"""Пароли, JWT и TOTP."""

from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
import jwt
import pyotp

from .config import settings


# ---------------------------------------------------------------- пароли
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode()[:72], bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str | None) -> bool:
    if not hashed:
        return False
    try:
        return bcrypt.checkpw(password.encode()[:72], hashed.encode())
    except ValueError:
        return False


# ---------------------------------------------------------------- JWT
def _now() -> datetime:
    return datetime.now(timezone.utc)


def encode(payload: dict[str, Any], ttl: timedelta) -> str:
    data = {**payload, "iat": _now(), "exp": _now() + ttl}
    return jwt.encode(data, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode(token: str, expected_type: str) -> dict[str, Any]:
    """Проверяет подпись, срок и тип токена; бросает jwt.PyJWTError."""
    data = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    if data.get("typ") != expected_type:
        raise jwt.InvalidTokenError("wrong token type")
    return data


def access_token(user_id: uuid.UUID) -> str:
    return encode({"sub": str(user_id), "typ": "access"}, timedelta(minutes=settings.access_ttl_minutes))


def refresh_token(user_id: uuid.UUID, jti: uuid.UUID) -> str:
    return encode({"sub": str(user_id), "typ": "refresh", "jti": str(jti)}, timedelta(days=settings.refresh_ttl_days))


def challenge_token(user_id: uuid.UUID, purpose: str = "mfa") -> str:
    """Промежуточный токен после пароля: годится только для второго шага (или настройки 2FA)."""
    return encode({"sub": str(user_id), "typ": purpose}, timedelta(minutes=settings.challenge_ttl_minutes))


def state_token(data: dict[str, Any]) -> str:
    return encode({**data, "typ": "oauth_state", "nonce": secrets.token_urlsafe(8)}, timedelta(minutes=10))


# ---------------------------------------------------------------- TOTP и коды восстановления
def new_totp_secret() -> str:
    return pyotp.random_base32()


def totp_uri(secret: str, account: str) -> str:
    return pyotp.TOTP(secret).provisioning_uri(name=account, issuer_name=settings.totp_issuer)


def verify_totp(secret: str | None, code: str) -> bool:
    if not secret:
        return False
    code = "".join(ch for ch in code if ch.isdigit())
    return len(code) == 6 and pyotp.TOTP(secret).verify(code, valid_window=1)


_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"


def new_recovery_codes(count: int = 8) -> list[str]:
    def one() -> str:
        raw = "".join(secrets.choice(_ALPHABET) for _ in range(10))
        return f"{raw[:5]}-{raw[5:]}"

    return [one() for _ in range(count)]


def hash_code(code: str) -> str:
    return hashlib.sha256(code.strip().lower().encode()).hexdigest()
