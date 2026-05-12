from __future__ import annotations

from app.adapters.telegram import TelegramAdapter
from app.repositories.mongodb import DuplicateReplyError, InMemoryRepository


async def create_operator_request(
    repo: InMemoryRepository,
    telegram: TelegramAdapter,
    user_id: str,
    sender_username: str,
    message: str,
    operator_chat_id: int,
):
    request = repo.create_request(user_id=user_id, message=message)
    text = f"From: {sender_username}\n\n{message}"
    sent_message_id = await telegram.send_message(chat_id=operator_chat_id, text=text)
    repo.store_telegram_message(request.id, operator_chat_id, sent_message_id)
    return request


def store_reply_once(repo: InMemoryRepository, request_id: str, reply_text: str, update_id: int | None, message_id: int | None) -> bool:
    try:
        repo.add_reply(request_id=request_id, reply_text=reply_text, telegram_update_id=update_id, telegram_message_id=message_id)
        return True
    except DuplicateReplyError:
        return False
