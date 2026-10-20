"""AI-помощник: чат со стримингом (Server-Sent Events) и историей диалогов."""

from __future__ import annotations

import asyncio
import json
import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.database import SessionLocal, get_db
from ..deps import current_user
from ..models import ChatMessage, ChatSession, User
from ..schemas import ChatIn, ChatMessageOut, ChatSessionOut
from ..services.knowledge import local_answer, system_prompt
from ..services.llm import LLMUnavailable, llm_enabled, stream_answer

router = APIRouter(prefix="/assistant", tags=["assistant"])
log = logging.getLogger(__name__)
HISTORY_LIMIT = 12


def sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


@router.get("/status")
async def status():
    return {"llm": llm_enabled()}


@router.post("/chat")
async def chat(data: ChatIn, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    if data.session_id:
        session = await db.get(ChatSession, data.session_id)
        if not session or session.user_id != user.id:
            raise HTTPException(404, "Диалог не найден.")
    else:
        session = ChatSession(user_id=user.id, title=data.message.strip()[:80])
        db.add(session)
        await db.flush()

    db.add(ChatMessage(session_id=session.id, role="user", content=data.message.strip()))
    await db.commit()

    previous = (
        await db.scalars(
            select(ChatMessage)
            .where(ChatMessage.session_id == session.id)
            .order_by(ChatMessage.id.desc())
            .limit(HISTORY_LIMIT)
        )
    ).all()
    history = [{"role": m.role, "content": m.content} for m in reversed(previous)]
    session_id = session.id
    system = system_prompt(data.context)

    async def generate():
        yield sse("session", {"session_id": str(session_id)})
        parts: list[str] = []
        source = "llm"
        try:
            async for chunk in stream_answer(system, history):
                parts.append(chunk)
                yield sse("delta", {"text": chunk})
        except (LLMUnavailable, Exception) as exc:  # noqa: BLE001 — любая ошибка модели → локальная база
            if not isinstance(exc, LLMUnavailable):
                log.warning("LLM error: %s", exc)
            if not parts:
                source = "knowledge"
                answer = local_answer(data.message)
                # имитируем печать, чтобы интерфейс вёл себя одинаково
                for i in range(0, len(answer), 24):
                    parts.append(answer[i : i + 24])
                    yield sse("delta", {"text": answer[i : i + 24]})
                    await asyncio.sleep(0.01)
        text = "".join(parts).strip()
        async with SessionLocal() as s:  # сессия запроса к этому моменту может быть закрыта
            s.add(ChatMessage(session_id=session_id, role="assistant", content=text, source=source))
            chat_session = await s.get(ChatSession, session_id)
            if chat_session:
                chat_session.updated_at = func.now()
            await s.commit()
        yield sse("done", {"source": source})

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/sessions", response_model=list[ChatSessionOut])
async def sessions(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    rows = await db.scalars(
        select(ChatSession).where(ChatSession.user_id == user.id).order_by(ChatSession.updated_at.desc()).limit(50)
    )
    return list(rows)


@router.get("/sessions/{session_id}", response_model=list[ChatMessageOut])
async def messages(session_id: uuid.UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    session = await db.get(ChatSession, session_id)
    if not session or session.user_id != user.id:
        raise HTTPException(404, "Диалог не найден.")
    rows = await db.scalars(select(ChatMessage).where(ChatMessage.session_id == session_id).order_by(ChatMessage.id))
    return list(rows)


@router.delete("/sessions/{session_id}", status_code=204)
async def delete_session(session_id: uuid.UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    session = await db.get(ChatSession, session_id)
    if session and session.user_id == user.id:
        await db.delete(session)
        await db.commit()
