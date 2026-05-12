from datetime import datetime, timezone
from typing import Literal
from pydantic import BaseModel, Field


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


class UserRecord(BaseModel):
    id: str
    username: str
    username_normalized: str
    token_hash: str
    created_at: datetime = Field(default_factory=now_utc)


class RequestRecord(BaseModel):
    id: str
    user_id: str
    message: str
    status: Literal["pending", "replied"] = "pending"
    created_at: datetime = Field(default_factory=now_utc)
    updated_at: datetime = Field(default_factory=now_utc)


class ReplyRecord(BaseModel):
    request_id: str
    reply_text: str
    telegram_update_id: int | None = None
    telegram_message_id: int | None = None
    created_at: datetime = Field(default_factory=now_utc)


class TelegramMessageRecord(BaseModel):
    request_id: str
    operator_chat_id: int
    sent_message_id: int
    created_at: datetime = Field(default_factory=now_utc)


class WebhookUpdateRecord(BaseModel):
    update_id: int
    status: Literal["processed", "ignored", "duplicate"]
    request_id: str | None = None
    message_id: int | None = None
    created_at: datetime = Field(default_factory=now_utc)
