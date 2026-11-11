"""The roadmap planner, held to the spec's own acceptance criteria (docs/roadmap.md S6, S14;
docs/product-spec.md §9.4) as golden profiles."""

from __future__ import annotations

from collections import Counter
from datetime import date, timedelta
from itertools import pairwise

from engine.projection import UnitStanding
from engine.roadmap import (
    EXAM_READY,
    MIXED_SHARE,
    RoadmapInput,
    SubjectInput,
    build,
    open_units,
    runs_per_day,
    study_dates,
)

TODAY = date(2026, 11, 10)  # a Tuesday


def units(
    prefix: str, masteries: list[float | None], answered: int = 4
) -> tuple[UnitStanding, ...]:
    """One subtopic per topic, equal shares, at these masteries."""
    share = 1.0 / len(masteries)
    return tuple(
        UnitStanding(
            unit_id=f"{prefix}-u{i}",
            name=f"{prefix} subtopic {i}",
            topic_id=f"{prefix}-t{i}",
            topic_name=f"{prefix} topic {i}",
            share=share,
            mastery=m,
            answered=0 if m is None else answered,
        )
        for i, m in enumerate(masteries)
    )


def subject(
    key: str,
    masteries: list[float | None],
    *,
    target: float | None = None,
    checked: date | None = TODAY - timedelta(days=1),
) -> SubjectInput:
    return SubjectInput(key, key.title(), units(key, masteries), target, checked)


def spec(
    *subjects: SubjectInput,
    exam: date | None = TODAY + timedelta(weeks=20),
    minutes: int = 30,
    days: tuple[int, ...] = (1, 2, 3, 4, 5, 6),
    target_total: float | None = 250,
    today: date = TODAY,
) -> RoadmapInput:
    return RoadmapInput(today, exam, days, minutes, subjects, target_total)


FOUR = (
    subject("english", [0.6, 0.5, 0.7, 0.4]),
    subject("maths", [0.2, 0.3, 0.5, 0.35, 0.6]),
    subject("biology", [0.45, 0.55, 0.3]),
    subject("chemistry", [0.5, 0.4, 0.65, 0.2]),
)


def runs(items):
    return [i for i in items if i.kind in ("run", "mixed")]


def test_capacity_follows_the_study_time() -> None:
    assert (
        runs_per_day(30) == 2
        and runs_per_day(5) == 1
        and runs_per_day(120) == 8
        and runs_per_day(600) == 20
    )
    days = study_dates(TODAY, TODAY + timedelta(days=14), (1, 3, 5))
    assert all(d.isoweekday() in (1, 3, 5) for d in days) and len(days) == 6


def test_the_same_state_gives_the_same_plan() -> None:
    assert build(spec(*FOUR)) == build(spec(*FOUR))


def test_two_subjects_each_get_thirty_percent_of_the_week() -> None:
    # S6: each subject of a two-subject student gets ≥ 30% of weekly minutes, even when one
    # is far weaker than the other.
    plan = build(
        spec(
            subject("english", [0.85, 0.9, 0.8]),
            subject("maths", [0.1, 0.2, 0.15]),
            target_total=300,
        )
    )
    count = Counter(i.subject_id for i in runs(plan.items))
    total = sum(count.values())
    assert count["english"] / total >= 0.30 - 1e-9
    assert count["maths"] > count["english"]


def test_four_subjects_each_keep_a_share() -> None:
    plan = build(spec(*FOUR))
    count = Counter(i.subject_id for i in runs(plan.items))
    total = sum(count.values())
    assert set(count) == {"english", "maths", "biology", "chemistry"}
    assert all(n / total >= 0.15 - 0.05 for n in count.values())


def test_a_day_mixes_subjects_and_never_repeats_a_subtopic_back_to_back() -> None:
    plan = build(spec(*FOUR, minutes=60))
    by_day: dict[date, list] = {}
    for item in plan.items:
        by_day.setdefault(item.day, []).append(item)
    for day_items in by_day.values():
        day_runs = [i for i in day_items if i.kind == "run"]
        for a, b in pairwise(day_runs):
            assert a.subtopic_id != b.subtopic_id


def test_every_weak_topic_gets_an_activity_within_fourteen_days() -> None:
    # S6: a 14-day simulation; every in-scope topic below Exam-ready gets an activity. The
    # plan is re-built after seven days, from the same standings. In scope means open in the
    # syllabus order: the secured ones (≥ 40%) and the next three not yet secured.
    many = subject("maths", [0.1, 0.2, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.62], target=70)
    first = build(spec(many, target_total=None, minutes=45))
    second = build(spec(many, target_total=None, minutes=45, today=TODAY + timedelta(days=7)))
    touched = {i.subtopic_id for i in first.items + second.items if i.subtopic_id}
    opened = {u.unit_id for u in open_units(many.units)}
    weak = {u.unit_id for u in many.units if (u.mastery or 0) < EXAM_READY} & opened
    assert weak <= touched
    # What else is touched follows the syllabus: a prefix of it, never a jump ahead.
    order = [u.unit_id for u in many.units]
    assert set(order[: max(order.index(t) for t in touched) + 1]) >= touched


def test_the_syllabus_order_comes_first() -> None:
    # The founder's rule: no differentiation for a student who has not got algebra. Subtopics
    # open in the syllabus's order; only three not yet secured are open at once.
    maths = subject("maths", [0.2, None, None, None, 0.1, 0.1], target=80)
    opened = [u.unit_id for u in open_units(maths.units)]
    assert opened == ["maths-u0", "maths-u1", "maths-u2"]
    # A short week: only the first three get runs.
    short = build(spec(maths, target_total=None, minutes=15))
    assert {i.subtopic_id for i in runs(short.items) if i.subtopic_id} <= set(opened)
    # A long week: no subtopic gets more than the run limit; the room goes to the next ones,
    # in order, rather than piling onto the first three.
    long = build(spec(maths, target_total=None, minutes=120))
    count = Counter(i.subtopic_id for i in runs(long.items) if i.subtopic_id)
    assert max(count.values()) <= 4
    used = [u.unit_id for u in maths.units if u.unit_id in count]
    assert used == [u.unit_id for u in maths.units][: len(used)]


def test_a_subtopic_never_met_is_planned_not_skipped() -> None:
    # The founder's Physics: three open subtopics, two never answered and one right once. All
    # three get runs; none is called "probably fine" and swapped for mixed practice.
    physics = subject("physics", [None, None, 1.0], target=90)
    physics = SubjectInput(
        "physics",
        "Physics",
        tuple(
            UnitStanding(
                u.unit_id,
                u.name,
                u.topic_id,
                u.topic_name,
                u.share,
                u.mastery,
                1 if u.mastery else 0,
            )
            for u in physics.units
        ),
        90,
        TODAY - timedelta(days=1),
    )
    plan = build(spec(physics, target_total=None, minutes=15))
    assert all(i.kind == "run" for i in runs(plan.items))
    assert {i.subtopic_id for i in runs(plan.items)} >= {"physics-u0", "physics-u1"}


def test_a_secured_subtopic_opens_the_next() -> None:
    # Secured (≥ 40% from 3+ answers) stays open for review and lets the next one in.
    maths = subject("maths", [0.9, 0.5, 0.2, None, None, None], target=80)
    assert [u.unit_id for u in open_units(maths.units)] == [
        "maths-u0",
        "maths-u1",
        "maths-u2",
        "maths-u3",
        "maths-u4",
    ]


def test_a_subtopic_with_no_questions_is_stepped_over() -> None:
    from dataclasses import replace

    base = units("bio", [None, None, None, None])
    with_gap = (replace(base[0], teachable=False), *base[1:])
    assert [u.unit_id for u in open_units(with_gap)] == ["bio-u1", "bio-u2", "bio-u3"]


def test_the_exam_phase_is_at_least_forty_percent_mixed() -> None:
    # S14: with ≤ 6 weeks to the exam, mixed practice is ≥ 40% of planned runs.
    plan = build(spec(*FOUR, exam=TODAY + timedelta(days=30), minutes=60))
    planned = runs(plan.items)
    mixed = [i for i in planned if i.kind == "mixed"]
    assert len(mixed) / len(planned) >= MIXED_SHARE - 1e-9
    assert any(i.kind == "mock" for i in plan.items)


def test_no_new_skill_is_started_in_the_final_weeks_when_it_needs_too_long() -> None:
    # S14: in the final 3 weeks, a skill that would need > 10% of the remaining time to reach
    # Exam-ready is not started as new learning. Unit 0 has never been tried and sits low.
    hard_new = SubjectInput(
        "maths",
        "Maths",
        (
            UnitStanding("m-new", "Never tried", "t0", "Topic 0", 0.4, 0.05, 0),
            UnitStanding("m-a", "Known A", "t1", "Topic 1", 0.3, 0.5, 6),
            UnitStanding("m-b", "Known B", "t2", "Topic 2", 0.3, 0.55, 6),
        ),
        70,
        TODAY - timedelta(days=1),
    )
    plan = build(spec(hard_new, exam=TODAY + timedelta(days=12), target_total=None))
    assert "m-new" not in {i.subtopic_id for i in plan.items}


def test_missed_days_leave_no_backlog() -> None:
    # S6: a student back after four days gets a fresh plan with nothing overdue.
    later = TODAY + timedelta(days=4)
    plan = build(spec(*FOUR, today=later))
    assert plan.items and min(i.day for i in plan.items) >= later


def test_a_subject_without_a_check_up_starts_with_one_and_no_total_is_claimed() -> None:
    plan = build(spec(FOUR[0], FOUR[1], subject("physics", [None, None], checked=None)))
    first = plan.items[0]
    assert first.kind == "checkup" and first.subject_id == "physics" and first.day == TODAY
    assert plan.status == "needs_checkups" and plan.total_now is None
    assert all(i.subject_id != "physics" or i.kind == "checkup" for i in plan.items)


def test_a_due_check_up_comes_first_on_its_day() -> None:
    stale = subject("maths", [0.3, 0.4, 0.5], checked=TODAY - timedelta(days=9))
    plan = build(spec(stale, target_total=None))
    today_items = [i for i in plan.items if i.day == TODAY]
    assert today_items[0].kind == "checkup" and today_items[0].subject_id == "maths"


def test_the_target_is_judged_honestly_with_one_plain_fix() -> None:
    easy = build(spec(*FOUR, target_total=120))
    assert easy.status == "on_track" and easy.advice is None
    hard = build(spec(*FOUR, target_total=390, exam=TODAY + timedelta(weeks=4), minutes=15))
    assert hard.status == "out_of_reach" and hard.advice
    assert hard.total_expected is not None and hard.total_expected < 390


def test_the_milestones_climb_towards_exam_day() -> None:
    plan = build(spec(*FOUR))
    for line in plan.subjects:
        assert list(line.milestones) == sorted(line.milestones)
        assert abs(line.milestones[-1] - line.expected) < 1.5
    assert len(plan.week_ends) >= 19


def test_students_see_a_value_band_not_marks() -> None:
    plan = build(spec(*FOUR))
    for item in plan.items:
        if item.kind == "run":
            assert item.value in ("high", "medium", "low")
            assert item.reason in ("high_value_gap", "coverage")


def test_value_bands_rank_the_plan() -> None:
    # Spec §9.3: a band, never marks; ranked within the student's own plan, so a subject with
    # many subtopics still has high-value work.
    weighted = SubjectInput(
        "maths",
        "Maths",
        tuple(
            UnitStanding(f"m{i}", f"m {i}", f"t{i}", f"t {i}", share, 0.2, 4)
            for i, share in enumerate([0.4, 0.3, 0.2, 0.1])
        ),
        70,
        TODAY - timedelta(days=1),
    )
    plan = build(spec(weighted, target_total=None, minutes=90))
    bands = {i.subtopic_id: i.value for i in plan.items if i.kind == "run"}
    assert bands["m0"] == "high" and bands["m3"] == "low"


def test_no_total_out_of_400_from_fewer_than_four_subjects() -> None:
    # Spec §9.9: a total only when every subject is covered.
    one = build(spec(FOUR[1], target_total=None))
    assert one.total_now is None and one.total_expected is None
    assert one.status == "needs_checkups"
    four = build(spec(*FOUR))
    assert four.total_now is not None and four.total_expected is not None


def test_a_subtopic_stops_holding_the_rest_back_after_four_runs() -> None:
    # A slow student is not stuck: four runs without securing it, and the path moves past it.
    from dataclasses import replace

    base = units("bio", [0.2, None, None, None, None])
    stuck = (replace(base[0], runs=4), *base[1:])
    assert [u.unit_id for u in open_units(base)] == ["bio-u0", "bio-u1", "bio-u2"]
    assert [u.unit_id for u in open_units(stuck)] == ["bio-u0", "bio-u1", "bio-u2", "bio-u3"]


def test_too_little_time_opens_more_and_says_how_much_more_a_day() -> None:
    # Sixty subtopics, three weeks, fifteen minutes a day: the open window widens so the plan
    # still reaches the end, and the student is told the time a day that would cover it.
    from engine.roadmap import _pace, runs_to_secure

    big = subject("biology", [None] * 60, target=70)
    tight = spec(big, exam=TODAY + timedelta(days=21), minutes=15, target_total=None)
    plan = build(tight)
    assert plan.pace_advice is not None and plan.pace_advice.startswith("Add ")
    roomy = build(spec(big, exam=TODAY + timedelta(weeks=40), minutes=120, target_total=None))
    assert roomy.pace_advice is None
    assert runs_to_secure([big]) == 2.0
    _ = _pace  # imported for the reader: the rule lives there


def test_a_slower_runner_fits_fewer_runs_in_the_same_time() -> None:
    assert runs_per_day(60) == 4
    assert runs_per_day(60, run_minutes=20) == 3
    slow = build(spec(*FOUR, minutes=60, today=TODAY))
    slower = build(
        RoadmapInput(TODAY, TODAY + timedelta(weeks=20), (1, 2, 3, 4, 5, 6), 60, FOUR, 250, 20)
    )
    assert slower.runs_per_day < slow.runs_per_day


def test_runs_never_outnumber_the_new_questions() -> None:
    # A subtopic with three questions left is one run, not four; with none left it no longer
    # holds the syllabus back.
    from dataclasses import replace

    from engine.roadmap import _runs_left

    base = units("chem", [None, None, None, None, None])
    small = (replace(base[0], fresh=3), replace(base[1], fresh=0), *base[2:])
    assert _runs_left(small[0]) == 1
    assert [u.unit_id for u in open_units(small)] == ["chem-u0", "chem-u1", "chem-u2", "chem-u3"]
