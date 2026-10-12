"""The scoring rules in docs/student-scoring.md, worked through without a database."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from uuid import UUID, uuid4

from app.scoring import (
    Answer,
    CheckupResult,
    Tally,
    average,
    checkup_result,
    percent,
    session_change,
    status,
    subject_score,
    tally,
)

START = datetime(2026, 10, 1, 9, tzinfo=UTC)
VOWELS = str(uuid4())
STRESS = str(uuid4())
SECTION = str(uuid4())


@dataclass(frozen=True)
class Unit:
    unit_id: str
    name: str
    topic_id: str = SECTION
    topic_name: str = "Oral forms"
    share: float = 0.5


UNITS = [Unit(VOWELS, "Vowels and consonants"), Unit(STRESS, "Stress")]


def answers(*rows: tuple[str, str, str, bool]) -> list[Answer]:
    """(question, topic, sitting, right), one minute apart, in order."""
    return [
        Answer(
            question_id=question,
            unit_id=unit,
            session_id=session,
            is_correct=right,
            at=START + timedelta(minutes=n),
        )
        for n, (question, unit, session, right) in enumerate(rows)
    ]


def test_a_percentage_is_whole_and_rounds_half_up() -> None:
    assert percent(3, 15) == 20
    assert percent(2, 3) == 67
    assert percent(1, 8) == 13
    assert percent(0, 0) is None


def test_only_the_latest_answer_to_a_question_counts() -> None:
    """Wrong last week and right today counts as right: fixing a mistake raises the score."""
    found = answers(
        ("q1", VOWELS, "s1", False),
        ("q2", VOWELS, "s1", False),
        ("q1", VOWELS, "s2", True),
    )
    assert tally(found) == Tally(right=1, answered=2)
    assert tally(found).score == 50


def test_retaking_the_same_questions_shows_the_improvement() -> None:
    """The founder's example: 2 of 10 then 3 of the same 10 goes from 20% to 30%."""
    first = [(f"q{n}", VOWELS, "s1", n < 2) for n in range(10)]
    again = [(f"q{n}", VOWELS, "s2", n < 3) for n in range(10)]
    found = answers(*first, *again)
    change = session_change(UNITS, found, "s2")
    assert (change.before, change.after) == (20, 30)
    [line] = change.topics
    assert (line.name, line.before, line.after, line.right, line.answered) == (
        "Vowels and consonants",
        20,
        30,
        3,
        10,
    )


def test_your_score_is_the_average_of_the_topic_scores() -> None:
    """docs/student-scoring.md §2: Vowels 20% and Stress 40% make 30%; Vowels to 60% makes 50%."""
    sitting = str(UUID(int=1))
    check = [
        *[(f"v{n}", VOWELS, sitting, n < 1) for n in range(5)],
        *[(f"s{n}", STRESS, sitting, n < 2) for n in range(5)],
    ]
    redo = [(f"v{n}", VOWELS, "run1", n < 3) for n in range(5)]
    found = answers(*check, *redo)
    checkup = checkup_result(UUID(int=1), START, found)
    assert (checkup.score, checkup.right, checkup.answered, checkup.topics) == (30, 3, 10, 2)

    today = START.date() + timedelta(days=3)
    score = subject_score(UUID(int=9), UNITS, found, [checkup], today)
    vowels, stress = score.topics
    assert (vowels.score, vowels.started_score, stress.score) == (60, 20, 40)
    assert (score.score, score.started_score, score.change, score.predicted) == (50, 30, 20, 30)
    assert score.topics_tried == 2
    assert score.next_checkup_due == date(2026, 10, 8)
    assert score.checkup_due is False
    assert subject_score(UUID(int=9), UNITS, found, [checkup], date(2026, 10, 8)).checkup_due

    change = session_change(UNITS, found, "run1")
    assert (change.before, change.after) == (30, 50)


def test_an_average_rounds_half_up() -> None:
    assert average([20, 40]) == 30
    assert average([20, 45]) == 33
    assert average([None, 70]) == 70
    assert average([]) is None


def test_the_latest_check_up_is_the_predicted_score() -> None:
    results = [
        CheckupResult(session_id=uuid4(), finished_at=START, answered=15, right=3, score=20),
        CheckupResult(
            session_id=uuid4(),
            finished_at=START + timedelta(days=7),
            answered=15,
            right=7,
            score=47,
        ),
    ]
    score = subject_score(UUID(int=9), UNITS, [], results, START.date() + timedelta(days=8))
    assert (score.started_score, score.predicted) == (20, 47)
    assert score.score is None


def test_a_topic_is_labelled_by_its_score() -> None:
    assert status(Tally(0, 0)) == "not_tried"
    assert status(Tally(2, 2)) == "just_started"
    assert status(Tally(1, 3)) == "needs_work"
    assert status(Tally(3, 5)) == "getting_there"
    assert status(Tally(4, 5)) == "strong"
