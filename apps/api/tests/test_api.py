import pytest

from app.db.schema import COLLECTIONS
from app.main import app
from app.repositories import mongodb
from app.services.tokens import hash_token, normalize_username, verify_token
from app.settings import settings


@pytest.mark.asyncio
async def test_login_claim_once_hashes_token(client):
    first = await client.post("/cli/login", json={"username": " Alice Smith "})
    assert first.status_code == 200
    payload = first.json()
    assert payload["claimed"] is True
    assert payload["username_normalized"] == "alice-smith"
    assert payload["token"]

    user = next(iter(mongodb.repository.users_by_id.values()))
    assert user.token_hash == hash_token(payload["token"])
    assert not hasattr(user, "token")

    second = await client.post("/cli/login", json={"username": "alice smith"})
    assert second.status_code == 200
    assert second.json() == {"username_normalized": "alice-smith", "claimed": False, "token": None}


@pytest.mark.asyncio
async def test_auth_guard_rejects_missing_and_invalid_token(client):
    missing = await client.post("/cli/requests", json={"message": "hello"})
    assert missing.status_code == 401
    invalid = await client.post("/cli/requests", json={"message": "hello"}, headers={"Authorization": "Bearer nope"})
    assert invalid.status_code == 401


@pytest.mark.asyncio
async def test_create_get_and_webhook_reply_to_message_flow(client, monkeypatch):
    sent_messages = []

    async def send_message(chat_id: int, text: str) -> int:
        sent_messages.append({"chat_id": chat_id, "text": text})
        return 4321

    monkeypatch.setattr(app.state.telegram, "send_message", send_message)

    login = (await client.post("/cli/login", json={"username": "alice"})).json()
    headers = {"Authorization": f"Bearer {login['token']}"}
    created = await client.post("/cli/requests", json={"message": "how are you?"}, headers=headers)
    assert created.status_code == 200
    request_id = created.json()["request_id"]
    assert sent_messages == [{"chat_id": settings.telegram_operator_chat_id, "text": "From: alice\n\nhow are you?"}]

    pending = await client.get(f"/cli/requests/{request_id}", headers=headers)
    assert pending.json()["status"] == "pending"

    sent = mongodb.repository.telegram_messages_by_request[request_id]
    webhook = await client.post(
        "/telegram/webhook",
        headers={"X-Telegram-Bot-Api-Secret-Token": settings.telegram_webhook_secret},
        json={
            "update_id": 10,
            "message": {
                "message_id": 501,
                "chat": {"id": settings.telegram_operator_chat_id},
                "text": "doing well",
                "reply_to_message": {"message_id": sent.sent_message_id},
            },
        },
    )
    assert webhook.status_code == 200
    assert webhook.json()["created"] is True

    replied = await client.get(f"/cli/requests/{request_id}", headers=headers)
    assert replied.json() == {"request_id": request_id, "status": "replied", "reply": "doing well"}

    duplicate_update = await client.post(
        "/telegram/webhook",
        headers={"X-Telegram-Bot-Api-Secret-Token": settings.telegram_webhook_secret},
        json={"update_id": 10, "message": {"message_id": 502, "chat": {"id": settings.telegram_operator_chat_id}, "text": "duplicate"}},
    )
    assert duplicate_update.json()["duplicate"] is True


@pytest.mark.asyncio
async def test_webhook_reply_command_and_duplicate_reply_are_idempotent(client):
    login = (await client.post("/cli/login", json={"username": "bob"})).json()
    headers = {"Authorization": f"Bearer {login['token']}"}
    request_id = (await client.post("/cli/requests", json={"message": "question"}, headers=headers)).json()["request_id"]

    first = await client.post(
        "/telegram/webhook",
        headers={"X-Telegram-Bot-Api-Secret-Token": settings.telegram_webhook_secret},
        json={"update_id": 20, "message": {"message_id": 601, "chat": {"id": settings.telegram_operator_chat_id}, "text": f"/reply {request_id} answer"}},
    )
    assert first.json()["created"] is True
    second = await client.post(
        "/telegram/webhook",
        headers={"X-Telegram-Bot-Api-Secret-Token": settings.telegram_webhook_secret},
        json={"update_id": 21, "message": {"message_id": 602, "chat": {"id": settings.telegram_operator_chat_id}, "text": f"/reply {request_id} different"}},
    )
    assert second.json()["created"] is False
    replied = await client.get(f"/cli/requests/{request_id}", headers=headers)
    assert replied.json()["reply"] == "answer"


@pytest.mark.asyncio
async def test_webhook_rejects_wrong_secret_and_ignores_wrong_chat(client):
    wrong_secret = await client.post("/telegram/webhook", headers={"X-Telegram-Bot-Api-Secret-Token": "wrong"}, json={"update_id": 30})
    assert wrong_secret.status_code == 401
    ignored = await client.post(
        "/telegram/webhook",
        headers={"X-Telegram-Bot-Api-Secret-Token": settings.telegram_webhook_secret},
        json={"update_id": 31, "message": {"message_id": 701, "chat": {"id": 999}, "text": "nope"}},
    )
    assert ignored.json()["ignored"] is True


def test_schema_artifact_defines_required_indexes_and_no_plaintext_token():
    assert {"users", "requests", "replies", "telegram_messages", "telegram_webhook_updates"}.issubset(COLLECTIONS)
    users = COLLECTIONS["users"]
    assert "token_hash" in users["fields"]
    assert "token" not in users["fields"]
    for spec in COLLECTIONS.values():
        assert all(index["keys"] != [("_id", 1)] for index in spec["indexes"])
    assert any(index.get("unique") and index["keys"] == [("username_normalized", 1)] for index in users["indexes"])
    assert any(index.get("unique") and index["keys"] == [("update_id", 1)] for index in COLLECTIONS["telegram_webhook_updates"]["indexes"])
    assert any(index.get("unique") and index["keys"] == [("operator_chat_id", 1), ("sent_message_id", 1)] for index in COLLECTIONS["telegram_messages"]["indexes"])


def test_token_helpers():
    assert normalize_username(" Alice Smith! ") == "alice-smith"
    token_hash = hash_token("secret")
    assert verify_token("secret", token_hash)
    assert not verify_token("other", token_hash)
