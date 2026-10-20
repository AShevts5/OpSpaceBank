"""Решения задач, проверки клиентов и история."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.database import get_db
from ..deps import current_user
from ..logic import tasks as T
from ..models import Solution, TaskCode, User
from ..schemas import ClientIn, GenericIn, SolutionIn, SolutionOut, Task1DecideIn, Task1LogIn, Task3DecideIn

router = APIRouter(prefix="/tasks", tags=["tasks"])

CATALOG = [
    {
        "id": "task1",
        "title": "Автоодобрение кредитной заявки",
        "subtitle": "Навигатор BI: формализация, минимизация, Process Mining",
        "variables": T.TASK1_LEGEND,
    },
    {
        "id": "task2",
        "title": "Сегмент «Премиум»",
        "subtitle": "Интернет-магазин: приоритет операций, де Морган, SQL",
        "variables": T.TASK2_LEGEND,
    },
    {
        "id": "task3",
        "title": "Премиальная кредитная карта",
        "subtitle": "Таблица Квайна, СДНФ и СКНФ — два прочтения правила",
        "variables": T.TASK3_LEGEND,
        "variants": {k: v["title"] for k, v in T.TASK3_VARIANTS.items()},
    },
]


@router.get("")
async def catalog():
    return CATALOG


@router.get("/{task_id}/solution")
async def solution(task_id: str, variant: str = Query("strict", pattern="^(strict|deposit)$")):
    if task_id == "task3":
        return T.solve_task3(variant)
    solver = T.SOLVERS.get(task_id)
    if not solver:
        raise HTTPException(404, "Такой задачи нет.")
    return solver()


@router.post("/task1/decide")
async def task1_decide(data: Task1DecideIn):
    a, b, c = int(data.A), int(data.B), int(data.C)
    approved = T.task1_minimal(a, b, c)
    if not a:
        reason = "Кредитный рейтинг не высокий — автоматически не одобряем (A = 0)."
    elif approved:
        reason = "Высокий рейтинг и " + ("подтверждённый доход." if b else "надёжный поручитель.")
    else:
        reason = "Рейтинг высокий, но нет ни подтверждённого дохода, ни поручителя."
    return {"approved": bool(approved), "formula": "A∧(B∨C)", "values": {"A": a, "B": b, "C": c}, "reason": reason}


@router.get("/task1/log")
async def task1_log():
    return T.task1_check_log()


@router.post("/task1/check-log")
async def task1_check(data: Task1LogIn):
    rows = [r.model_dump() for r in data.rows] if data.rows else None
    return T.task1_check_log(rows)


@router.post("/task2/classify")
async def task2_classify(clients: list[ClientIn]):
    return [T.task2_classify(c.model_dump()) for c in clients]


@router.post("/task3/decide")
async def task3_decide(data: Task3DecideIn):
    x, y, z = int(data.X), int(data.Y), int(data.Z)
    return {
        "variant": data.variant,
        "approved": bool(T.task3_decide(data.variant, x, y, z)),
        "minterm": x * 4 + y * 2 + z,
        "minimal": T.solve_task3(data.variant)["answer"]["minimal"],
    }


@router.post("/quine")
async def quine(data: GenericIn):
    return T.generic_solve(data.variables, data.minterms)


# ---------------------------------------------------------------- история
history = APIRouter(prefix="/history", tags=["history"])


@history.get("", response_model=list[SolutionOut])
async def list_history(limit: int = 100, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    rows = await db.scalars(
        select(Solution).where(Solution.user_id == user.id).order_by(Solution.created_at.desc()).limit(min(limit, 500))
    )
    return list(rows)


@history.post("", response_model=list[SolutionOut])
async def add_history(items: list[SolutionIn], user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """Принимает пачку: фронтенд копит решения офлайн и досылает их при появлении сети.
    client_uid делает отправку идемпотентной — повтор не создаст дубль."""
    saved: list[Solution] = []
    for item in items[:200]:
        if item.client_uid:
            exists = await db.scalar(select(Solution).where(Solution.client_uid == item.client_uid))
            if exists:
                if exists.user_id == user.id:
                    saved.append(exists)
                continue
        data = item.model_dump(exclude_none=True)
        data["task"] = TaskCode(item.task)
        row = Solution(user_id=user.id, **data)
        db.add(row)
        saved.append(row)
    await db.commit()
    return saved


@history.delete("", status_code=204)
async def clear_history(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    await db.execute(delete(Solution).where(Solution.user_id == user.id))
    await db.commit()
