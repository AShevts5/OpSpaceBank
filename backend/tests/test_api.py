"""Сквозные тесты API на SQLite в памяти: регистрация → 2FA → вход → задачи → история → чат.

pytest -q  (нужны пакеты из requirements.txt)
"""

import asyncio
import os

os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///./test.db")
os.environ.setdefault("LLM_PROVIDER", "none")

import pyotp  # noqa: E402
import pytest  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402

from app.core.database import Base, engine  # noqa: E402
from app.main import app  # noqa: E402

API = "/api/v1"


@pytest.fixture(scope="module", autouse=True)
def db():
    async def create():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
            await conn.run_sync(Base.metadata.create_all)

    asyncio.run(create())
    yield
    if os.path.exists("test.db"):
        os.remove("test.db")


def run(coro):
    return asyncio.run(coro)


async def _flow():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        r = await c.post(f"{API}/auth/register", json={"email": "anna@example.com", "password": "secret123", "name": "Анна"})
        assert r.status_code == 201, r.text
        tokens = r.json()
        auth = {"Authorization": f"Bearer {tokens['access_token']}"}

        # включаем 2FA
        setup = (await c.post(f"{API}/auth/2fa/setup", headers=auth)).json()
        code = pyotp.TOTP(setup["secret"]).now()
        enabled = await c.post(f"{API}/auth/2fa/enable", headers=auth, json={"code": code})
        assert enabled.status_code == 200, enabled.text
        recovery = enabled.json()["recovery_codes"]

        # вход теперь двухшаговый
        step1 = (await c.post(f"{API}/auth/login", json={"login": "anna@example.com", "password": "secret123"})).json()
        assert step1["two_factor_required"]
        bad = await c.post(f"{API}/auth/2fa/verify", json={"challenge": step1["challenge"], "code": "000000"})
        assert bad.status_code == 401
        ok = await c.post(f"{API}/auth/2fa/verify", json={"challenge": step1["challenge"], "code": recovery[0]})
        assert ok.status_code == 200
        tokens = ok.json()
        auth = {"Authorization": f"Bearer {tokens['access_token']}"}

        # код восстановления одноразовый
        step1 = (await c.post(f"{API}/auth/login", json={"login": "anna@example.com", "password": "secret123"})).json()
        again = await c.post(f"{API}/auth/2fa/verify", json={"challenge": step1["challenge"], "code": recovery[0]})
        assert again.status_code == 401

        # ротация refresh: старый токен после использования не работает
        r1 = await c.post(f"{API}/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
        assert r1.status_code == 200
        r2 = await c.post(f"{API}/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
        assert r2.status_code == 401
        auth = {"Authorization": f"Bearer {r1.json()['access_token']}"}

        # задачи
        s3 = (await c.get(f"{API}/tasks/task3/solution", params={"variant": "deposit"})).json()
        assert s3["answer"]["redundant"] == ["Y∧Z"]
        d = (await c.post(f"{API}/tasks/task1/decide", json={"A": True, "B": False, "C": True})).json()
        assert d["approved"] is True
        cl = (await c.post(f"{API}/tasks/task2/classify", json=[{"name": "Олег", "purchases": 5, "avg_check": 10000, "loyalty": True}])).json()
        assert cl[0]["premium"] == 0
        q = (await c.post(f"{API}/tasks/quine", json={"variables": ["A", "B", "C"], "minterms": [1, 3, 6, 7]})).json()
        assert q["minimal_dnf"] == "(A∧B) ∨ (¬A∧C)"

        # история с идемпотентной синхронизацией
        item = {"task": "task1", "mode": "wizard", "score": 5, "total": 6, "client_uid": "u-1"}
        await c.post(f"{API}/history", headers=auth, json=[item])
        await c.post(f"{API}/history", headers=auth, json=[item])
        hist = (await c.get(f"{API}/history", headers=auth)).json()
        assert len(hist) == 1

        # чат без LLM отвечает из базы знаний
        resp = await c.post(f"{API}/assistant/chat", headers=auth, json={"message": "Что такое СДНФ?"})
        assert resp.status_code == 200
        assert "event: done" in resp.text and "\"source\": \"knowledge\"" in resp.text


def test_full_flow():
    run(_flow())
