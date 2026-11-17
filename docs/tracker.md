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
| Lessons follow the Nigerian curriculum (WAEC, JAMB, school sources), explanatory, not complex | Sources map, writer brief, guide | `docs/lessons/sources.md`, `subtopic-lesson-guide.md` | Done-local |
| Worked examples straight after each rule; rating, own questions, 1–2 problems after the lesson | After-lesson stage (rating, problems typed or photo, coach) | `routers/lesson_after.py`, `LessonAfter.tsx`, migrations 046–047 | Done-local |
| Coach conversation saved, shown again, used as context (lessons and missed questions) | Kept per student and lesson | `lesson_coach.py`, `practice.py` | Done-local |
| A subtopic is several short lessons, each its own roadmap stop | Parts in DB, roadmap, loader | `047_lesson_parts.sql`, engine, `roadmap.py` | Done-local |
| Lessons about 3 minutes (a guide, not a limit; 3–4 min fine), one main idea | All 10 subtopics rebuilt: 61 lessons | `restructure-brief.md`, `docs/lessons/subtopics/**` | Done-local |
| No gaps, no rushing: teach before use, examples as examples, stay at level, guided working | Rules in the guide; all lessons rewritten | guide "No gaps, no rushing" | Done-local |
| The one test for every sentence; no repetition; each line one job; traps give the rule; precise recaps | All 61 lessons reviewed line by line | `review-brief.md` | Done-local |
| Whole spoken sentences; lists joined with "and" | Language pass on all lessons | `editor-brief.md` | Done-local |
| Names before symbols; voice reads symbols letter by letter (Na = "N A"), ions, brackets | `for_the_voice` | `apps/api/src/app/tutor.py` | Done-local |
| Board lines start with a capital | Lessons and bank | guide | Done-local |
| Open like a teacher: no "lesson one of two", no saying things three times | Openings rewritten | guide | Done-local |
| Name the list, then teach each item with its picture as it is explained | Elements and compounds first; rule in guide | guide | Done-local |
| One thing said, then written; never the next line while the last is still being said | Moments split; board waits for a line's words | `wordClock.derivedWriteCue`, guide | Done-local |
| Pictures pop in on their word, not drawn from scratch; caption not cut in half | `show` op, pop by fading, caption fades whole | `doodleEngine.ts`, `Doodle.tsx` | Done-local |
| No blinking section heading | One stable slot per moment | `Board.tsx` | Done-local |
| Marks land on their word; scroll to a marked earlier line | Mark timing from the voice | `wordClock.derivedCue`, `Board.tsx` | Done-local |
| Lesson ends with its own line, not the missed-question closing | `finishedLine` | `Board.tsx`, `Lesson.tsx` | Done-local |
| Biology drawings: realistic, correct, nothing misplaced | Plant cell fixed (wall offset, labels, circles) | `sub_bio_cell_structure_b.svg` | Done-local |
| More subjects' lessons (beyond Chemistry, the cell, indices) | — | — | Open |

## Question bank (past-question lessons, `docs/questions/utme/*/lessons_*.yaml`)

| Ask (founder) | Done | Where | Status |
|---|---|---|---|
| Fix fragment sentences in the bank too | Language pass, 102 files | `bank-editor-brief.md` | Done-local |
| Bank explanations must make sense like the lessons | Teaching pass, 102 files (1,944 lessons) | `bank-teaching-brief.md` | Done-local |
| Go through the flags and fix where necessary | All 135 checked: 64 fixed, 78 not errors, no key wrong | `docs/content-review/bank-lessons-flags-2026-11-12.md` | Done-local |
| Remove the answer checks; fewer analogies and doodles; the six standards; line and marks on their words | Accounts, Biology, Physics 2018 reviewed (19 files) | `bank-review-brief.md`, `check_lesson_edit.py --review` | In progress (83 files paused for usage) |
| Elements, compounds and mixtures has only 3 questions (all check-up) | — | the bank | Open (thin subtopic; more questions needed) |

## Reviewer side (`/review`) and new questions (founder, 13 Nov 2026)

Order of work (each shown at 1440 and 390 before the next):

| Ask (founder) | Plan | Where | Status |
|---|---|---|---|
| More questions per subtopic (about 5,000 to give every subtopic 10; thin subjects: Biology, Chemistry, Physics, Economics, Government, Accounts, Commerce) | Generate outside Claude Code: an external AI pasting JSON, or the plan's monthly API credit ($100 on Max, claimed in claude.ai Billing → API credits, key in Admin → AI for questions, cap $100) | — | Open |
| AI questions kept apart from the real bank, clearly labelled | "AI-generated sets" section per subject with its badge; the set's page says "AI-generated set"; never a fake year | migration 048, `routers/bank.py`, `review/BankPages.tsx` | Done-local |
| Upload questions by JSON; never an invented subtopic | Import JSON panel on AI sets: pick subtopics (thinnest first), copy the prompt, paste, Check (every fault listed), Import the ones that pass as "To check"; tested end to end | `routers/bank_import.py`, `review/ImportJson.tsx`, `docs/questions/ai-question-format.md` | Done-local |
| "Add with AI" not on past papers | Gone; AI sets have "Import JSON" instead | `BankPages.tsx` | Done-local |
| Subject page: can't rename or delete a year; design poor | Sections (past papers, own sets, AI sets); rename and remove as icons; cards two to a row on a phone; smaller header buttons | `BankPages.tsx`, `bank.css`, `bank.py` | Done-local |
| Question detail page: poor UI/UX | Checks strip; question in its own box; each wrong option with its reason; "B is right" to confirm; numbered worked steps and a hint box (Edit to change); level and topic below | `ReviewPage.tsx`, `review.css`, `routers/review.py` (`why`) | Done-local |
| Lessons managed from the reviewer side: status per topic, edit, generate | Lessons page: every topic and subtopic with its lessons (or "No lessons yet"); a lesson read as said and written; Edit the words with a check that keeps cues and marks; edits kept from the loader (migration 049) | `routers/bank_lessons.py`, `review/LessonsPages.tsx`, `049_lesson_edits.sql`, `load_subtopic_lessons.py` | Done-local (edit); generate waits on the founder's yes to the cost |
| Write lessons with AI; LaTeX never broken; correct answers; a moderately priced model | Trial: gpt-6.1-terra writes a lesson, checked for format, LaTeX (KaTeX), speech as spoken and the answer key; 3 Chemistry lessons passed | `database/write_subtopic_lesson.py`, `check_latex.mjs` | In progress (blind second solve next) |
| Review the uploaded questions one by one next week | Re-solve, check key, options, wording, fit, figure | — | Waiting (questions to be uploaded; weekly limit) |

## Voice

| Ask (founder) | Done | Where | Status |
|---|---|---|---|
| Nigerian-accent voice: research YarnGPT, others; test Inworld; compare cost | Inworld (Emeka) added and made default | `inworld_voice.py`, `boardPrefs.ts` | Done-local |
| Maths said properly ("2 comma 4", brackets) | `for_the_voice` | `tutor.py` | Done-local |
| Lagos, Ibadan, garri pronunciation | — | Inworld lexicon | Open |
| Inworld credit | — | Inworld portal | Waiting (founder) |

## Board and app

| Ask (founder) | Done | Where | Status |
|---|---|---|---|
| Lesson in one download kept on the phone (weak networks) | Lesson package, cache | `lesson_package.py`, `lessonPackage.ts` | Done-local |
| A refresh must not reload from scratch | Kept package played at once; fallback voice when Inworld refuses | same | Done-local |
| No subtitle box; a timeline; dock on phone; buddy by the controls; no emphasis on Next | Board dock rebuilt | `Board.tsx`, `board.css` | Done-local |
| Loading screen redesigned | Pen-on-board loader | `Lesson.tsx`, `Lesson.css` | Done-local |
| Whiteboard and Emeka by default | Prefs v3 | `boardPrefs.ts` | Done-local |
| Practice second pass: figures first, sticker tiles, weak topics as cards, one shadow | Done | `PracticeHub.tsx` | Pushed |
| A held run is said in a popup at once, never a page change | `RunGate.tsx` | Practice, Progress, subject page | Pushed |
| Check-up report page redesign | Result band (ring, answer marks, bar to target), topic tiles, your answers with working, three next cards | `CheckupReport.tsx`, `/v1/checkup/{id}/answers` | Done-local |
| Today, 17 Nov: run report, mock report, question screen, check-up sitting, subject page, after the lesson, saved questions, mock set-up | Planned (migration 056) | Page redesigns | In progress |
| Exams & subjects: one page; remove with ×, add from a popup; no counts; faster | Rebuilt | `Exams.tsx`, `/student/catalogue` kept 5 min | Done-local |
| Mock exam room: no redesign of its own; takes the new question screen | Founder, 17 Nov | — | Agreed |
| Progress page redesigned (subject cards, runs, folding topics, no 100% from one answer) | Rebuilt | `Progress.tsx` | Pushed |
| Tracker: true finished dates; calmer rows on phone | Migration 053; rows with tick, title, one line | `TrackerPage.tsx` | Done-local |
| Tracker: Today shows finished-today; one list by day, not by area | Today and day groups | `TrackerPage.tsx` | Done-local |
| Mock page redesigned; scheduled (set for you) vs custom (set yourself); both locked until ready | Two sticker cards, server locks, admin scheduling, migration 052 | `MockHub.tsx`, `routers/mock.py` | Done-local |

## Roadmap

| Ask (founder) | Done | Where | Status |
|---|---|---|---|
| After a weak run: the lessons next, then the run again, each its own stop | Same-day insert and morning plan | `roadmap.py`, engine | Done-local |
| Run after all of a subtopic's lessons, not after each | Lessons in order, one run after | engine `_syllabus_queue` | Done-local |
| A weak run brought no lesson (subtopic out of questions) | Lessons come anyway; no run when none left | `engine.needs_lesson` | Done-local |
| A finished run vanished from the roadmap | "Earlier" section above Today | `roadmap.py`, `Roadmap.tsx` | Done-local |
| A lesson's icon differs from a run's | Play icon | `Roadmap.tsx` | Done-local |
| A subtopic's lessons one after another (not scattered between other subjects), also across a day's end | Planner keeps the subject holding the next lesson, whichever day | `engine/roadmap.py` | Done-local |
| More lessons and runs for a weak student take more time than they set: adjust the time | The day is planned in minutes (a lesson about 5, a run the student's run time); the pace check asks for more time when the work no longer fits | engine | Done-local |
| Still weak after the lessons and the run again: what then? | One round of lessons per subtopic; then "Still needs work" on the path, practised on, no loop of lessons | engine, `roadmap.py`, `Roadmap.tsx` | Done-local |
| Closing a half-watched lesson opened "after the lesson" | Close goes back to the roadmap; not counted | `Board.tsx`, `Lesson.tsx` | Done-local |
| Leaving anything in progress asks first (close button, closing the tab): lessons, runs, check-ups, after the lesson; Continue waits for the problem | Leave warning, confirm dialogs | `lib/leaveWarning.ts`, the rooms, `Lesson.tsx`, `LessonAfter.tsx` | Done-local |
| A lesson resumes where the student stopped | The step reached is kept on the phone per lesson version; the board opens there | `Board.tsx` (`startAt`, `onReached`), `Lesson.tsx` | Done-local |
| After-lesson page: poor UI; wrong answer or photo gets written feedback, not video | Redesigned: problem first with tappable options, feedback box, rating row, coach collapsed | `LessonAfter.tsx/.css` | Done-local |

## Speed and load

| Ask (founder) | Done | Where | Status |
|---|---|---|---|
| Every page slow; limit requests so the server copes with many users | Subject data cached 5 min; shared requests in the app (overview once a page, not 4–6) | `subject_cache.py`, `lib/shared.ts` | Done-local |
| PC slow during runs | Voice warm-up off in development; fewer agents at once | — | Done |
| Measure on a built app (development sends ~90 files a page) | — | — | Open |

## Working rules (standing)

- Ask before pushing; a push deploys to both servers.
- Never read `.env`; ask before paid API use.
- Founder runs server commands; give the steps.
- Worklog entry with each fix; this tracker updated with each change and pushed with each push.
- Check every UI state at 1440 and 390.
- Updates every 2 minutes during long runs; watch the usage limits.
