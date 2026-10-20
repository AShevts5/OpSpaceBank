from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "OpSpaceBank"
    api_prefix: str = "/api/v1"
    debug: bool = False

    # БД
    database_url: str = "postgresql+asyncpg://opspacebank:opspacebank@localhost:5432/opspacebank"

    # JWT
    jwt_secret: str = "change-me-please-32-bytes-minimum-secret"
    jwt_algorithm: str = "HS256"
    access_ttl_minutes: int = 15
    refresh_ttl_days: int = 30
    challenge_ttl_minutes: int = 5

    # 2FA
    totp_issuer: str = "OpSpaceBank"
    require_2fa: bool = False  # True — без настроенной 2FA войти нельзя

    # адреса
    frontend_url: str = "http://localhost:5173"
    backend_public_url: str = "http://localhost:8000"
    mobile_redirect: str = "ru.opspacebank.app://oauth"
    cors_origins: str = "http://localhost:5173,http://localhost:4173,capacitor://localhost,https://localhost"

    # Яндекс ID (OAuth 2.0)
    yandex_client_id: str = ""
    yandex_client_secret: str = ""

    # AI-помощник: none | openai | anthropic
    llm_provider: str = "none"
    llm_api_key: str = ""
    llm_base_url: str = "https://api.openai.com/v1"  # для YandexGPT: https://llm.api.cloud.yandex.net/v1
    llm_model: str = "gpt-4o-mini"  # для YandexGPT: gpt://<folder_id>/yandexgpt/latest
    llm_folder_id: str = ""  # x-folder-id для YandexGPT (если нужен)
    llm_temperature: float = 0.3
    llm_max_tokens: int = 1200

    @property
    def yandex_enabled(self) -> bool:
        return bool(self.yandex_client_id and self.yandex_client_secret)

    @property
    def yandex_redirect_uri(self) -> str:
        return f"{self.backend_public_url}{self.api_prefix}/auth/yandex/callback"

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
