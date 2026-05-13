import asyncio
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.repositories import mongodb
from app.settings import settings


async def main() -> None:
    mongodb.repository = mongodb.InMemoryRepository()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://smoke") as client:
        login = (await client.post("/cli/login", json={"username": "smoke"})).json()
        headers = {"Authorization": f"Bearer {login['token']}"}
        created = (await client.post("/cli/requests", json={"message": "how are you?"}, headers=headers)).json()
        request_id = created["request_id"]
        sent = mongodb.repository.telegram_messages_by_request[request_id]
        await client.post(
            "/telegram/webhook",
            headers={"X-Telegram-Bot-Api-Secret-Token": settings.telegram_webhook_secret},
            json={"update_id": 900, "message": {"message_id": 901, "chat": {"id": settings.telegram_operator_chat_id}, "text": "smoke reply", "reply_to_message": {"message_id": sent.sent_message_id}}},
        )
        replied = (await client.get(f"/cli/requests/{request_id}", headers=headers)).json()
        assert replied["reply"] == "smoke reply"
        delayed = (await client.post("/cli/requests", json={"message": "delayed?"}, headers=headers)).json()["request_id"]

        async def answer_later():
            await asyncio.sleep(0.5)
            sent2 = mongodb.repository.telegram_messages_by_request[delayed]
            await client.post(
                "/telegram/webhook",
                headers={"X-Telegram-Bot-Api-Secret-Token": settings.telegram_webhook_secret},
                json={"update_id": 902, "message": {"message_id": 903, "chat": {"id": settings.telegram_operator_chat_id}, "text": "delayed reply", "reply_to_message": {"message_id": sent2.sent_message_id}}},
            )

        task = asyncio.create_task(answer_later())
        wait_result = (await client.get(f"/cli/requests/{delayed}?wait=true&timeout_seconds=5", headers=headers)).json()
        await task
        assert wait_result["reply"] == "delayed reply"
        print(f"smoke passed request_id={request_id} delayed_request_id={delayed}")


if __name__ == "__main__":
    asyncio.run(main())
