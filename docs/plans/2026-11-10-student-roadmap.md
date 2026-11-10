# The student roadmap: we plan, the student follows

10 November 2026. The founder's direction: Stack Prep drives each student to their target
score instead of handing them a toolbox. Later a student who follows the plan and misses
their target gets their money back, so the plan has to be honest about what it can deliver
and has to record who followed it. Daily reminders, warnings and telling a parent come after
this (see "Later" below).

This builds the planner the original spec described (`docs/product-spec.md` §9.4, roadmap
sprint S6), which was never built, using pieces that already exist:

- `engine.projection.project()`: given subtopic scores, each subtopic's share of the paper
  and a number of study sessions, it says how many sessions each subtopic deserves and what
  score that should reach.
- The weekly check-up and its lock on practice (`routers/practice.py` `checkup_lock`).
- The goal: target, exam date, minutes a day, study days (`student_exam_goals`), and the
  profile's `target_aggregate` out of 400.
- Practice runs on chosen subtopics (`POST /v1/practice/start` with `subtopic_ids`).

## What the student sees

1. Home shows **Today**: the runs planned for today, in order, each one line ("Maths ·
   Quadratic equations · 10 questions"), with one button for the next. A check-up that is
   due comes first.
2. A **Roadmap** page: the target out of 400, where they stand now, the line we expect them
   to climb week by week to exam day, this week's plan, and whether the target is in reach.
3. When a check-up finishes, the roadmap re-plans and says what changed.
4. Missed days are not a backlog: the plan re-builds from where the student is.

## How a roadmap is built (engine, pure function)

`packages/engine/src/engine/roadmap.py` takes, per subject: the subtopic standings (as the
practice planner already builds them), the subject's target (out of 100), and the last
check-up date; plus today, the exam date, study weekdays and minutes a day. It returns:

- **Capacity.** Study days from today to the exam (on the chosen weekdays), and runs a day:
  minutes a day ÷ 15 (one 10-question run takes about 15 minutes), at least 1, at most 6.
  No exam date: plan 12 weeks.
- **Split between subjects.** Each subject gets sessions in proportion to its gap to target
  (target minus score now, at least 5 points so no subject is dropped), and never less than
  15% of the total, so a strong subject is still kept warm.
- **Split within a subject.** `project(standings, that subject's sessions)` gives sessions per
  subtopic, heaviest weaknesses first (its reserved 30%), then where the next session earns
  most. The projected score is the subject's expected exam-day score.
- **Reachability.** Expected total (sum of the subjects' projected scores, scaled to four
  subjects out of 400) against the target: *on track* (≥ target), *stretch* (within 15
  marks) or *out of reach*, with the plain fix: one more study day a week, or more minutes.
- **Weekly milestones.** For each week to the exam, the expected score per subject after that
  week's sessions, so the roadmap page can draw the line and later check it against
  check-ups.
- **The next seven days, day by day.** Each run is one subject and one subtopic (10
  questions), taken from that subject's allocation, highest marks first, spread so a day
  mixes subjects. A check-up that falls due is placed on its day, before that subject's runs.
  In the last six weeks every third run is a mixed run (the engine's own plan across the
  subject) and each subject gets one mock a week.
- Every item carries a reason the student can read: *high value* (heavy and weak),
  *nearly there* (close to strong and often asked), *mixed practice*, *mock*, *check-up*.

Only seven days are fixed at a time; beyond that the plan is the milestone line, re-built
weekly from real results.

## What is stored (migration 041)

- `roadmaps`: one per student at a time (`active` or `replaced`): when and why it was built
  (first check-up, check-up, goal changed, new week), the inputs it used, the target and the
  expected score, the reachability, the milestones, and `engine_version`.
- `roadmap_items`: each planned run, check-up or mock: day, subject, subtopic, length, reason,
  and the session that did it. Done, missed and pending are worked out from that session, so
  following the plan is recorded from day one (the evidence the money-back promise needs).

It re-builds when: there is none; a check-up finished after it was built; the goal or study
time changed; or its seven days have run out. Old items stay, with what happened to them.

## API

- `GET /v1/roadmap/{student_id}`: the active roadmap (built or re-built on the way if
  needed): today, this week, milestones, reachability, and the plan-following record.
- `POST /v1/roadmap/{student_id}/items/{item_id}/start`: starts that item (a practice run on
  its subtopic, a check-up or a mock) and links the session to it. A roadmap run is part of
  the product, so it never counts as a "custom run" for plan limits.

## Decisions taken for now (the founder can change them)

- The target is one total out of 400, split evenly across the four subjects at first (250 is
  62.5% each); a per-subject target, where one is set, wins.
- Run builder: still there in this first step; locking it until the first milestone comes
  next, once the roadmap is in use.
- Free practice stays open; "once today's plan is done" is the planned rule.

## Later

- Daily reminder and streak-style motivation to come back each day.
- Missed plan: warnings (email, push, later SMS), then the parent is told; parents linked to
  a student.
- Spaced review of old mistakes (`review_state`, unused today) feeding the plan.
- Checking predicted scores against real JAMB results, then the money-back terms.
