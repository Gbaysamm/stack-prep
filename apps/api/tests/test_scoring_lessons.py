"""After a lesson, a subtopic's later answers are the student's real attempt at it."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.scoring import Answer, after_lessons, tally

T0 = datetime(2026, 11, 11, 9, tzinfo=UTC)


def answer(q: str, unit: str, right: bool, minutes: int) -> Answer:
    return Answer(q, unit, "s", right, T0 + timedelta(minutes=minutes))


def test_a_lesson_alone_moves_nothing() -> None:
    before = [answer("q1", "u", False, 0), answer("q2", "u", False, 1)]
    lessons = {"u": T0 + timedelta(minutes=5)}
    assert after_lessons(before, lessons) == before


def test_answers_after_the_lesson_replace_those_before_it() -> None:
    found = [
        answer("q1", "u", False, 0),
        answer("q2", "u", False, 1),
        answer("q3", "u", True, 10),
        answer("q4", "u", True, 11),
        answer("x1", "other", False, 2),
    ]
    kept = after_lessons(found, {"u": T0 + timedelta(minutes=5)})
    assert tally(kept, "u").right == 2 and tally(kept, "u").answered == 2
    # Another subtopic is untouched.
    assert tally(kept, "other").answered == 1
