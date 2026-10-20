"""Булев движок: таблицы истинности, СДНФ/СКНФ и метод Квайна — Мак-Класки.

Модуль не зависит от FastAPI и БД: его гоняют тесты, API и AI-помощник.
Порядок переменных задаёт старшинство битов: первая переменная — старший бит,
поэтому для (X, Y, Z) набор 011 — это минтерм m3 = ¬X·Y·Z.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from itertools import combinations, product
from typing import Callable, Iterable, Sequence

NOT = "¬"
AND = "∧"
OR = "∨"


# ---------------------------------------------------------------- таблица истинности
def assignments(n: int) -> list[tuple[int, ...]]:
    """Все наборы из n битов в порядке возрастания номера (000, 001, ...)."""
    return [tuple(bits) for bits in product((0, 1), repeat=n)]


def index_of(bits: Sequence[int]) -> int:
    value = 0
    for bit in bits:
        value = (value << 1) | int(bit)
    return value


def truth_table(variables: Sequence[str], func: Callable[..., bool | int]) -> list[dict]:
    rows = []
    for bits in assignments(len(variables)):
        rows.append({"index": index_of(bits), "bits": list(bits), "value": int(bool(func(*bits)))})
    return rows


def minterms_of(variables: Sequence[str], func: Callable[..., bool | int]) -> list[int]:
    return [row["index"] for row in truth_table(variables, func) if row["value"]]


def bits_of(index: int, n: int) -> str:
    return format(index, f"0{n}b")


# ---------------------------------------------------------------- запись термов
def literal(var: str, bit: str | int, form: str = "dnf") -> str:
    """Литерал для конъюнкции (dnf) или дизъюнкции (cnf)."""
    bit = str(bit)
    if form == "dnf":
        return var if bit == "1" else f"{NOT}{var}"
    return var if bit == "0" else f"{NOT}{var}"


def pattern_to_term(pattern: str, variables: Sequence[str]) -> str:
    """'1-0' -> 'X∧¬Z'. Прочерк — переменная склеилась и выпала."""
    parts = [literal(v, b) for v, b in zip(variables, pattern) if b != "-"]
    return AND.join(parts) if parts else "1"


def minterm_term(index: int, variables: Sequence[str]) -> str:
    return AND.join(literal(v, b) for v, b in zip(variables, bits_of(index, len(variables))))


def maxterm_term(index: int, variables: Sequence[str]) -> str:
    return "(" + OR.join(literal(v, b, "cnf") for v, b in zip(variables, bits_of(index, len(variables)))) + ")"


def sdnf(minterms: Iterable[int], variables: Sequence[str]) -> str:
    terms = [minterm_term(m, variables) for m in sorted(minterms)]
    if not terms:
        return "0"
    return f" {OR} ".join(f"({t})" if len(variables) > 1 else t for t in terms)


def sknf(minterms: Iterable[int], variables: Sequence[str]) -> str:
    ones = set(minterms)
    zeros = [i for i in range(2 ** len(variables)) if i not in ones]
    if not zeros:
        return "1"
    return f" {AND} ".join(maxterm_term(m, variables) for m in zeros)


def dnf_from_patterns(patterns: Iterable[str], variables: Sequence[str]) -> str:
    patterns = list(patterns)
    if not patterns:
        return "0"
    terms = [pattern_to_term(p, variables) for p in patterns]
    if len(terms) == 1:
        return terms[0]
    return f" {OR} ".join(f"({t})" if AND in t else t for t in terms)


# ---------------------------------------------------------------- Квайн — Мак-Класки
def ones(pattern: str) -> int:
    return pattern.count("1")


def covers(pattern: str, index: int) -> bool:
    bits = bits_of(index, len(pattern))
    return all(p == "-" or p == b for p, b in zip(pattern, bits))


def term_order(pattern: str) -> tuple:
    """Порядок вывода термов: сначала с прямой первой переменной (X∧Y раньше Y∧Z)."""
    return tuple({"1": 0, "0": 1, "-": 2}[c] for c in pattern)


def try_combine(a: str, b: str) -> str | None:
    """Склеивание: термы отличаются ровно в одной позиции и прочерки совпадают."""
    diff = -1
    for i, (x, y) in enumerate(zip(a, b)):
        if x != y:
            if x == "-" or y == "-" or diff != -1:
                return None
            diff = i
    if diff == -1:
        return None
    return a[:diff] + "-" + a[diff + 1 :]


@dataclass
class Implicant:
    pattern: str
    minterms: tuple[int, ...]

    def to_dict(self, variables: Sequence[str]) -> dict:
        return {
            "pattern": self.pattern,
            "minterms": list(self.minterms),
            "term": pattern_to_term(self.pattern, variables),
            "label": "m(" + ",".join(map(str, self.minterms)) + ")",
        }


@dataclass
class QMResult:
    variables: list[str]
    minterms: list[int]
    stages: list[dict] = field(default_factory=list)
    prime_implicants: list[Implicant] = field(default_factory=list)
    chart: list[dict] = field(default_factory=list)
    essential: list[Implicant] = field(default_factory=list)
    extra: list[Implicant] = field(default_factory=list)
    redundant: list[Implicant] = field(default_factory=list)
    minimal: list[Implicant] = field(default_factory=list)
    all_minimal_covers: list[list[str]] = field(default_factory=list)

    @property
    def minimal_dnf(self) -> str:
        return dnf_from_patterns([i.pattern for i in self.minimal], self.variables)

    def to_dict(self) -> dict:
        v = self.variables
        return {
            "variables": v,
            "minterms": self.minterms,
            "stages": self.stages,
            "prime_implicants": [i.to_dict(v) for i in self.prime_implicants],
            "chart": self.chart,
            "essential": [i.to_dict(v) for i in self.essential],
            "extra": [i.to_dict(v) for i in self.extra],
            "redundant": [i.to_dict(v) for i in self.redundant],
            "minimal": [i.to_dict(v) for i in self.minimal],
            "minimal_dnf": self.minimal_dnf,
            "all_minimal_covers": self.all_minimal_covers,
            "sdnf": sdnf(self.minterms, v),
            "sknf": sknf(self.minterms, v),
        }


def quine_mccluskey(minterms: Iterable[int], variables: Sequence[str]) -> QMResult:
    """Полный ход метода с промежуточными стадиями для показа пользователю."""
    variables = list(variables)
    n = len(variables)
    mins = sorted(set(minterms))
    result = QMResult(variables=variables, minterms=mins)
    if not mins:
        return result

    current = [Implicant(bits_of(m, n), (m,)) for m in mins]
    primes: list[Implicant] = []
    stage_no = 0
    while current:
        groups: dict[int, list[Implicant]] = {}
        for imp in current:
            groups.setdefault(ones(imp.pattern), []).append(imp)
        used: set[str] = set()
        merges: list[dict] = []
        nxt: dict[str, Implicant] = {}
        keys = sorted(groups)
        for k in keys:
            for a in groups.get(k, []):
                for b in groups.get(k + 1, []):
                    combined = try_combine(a.pattern, b.pattern)
                    if combined is None:
                        continue
                    used.add(a.pattern)
                    used.add(b.pattern)
                    mt = tuple(sorted(set(a.minterms) | set(b.minterms)))
                    merges.append(
                        {
                            "a": a.pattern,
                            "b": b.pattern,
                            "result": combined,
                            "minterms": list(mt),
                            "term": pattern_to_term(combined, variables),
                        }
                    )
                    nxt.setdefault(combined, Implicant(combined, mt))
        stage_primes = [imp for imp in current if imp.pattern not in used]
        primes.extend(stage_primes)
        result.stages.append(
            {
                "stage": stage_no,
                "groups": [
                    {
                        "ones": k,
                        "items": [
                            {**imp.to_dict(variables), "used": imp.pattern in used} for imp in groups[k]
                        ],
                    }
                    for k in keys
                ],
                "merges": merges,
                "primes_here": [imp.pattern for imp in stage_primes],
            }
        )
        current = list(nxt.values())
        stage_no += 1

    # уникальные простые импликанты в стабильном порядке
    seen: dict[str, Implicant] = {}
    for p in primes:
        seen.setdefault(p.pattern, p)
    primes = sorted(seen.values(), key=lambda i: term_order(i.pattern))
    result.prime_implicants = primes

    # импликантная таблица (таблица Квайна)
    chart = []
    for p in primes:
        chart.append(
            {
                "pattern": p.pattern,
                "term": pattern_to_term(p.pattern, variables),
                "covers": {str(m): covers(p.pattern, m) for m in mins},
            }
        )
    result.chart = chart

    essential: list[Implicant] = []
    for m in mins:
        covering = [p for p in primes if covers(p.pattern, m)]
        if len(covering) == 1 and covering[0] not in essential:
            essential.append(covering[0])
    result.essential = sorted(essential, key=lambda i: term_order(i.pattern))

    covered = {m for p in essential for m in mins if covers(p.pattern, m)}
    rest = [m for m in mins if m not in covered]
    candidates = [p for p in primes if p not in essential]

    best: list[list[Implicant]] = []
    if rest:
        for size in range(1, len(candidates) + 1):
            for combo in combinations(candidates, size):
                if all(any(covers(p.pattern, m) for p in combo) for m in rest):
                    best.append(list(combo))
            if best:
                break
        # среди покрытий одной длины выбираем с наименьшим числом литералов
        best.sort(key=lambda c: sum(len(p.pattern) - p.pattern.count("-") for p in c))
    extra = best[0] if best else []
    result.extra = extra
    result.minimal = sorted(essential + extra, key=lambda i: term_order(i.pattern))
    result.redundant = [p for p in primes if p not in result.minimal]
    covers_list = [[p.pattern for p in essential + c] for c in best] if best else [[p.pattern for p in essential]]
    result.all_minimal_covers = covers_list
    return result


def evaluate_patterns(patterns: Iterable[str], bits: Sequence[int]) -> int:
    idx = index_of(bits)
    return int(any(covers(p, idx) for p in patterns))


def table_rows(variables: Sequence[str], columns: dict[str, Callable[..., int]]) -> dict:
    """Таблица для фронта: переменные + произвольные вычисляемые столбцы."""
    header = list(variables) + list(columns)
    rows = []
    for bits in assignments(len(variables)):
        rows.append(list(bits) + [int(bool(f(*bits))) for f in columns.values()])
    return {"columns": header, "rows": rows}
