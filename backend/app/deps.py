import uuid

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from .core.database import get_db
from .core.security import decode
from .models import User

bearer = HTTPBearer(auto_error=False)


def _unauthorized(detail: str = "Требуется вход в систему.") -> HTTPException:
    return HTTPException(status.HTTP_401_UNAUTHORIZED, detail, headers={"WWW-Authenticate": "Bearer"})


async def _user_from(token: str, typ: str, db: AsyncSession) -> User:
    try:
        data = decode(token, typ)
    except jwt.ExpiredSignatureError as exc:
        raise _unauthorized("Срок действия токена истёк.") from exc
    except jwt.PyJWTError as exc:
        raise _unauthorized("Недействительный токен.") from exc
    user = await db.get(User, uuid.UUID(data["sub"]))
    if not user or not user.is_active:
        raise _unauthorized("Пользователь не найден или заблокирован.")
    return user


async def current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    if not creds:
        raise _unauthorized()
    return await _user_from(creds.credentials, "access", db)


async def optional_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: AsyncSession = Depends(get_db),
) -> User | None:
    if not creds:
        return None
    try:
        return await _user_from(creds.credentials, "access", db)
    except HTTPException:
        return None


async def user_for_2fa_setup(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Настраивать 2FA можно с обычным access-токеном или с токеном «mfa_setup»,
    который выдаётся при входе, если 2FA обязательна, а пользователь её ещё не включил."""
    if not creds:
        raise _unauthorized()
    try:
        return await _user_from(creds.credentials, "access", db)
    except HTTPException:
        return await _user_from(creds.credentials, "mfa_setup", db)
