"""MongoDB collection and index definitions for jackson-api.

This artifact is intentionally committed even though local tests use an in-memory
repository. It is the deployment schema contract for MongoDB-backed storage.
It stores token hashes only; there is no plaintext token field.
"""

COLLECTIONS = {
    "users": {
        "fields": {
            "_id": "ObjectId | string",
            "username": "string",
            "username_normalized": "string",
            "token_hash": "sha256 hex string",
            "created_at": "datetime",
        },
        "indexes": [
            {"keys": [("username_normalized", 1)], "unique": True, "name": "uniq_username_normalized"},
            {"keys": [("token_hash", 1)], "unique": True, "name": "uniq_token_hash"},
        ],
    },
    "requests": {
        "fields": {
            "_id": "request_id string",
            "user_id": "users._id",
            "message": "string",
            "status": "pending | replied",
            "created_at": "datetime",
            "updated_at": "datetime",
        },
        "indexes": [
            {"keys": [("user_id", 1), ("created_at", -1)], "name": "by_user_created"},
        ],
    },
    "replies": {
        "fields": {
            "request_id": "requests._id",
            "reply_text": "string",
            "telegram_update_id": "int | null",
            "telegram_message_id": "int | null",
            "created_at": "datetime",
        },
        "indexes": [
            {"keys": [("request_id", 1)], "unique": True, "name": "uniq_reply_per_request"},
            {"keys": [("telegram_update_id", 1)], "unique": True, "sparse": True, "name": "uniq_reply_update_id"},
        ],
    },
    "telegram_messages": {
        "fields": {
            "request_id": "requests._id",
            "operator_chat_id": "int",
            "sent_message_id": "int",
            "created_at": "datetime",
        },
        "indexes": [
            {"keys": [("request_id", 1)], "unique": True, "name": "uniq_telegram_message_request"},
            {"keys": [("operator_chat_id", 1), ("sent_message_id", 1)], "unique": True, "name": "uniq_operator_sent_message"},
        ],
    },
    "telegram_webhook_updates": {
        "fields": {
            "update_id": "int",
            "status": "processed | ignored | duplicate",
            "request_id": "requests._id | null",
            "message_id": "int | null",
            "created_at": "datetime",
        },
        "indexes": [
            {"keys": [("update_id", 1)], "unique": True, "name": "uniq_telegram_update_id"},
            {"keys": [("request_id", 1), ("status", 1)], "name": "by_request_status"},
        ],
    },
}


def collection_names() -> list[str]:
    return list(COLLECTIONS.keys())


def indexes_for(collection_name: str) -> list[dict]:
    return COLLECTIONS[collection_name]["indexes"]
