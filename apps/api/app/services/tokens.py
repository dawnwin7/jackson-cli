from __future__ import annotations

import hashlib
import hmac
import re
import secrets

_TOKEN_BYTES = 32
_USERNAME_RE = re.compile(r"[^a-z0-9_.-]+")


def normalize_username(username: str) -> str:
    normalized = _USERNAME_RE.sub("-", username.strip().lower()).strip("-._")
    if not normalized:
        raise ValueError("username is required")
    return normalized


def generate_token() -> str:
    return secrets.token_urlsafe(_TOKEN_BYTES)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def verify_token(token: str, token_hash: str) -> bool:
    return hmac.compare_digest(hash_token(token), token_hash)


def redact_secret(value: str) -> str:
    if not value:
        return "<empty>"
    if len(value) <= 8:
        return "<redacted>"
    return f"{value[:4]}…{value[-4:]}"
