from __future__ import annotations

import re
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header, HTTPException, status

from app.repositories import mongodb
from app.repositories.mongodb import InMemoryRepository
from app.services.requests import store_reply_once
from app.settings import settings

router = APIRouter(prefix="/telegram", tags=["private-telegram"])
_REPLY_RE = re.compile(r"^/reply\s+(?P<request_id>\S+)(?:\s+(?P<reply>.*))?$", re.DOTALL)


def get_repo() -> InMemoryRepository:
    return mongodb.repository


def _message_text(message: dict[str, Any]) -> str:
    return str(message.get("text") or message.get("caption") or "").strip()


def _parse_reply_command(text: str) -> tuple[str, str] | None:
    match = _REPLY_RE.match(text.strip())
    if not match:
        return None
    request_id = match.group("request_id")
    reply = (match.group("reply") or "").strip()
    return request_id, reply


@router.post("/webhook")
async def webhook(
    payload: dict[str, Any],
    repo: Annotated[InMemoryRepository, Depends(get_repo)],
    secret_token: Annotated[str | None, Header(alias="X-Telegram-Bot-Api-Secret-Token")] = None,
):
    if secret_token != settings.telegram_webhook_secret:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid telegram webhook secret")

    update_id = payload.get("update_id")
    if not isinstance(update_id, int):
        raise HTTPException(status_code=400, detail="missing update_id")
    if repo.has_update(update_id):
        return {"ok": True, "duplicate": True}

    message = payload.get("message") or {}
    chat = message.get("chat") or {}
    chat_id = chat.get("id")
    message_id = message.get("message_id") if isinstance(message.get("message_id"), int) else None
    if chat_id != settings.telegram_operator_chat_id:
        repo.mark_update(update_id, "ignored", message_id=message_id)
        return {"ok": True, "ignored": True}

    text = _message_text(message)
    request_id: str | None = None
    reply_text: str = text

    reply_to_message = message.get("reply_to_message") or {}
    reply_to_id = reply_to_message.get("message_id")
    if isinstance(reply_to_id, int):
        request_id = repo.find_request_by_telegram_message(settings.telegram_operator_chat_id, reply_to_id)

    command = _parse_reply_command(text)
    if request_id is None and command:
        request_id, reply_text = command
    elif command and command[1]:
        reply_text = command[1]

    if not request_id:
        repo.mark_update(update_id, "ignored", message_id=message_id)
        return {"ok": True, "ignored": True}

    if not reply_text:
        reply_text = text
    repo.mark_update(update_id, "processed", request_id=request_id, message_id=message_id)
    created = store_reply_once(repo, request_id=request_id, reply_text=reply_text, update_id=update_id, message_id=message_id)
    return {"ok": True, "request_id": request_id, "created": created}
