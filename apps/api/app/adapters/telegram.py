from __future__ import annotations

from dataclasses import dataclass
import itertools

import httpx


class TelegramSendError(RuntimeError):
    pass


@dataclass
class TelegramAdapter:
    bot_token: str
    api_base_url: str = "https://api.telegram.org"
    test_mode: bool = False

    _counter = itertools.count(1000)

    async def send_message(self, chat_id: int, text: str) -> int:
        if self.test_mode:
            return next(self._counter)
        url = f"{self.api_base_url.rstrip('/')}/bot{self.bot_token}/sendMessage"
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(url, json={"chat_id": chat_id, "text": text})
        try:
            payload = response.json()
        except ValueError as exc:
            raise TelegramSendError("telegram returned non-json response") from exc
        if response.status_code >= 400 or not payload.get("ok"):
            description = payload.get("description", "telegram sendMessage failed")
            raise TelegramSendError(description)
        message_id = payload.get("result", {}).get("message_id")
        if not isinstance(message_id, int):
            raise TelegramSendError("telegram sendMessage response missing message_id")
        return message_id
