# Founder tracker

Every instruction and suggestion from the founder, what was done for it, where, and its status.
Kept up to date with every change and pushed with every push (founder, 13 Nov 2026), so that
if a conversation is lost we know what was asked, what is done, and where to continue.

**Status words:** Open (not started) · In progress · Done-local (committed, not pushed) ·
Pushed (on `company/integration`, deploys to both servers) · Waiting (on the founder or outside).

`docs/worklog.md` is the dated diary of each change; this file is the list of asks.

---

## Where we are (updated 16 Nov 2026)

- **The live tracker is now /tracker** (stackprep.binaax.app/tracker): tasks, steps, history and
  deployments, kept by the team. This file stays as the record of the founder's asks.

- **Last thing done:** the bank's line-by-line review (`docs/questions/bank-review-brief.md`)
  ran for Accounts (9 files), Biology (9) and Physics 2018, then was paused to save the weekly
  usage limit. Those 19 files are checked; to be loaded and committed with this tracker.
- **Next:** before writing lessons in bulk, add a blind second solve of every problem; the
  founder listens to one trial lesson; then the Write a lesson button (gpt-6.1-terra, about
  $0.05 a lesson). Pictures stay hand-drawn SVG; an image model may be tried later.
- **Paused:** the bank review for the remaining 83 files, one subject at a time when the
  founder says (Chemistry, Commerce, Economics, English, Government, Literature, Mathematics,
  Physics 2010–2017); then a timing audit of every moment, film a few lessons, commit.
- **Pushed 13 Nov 2026** to `company/integration` (deploys both servers; migrations 048 and 049 run on deploy).
  the founder's yes; before it, sync with `company/integration` (it has diverged), and each
  server's `.env` needs `INWORLD_API_KEY`.
- **Outside work:** Inworld has no credit; lessons play in the studio voice until it is topped up.

---

## Lessons (subtopic lessons, `docs/lessons/subtopics/`)

| Ask (founder) | Done | Where | Status |
|---|---|---|---|
| Lessons follow the Nigerian curriculum (WAEC, JAMB, school sources), explanatory, not complex | Sources map, writer brief, guide | `docs/lessons/sources.md`, `subtopic-lesson-guide.md` | Pushed |
| Worked examples straight after each rule; rating, own questions, 1–2 problems after the lesson | After-lesson stage (rating, problems typed or photo, coach) | `routers/lesson_after.py`, `LessonAfter.tsx`, migrations 046–047 | Pushed |
| Coach conversation saved, shown again, used as context (lessons and missed questions) | Kept per student and lesson | `lesson_coach.py`, `practice.py` | Pushed |
| A subtopic is several short lessons, each its own roadmap stop | Parts in DB, roadmap, loader | `047_lesson_parts.sql`, engine, `roadmap.py` | Pushed |
| Lessons about 3 minutes (a guide, not a limit; 3–4 min fine), one main idea | All 10 subtopics rebuilt: 61 lessons | `restructure-brief.md`, `docs/lessons/subtopics/**` | Pushed |
| No gaps, no rushing: teach before use, examples as examples, stay at level, guided working | Rules in the guide; all lessons rewritten | guide "No gaps, no rushing" | Pushed |
| The one test for every sentence; no repetition; each line one job; traps give the rule; precise recaps | All 61 lessons reviewed line by line | `review-brief.md` | Pushed |
| Whole spoken sentences; lists joined with "and" | Language pass on all lessons | `editor-brief.md` | Pushed |
| Names before symbols; voice reads symbols letter by letter (Na = "N A"), ions, brackets | `for_the_voice` | `apps/api/src/app/tutor.py` | Pushed |
| Board lines start with a capital | Lessons and bank | guide | Pushed |
| Open like a teacher: no "lesson one of two", no saying things three times | Openings rewritten | guide | Pushed |
| Name the list, then teach each item with its picture as it is explained | Elements and compounds first; rule in guide | guide | Pushed |
| One thing said, then written; never the next line while the last is still being said | Moments split; board waits for a line's words | `wordClock.derivedWriteCue`, guide | Pushed |
| Pictures pop in on their word, not drawn from scratch; caption not cut in half | `show` op, pop by fading, caption fades whole | `doodleEngine.ts`, `Doodle.tsx` | Pushed |
| No blinking section heading | One stable slot per moment | `Board.tsx` | Pushed |
| Marks land on their word; scroll to a marked earlier line | Mark timing from the voice | `wordClock.derivedCue`, `Board.tsx` | Pushed |
| Lesson ends with its own line, not the missed-question closing | `finishedLine` | `Board.tsx`, `Lesson.tsx` | Pushed |
| Biology drawings: realistic, correct, nothing misplaced | Plant cell fixed (wall offset, labels, circles) | `sub_bio_cell_structure_b.svg` | Pushed |
| More subjects' lessons (beyond Chemistry, the cell, indices) | — | — | Open |

## Question bank (past-question lessons, `docs/questions/utme/*/lessons_*.yaml`)

| Ask (founder) | Done | Where | Status |
|---|---|---|---|
| Fix fragment sentences in the bank too | Language pass, 102 files | `bank-editor-brief.md` | Pushed |
| Bank explanations must make sense like the lessons | Teaching pass, 102 files (1,944 lessons) | `bank-teaching-brief.md` | Pushed |
| Go through the flags and fix where necessary | All 135 checked: 64 fixed, 78 not errors, no key wrong | `docs/content-review/bank-lessons-flags-2026-11-12.md` | Pushed |
| Remove the answer checks; fewer analogies and doodles; the six standards; line and marks on their words | Accounts, Biology, Physics 2018 reviewed (19 files) | `bank-review-brief.md`, `check_lesson_edit.py --review` | In progress (83 files paused for usage) |
| Elements, compounds and mixtures has only 3 questions (all check-up) | — | the bank | Open (thin subtopic; more questions needed) |

## Reviewer side (`/review`) and new questions (founder, 13 Nov 2026)

Order of work (each shown at 1440 and 390 before the next):

| Ask (founder) | Plan | Where | Status |
|---|---|---|---|
| More questions per subtopic (about 5,000 to give every subtopic 10; thin subjects: Biology, Chemistry, Physics, Economics, Government, Accounts, Commerce) | Generate outside Claude Code: an external AI pasting JSON, or the plan's monthly API credit ($100 on Max, claimed in claude.ai Billing → API credits, key in Admin → AI for questions, cap $100) | — | Open |
| AI questions kept apart from the real bank, clearly labelled | "AI-generated sets" section per subject with its badge; the set's page says "AI-generated set"; never a fake year | migration 048, `routers/bank.py`, `review/BankPages.tsx` | Pushed |
| Upload questions by JSON; never an invented subtopic | Import JSON panel on AI sets: pick subtopics (thinnest first), copy the prompt, paste, Check (every fault listed), Import the ones that pass as "To check"; tested end to end | `routers/bank_import.py`, `review/ImportJson.tsx`, `docs/questions/ai-question-format.md` | Pushed |
| "Add with AI" not on past papers | Gone; AI sets have "Import JSON" instead | `BankPages.tsx` | Pushed |
| Subject page: can't rename or delete a year; design poor | Sections (past papers, own sets, AI sets); rename and remove as icons; cards two to a row on a phone; smaller header buttons | `BankPages.tsx`, `bank.css`, `bank.py` | Pushed |
| Question detail page: poor UI/UX | Checks strip; question in its own box; each wrong option with its reason; "B is right" to confirm; numbered worked steps and a hint box (Edit to change); level and topic below | `ReviewPage.tsx`, `review.css`, `routers/review.py` (`why`) | Pushed |
| Lessons managed from the reviewer side: status per topic, edit, generate | Lessons page: every topic and subtopic with its lessons (or "No lessons yet"); a lesson read as said and written; Edit the words with a check that keeps cues and marks; edits kept from the loader (migration 049) | `routers/bank_lessons.py`, `review/LessonsPages.tsx`, `049_lesson_edits.sql`, `load_subtopic_lessons.py` | Done-local (edit); generate waits on the founder's yes to the cost |
| Write lessons with AI; LaTeX never broken; correct answers; a moderately priced model | Trial: gpt-6.1-terra writes a lesson, checked for format, LaTeX (KaTeX), speech as spoken and the answer key; 3 Chemistry lessons passed | `database/write_subtopic_lesson.py`, `check_latex.mjs` | In progress (blind second solve next) |
| Review the uploaded questions one by one next week | Re-solve, check key, options, wording, fit, figure | — | Waiting (questions to be uploaded; weekly limit) |

## Voice

| Ask (founder) | Done | Where | Status |
|---|---|---|---|
| Nigerian-accent voice: research YarnGPT, others; test Inworld; compare cost | Inworld (Emeka) added and made default | `inworld_voice.py`, `boardPrefs.ts` | Pushed |
| Maths said properly ("2 comma 4", brackets) | `for_the_voice` | `tutor.py` | Pushed |
| Lagos, Ibadan, garri pronunciation | — | Inworld lexicon | Open |
| Inworld credit | — | Inworld portal | Waiting (founder) |

## Board and app

| Ask (founder) | Done | Where | Status |
|---|---|---|---|
| Lesson in one download kept on the phone (weak networks) | Lesson package, cache | `lesson_package.py`, `lessonPackage.ts` | Pushed |
| A refresh must not reload from scratch | Kept package played at once; fallback voice when Inworld refuses | same | Pushed |
| No subtitle box; a timeline; dock on phone; buddy by the controls; no emphasis on Next | Board dock rebuilt | `Board.tsx`, `board.css` | Pushed |
| Loading screen redesigned | Pen-on-board loader | `Lesson.tsx`, `Lesson.css` | Pushed |
| Whiteboard and Emeka by default | Prefs v3 | `boardPrefs.ts` | Pushed |
| Practice second pass: figures first, sticker tiles, weak topics as cards, one shadow | Done | `PracticeHub.tsx` | Pushed |
| A held run is said in a popup at once, never a page change | `RunGate.tsx` | Practice, Progress, subject page | Pushed |
| Check-up report page redesign | Result band (ring, answer marks, bar to target), topic tiles, your answers with working, three next cards | `CheckupReport.tsx`, `/v1/checkup/{id}/answers` | Pushed |
| Today, 17 Nov: run report, mock report, question screen, check-up sitting, subject page, after the lesson, saved questions, mock set-up | Planned (migration 056) | Page redesigns | In progress |
| Exams & subjects: one page; remove with ×, add from a popup; no counts; faster | Rebuilt | `Exams.tsx`, `/student/catalogue` kept 5 min | Pushed |
| Subjects page (new): goal tickets with score now, Swap on each, compulsory first | Rebuilt | `Subjects.tsx` | Pushed |
| Subject page: no tabs; topics and runs as on Progress; address by name | Rebuilt | `SubjectHub.tsx` | Pushed |
| Profile: goals moved to Subjects; filler rows gone | Trimmed | `Profile.tsx` | Pushed |
| One design standard (stickers everywhere, tighter corners, built on the design system) | `docs/design-standard.md` | app-wide | Pushed |
| App stalled when Inworld was unreachable | Fail fast, back off 2 min | `inworld_voice.py` | Pushed |
| Rest of the page list (run and mock reports kept; question screen, after the lesson, saved questions, mock set-up, onboarding, plans, settings, messages) | Done 17 Nov | migration 057 | Pushed |
| Phones wider than the screen (stray hidden label) | Pinned | `SubjectSwitcher.css` | Pushed |
| Mock exam room: no redesign of its own; takes the new question screen | Founder, 17 Nov | — | Agreed |
| Progress page redesigned (subject cards, runs, folding topics, no 100% from one answer) | Rebuilt | `Progress.tsx` | Pushed |
| Tracker: true finished dates; calmer rows on phone | Migration 053; rows with tick, title, one line | `TrackerPage.tsx` | Pushed |
| Tracker: Today shows finished-today; one list by day, not by area | Today and day groups | `TrackerPage.tsx` | Pushed |
| Mock page redesigned; scheduled (set for you) vs custom (set yourself); both locked until ready | Two sticker cards, server locks, admin scheduling, migration 052 | `MockHub.tsx`, `routers/mock.py` | Pushed |

## Roadmap

| Ask (founder) | Done | Where | Status |
|---|---|---|---|
| After a weak run: the lessons next, then the run again, each its own stop | Same-day insert and morning plan | `roadmap.py`, engine | Pushed |
| Run after all of a subtopic's lessons, not after each | Lessons in order, one run after | engine `_syllabus_queue` | Pushed |
| A weak run brought no lesson (subtopic out of questions) | Lessons come anyway; no run when none left | `engine.needs_lesson` | Pushed |
| A finished run vanished from the roadmap | "Earlier" section above Today | `roadmap.py`, `Roadmap.tsx` | Pushed |
| A lesson's icon differs from a run's | Play icon | `Roadmap.tsx` | Pushed |
| A subtopic's lessons one after another (not scattered between other subjects), also across a day's end | Planner keeps the subject holding the next lesson, whichever day | `engine/roadmap.py` | Pushed |
| More lessons and runs for a weak student take more time than they set: adjust the time | The day is planned in minutes (a lesson about 5, a run the student's run time); the pace check asks for more time when the work no longer fits | engine | Pushed |
| Still weak after the lessons and the run again: what then? | One round of lessons per subtopic; then "Still needs work" on the path, practised on, no loop of lessons | engine, `roadmap.py`, `Roadmap.tsx` | Pushed |
| Closing a half-watched lesson opened "after the lesson" | Close goes back to the roadmap; not counted | `Board.tsx`, `Lesson.tsx` | Pushed |
| Leaving anything in progress asks first (close button, closing the tab): lessons, runs, check-ups, after the lesson; Continue waits for the problem | Leave warning, confirm dialogs | `lib/leaveWarning.ts`, the rooms, `Lesson.tsx`, `LessonAfter.tsx` | Pushed |
| A lesson resumes where the student stopped | The step reached is kept on the phone per lesson version; the board opens there | `Board.tsx` (`startAt`, `onReached`), `Lesson.tsx` | Pushed |
| After-lesson page: poor UI; wrong answer or photo gets written feedback, not video | Redesigned: problem first with tappable options, feedback box, rating row, coach collapsed | `LessonAfter.tsx/.css` | Pushed |

## Speed and load

| Ask (founder) | Done | Where | Status |
|---|---|---|---|
| Every page slow; limit requests so the server copes with many users | Subject data cached 5 min; shared requests in the app (overview once a page, not 4–6) | `subject_cache.py`, `lib/shared.ts` | Pushed |
| PC slow during runs | Voice warm-up off in development; fewer agents at once | — | Done |
| Measure on a built app (development sends ~90 files a page) | — | — | Open |

## Working rules (standing)

- Ask before pushing; a push deploys to both servers.
- Never read `.env`; ask before paid API use.
- Founder runs server commands; give the steps.
- Worklog entry with each fix; this tracker updated with each change and pushed with each push.
- Check every UI state at 1440 and 390.
- Updates every 2 minutes during long runs; watch the usage limits.

## Notifications and reports (founder, 17 Nov 2026)

| Ask (founder) | Plan | Where | Status |
|---|---|---|---|
| Notify students at different stages (missed day, streak at risk, rewards, motivation), like Duolingo | One engine, an hourly job, a cap per day per channel | `notifications` (to build) | In progress (plan) |
| In-app notifications | A bell and an inbox | app shell | To do |
| Email reminders the day after a missed day | At their usual time; gentler on days 3 and 7; weekly after; stop after two weeks | mailer + job | To do |
| Weekly (or daily) report by email, with gains and insights | Links to Progress; Progress is the report page | mailer + job | To do |
| Parents told after a student defaults; parent reports | Email first; WhatsApp or SMS later (paid); with consent | `guardians` (exists) | To do |
| Push notifications | Web push with permission | service worker | To do |

## The tracker combined (founder, 17 Nov 2026)

24 open items became 7: related pieces are one item with a checklist (More subject lessons,
More questions, three Notifications items). Removed as not ours to track: the OpenAI credit,
the lawyer, the Lagos and Ibadan pronunciation, the Mock exam room (migration 059).

## The tracker page (founder, 17 Nov 2026)

| Ask (founder) | Done | Where | Status |
|---|---|---|---|
| Rearrange tasks by priority or what I am working on | Drag a task; or Move to the top, up, down from its box | `TrackerPage.tsx`, `POST /v1/public/tracker/order`, migration 060 | Committed |
| The box should not mark a task done at once | A menu: Mark done, stage, Today, Move, Open, Delete (confirmed) | `TrackerPage.tsx` | Committed |

## Notifications, part one (founder, 17 Nov 2026)

| Ask (founder) | Done | Where | Status |
|---|---|---|---|
| Notify at different stages, like Duolingo; cron jobs | Hourly job on the worker: streak at risk, missed a day, away 3/7/14, streak milestones; one nudge a day, quiet 9 pm to 8 am | `app/notifications.py`, `worker.py`, migration 061 | Committed |
| In-app notifications | A bell with the latest five and a count; Mark all read | `Bell.tsx` | Committed |
| Each one dismissible; tap for more; a page past five; optimistic | A bin on each; a Notifications page (All, Unread), each opens in place with its button; read or unread; every change shows at once | `pages/Notifications.tsx`, `notificationsApi.ts` | Committed |
| No hero on the Notifications page; one container or boxes? | Plain title; one container (a feed of short, alike items) | `pages/Notifications.tsx` | Committed |
| Skeletons and the help button on the tracker | Added, with faster pages and the pinned sidebar | migration 061 | Committed |
| Gamification next | On the tracker as the next item | migration 061 | To do |
| Every notification the app needs (founder: "anything that needs the user's attention") | Told when it happens: reply to their message, plan started, check-up or mock marked, password or login changed, welcome. Told by the hourly job: exam countdown 30/14/7/1, scheduled mock open and closing tomorrow, today's roadmap check-up or mock, plan ending in 3 days, plan ended | `notifications.notify`, `PLAN_RULES`, the routers | Committed |
| Email reports and reminders, so students come back | Reminders by email (one email a day at most, everything due in it), account and plan emails, the weekly report on Sunday evening (in the bell too, links to Progress); none of it can be turned off (founder: a student who could would not be serious) | `notification_email.py`, migration 063 | Committed |
| See the email templates; emails on sign-up, account start, deletion and the like, signed in or not; one file per template | Branded HTML emails in `app/emails/` (one file each); welcome, security, plan and account emails within seconds; account paused and open again; a review page at `/dev/emails` (local only) shows all 17 | `app/emails/`, `notification_email.send_soon` | Committed (deletion: the app has none yet, on the tracker) |

## 18 Nov 2026

| Ask (founder) | Done | Where | Status |
|---|---|---|---|
| Today: complete the notification engine and gamification first; put it on the tracker and deploy it | Both planned for today, at the top, notifications first | migration 062 | Pushed |
| Add the lesson and question expansion to the tracker | More subject lessons and More questions on today's plan, after gamification | migration 064 | Committed |
| Parents told when students default; reports to parents | A student adds a parent in Settings; the parent confirms by email; then a weekly report on Sunday and an alert after 3 and 7 days without study; a confirmed parent stays | `routers/parents.py`, `parent_email.py`, `/parent/<token>`, migration 065 | Committed |
| The reminder email is too short | Each reminder adds steps for what to do now, and why it matters or what to expect | `emails/reminder.py` | Committed |
| Push notifications | Service worker, manifest, Turn on in the bell; every notification pushed once to each device; needs VAPID keys on the servers | `app/push.py`, `public/sw.js`, `pushClient.ts`, migration 066 | Committed |
| The bell is too long; four check-up notifications at once | One line per message, tighter rows; today's check-ups as one notification | `Bell.css`, `notifications.PLAN_RULES` | Committed |
| Note what is pending for notifications (credentials, settings) | `docs/notifications-pending.md`; a waiting item on the tracker | migration 067 | Committed |
| Gamification: a plan first, with animations and feedback loops that make sense | `docs/gamification-plan.md`, decisions open | docs | In progress |
| The reward animation is flat, not like Brilliant or Duolingo | Rebuilt as a sequence: spring, badge pop, drawn tick, confetti burst, gains counting up, the day's ring; recorded with scripts/record-motion.mjs | `Celebrate.tsx`, `/dev/motion` | Committed |
| Gamification step 1: XP and the answer loop | XP ledger and rules, +XP and combo on right answers, the reward with real figures after runs and lessons, the daily goal bonus | `app/xp.py`, `routers/game.py`, migration 068 | Committed |
| Gamification steps 2-4: daily goal, streak freeze, badges, levels | Today's ring around the streak flame, freezes, 13 badges with a shelf and unlock moment, levels with a level-up moment | `badges.py`, `Badges.tsx`, migrations 069-070 | Committed |
| The top bar is cluttered; chips not the same height on phones | One chip for streak and today's plan; level moved to Progress; equal heights | `Streak.tsx` | Committed |
