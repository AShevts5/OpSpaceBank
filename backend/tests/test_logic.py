"""Тесты логики задач. Запуск: pytest -q (или python -m tests.test_logic)."""

from itertools import product

from app.logic.boolean import quine_mccluskey, sdnf, sknf
from app.logic.tasks import (
    solve_task1,
    solve_task2,
    solve_task3,
    task1_check_log,
    task1_minimal,
    task1_original,
    task2_classify,
    TASK2_CLIENTS,
    task3_decide,
)


def test_task1_minimization_equivalent():
    for a, b, c in product((0, 1), repeat=3):
        assert task1_original(a, b, c) == task1_minimal(a, b, c)


def test_task1_process_mining():
    log = task1_check_log()
    assert set(log["violations"]) == {"Z-1003", "Z-1006", "Z-1010"}
    assert log["missed"] == ["Z-1009"]
    assert solve_task1()["answer"]["minimal"] == "F = A∧(B∨C)"


def test_task2_clients():
    result = {c["name"]: task2_classify(c)["premium"] for c in TASK2_CLIENTS}
    assert result == {"Анна": 1, "Игорь": 1, "Олег": 0, "Елена": 1}
    blacklisted = task2_classify({"name": "X", "purchases": 50, "avg_check": 9000, "loyalty": True, "blacklist": True})
    assert blacklisted["premium"] == 0
    # без скобок участник лояльности с 1 покупкой ошибочно попадает в премиум
    low = task2_classify({"name": "Y", "purchases": 1, "avg_check": 100, "loyalty": True})
    assert low["premium"] == 0 and low["without_brackets"] == 1
    assert sum(r[-2] for r in solve_task2()["steps"][2]["table"]["rows"]) == 3


def test_task3_strict():
    s = solve_task3("strict")
    assert s["answer"]["minterms"] == [3, 6, 7]
    assert s["answer"]["minimal"] == "(X∧Y) ∨ (Y∧Z)"
    assert s["answer"]["redundant"] == []
    assert s["answer"]["sdnf"] == "(¬X∧Y∧Z) ∨ (X∧Y∧¬Z) ∨ (X∧Y∧Z)"


def test_task3_deposit():
    s = solve_task3("deposit")
    assert s["answer"]["minterms"] == [1, 3, 6, 7]
    assert set(s["answer"]["prime_implicants"]) == {"X∧Y", "¬X∧Z", "Y∧Z"}
    assert set(s["answer"]["essential"]) == {"X∧Y", "¬X∧Z"}
    assert s["answer"]["redundant"] == ["Y∧Z"]
    for x, y, z in product((0, 1), repeat=3):
        assert task3_decide("deposit", x, y, z) == int((x and y) or ((not x) and z))


def test_qm_generic_classic():
    # классический пример: f = Σm(0,1,2,5,6,7) имеет два минимальных покрытия по 3 импликанты
    r = quine_mccluskey([0, 1, 2, 5, 6, 7], ["A", "B", "C"])
    assert len(r.prime_implicants) == 6
    assert len(r.minimal) == 3
    assert len(r.all_minimal_covers) == 2


def test_forms_edge():
    assert sdnf([], ["A"]) == "0"
    assert sknf([0, 1], ["A"]) == "1"


if __name__ == "__main__":
    import sys

    failed = 0
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print("ok  ", name)
            except AssertionError as exc:
                failed += 1
                print("FAIL", name, exc)
    sys.exit(1 if failed else 0)
