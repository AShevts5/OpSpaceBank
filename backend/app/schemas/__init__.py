from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


# ---------------------------------------------------------------- auth
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: str | None = Field(default=None, max_length=120)


class LoginIn(BaseModel):
    login: str = Field(description="email или логин")
    password: str


class SecondFactorIn(BaseModel):
    challenge: str
    code: str = Field(min_length=6, max_length=16, description="6 цифр из приложения или код восстановления")


class RefreshIn(BaseModel):
    refresh_token: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str | None
    login: str | None
    name: str | None
    avatar_url: str | None
    totp_enabled: bool
    has_password: bool = False
    yandex_linked: bool = False
    created_at: datetime


class TokensOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int
    user: UserOut


class ChallengeOut(BaseModel):
    two_factor_required: bool = False
    two_factor_setup_required: bool = False
    challenge: str


class TotpSetupOut(BaseModel):
    secret: str
    otpauth_uri: str


class TotpCodeIn(BaseModel):
    code: str


class RecoveryCodesOut(BaseModel):
    recovery_codes: list[str]
    tokens: TokensOut | None = None


class ProfileIn(BaseModel):
    name: str | None = Field(default=None, max_length=120)


class PasswordChangeIn(BaseModel):
    old_password: str | None = None
    new_password: str = Field(min_length=8, max_length=128)


# ---------------------------------------------------------------- задачи
class Task1DecideIn(BaseModel):
    A: bool
    B: bool
    C: bool


class Task1LogRow(BaseModel):
    case: str
    A: int
    B: int
    C: int
    decision: Literal["approved", "rejected"]
    actor: str | None = None


class Task1LogIn(BaseModel):
    rows: list[Task1LogRow] | None = None


class ClientIn(BaseModel):
    name: str = "Клиент"
    purchases: int = Field(ge=0)
    avg_check: float = Field(ge=0)
    loyalty: bool = False
    blacklist: bool = False


class Task3DecideIn(BaseModel):
    variant: Literal["strict", "deposit"] = "strict"
    X: bool
    Y: bool
    Z: bool


class GenericIn(BaseModel):
    variables: list[str] = Field(min_length=1, max_length=6)
    minterms: list[int]

    @field_validator("minterms")
    @classmethod
    def _range(cls, v: list[int], info: Any) -> list[int]:
        n = len(info.data.get("variables", []))
        if any(m < 0 or m >= 2**n for m in v):
            raise ValueError(f"номера наборов должны быть от 0 до {2 ** n - 1}")
        return sorted(set(v))


class SolutionIn(BaseModel):
    task: Literal["task1", "task2", "task3", "custom"]
    mode: str = Field(max_length=32)
    variant: str | None = None
    input: dict | None = None
    result: dict | None = None
    score: int | None = None
    total: int | None = None
    client_uid: str | None = Field(default=None, max_length=64)
    created_at: datetime | None = None


class SolutionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    task: str
    mode: str
    variant: str | None
    input: dict | None
    result: dict | None
    score: int | None
    total: int | None
    created_at: datetime


# ---------------------------------------------------------------- AI
class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    session_id: uuid.UUID | None = None
    context: str | None = Field(default=None, max_length=40, description="на какой странице пользователь")


class ChatSessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    updated_at: datetime


class ChatMessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    role: str
    content: str
    source: str | None
    created_at: datetime
