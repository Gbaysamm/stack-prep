# Gamification plan

Agreed with the founder, 18 Nov 2026.

## The aim

Make students come back every day and work properly when they do, so their UTME score goes
up. Every reward is for **learning**, never for clicking: a guess, a peek at the answer or a
rushed run earns little. The game sits on top of what already drives the student (the roadmap,
the predicted score, the target) rather than beside it.

## What we already have

- **Streak**: days in a row with practice, a check-up or a lesson; chip in the top bar, a
  dialog with the last 14 days; reminders and milestones (3, 7, 14, 30, 50, 100) in the bell.
- **Celebrate**: confetti and a lime tick at the end of a lesson and of onboarding.
- **Topic status**: not tried, just started, needs work, getting there, strong (from scoring).
- **Predicted score and target** per subject and out of 400; the roadmap and its journey.
- **"Right without help"** counted during a practice run.

No points, levels, badges, daily goal or leagues yet.

## The loops

Three loops, each with its own feedback, from seconds to weeks.

1. **Each answer (seconds).** Right without help: a green pulse on the option, a small "+10"
   rising, a soft tick sound and a short buzz on Android phones. Three right in a row: a
   combo flame on the counter. Wrong: no penalty and no red flash; the working opens. The
   point is to feel good about effort, never to fear being wrong.
2. **Each session (minutes).** The end of a run, a lesson, a check-up or a mock gets one
   summary moment: points earned, accuracy, best combo, the daily goal ring filling, the streak
   extended, and any topic that moved up ("Electrolysis: getting there → strong"). Celebrate's
   confetti only when something real happened (goal met, topic mastered, badge, level).
3. **Each day and week (days).** A daily goal (questions or minutes, from the time the student
   set at onboarding) with a ring on Home and in the top bar; the streak; the weekly report.
   Over weeks: levels, badges, topics mastered, and the predicted score climbing toward the
   target.

## The pieces

### Points: XP

| Earned for | Points |
|---|---|
| A right answer without help | 10 |
| Right after a hint | 5 |
| Right on the second try | 3 |
| Finishing a lesson | 20 |
| Finishing a check-up | 30 |
| Finishing a mock | 100 |
| Meeting the daily goal | 25 |
| Combo bonus (each 3 in a row) | 5 |

Nothing for: answers after viewing the solution, questions answered again within a day, speed.
Kept in a ledger (`xp_events`), one row per reason, so it can never double-count and can be
explained.

### Daily goal: today's roadmap

The goal is the day's roadmap (founder, 18 Nov 2026): the ring fills as the student finishes
each of today's items (a run, a lesson, a check-up, the weekly mock). A student with no roadmap
yet has 20 questions instead. Ring on Home and next to the streak. Finishing the day: a short
moment, +25.

### Streak freeze

Earned automatically: one for every 7-day streak, holding at most two. A missed day uses one
instead of breaking the streak; the bell says so the next morning. Keeps a hard-won streak from
dying to one bad day, which is when students quit.

### Levels

From total points, steps getting longer (level 2 at 100, then +50 each level). The level shows
in the top bar on the avatar ring and on Profile. Levelling up: the biggest moment (full-screen
card, confetti, the new level).

### Badges

Few and meaningful, each a sticker in our colours:

- First check-up · First lesson · First mock
- 7-day, 30-day, 100-day streak
- 100, 500, 1,000 questions right without help
- First topic strong · A whole unit strong · Every topic in a subject tried
- Predicted score up 20 · Target reached in a subject
- A perfect run (10 of 10, no help)

Unlocking one: a badge card that flips in, then it lives on a shelf on Progress (locked ones
shown greyed with what unlocks them).

### Mastery moments

When a topic's status moves up (needs work → getting there → strong), say so at the end of
the session, and "strong" is a small celebration of its own. This ties the game straight to the
score.

### Leagues: later

Weekly leaderboard of 20-30 students by XP, top ones move up a league. Strong for motivation
(Duolingo's biggest lever) but for minors it needs care: first names and avatars only, no chat,
opt-out. Later, once the rest proves itself (founder, 18 Nov 2026).

## One motion language

| Moment | Size | Motion | Sound |
|---|---|---|---|
| Right answer | small | 300 ms pulse, "+10" rises and fades | soft tick |
| Combo | small | flame pops on the counter | none |
| Session end | medium | summary card rises, ring fills, numbers count up | none |
| Goal met, topic strong | medium | Celebrate (confetti 2.6 s) | short chime |
| Badge | medium | badge flips in on its card | chime |
| Level up | large | full-screen card, confetti, level number counts up | longer chime |

All in our colours, all skippable with a tap, all off with reduced motion. Sound: off by default,
with a switch in Settings to turn it on (founder, 18 Nov 2026). Android buzz on right answers and
moments; iPhone browsers do not allow it.

## Where it shows

- **Top bar**: streak chip, daily goal ring, level on the avatar.
- **Home**: the daily goal ring and today's plan together; streak; next badge close to unlocking.
- **Practice and check-up**: per-answer feedback, combo, session summary.
- **Progress**: level and points, badges shelf, topics mastered.
- **Bell and emails**: badges, level ups, topic mastered (in-app); the weekly report adds
  points, badges and topics mastered.
- **Parents' weekly report**: badges and topics mastered that week.

## Build order

1. **Points and the answer loop**: ledger, points per answer, per-answer feedback and combo,
   the session summary with points and topics moved.
2. **Daily goal and streak freeze**: the ring on Home and the top bar; the goal moment.
3. **Badges**: definitions, unlocking, the badge moment, the shelf on Progress, notifications.
4. **Levels**: the level-up moment, level on the avatar and Profile.
5. **Leagues**, if agreed.

Each step is used and screenshotted on phone and laptop before the next.

## Decided (founder, 18 Nov 2026)

1. Points are called XP.
2. The daily goal is today's roadmap (20 questions when there is no roadmap yet).
3. Sound is off by default, with a switch in Settings.
4. Streak freeze: yes, as planned.
5. Leagues: later.
