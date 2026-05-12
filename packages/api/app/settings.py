import os

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="JACKSON_", env_file=".env", extra="ignore")

    telegram_bot_token: str = "test-bot-token"
    telegram_operator_chat_id: int = 424242
    telegram_webhook_secret: str = "test-webhook-secret"
    telegram_api_base_url: str = "https://api.telegram.org"
    test_mode: bool = False

    @property
    def mongo_uri(self) -> str | None:
        return os.getenv("MONGO_URI") or os.getenv("JACKSON_MONGO_URI")

    @property
    def mongo_dbname(self) -> str:
        # MONOGO_DBNAME is supported because it is the requested production env var.
        return os.getenv("MONOGO_DBNAME") or os.getenv("MONGO_DBNAME") or os.getenv("JACKSON_MONGO_DBNAME") or "jackson"


settings = Settings()
