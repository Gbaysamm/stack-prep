"""XP rules and levels (app/xp.py)."""

from __future__ import annotations

from app.xp import for_answer, level_for


def test_xp_is_for_learning() -> None:
    assert for_answer(correct=True, hints_before=0, guessed=False) == 10
    assert for_answer(correct=True, hints_before=0, guessed=True) == 3
    assert for_answer(correct=True, hints_before=1, guessed=False) == 5
    assert for_answer(correct=True, hints_before=2, guessed=False) == 0
    assert for_answer(correct=False, hints_before=0, guessed=False) == 0


def test_levels_get_longer() -> None:
    assert (level_for(0).level, level_for(0).needs) == (1, 100)
    assert level_for(99).level == 1
    assert (level_for(100).level, level_for(100).into, level_for(100).needs) == (2, 0, 150)
    assert level_for(249).level == 2
    assert level_for(250).level == 3
    assert level_for(450).level == 4
