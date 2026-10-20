"""Аутентификация: пароль → (2FA TOTP) → пара JWT; refresh с ротацией; Яндекс ID (OAuth 2.0)."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import httpx
import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from sqlalchemy import or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..core.config import settings
from ..core.database import get_db
from ..core.security import (
    access_token,
    challenge_token,
    decode,
    hash_code,
    hash_password,
    new_recovery_codes,
    new_totp_secret,
    refresh_token,
    state_token,
    totp_uri,
    verify_password,
    verify_totp,
)
from ..deps import current_user, user_for_2fa_setup
from ..models import OAuthAccount, RefreshSession, User
from ..schemas import (
    ChallengeOut,
    LoginIn,
    PasswordChangeIn,
    ProfileIn,
    RecoveryCodesOut,
    RefreshIn,
    RegisterIn,
    SecondFactorIn,
    TokensOut,
    TotpCodeIn,
    TotpSetupOut,
    UserOut,
)

router = APIRouter(prefix="/auth", tags=["auth"])

YANDEX_AUTHORIZE = "https://oauth.yandex.ru/authorize"
YANDEX_TOKEN = "https://oauth.yandex.ru/token"
YANDEX_INFO = "https://login.yandex.ru/info"


# ---------------------------------------------------------------- helpers
async def user_out(db: AsyncSession, user: User) -> UserOut:
    linked = await db.scalar(
        select(OAuthAccount.id).where(OAuthAccount.user_id == user.id, OAuthAccount.provider == "yandex")
    )
    out = UserOut.model_validate(user)
    out.has_password = bool(user.password_hash)
    out.yandex_linked = linked is not None
    return out


async def issue_tokens(db: AsyncSession, user: User, request: Request | None = None) -> TokensOut:
    session = RefreshSession(
        user_id=user.id,
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.refresh_ttl_days),
        user_agent=(request.headers.get("user-agent", "")[:300] if request else None),
    )
    db.add(session)
    user.last_login_at = datetime.now(timezone.utc)
    await db.flush()
    tokens = TokensOut(
        access_token=access_token(user.id),
        refresh_token=refresh_token(user.id, session.id),
        expires_in=settings.access_ttl_minutes * 60,
        user=await user_out(db, user),
    )
    await db.commit()
    return tokens


async def after_first_factor(db: AsyncSession, user: User, request: Request) -> TokensOut | ChallengeOut:
    """Первый фактор пройден. Дальше — либо второй фактор, либо сразу токены."""
    if user.totp_enabled or settings.require_2fa:
        await db.commit()  # новый пользователь (регистрация, Яндекс) должен сохраниться и без токенов
    if user.totp_enabled:
        return ChallengeOut(two_factor_required=True, challenge=challenge_token(user.id, "mfa"))
    if settings.require_2fa:
        return ChallengeOut(two_factor_setup_required=True, challenge=challenge_token(user.id, "mfa_setup"))
    return await issue_tokens(db, user, request)


def bad_request(detail: str, code: int = status.HTTP_400_BAD_REQUEST) -> HTTPException:
    return HTTPException(code, detail)


# ---------------------------------------------------------------- регистрация и вход
@router.post("/register", response_model=TokensOut | ChallengeOut, status_code=201)
async def register(data: RegisterIn, request: Request, db: AsyncSession = Depends(get_db)):
    email = data.email.lower()
    if await db.scalar(select(User.id).where(User.email == email)):
        raise bad_request("Пользователь с таким email уже зарегистрирован.", status.HTTP_409_CONFLICT)
    user = User(email=email, name=data.name, password_hash=hash_password(data.password))
    db.add(user)
    await db.flush()
    return await after_first_factor(db, user, request)


@router.post("/login", response_model=TokensOut | ChallengeOut)
async def login(data: LoginIn, request: Request, db: AsyncSession = Depends(get_db)):
    key = data.login.strip().lower()
    user = await db.scalar(select(User).where(or_(User.email == key, User.login == key)))
    if not user or not verify_password(data.password, user.password_hash):
        raise bad_request("Неверный логин или пароль.", status.HTTP_401_UNAUTHORIZED)
    if not user.is_active:
        raise bad_request("Аккаунт заблокирован.", status.HTTP_403_FORBIDDEN)
    return await after_first_factor(db, user, request)


@router.post("/2fa/verify", response_model=TokensOut)
async def second_factor(data: SecondFactorIn, request: Request, db: AsyncSession = Depends(get_db)):
    try:
        payload = decode(data.challenge, "mfa")
    except jwt.PyJWTError as exc:
        raise bad_request("Сессия входа истекла, войдите заново.", 401) from exc
    user = await db.get(User, uuid.UUID(payload["sub"]))
    if not user or not user.totp_enabled:
        raise bad_request("2FA не настроена.", 401)
    code = data.code.strip()
    if verify_totp(user.totp_secret, code):
        return await issue_tokens(db, user, request)
    hashed = hash_code(code)
    codes = list(user.recovery_codes or [])
    if hashed in codes:  # код восстановления — одноразовый
        codes.remove(hashed)
        user.recovery_codes = codes
        return await issue_tokens(db, user, request)
    raise bad_request("Неверный код подтверждения.", 401)


@router.post("/refresh", response_model=TokensOut)
async def refresh(data: RefreshIn, request: Request, db: AsyncSession = Depends(get_db)):
    try:
        payload = decode(data.refresh_token, "refresh")
    except jwt.PyJWTError as exc:
        raise bad_request("Сессия истекла, войдите заново.", 401) from exc
    session = await db.get(RefreshSession, uuid.UUID(payload["jti"]))
    if not session or session.revoked:
        # повторное использование старого refresh — признак кражи: гасим все сессии пользователя
        await db.execute(
            update(RefreshSession).where(RefreshSession.user_id == uuid.UUID(payload["sub"])).values(revoked=True)
        )
        await db.commit()
        raise bad_request("Сессия отозвана, войдите заново.", 401)
    session.revoked = True
    user = await db.get(User, session.user_id)
    if not user or not user.is_active:
        raise bad_request("Пользователь не найден.", 401)
    return await issue_tokens(db, user, request)


@router.post("/logout", status_code=204)
async def logout(data: RefreshIn, db: AsyncSession = Depends(get_db)):
    try:
        payload = decode(data.refresh_token, "refresh")
    except jwt.PyJWTError:
        return None
    session = await db.get(RefreshSession, uuid.UUID(payload["jti"]))
    if session:
        session.revoked = True
        await db.commit()
    return None


# ---------------------------------------------------------------- профиль
@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    return await user_out(db, user)


@router.patch("/me", response_model=UserOut)
async def update_me(data: ProfileIn, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    if data.name is not None:
        user.name = data.name.strip() or None
    await db.commit()
    return await user_out(db, user)


@router.post("/password", status_code=204)
async def change_password(data: PasswordChangeIn, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    if user.password_hash and not verify_password(data.old_password or "", user.password_hash):
        raise bad_request("Текущий пароль указан неверно.")
    user.password_hash = hash_password(data.new_password)
    await db.commit()


# ---------------------------------------------------------------- настройка TOTP
@router.post("/2fa/setup", response_model=TotpSetupOut)
async def totp_setup(user: User = Depends(user_for_2fa_setup), db: AsyncSession = Depends(get_db)):
    if user.totp_enabled:
        raise bad_request("2FA уже включена.")
    user.totp_secret = new_totp_secret()
    await db.commit()
    return TotpSetupOut(secret=user.totp_secret, otpauth_uri=totp_uri(user.totp_secret, user.email or user.login or "user"))


@router.post("/2fa/enable", response_model=RecoveryCodesOut)
async def totp_enable(
    data: TotpCodeIn, request: Request, user: User = Depends(user_for_2fa_setup), db: AsyncSession = Depends(get_db)
):
    if not verify_totp(user.totp_secret, data.code):
        raise bad_request("Код не подошёл. Проверьте время на телефоне и попробуйте ещё раз.")
    codes = new_recovery_codes()
    user.totp_enabled = True
    user.recovery_codes = [hash_code(c) for c in codes]
    await db.flush()
    # если настраивали при обязательной 2FA, сразу пускаем внутрь
    tokens = await issue_tokens(db, user, request)
    return RecoveryCodesOut(recovery_codes=codes, tokens=tokens)


@router.post("/2fa/disable", status_code=204)
async def totp_disable(data: TotpCodeIn, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    if settings.require_2fa:
        raise bad_request("На этом сервере двухфакторная аутентификация обязательна.")
    if not verify_totp(user.totp_secret, data.code):
        raise bad_request("Неверный код.")
    user.totp_enabled = False
    user.totp_secret = None
    user.recovery_codes = None
    await db.commit()


@router.post("/2fa/recovery-codes", response_model=RecoveryCodesOut)
async def regenerate_codes(data: TotpCodeIn, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    if not user.totp_enabled or not verify_totp(user.totp_secret, data.code):
        raise bad_request("Неверный код.")
    codes = new_recovery_codes()
    user.recovery_codes = [hash_code(c) for c in codes]
    await db.commit()
    return RecoveryCodesOut(recovery_codes=codes)


# ---------------------------------------------------------------- Яндекс ID
@router.get("/yandex/login")
async def yandex_login(platform: str = "web", link_token: str | None = None):
    """Редирект на страницу согласия Яндекса. platform=mobile — вернём в приложение по deep link."""
    if not settings.yandex_enabled:
        raise bad_request("Вход через Яндекс не настроен на сервере.", 503)
    link_user = None
    if link_token:  # привязка Яндекса к уже существующему аккаунту
        try:
            link_user = decode(link_token, "access")["sub"]
        except jwt.PyJWTError:
            link_user = None
    params = {
        "response_type": "code",
        "client_id": settings.yandex_client_id,
        "redirect_uri": settings.yandex_redirect_uri,
        "state": state_token({"platform": platform, "link": link_user}),
        "force_confirm": "no",
    }
    return RedirectResponse(f"{YANDEX_AUTHORIZE}?{urlencode(params)}")


def _front_redirect(platform: str, fragment: dict) -> RedirectResponse:
    base = settings.mobile_redirect if platform == "mobile" else f"{settings.frontend_url}/oauth"
    return RedirectResponse(f"{base}#{urlencode(fragment)}")


@router.get("/yandex/callback")
async def yandex_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    platform = "web"
    try:
        st = decode(state or "", "oauth_state")
        platform = st.get("platform", "web")
    except jwt.PyJWTError:
        return _front_redirect(platform, {"error": "Ссылка входа устарела, попробуйте ещё раз."})
    if error or not code:
        return _front_redirect(platform, {"error": "Вход через Яндекс отменён."})

    async with httpx.AsyncClient(timeout=15) as client:
        token_resp = await client.post(
            YANDEX_TOKEN,
            data={
                "grant_type": "authorization_code",
                "code": code,
                "client_id": settings.yandex_client_id,
                "client_secret": settings.yandex_client_secret,
            },
        )
        if token_resp.status_code != 200:
            return _front_redirect(platform, {"error": "Яндекс не подтвердил вход."})
        ya_token = token_resp.json()["access_token"]
        info_resp = await client.get(YANDEX_INFO, params={"format": "json"}, headers={"Authorization": f"OAuth {ya_token}"})
        if info_resp.status_code != 200:
            return _front_redirect(platform, {"error": "Не удалось получить профиль Яндекса."})
        info = info_resp.json()

    subject = str(info["id"])
    email = (info.get("default_email") or "").lower() or None
    account = await db.scalar(
        select(OAuthAccount)
        .options(selectinload(OAuthAccount.user))
        .where(OAuthAccount.provider == "yandex", OAuthAccount.subject == subject)
    )
    if account:
        user = account.user
    else:
        user = None
        if st.get("link"):
            user = await db.get(User, uuid.UUID(st["link"]))
        if user is None and email:
            user = await db.scalar(select(User).where(User.email == email))
        if user is None:
            avatar = info.get("default_avatar_id")
            user = User(
                email=email,
                name=info.get("first_name") or info.get("display_name") or info.get("real_name"),
                avatar_url=f"https://avatars.yandex.net/get-yapic/{avatar}/islands-200" if avatar else None,
            )
            db.add(user)
            await db.flush()
        db.add(OAuthAccount(user_id=user.id, provider="yandex", subject=subject, login=info.get("login")))
        await db.flush()

    result = await after_first_factor(db, user, request)
    await db.commit()
    if isinstance(result, ChallengeOut):
        key = "challenge" if result.two_factor_required else "setup_challenge"
        return _front_redirect(platform, {key: result.challenge})
    return _front_redirect(platform, {"access_token": result.access_token, "refresh_token": result.refresh_token})
