from __future__ import annotations

from fastapi import FastAPI

from app.adapters.telegram import TelegramAdapter
from app.routes.cli import router as cli_router
from app.routes.telegram import router as telegram_router
from app.settings import settings


def create_app() -> FastAPI:
    app = FastAPI(title="jackson private backend", docs_url=None, redoc_url=None, openapi_url=None)
    app.state.telegram = TelegramAdapter(
        bot_token=settings.telegram_bot_token,
        api_base_url=settings.telegram_api_base_url,
        test_mode=settings.test_mode or settings.telegram_bot_token == "test-bot-token",
    )
    app.include_router(cli_router)
    app.include_router(telegram_router)
    return app


app = create_app()
