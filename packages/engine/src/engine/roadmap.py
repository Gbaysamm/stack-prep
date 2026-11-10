"""The student's roadmap: from where they stand to their target, day by day.

Stack Prep plans the work; the student follows it (docs/plans/2026-11-10-student-roadmap.md).
This is the planner of the product spec (docs/product-spec.md §9.4, roadmap sprints S6 and
S14), built on :func:`engine.projection.project`. From each subject's subtopic standings, the
targets, the exam date and the time the student can give, it works out:

* how the study sessions left are split between subjects and, through ``project``, between
  subtopics, so each session goes where it earns the most marks;
* the score that should reach on exam day against the target: on track, a stretch or out of
  reach, with the one change that would help;
* the expected score at the end of each week, a line later check-ups are held against;
* the next seven days, run by run.

The spec's planner rules, and where each is kept:

=====================================  =====================================================
Subject balance ≥ 30% (two subjects)   :func:`_shares`; with four subjects, 15% each
Coverage: every topic below            :func:`_coverage`: half of them each week, so each
Exam-ready gets an activity every      gets one in any fourteen days
14 days
≤ 30 minutes on one skill in a row     one run is ~15 minutes and the next run is always a
                                       different subtopic or subject
Exam phase (≤ 6 weeks): mixed ≥ 40%    :func:`_next_days`
Final 3 weeks: don't start skills      :func:`_startable`
needing > 10% of the remaining time
Missed days: no backlog                only seven days are fixed; the rest re-builds weekly
Reviews ≤ 25%, success mix,            inside each run (the practice loop), not here
prerequisite repair
=====================================  =====================================================

Students see a value band (high, medium, low), never "+4 marks" (spec §9.3). A total out of
400 is given only when every subject has been measured (spec §9.9); until then each subject
stands on its own.

Pure: no I/O, no clock. ``today`` is passed in.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import date, timedelta
from math import ceil
from typing import Literal

from engine.projection import (
    PlannedUnit,
    Projection,
    UnitStanding,
    project,
    score_now,
    session_gain,
)

#: One run of ten questions, with hints and the odd lesson, takes about this long.
RUN_MINUTES = 15
RUN_LENGTH = 10
CHECKUP_LENGTH = 15
MAX_RUNS_PER_DAY = 6
#: With no exam date, plan this far ahead.
DEFAULT_WEEKS = 12
#: A check-up falls due this many days after the last (scoring.CHECKUP_EVERY_DAYS).
CHECKUP_EVERY_DAYS = 7
#: The spec's subject balance for a two-subject student; it scales down with more subjects.
SUBJECT_BALANCE = 0.30
#: A subject at or above its target still gets time, as if it were this far short.
MIN_GAP = 5.0
#: Spec §9.1: a skill is Exam-ready from 65%.
EXAM_READY = 0.65
#: Spec §9.4: every topic below Exam-ready gets an activity within this many days.
COVERAGE_DAYS = 14
#: The exam phase (≤ 6 weeks): at least this share of runs is mixed practice.
EXAM_PHASE_DAYS = 42
MIXED_SHARE = 0.40
#: The final weeks: no new skill that needs more than this share of the remaining time.
FINAL_DAYS = 21
NEW_SKILL_TIME_CAP = 0.10
#: UTME: four subjects, each out of 100.
SUBJECTS_IN_EXAM = 4
#: Within this many marks (out of 400) of the target is a stretch, not out of reach.
STRETCH_MARGIN = 15.0
FIXED_DAYS = 7

Kind = Literal["run", "mixed", "mock", "checkup"]
#: Spec §9.4's reason codes, with the check-up added (weekly, not only at onboarding).
Reason = Literal["high_value_gap", "coverage", "mixed_practice", "mock", "checkup", "first_checkup"]
Value = Literal["high", "medium", "low"]
Status = Literal[
    "on_track", "stretch", "out_of_reach", "no_target", "needs_checkups", "exam_passed"
]


@dataclass(frozen=True)
class SubjectInput:
    subject_id: str
    name: str
    #: Subtopic standings, as the practice planner builds them.
    units: tuple[UnitStanding, ...]
    #: Out of 100.
    target: float | None
    #: When its last check-up finished; None when it has had none (nothing is planned for it
    #: beyond that first check-up, because there is nothing to plan from).
    last_checkup: date | None


@dataclass(frozen=True)
class RoadmapInput:
    today: date
    exam_date: date | None
    #: ISO weekdays, Monday 1 to Sunday 7.
    study_days: tuple[int, ...]
    minutes_per_day: int
    subjects: tuple[SubjectInput, ...]
    #: Out of 400; split across the subjects when they have no target of their own.
    target_total: float | None = None


@dataclass(frozen=True)
class PlannedItem:
    day: date
    order: int
    kind: Kind
    subject_id: str | None
    subtopic_id: str | None
    subtopic_name: str | None
    length: int
    reason: Reason
    value: Value | None = None


@dataclass(frozen=True)
class SubjectPlan:
    subject_id: str
    name: str
    measured: bool
    score_now: float
    target: float | None
    expected: float
    sessions: int
    #: Expected score at the end of each week, in order.
    milestones: tuple[float, ...]


@dataclass(frozen=True)
class Roadmap:
    today: date
    exam_date: date | None
    study_days_left: int
    runs_per_day: int
    sessions: int
    week_ends: tuple[date, ...]
    #: Out of 400; only when every subject has been measured.
    total_now: float | None
    total_expected: float | None
    target_total: float | None
    status: Status
    #: One plain change that would help, when the target is not on track.
    advice: str | None
    subjects: tuple[SubjectPlan, ...]
    items: tuple[PlannedItem, ...] = field(default=())


def runs_per_day(minutes_per_day: int) -> int:
    return max(1, min(MAX_RUNS_PER_DAY, minutes_per_day // RUN_MINUTES))


def study_dates(today: date, exam_date: date | None, study_days: Sequence[int]) -> list[date]:
    """The days left to study, today included, the exam day not."""
    end = exam_date if exam_date is not None else today + timedelta(weeks=DEFAULT_WEEKS)
    weekdays = set(study_days) or {1, 2, 3, 4, 5, 6}
    return [
        today + timedelta(days=offset)
        for offset in range(max(0, (end - today).days))
        if (today + timedelta(days=offset)).isoweekday() in weekdays
    ]


def _targets(spec: RoadmapInput) -> dict[str, float | None]:
    """Each subject's target out of 100: its own, or an even share of the total."""
    even = spec.target_total / SUBJECTS_IN_EXAM if spec.target_total is not None else None
    return {s.subject_id: s.target if s.target is not None else even for s in spec.subjects}


def _shares(
    measured: Sequence[SubjectInput], now: dict[str, float], targets: dict[str, float | None]
) -> dict[str, float]:
    """How the sessions are split: by gap to target, with the spec's floor for every subject."""
    if not measured:
        return {}
    gaps = {
        s.subject_id: max((targets[s.subject_id] or 0.0) - now[s.subject_id], MIN_GAP)
        for s in measured
    }
    total = sum(gaps.values())
    shares = {key: gap / total for key, gap in gaps.items()}
    if len(shares) > 1:
        # 30% each for two subjects (the spec); 15% each for four, which is what fits.
        floor = min(SUBJECT_BALANCE, 0.6 / len(shares))
        for _ in range(len(shares)):
            low = {key for key, value in shares.items() if value < floor}
            if not low:
                break
            rest = 1.0 - floor * len(low)
            others = sum(value for key, value in shares.items() if key not in low)
            shares = {
                key: floor if key in low else value * rest / others for key, value in shares.items()
            }
    return shares


def _allocate(
    measured: Sequence[SubjectInput], shares: dict[str, float], sessions: int
) -> dict[str, tuple[int, Projection]]:
    out: dict[str, tuple[int, Projection]] = {}
    for subject in measured:
        count = max(1, round(sessions * shares[subject.subject_id])) if sessions else 0
        out[subject.subject_id] = (count, project(subject.units, sessions_available=count))
    return out


def _total(per_subject: Sequence[float]) -> float:
    return round(sum(per_subject), 1)


def _expected_total(spec: RoadmapInput, minutes: int, study_days: Sequence[int]) -> float | None:
    """The exam-day total for a different amount of study time (for the advice)."""
    measured = [s for s in spec.subjects if s.last_checkup is not None]
    if len(measured) < len(spec.subjects) or not measured:
        return None
    targets = _targets(spec)
    now = {s.subject_id: score_now(s.units) for s in measured}
    sessions = len(study_dates(spec.today, spec.exam_date, study_days)) * runs_per_day(minutes)
    allocated = _allocate(measured, _shares(measured, now, targets), sessions)
    return _total([p.score_projected for _, p in allocated.values()])


def _status(expected: float | None, target: float | None) -> Status:
    if target is None or expected is None:
        return "no_target"
    if expected >= target:
        return "on_track"
    if expected >= target - STRETCH_MARGIN:
        return "stretch"
    return "out_of_reach"


def _advice(spec: RoadmapInput, status: Status, target: float | None) -> str | None:
    if status not in ("stretch", "out_of_reach") or target is None:
        return None
    longer = spec.minutes_per_day + RUN_MINUTES
    if runs_per_day(longer) > runs_per_day(spec.minutes_per_day):
        reached = _expected_total(spec, longer, spec.study_days)
        if reached is not None and reached >= target:
            return f"Study {longer} minutes a day instead of {spec.minutes_per_day} to reach it."
    days = sorted(set(spec.study_days) or {1, 2, 3, 4, 5, 6})
    if len(days) < 7:
        extra = next(d for d in range(1, 8) if d not in days)
        reached = _expected_total(spec, spec.minutes_per_day, [*days, extra])
        if reached is not None and reached >= target:
            return "Add one more study day a week to reach it."
    best = _expected_total(spec, MAX_RUNS_PER_DAY * RUN_MINUTES, range(1, 8))
    if best is not None and best < target:
        return f"The time left allows about {round(best)}; aim for that, or start earlier."
    return "Give it more time each day to reach it."


def _value_bands(projection: Projection) -> dict[str, Value]:
    """High, medium or low value, relative to the rest of this subject's plan.

    The marks one session adds are small in a subject with many subtopics, so an absolute
    scale would call everything low. What helps a student is the ranking: the top third of
    what is planned is high value, the next third medium, the rest low.
    """
    planned = sorted(
        (line for line in projection.plan if line.sessions > 0),
        key=lambda line: (-line.marks_gained / line.sessions, line.unit_id),
    )
    bands: dict[str, Value] = {}
    for index, line in enumerate(planned):
        third = index * 3 // max(1, len(planned))
        bands[line.unit_id] = "high" if third == 0 else "medium" if third == 1 else "low"
    return bands


def _queue(projection: Projection) -> list[tuple[str, str, Reason, Value, PlannedUnit]]:
    """This subject's runs in order: each planned subtopic in turn, highest marks first."""
    plan = [line for line in projection.plan if line.sessions > 0]
    bands = _value_bands(projection)
    left = {line.unit_id: line.sessions for line in plan}
    order: list[tuple[str, str, Reason, Value, PlannedUnit]] = []
    while any(left.values()):
        for line in plan:
            if left[line.unit_id]:
                left[line.unit_id] -= 1
                order.append((line.unit_id, line.name, "high_value_gap", bands[line.unit_id], line))
    return order


def _coverage(
    projection: Projection, today: date
) -> list[tuple[str, str, Reason, Value, PlannedUnit]]:
    """Topics below Exam-ready that this week's runs miss: half of them this week.

    The plan is re-built each week, so taking alternate halves (by the week's number) gives
    every such topic an activity within any fourteen days, as the spec asks.
    """
    planned_topics = set()
    first_week = _queue(projection)[: max(1, len(_queue(projection)) // 4)]
    for _, _, _, _, line in first_week:
        planned_topics.add(line.topic_name)
    by_topic: dict[str, list[PlannedUnit]] = {}
    for line in projection.plan:
        by_topic.setdefault(line.topic_name, []).append(line)
    behind = sorted(
        (
            max(lines, key=lambda line: line.share)
            for topic, lines in by_topic.items()
            if topic not in planned_topics
            and sum(line.mastery_now for line in lines) / len(lines) < EXAM_READY
        ),
        key=lambda line: (-line.share, line.unit_id),
    )
    parity = (today.toordinal() // 7) % 2
    chosen = behind[parity::2] if len(behind) > 1 else behind
    return [(line.unit_id, line.name, "coverage", "low", line) for line in chosen]


def _sessions_to_exam_ready(mastery: float) -> int:
    count, level = 0, mastery
    while level < EXAM_READY and count < 200:
        gain = session_gain(level)
        if gain <= 1e-6:
            return 200
        level += gain
        count += 1
    return count


def _startable(
    line: PlannedUnit,
    unit: UnitStanding | None,
    day: date,
    exam_date: date | None,
    remaining_sessions: int,
) -> bool:
    """Spec §9.4: in the final weeks, no new skill that needs too much of the time left."""
    if exam_date is None or (exam_date - day).days > FINAL_DAYS:
        return True
    is_new = unit is None or unit.answered == 0
    if not is_new:
        return True
    return _sessions_to_exam_ready(line.mastery_now) <= NEW_SKILL_TIME_CAP * remaining_sessions


def _week_ends(today: date, last: date) -> list[date]:
    weeks = max(1, ceil(((last - today).days + 1) / 7))
    return [today + timedelta(days=7 * (w + 1) - 1) for w in range(weeks)]


def build(spec: RoadmapInput) -> Roadmap:
    """The roadmap for this student, today."""
    dates = study_dates(spec.today, spec.exam_date, spec.study_days)
    per_day = runs_per_day(spec.minutes_per_day)
    sessions = len(dates) * per_day
    targets = _targets(spec)
    measured = [s for s in spec.subjects if s.last_checkup is not None]
    now = {s.subject_id: score_now(s.units) for s in spec.subjects}
    shares = _shares(measured, now, targets)
    allocated = _allocate(measured, shares, sessions)

    week_ends = _week_ends(spec.today, dates[-1]) if dates else []
    subject_plans: list[SubjectPlan] = []
    for subject in spec.subjects:
        if subject.subject_id not in allocated:
            subject_plans.append(
                SubjectPlan(
                    subject.subject_id,
                    subject.name,
                    False,
                    round(now[subject.subject_id], 1),
                    targets[subject.subject_id],
                    round(now[subject.subject_id], 1),
                    0,
                    (),
                )
            )
            continue
        count, projection = allocated[subject.subject_id]
        milestones = []
        for end in week_ends:
            done_days = sum(1 for d in dates if d <= end)
            done = round(count * done_days / len(dates)) if dates else 0
            milestones.append(project(subject.units, sessions_available=done).score_projected)
        subject_plans.append(
            SubjectPlan(
                subject.subject_id,
                subject.name,
                True,
                projection.score_now,
                targets[subject.subject_id],
                projection.score_projected,
                count,
                tuple(milestones),
            )
        )

    # A total out of 400 only when all four subjects have been measured (spec §9.9).
    every_subject_measured = len(spec.subjects) >= SUBJECTS_IN_EXAM and len(measured) == len(
        spec.subjects
    )
    total_now = _total([p.score_now for p in subject_plans]) if every_subject_measured else None
    total_expected = _total([p.expected for p in subject_plans]) if every_subject_measured else None
    subject_targets = [targets[s.subject_id] for s in spec.subjects]
    if spec.target_total is not None:
        target_total: float | None = spec.target_total
    elif subject_targets and all(t is not None for t in subject_targets):
        target_total = _total([t for t in subject_targets if t is not None]) * (
            SUBJECTS_IN_EXAM / len(subject_targets)
        )
    else:
        target_total = None
    if not dates:
        status: Status = "exam_passed"
    elif not every_subject_measured:
        status = "needs_checkups"
    else:
        status = _status(total_expected, target_total)

    items = _next_days(spec, dates, per_day, measured, allocated, shares) if dates else []
    return Roadmap(
        today=spec.today,
        exam_date=spec.exam_date,
        study_days_left=len(dates),
        runs_per_day=per_day,
        sessions=sessions,
        week_ends=tuple(week_ends),
        total_now=total_now,
        total_expected=total_expected,
        target_total=target_total,
        status=status,
        advice=_advice(spec, status, target_total) if dates and len(spec.subjects) == 4 else None,
        subjects=tuple(subject_plans),
        items=tuple(items),
    )


def _next_days(
    spec: RoadmapInput,
    dates: Sequence[date],
    per_day: int,
    measured: Sequence[SubjectInput],
    allocated: dict[str, tuple[int, Projection]],
    shares: dict[str, float],
) -> list[PlannedItem]:
    """The next seven days, slot by slot."""
    horizon = spec.today + timedelta(days=FIXED_DAYS - 1)
    units = {u.unit_id: u for s in measured for u in s.units}
    queues: dict[str, list[tuple[str, str, Reason, Value, PlannedUnit]]] = {}
    for subject in measured:
        projection = allocated[subject.subject_id][1]
        planned = _queue(projection)
        extra = _coverage(projection, spec.today)
        # Coverage runs go in every fourth place, so they never crowd out the high-value work.
        merged: list[tuple[str, str, Reason, Value, PlannedUnit]] = []
        while planned or extra:
            merged.extend(planned[:3])
            planned = planned[3:]
            if extra:
                merged.append(extra.pop(0))
        queues[subject.subject_id] = merged
    used = dict.fromkeys(queues, 0)
    placed_runs = 0
    phase_runs = 0
    phase_mixed = 0
    due = {
        s.subject_id: s.last_checkup + timedelta(days=CHECKUP_EVERY_DAYS)
        for s in measured
        if s.last_checkup is not None
    }
    items: list[PlannedItem] = []

    # A subject with no check-up yet: that comes first, today.
    for subject in (s for s in spec.subjects if s.last_checkup is None):
        items.append(
            PlannedItem(
                dates[0],
                len(items),
                "checkup",
                subject.subject_id,
                None,
                None,
                CHECKUP_LENGTH,
                "first_checkup",
            )
        )

    mock_weeks: set[int] = set()
    week_last_day = max(set(spec.study_days) or {6})
    for day in (d for d in dates if d <= horizon):
        order = sum(1 for item in items if item.day == day)
        slots = per_day
        for subject_id, when in sorted(due.items()):
            if when <= day and slots > 0:
                items.append(
                    PlannedItem(
                        day, order, "checkup", subject_id, None, None, CHECKUP_LENGTH, "checkup"
                    )
                )
                order += 1
                slots -= 1
                due[subject_id] = day + timedelta(days=CHECKUP_EVERY_DAYS)
        if not queues:
            continue
        exam_phase = spec.exam_date is not None and (spec.exam_date - day).days <= EXAM_PHASE_DAYS
        week = (day - spec.today).days // 7
        if exam_phase and week not in mock_weeks and day.isoweekday() == week_last_day:
            # One mock a week in the exam phase, on the week's last study day; it fills the day.
            items.append(PlannedItem(day, order, "mock", None, None, None, 0, "mock"))
            mock_weeks.add(week)
            continue
        remaining = sum(1 for d in dates if d >= day) * per_day
        last_subject: str | None = None
        for _ in range(slots):
            # The subject furthest behind its share of the runs so far. Following the same
            # subject again costs half a run, so a day mixes subjects when the shares are close
            # but the weak subject still gets the time it needs.
            subject_id = sorted(
                queues,
                key=lambda key: (
                    -(
                        shares[key] * (placed_runs + 1)
                        - used[key]
                        - (0.5 if key == last_subject and len(queues) > 1 else 0.0)
                    ),
                    key,
                ),
            )[0]
            if exam_phase and phase_mixed < MIXED_SHARE * (phase_runs + 1):
                items.append(
                    PlannedItem(
                        day, order, "mixed", subject_id, None, None, RUN_LENGTH, "mixed_practice"
                    )
                )
                phase_mixed += 1
            else:
                queue = queues[subject_id]
                pick = None
                for step in range(len(queue)):
                    candidate = queue[(used[subject_id] + step) % len(queue)]
                    if _startable(
                        candidate[4], units.get(candidate[0]), day, spec.exam_date, remaining
                    ):
                        pick = candidate
                        break
                if pick is None:
                    items.append(
                        PlannedItem(
                            day,
                            order,
                            "mixed",
                            subject_id,
                            None,
                            None,
                            RUN_LENGTH,
                            "mixed_practice",
                        )
                    )
                else:
                    unit_id, name, reason, value, _ = pick
                    items.append(
                        PlannedItem(
                            day, order, "run", subject_id, unit_id, name, RUN_LENGTH, reason, value
                        )
                    )
            if exam_phase:
                phase_runs += 1
            used[subject_id] += 1
            placed_runs += 1
            order += 1
            last_subject = subject_id
    return items
