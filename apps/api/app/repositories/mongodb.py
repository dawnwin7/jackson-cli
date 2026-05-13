from __future__ import annotations

from dataclasses import dataclass, field
from uuid import uuid4

from pymongo import ASCENDING, ReturnDocument
from pymongo.collection import Collection
from pymongo.database import Database
from pymongo.errors import DuplicateKeyError
from pymongo.mongo_client import MongoClient

from app.db.schema import COLLECTIONS
from app.models import ReplyRecord, RequestRecord, TelegramMessageRecord, UserRecord, WebhookUpdateRecord, now_utc
from app.services.tokens import hash_token, verify_token
from app.settings import settings


class DuplicateReplyError(Exception):
    pass


class MongoConfigurationError(RuntimeError):
    pass


def _dump(model):
    return model.model_dump(mode="python")


def _index_kwargs(index: dict) -> dict:
    kwargs = {"name": index["name"]}
    if index.get("unique"):
        kwargs["unique"] = True
    if index.get("sparse"):
        kwargs["sparse"] = True
    return kwargs


def ensure_indexes(db: Database) -> None:
    for collection_name, spec in COLLECTIONS.items():
        collection = db[collection_name]
        for index in spec["indexes"]:
            collection.create_index(index["keys"], **_index_kwargs(index))


@dataclass
class InMemoryRepository:
    users_by_name: dict[str, UserRecord] = field(default_factory=dict)
    users_by_id: dict[str, UserRecord] = field(default_factory=dict)
    requests: dict[str, RequestRecord] = field(default_factory=dict)
    replies: dict[str, ReplyRecord] = field(default_factory=dict)
    telegram_messages_by_request: dict[str, TelegramMessageRecord] = field(default_factory=dict)
    telegram_messages_by_sent_id: dict[tuple[int, int], TelegramMessageRecord] = field(default_factory=dict)
    webhook_updates: dict[int, WebhookUpdateRecord] = field(default_factory=dict)

    def claim_user(self, username: str, username_normalized: str, token_hash: str) -> tuple[UserRecord, bool]:
        existing = self.users_by_name.get(username_normalized)
        if existing:
            return existing, False
        record = UserRecord(id=str(uuid4()), username=username, username_normalized=username_normalized, token_hash=token_hash)
        self.users_by_name[username_normalized] = record
        self.users_by_id[record.id] = record
        return record, True

    def authenticate(self, token: str) -> UserRecord | None:
        for user in self.users_by_id.values():
            if verify_token(token, user.token_hash):
                return user
        return None

    def create_request(self, user_id: str, message: str) -> RequestRecord:
        request = RequestRecord(id=f"req_{uuid4().hex[:16]}", user_id=user_id, message=message)
        self.requests[request.id] = request
        return request

    def get_request_for_user(self, request_id: str, user_id: str) -> RequestRecord | None:
        request = self.requests.get(request_id)
        if not request or request.user_id != user_id:
            return None
        return request

    def get_reply(self, request_id: str) -> ReplyRecord | None:
        return self.replies.get(request_id)

    def store_telegram_message(self, request_id: str, operator_chat_id: int, sent_message_id: int) -> TelegramMessageRecord:
        record = TelegramMessageRecord(request_id=request_id, operator_chat_id=operator_chat_id, sent_message_id=sent_message_id)
        self.telegram_messages_by_request[request_id] = record
        self.telegram_messages_by_sent_id[(operator_chat_id, sent_message_id)] = record
        return record

    def find_request_by_telegram_message(self, operator_chat_id: int, sent_message_id: int) -> str | None:
        record = self.telegram_messages_by_sent_id.get((operator_chat_id, sent_message_id))
        return record.request_id if record else None

    def has_update(self, update_id: int) -> bool:
        return update_id in self.webhook_updates

    def mark_update(self, update_id: int, status: str, request_id: str | None = None, message_id: int | None = None) -> bool:
        if update_id in self.webhook_updates:
            return False
        self.webhook_updates[update_id] = WebhookUpdateRecord(update_id=update_id, status=status, request_id=request_id, message_id=message_id)
        return True

    def add_reply(self, request_id: str, reply_text: str, telegram_update_id: int | None, telegram_message_id: int | None) -> ReplyRecord:
        if request_id in self.replies:
            raise DuplicateReplyError(request_id)
        if request_id not in self.requests:
            raise KeyError(request_id)
        reply = ReplyRecord(
            request_id=request_id,
            reply_text=reply_text,
            telegram_update_id=telegram_update_id,
            telegram_message_id=telegram_message_id,
        )
        self.replies[request_id] = reply
        request = self.requests[request_id]
        request.status = "replied"
        request.updated_at = now_utc()
        return reply


class MongoRepository:
    def __init__(self, mongo_uri: str, db_name: str) -> None:
        self.client: MongoClient = MongoClient(mongo_uri)
        self.db = self.client[db_name]
        ensure_indexes(self.db)

    @property
    def users(self) -> Collection:
        return self.db["users"]

    @property
    def requests(self) -> Collection:
        return self.db["requests"]

    @property
    def replies(self) -> Collection:
        return self.db["replies"]

    @property
    def telegram_messages(self) -> Collection:
        return self.db["telegram_messages"]

    @property
    def webhook_updates(self) -> Collection:
        return self.db["telegram_webhook_updates"]

    def claim_user(self, username: str, username_normalized: str, token_hash: str) -> tuple[UserRecord, bool]:
        existing = self.users.find_one({"username_normalized": username_normalized})
        if existing:
            return _user_from_doc(existing), False
        record = UserRecord(id=str(uuid4()), username=username, username_normalized=username_normalized, token_hash=token_hash)
        doc = _dump(record) | {"_id": record.id}
        try:
            self.users.insert_one(doc)
        except DuplicateKeyError:
            existing = self.users.find_one({"username_normalized": username_normalized})
            if not existing:
                raise
            return _user_from_doc(existing), False
        return record, True

    def authenticate(self, token: str) -> UserRecord | None:
        user = self.users.find_one({"token_hash": hash_token(token)})
        return _user_from_doc(user) if user else None

    def create_request(self, user_id: str, message: str) -> RequestRecord:
        request = RequestRecord(id=f"req_{uuid4().hex[:16]}", user_id=user_id, message=message)
        self.requests.insert_one(_dump(request) | {"_id": request.id})
        return request

    def get_request_for_user(self, request_id: str, user_id: str) -> RequestRecord | None:
        doc = self.requests.find_one({"_id": request_id, "user_id": user_id})
        return _request_from_doc(doc) if doc else None

    def get_reply(self, request_id: str) -> ReplyRecord | None:
        doc = self.replies.find_one({"request_id": request_id})
        return ReplyRecord(**doc) if doc else None

    def store_telegram_message(self, request_id: str, operator_chat_id: int, sent_message_id: int) -> TelegramMessageRecord:
        record = TelegramMessageRecord(request_id=request_id, operator_chat_id=operator_chat_id, sent_message_id=sent_message_id)
        self.telegram_messages.replace_one({"request_id": request_id}, _dump(record), upsert=True)
        return record

    def find_request_by_telegram_message(self, operator_chat_id: int, sent_message_id: int) -> str | None:
        doc = self.telegram_messages.find_one({"operator_chat_id": operator_chat_id, "sent_message_id": sent_message_id})
        return doc["request_id"] if doc else None

    def has_update(self, update_id: int) -> bool:
        return self.webhook_updates.find_one({"update_id": update_id}, {"_id": 1}) is not None

    def mark_update(self, update_id: int, status: str, request_id: str | None = None, message_id: int | None = None) -> bool:
        record = WebhookUpdateRecord(update_id=update_id, status=status, request_id=request_id, message_id=message_id)
        try:
            self.webhook_updates.insert_one(_dump(record))
            return True
        except DuplicateKeyError:
            return False

    def add_reply(self, request_id: str, reply_text: str, telegram_update_id: int | None, telegram_message_id: int | None) -> ReplyRecord:
        if self.requests.find_one({"_id": request_id}, {"_id": 1}) is None:
            raise KeyError(request_id)
        reply = ReplyRecord(
            request_id=request_id,
            reply_text=reply_text,
            telegram_update_id=telegram_update_id,
            telegram_message_id=telegram_message_id,
        )
        try:
            self.replies.insert_one(_dump(reply))
        except DuplicateKeyError as exc:
            raise DuplicateReplyError(request_id) from exc
        self.requests.find_one_and_update(
            {"_id": request_id},
            {"$set": {"status": "replied", "updated_at": now_utc()}},
            return_document=ReturnDocument.AFTER,
        )
        return reply


def _user_from_doc(doc: dict) -> UserRecord:
    return UserRecord(
        id=str(doc.get("_id") or doc["id"]),
        username=doc["username"],
        username_normalized=doc["username_normalized"],
        token_hash=doc["token_hash"],
        created_at=doc["created_at"],
    )


def _request_from_doc(doc: dict) -> RequestRecord:
    return RequestRecord(
        id=str(doc.get("_id") or doc["id"]),
        user_id=doc["user_id"],
        message=doc["message"],
        status=doc["status"],
        created_at=doc["created_at"],
        updated_at=doc["updated_at"],
    )


def create_repository():
    if settings.test_mode:
        return InMemoryRepository()
    if not settings.mongo_uri:
        raise MongoConfigurationError("MONGO_URI is required outside JACKSON_TEST_MODE")
    return MongoRepository(settings.mongo_uri, settings.mongo_dbname)


repository = create_repository()
