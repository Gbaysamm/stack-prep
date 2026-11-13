# Founder tracker

Every instruction and suggestion from the founder, what was done for it, where, and its status.
Kept up to date with every change and pushed with every push (founder, 13 Nov 2026), so that
if a conversation is lost we know what was asked, what is done, and where to continue.

**Status words:** Open (not started) · In progress · Done-local (committed, not pushed) ·
Pushed (on `company/integration`, deploys to both servers) · Waiting (on the founder or outside).

`docs/worklog.md` is the dated diary of each change; this file is the list of asks.

---

## Where we are (updated 13 Nov 2026)

- **Last thing done:** the bank's line-by-line review (`docs/questions/bank-review-brief.md`)
  ran for Accounts (9 files), Biology (9) and Physics 2018, then was paused to save the weekly
  usage limit. Those 19 files are checked; to be loaded and committed with this tracker.
- **Next (founder, 13 Nov 2026):** rebuild the reviewer side in this order: (1) AI-generated
  sets and the JSON importer, (2) subject page with rename and retire, (3) question detail,
  (4) a Lessons page, (5) lesson generation. See "Reviewer side" below.
- **Paused:** the bank review for the remaining 83 files, one subject at a time when the
  founder says (Chemistry, Commerce, Economics, English, Government, Literature, Mathematics,
  Physics 2010–2017); then a timing audit of every moment, film a few lessons, commit.
- **Not pushed:** nothing since `835bdc5`. Every commit after it is local only. A push needs
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
| AI questions kept apart from the real bank, clearly labelled | An "AI-generated practice" set per subject in "Our own sets", badge everywhere; never a fake year | migration 048, `routers/bank.py`, `review/BankPages.tsx` | In progress (server done-local; screens next) |
| Upload questions by JSON; never an invented subtopic | Per-subject subtopic list (codes, syllabus line, counts) and a ready prompt; importer rejects unknown codes; check, preview, import as "To check"; figures as SVG or "figure needed" (held back) | `routers/bank_import.py`, `docs/questions/ai-question-format.md`; panel next | In progress (server done-local) |
| "Add with AI" not on past papers | Only in AI sets | `BankPages.tsx` | Open (1) |
| Subject page: can't rename or delete a year; design poor | Redesign; rename, retire a paper | `BankPages.tsx`, `bank.py` | Open (2) |
| Question detail page: poor UI/UX | Redesign the question view and editing | `BankPages.tsx`, `ReviewPage.tsx` | Open (3) |
| Lessons managed from the reviewer side: status per topic, edit, generate | A Lessons page: subtopics, parts, missing, edit a lesson, generate one | new | Open (4, 5) |
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
