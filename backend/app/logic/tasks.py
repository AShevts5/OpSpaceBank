"""Три банковские задачи: формализация, минимизация, проверка и интерпретация.

Каждая функция solve_* возвращает словарь одной и той же формы:
{ id, title, variables, steps: [...], answer: {...} }, где step —
{ title, text, formula?, table?, code? }. Эту же форму рисует фронтенд.
"""

from __future__ import annotations

from typing import Any

from .boolean import (
    AND,
    NOT,
    OR,
    quine_mccluskey,
    sdnf,
    sknf,
    table_rows,
)

# ============================================================== задача 1
TASK1_VARS = ["A", "B", "C"]
TASK1_LEGEND = {
    "A": "Кредитный рейтинг клиента высокий",
    "B": "Доход подтверждён официальной справкой",
    "C": "Есть поручитель с хорошей кредитной историей",
}


def task1_original(a: int, b: int, c: int) -> int:
    return int((a and b) or (a and not b and c))


def task1_minimal(a: int, b: int, c: int) -> int:
    return int(a and (b or c))


# Журнал событий для Process Mining: как заявки реально прошли через процесс.
TASK1_EVENT_LOG: list[dict[str, Any]] = [
    {"case": "Z-1001", "A": 1, "B": 1, "C": 0, "decision": "approved", "actor": "робот"},
    {"case": "Z-1002", "A": 1, "B": 0, "C": 1, "decision": "approved", "actor": "робот"},
    {"case": "Z-1003", "A": 0, "B": 1, "C": 1, "decision": "approved", "actor": "менеджер Петров"},
    {"case": "Z-1004", "A": 1, "B": 0, "C": 0, "decision": "rejected", "actor": "робот"},
    {"case": "Z-1005", "A": 0, "B": 0, "C": 1, "decision": "rejected", "actor": "робот"},
    {"case": "Z-1006", "A": 1, "B": 0, "C": 0, "decision": "approved", "actor": "менеджер Сидорова"},
    {"case": "Z-1007", "A": 1, "B": 1, "C": 1, "decision": "approved", "actor": "робот"},
    {"case": "Z-1008", "A": 0, "B": 1, "C": 0, "decision": "rejected", "actor": "робот"},
    {"case": "Z-1009", "A": 1, "B": 0, "C": 1, "decision": "rejected", "actor": "менеджер Петров"},
    {"case": "Z-1010", "A": 0, "B": 0, "C": 0, "decision": "approved", "actor": "менеджер Сидорова"},
    {"case": "Z-1011", "A": 1, "B": 1, "C": 0, "decision": "approved", "actor": "робот"},
    {"case": "Z-1012", "A": 0, "B": 1, "C": 1, "decision": "rejected", "actor": "робот"},
]


def task1_check_log(log: list[dict[str, Any]] | None = None) -> dict:
    """Сверка журнала с правилом F = A ∧ (B ∨ C).

    violation   — одобрено вопреки правилу (риск для банка);
    missed      — правило разрешало, а заявку отклонили (упущенная выгода).
    """
    log = log if log is not None else TASK1_EVENT_LOG
    rows = []
    for item in log:
        a, b, c = int(item["A"]), int(item["B"]), int(item["C"])
        expected = task1_minimal(a, b, c)
        actual = 1 if item["decision"] == "approved" else 0
        status = "ok"
        if actual == 1 and expected == 0:
            status = "violation"
        elif actual == 0 and expected == 1:
            status = "missed"
        rows.append({**item, "expected": expected, "actual": actual, "status": status})
    return {
        "rows": rows,
        "violations": [r["case"] for r in rows if r["status"] == "violation"],
        "missed": [r["case"] for r in rows if r["status"] == "missed"],
        "conformance": round(sum(r["status"] == "ok" for r in rows) / max(len(rows), 1), 3),
    }


def solve_task1() -> dict:
    table = table_rows(
        TASK1_VARS,
        {
            "A∧B": lambda a, b, c: a and b,
            "A∧¬B∧C": lambda a, b, c: a and not b and c,
            "F исходная": task1_original,
            "A∧(B∨C)": task1_minimal,
        },
    )
    equal = all(r[-1] == r[-2] for r in table["rows"])
    log = task1_check_log()
    return {
        "id": "task1",
        "title": "Автоодобрение кредитной заявки (Навигатор BI)",
        "variables": TASK1_LEGEND,
        "steps": [
            {
                "title": "1. Формализация",
                "text": "«Высокий рейтинг И подтверждён доход» → A∧B. «Высокий рейтинг, доход НЕ подтверждён, "
                "И есть поручитель» → A∧¬B∧C. Случаи связаны союзом «ЛИБО» — это дизъюнкция.",
                "formula": "F(A,B,C) = (A∧B) ∨ (A∧¬B∧C)",
            },
            {
                "title": "2. Дистрибутивный закон: выносим A за скобку",
                "text": "Общий множитель A есть в обоих слагаемых.",
                "formula": "F = A ∧ (B ∨ (¬B ∧ C))",
            },
            {
                "title": "3. Распределительный закон дизъюнкции относительно конъюнкции",
                "text": "B ∨ (¬B∧C) = (B∨¬B) ∧ (B∨C).",
                "formula": "F = A ∧ ((B∨¬B) ∧ (B∨C))",
            },
            {
                "title": "4. Закон исключённого третьего",
                "text": "B ∨ ¬B = 1, а 1 ∧ X = X.",
                "formula": "F = A ∧ (B ∨ C)",
            },
            {
                "title": "5. Проверка таблицей истинности",
                "text": "Столбцы исходной и минимальной формулы совпадают на всех 8 наборах."
                if equal
                else "Внимание: столбцы не совпали!",
                "table": table,
            },
            {
                "title": "6. Реализация в «Навигатор BI»",
                "text": "В конструктор бизнес-логики закладывается F = A∧(B∨C): вместо трёх сложных проверок "
                "(с отрицанием) система делает две, что снижает требования к вычислительным ресурсам.",
                "code": "approve = rating_high AND (income_confirmed OR has_guarantor)",
            },
            {
                "title": "7. Process Mining: поиск нарушений",
                "text": f"Сверили {len(log['rows'])} заявок из журнала с правилом. Одобрено вопреки правилу: "
                f"{', '.join(log['violations']) or 'нет'}. Отклонено, хотя правило разрешало: "
                f"{', '.join(log['missed']) or 'нет'}. Соответствие процесса правилу: {round(log['conformance'] * 100)}%.",
                "process_log": log,
            },
        ],
        "answer": {
            "original": "F = (A∧B) ∨ (A∧¬B∧C)",
            "minimal": "F = A∧(B∨C)",
            "interpretation": "Заявка одобряется, если у клиента высокий рейтинг и при этом либо подтверждён "
            "доход, либо есть надёжный поручитель.",
            "violations": log["violations"],
            "missed": log["missed"],
        },
    }


# ============================================================== задача 2
TASK2_VARS = ["A", "B", "C", "D"]
TASK2_LEGEND = {
    "A": "Покупок больше 10",
    "B": "Средний чек выше 5000 ₽",
    "C": "Участвует в программе лояльности",
    "D": "Клиент в чёрном списке",
}

TASK2_CLIENTS = [
    {"name": "Анна", "purchases": 12, "avg_check": 6000, "loyalty": False, "blacklist": False},
    {"name": "Игорь", "purchases": 15, "avg_check": 3000, "loyalty": True, "blacklist": False},
    {"name": "Олег", "purchases": 5, "avg_check": 10000, "loyalty": True, "blacklist": False},
    {"name": "Елена", "purchases": 20, "avg_check": 8000, "loyalty": True, "blacklist": False},
]


def task2_rule(a: int, b: int, c: int, d: int) -> int:
    return int(a and (b or c) and not d)


def task2_wrong_priority(a: int, b: int, c: int, d: int) -> int:
    """Ошибка без скобок: A∧B ∨ C∧¬D — конъюнкция связывает сильнее."""
    return int((a and b) or (c and not d))


def task2_flags(client: dict) -> dict:
    return {
        "A": int(client["purchases"] > 10),
        "B": int(client["avg_check"] > 5000),
        "C": int(bool(client["loyalty"])),
        "D": int(bool(client.get("blacklist", False))),
    }


def task2_classify(client: dict) -> dict:
    f = task2_flags(client)
    premium = task2_rule(f["A"], f["B"], f["C"], f["D"])
    wrong = task2_wrong_priority(f["A"], f["B"], f["C"], f["D"])
    if f["D"]:
        reason = "в чёрном списке — в сегмент не попадает ни при каких условиях"
    elif not f["A"]:
        reason = "10 покупок и меньше — не выполнено обязательное условие A"
    elif premium:
        reason = "больше 10 покупок и " + ("высокий средний чек" if f["B"] else "участвует в программе лояльности")
    else:
        reason = "нет ни высокого чека, ни участия в программе лояльности"
    return {**client, **f, "premium": premium, "without_brackets": wrong, "reason": reason}


TASK2_SQL = (
    "SELECT * FROM clients\n"
    "WHERE purchases_count > 10\n"
    "  AND (avg_check > 5000 OR loyalty = TRUE)\n"
    "  AND NOT is_blacklisted;"
)
TASK2_SQL_DEMORGAN = (
    "-- ¬(B ∨ C) = ¬B ∧ ¬C (закон де Моргана)\n"
    "SELECT * FROM clients\n"
    "WHERE avg_check <= 5000 AND loyalty = FALSE;"
)


def solve_task2() -> dict:
    table = table_rows(
        TASK2_VARS,
        {
            "B∨C": lambda a, b, c, d: b or c,
            "¬D": lambda a, b, c, d: not d,
            "F": task2_rule,
            "без скобок": task2_wrong_priority,
        },
    )
    clients = [task2_classify(c) for c in TASK2_CLIENTS]
    diff_rows = [r for r in table["rows"] if r[-1] != r[-2]]
    return {
        "id": "task2",
        "title": "Сегмент «Премиум» для закрытой распродажи",
        "variables": TASK2_LEGEND,
        "steps": [
            {
                "title": "1. Выделяем высказывания",
                "text": "A: покупок > 10; B: средний чек > 5000 ₽; C: участвует в программе лояльности; "
                "D: клиент в чёрном списке.",
            },
            {
                "title": "2. Составляем логическую функцию",
                "text": "«Более 10 покупок И (чек выше 5000 ИЛИ лояльность)», «однако чёрный список — никогда» → "
                "добавляем ∧¬D. Скобки обязательны: конъюнкция приоритетнее дизъюнкции.",
                "formula": "F(A,B,C,D) = A ∧ (B ∨ C) ∧ ¬D",
            },
            {
                "title": "3. Таблица истинности (16 наборов)",
                "text": f"F = 1 ровно на {sum(r[-2] for r in table['rows'])} наборах. Последний столбец — та же "
                f"формула без скобок: она расходится с правильной на {len(diff_rows)} наборах.",
                "table": table,
            },
            {
                "title": "4. Законы де Моргана в аналитике",
                "text": "Если маркетологи попросят исключить тех, у кого есть высокий чек или лояльность, "
                "нужно ¬(B∨C). По де Моргану это ¬B ∧ ¬C: «чек ≤ 5000 И лояльность = 0» — простой запрос "
                "без OR, что снижает нагрузку на сервер и ускоряет построение дашборда.",
                "formula": "¬(B ∨ C) = ¬B ∧ ¬C",
                "code": TASK2_SQL_DEMORGAN,
            },
            {
                "title": "5. SQL-запрос для BI",
                "text": "Правило в виде фильтра витрины клиентов.",
                "code": TASK2_SQL,
            },
            {
                "title": "6. Тест-кейсы на конкретных клиентах",
                "text": "; ".join(
                    f"{c['name']}: {'ПРЕМИУМ' if c['premium'] else 'нет'} ({c['reason']})" for c in clients
                ),
                "clients": clients,
            },
        ],
        "answer": {
            "formula": "F = A∧(B∨C)∧¬D",
            "premium": [c["name"] for c in clients if c["premium"]],
            "rejected": [c["name"] for c in clients if not c["premium"]],
            "summary": "Главное — правильно расставить приоритеты (скобки). Без скобок условие «>10 покупок» "
            "относилось бы только к среднему чеку, и все участники программы лояльности (даже с 1 покупкой) "
            "попали бы в премиум.",
        },
    }


# ============================================================== задача 3
TASK3_VARS = ["X", "Y", "Z"]
TASK3_LEGEND = {
    "X": "Высокий доход",
    "Y": "Положительная кредитная история",
    "Z": "Есть депозит в банке",
}

TASK3_VARIANTS: dict[str, dict] = {
    "strict": {
        "title": "Вариант 1: правило 2 = ¬X ∧ Y ∧ Z",
        "reading": "Нет высокого дохода, но есть идеальная кредитная история И крупный депозит "
        "(оговорку «даже если история подкачала» считаем опечаткой — история нужна).",
        "rule2": f"{NOT}X{AND}Y{AND}Z",
        "func": lambda x, y, z: int((x and y) or (not x and y and z)),
    },
    "deposit": {
        "title": "Вариант 2: правило 2 = ¬X ∧ Z",
        "reading": "Нет высокого дохода, но есть крупный депозит — «даже если кредитная история подкачала», "
        "то есть история во втором правиле не важна.",
        "rule2": f"{NOT}X{AND}Z",
        "func": lambda x, y, z: int((x and y) or (not x and z)),
    },
}


def task3_interpret(variant: str, qm: dict) -> list[str]:
    lines = []
    if variant == "strict":
        lines += [
            "Простые импликанты X∧Y и Y∧Z обе существенные — без любой из них часть клиентов потеряется.",
            "Итог F = (X∧Y) ∨ (Y∧Z) = Y ∧ (X ∨ Z): положительная кредитная история обязательна всегда, "
            "а дальше достаточно ЛИБО высокого дохода, ЛИБО депозита.",
            "Для IT: сначала проверяем Y (самый «отсекающий» и дешёвый запрос в бюро кредитных историй), "
            "при Y=0 сразу отказ — запросы о доходе и депозите не нужны.",
        ]
    else:
        lines += [
            "Получились три простые импликанты: X∧Y, ¬X∧Z и Y∧Z. Существенные — X∧Y (только она покрывает m6) "
            "и ¬X∧Z (только она покрывает m1).",
            "Импликанта Y∧Z (история + депозит) — консенсус двух других и лишняя: все её клиенты уже одобрены "
            "первыми двумя правилами. Это дублирующая проверка, которую не нужно программировать.",
            "Итог F = (X∧Y) ∨ (¬X∧Z): при высоком доходе решает кредитная история, без высокого дохода — "
            "наличие депозита. Это мультиплексор: X выбирает, какой фактор смотреть.",
            "Для IT: одно ветвление if X: return Y else: return Z — по одной проверке на каждой ветке.",
        ]
    lines.append(
        "СДНФ перечисляет все «одобряемые» профили клиентов поштучно (её удобно использовать как "
        "набор тест-кейсов), СКНФ — все запрещающие комбинации (удобно для валидаторов отказов)."
    )
    return lines


def solve_task3(variant: str = "strict") -> dict:
    if variant not in TASK3_VARIANTS:
        raise ValueError(f"unknown variant {variant!r}")
    meta = TASK3_VARIANTS[variant]
    func = meta["func"]
    table = table_rows(TASK3_VARS, {"X∧Y": lambda x, y, z: x and y, meta["rule2"]: lambda x, y, z: func(x, y, z) and not (x and y), "F": func})
    mins = [i for i, row in enumerate(table["rows"]) if row[-1]]
    qm = quine_mccluskey(mins, TASK3_VARS).to_dict()
    minimal = qm["minimal_dnf"]
    return {
        "id": "task3",
        "variant": variant,
        "title": "Автоматизация одобрения кредитного лимита — " + meta["title"],
        "variables": TASK3_LEGEND,
        "steps": [
            {"title": "1. Как читаем правило 2", "text": meta["reading"]},
            {
                "title": "2. Функция по бизнес-правилам",
                "formula": f"F(X,Y,Z) = (X{AND}Y) {OR} ({meta['rule2']})",
                "text": "Правила связаны «или»: достаточно выполнения любого из них.",
            },
            {
                "title": "3. Таблица истинности и номера наборов",
                "text": "Наборы, где F = 1: " + ", ".join(f"m{m}" for m in mins) + ".",
                "table": table,
            },
            {"title": "4. СДНФ (по единицам функции)", "formula": "F = " + qm["sdnf"]},
            {"title": "5. СКНФ (по нулям функции)", "formula": "F = " + qm["sknf"]},
            {
                "title": "6. Склеивание (метод Квайна)",
                "text": "Группируем наборы по числу единиц и склеиваем соседние группы: термы, отличающиеся "
                "одной переменной, дают терм без неё (A·x ∨ A·¬x = A).",
                "qm_stages": qm["stages"],
            },
            {
                "title": "7. Импликантная таблица Квайна",
                "text": "Строки — простые импликанты, столбцы — наборы СДНФ. Столбец с единственной отметкой "
                "указывает на существенную импликанту.",
                "qm_chart": qm["chart"],
            },
            {"title": "8. Минимальная ДНФ", "formula": "F = " + minimal},
            {"title": "9. Интерпретация для IT-отдела", "text": "\n".join(task3_interpret(variant, qm))},
        ],
        "answer": {
            "minterms": mins,
            "sdnf": qm["sdnf"],
            "sknf": qm["sknf"],
            "prime_implicants": [p["term"] for p in qm["prime_implicants"]],
            "essential": [p["term"] for p in qm["essential"]],
            "redundant": [p["term"] for p in qm["redundant"]],
            "minimal": minimal,
        },
        "qm": qm,
    }


def task3_decide(variant: str, x: int, y: int, z: int) -> int:
    return TASK3_VARIANTS[variant]["func"](x, y, z)


SOLVERS = {"task1": solve_task1, "task2": solve_task2, "task3": solve_task3}


def generic_solve(variables: list[str], minterms: list[int]) -> dict:
    qm = quine_mccluskey(minterms, variables)
    d = qm.to_dict()
    d["sdnf"] = sdnf(minterms, variables)
    d["sknf"] = sknf(minterms, variables)
    return d
