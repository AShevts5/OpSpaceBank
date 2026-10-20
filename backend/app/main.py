from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .core.config import settings
from .routers import assistant, auth, tasks
from .services.llm import llm_enabled

app = FastAPI(
    title="OpSpaceBank API",
    description="Помощник банка: дискретная математика в бизнес-процессах.",
    version="1.0.0",
    docs_url=f"{settings.api_prefix}/docs",
    openapi_url=f"{settings.api_prefix}/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for r in (auth.router, tasks.router, tasks.history, assistant.router):
    app.include_router(r, prefix=settings.api_prefix)


@app.get(f"{settings.api_prefix}/health")
async def health():
    return {"status": "ok"}


@app.get(f"{settings.api_prefix}/config")
async def public_config():
    """Что включено на сервере — фронтенд прячет недоступные кнопки."""
    return {
        "app_name": settings.app_name,
        "auth": {"yandex": settings.yandex_enabled, "require_2fa": settings.require_2fa},
        "assistant": {"llm": llm_enabled(), "provider": settings.llm_provider},
    }
