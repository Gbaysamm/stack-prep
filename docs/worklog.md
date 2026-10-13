# Stack Prep work log

What changed, when, and why, newest first. One entry is added straight after each fix or
feature lands, so anyone picking up the system can catch up here before reading code.

Each entry says:
- **what** changed, in plain words;
- **why**, the decision or problem behind it;
- **where**: the commit, and the main files or docs;
- **status**: done, deployed, or waiting on something.

Older history, before this log started, is in `git log` and `docs/roadmap.md`.

---

## 2026-10-13

### Mock report: a slimmer result card
- **What:**
  - The totals are one line with coloured dots, not four tall boxes with left borders.
  - The subject rows are tighter, with smaller scores and bars.
  - The report's row styles were renamed (`mk-res`). They had reused the history list's
    `mk-row` name and changed its layout.
- **Why:** the founder found the card too big and didn't like the left borders.
- **Where:** `apps/web/src/prep/pages/MockReport.tsx` and `Mock.css`.
- **Status:** committed locally; the report and history were checked at 1440 and 390.

### Mock report: one result card that fits the subjects sat
- **What:** the overall box and the fixed-width subject cards are now one card:
  - a strip of four totals (questions, right, wrong, unanswered), each with its colour;
  - one full-width row per subject: a right/wrong bar, "R right of A answered · U
    unanswered", and the score;
  - an "All subjects" total row when more than one subject was sat;
  - a subject with no answers says "No answers" instead of a dash.
- **Why:** the founder found too much empty space; the cards didn't adapt to how many
  subjects were sat.
- **Where:** `apps/web/src/prep/pages/MockReport.tsx` and `Mock.css`.
- **Status:** committed locally; checked at 1440 and 390.

### Mock exam: a clearer "Time allowed"
- **What:** the custom mock's time card has:
  - a −/+ stepper (5-minute steps) showing the minutes and the hours;
  - quick picks, with the real exam's pace for that many questions marked "Exam pace";
  - a line saying what the time means per question ("About 1 min 12 s a question. JAMB
    gives 40 s"), labelled tighter than, the same as, or more than the real exam.
- **Why:** the founder found the old card unclear: a plain segmented control, a browser
  number box and a detached "JAMB's pace" note.
- **Where:** `apps/web/src/prep/pages/MockSetup.tsx` and `Mock.css`.
- **Status:** committed locally; checked at 1440 and 390.

### Deployed: plain-percentage scoring and the CBT mock exam
- CI run 38280711166 passed, and both servers were updated, including migration 029.


### Scoring rebuilt as plain percentages
- **What:**
  - A topic score is right ÷ answered, using the latest answer to each question.
  - Your score is the average of your topic scores.
  - A check-up's result is the average of that sitting's topic scores. The first check-up is
    "Started at"; the latest is the predicted score.
  - Check-ups are due every 7 days. Practice is locked until the first check-up, and again
    while one is due.
  - Check-ups use fresh questions first, then reuse the ones seen longest ago.
  - Wrong, guessed and taught questions come back in later runs (about 1 in 3, marked "Back
    again").
  - Every run ends with "your score before → after" and each topic's change.
  - The predicted range, "by exam day" and the "+marks" plan are removed.
- **Why:** the founder found the old score impossible to follow. A new account showed 50%
  and nobody could say why. The founder chose the average of topics and "latest answer
  replaces".
- **Where:**
  - the rules: `docs/student-scoring.md` (version 3.1);
  - the API: `apps/api/src/app/scoring.py`, plus `routers/checkup.py`, `progress.py` and
    `practice.py`;
  - the web: Home, the check-up report and hub, Progress, Practice, the subject page, the run
    summary and the help pages.
- **Status:**
  - committed locally;
  - API: 351 tests pass, lint and types clean;
  - web: types, the build and its 43 tests pass;
  - screenshots in progress.

### CBT mock exam
- **What:** a JAMB-style computer-based test at `/mock`.
  - **Setup:** a Real UTME preset (English 60, the others 40, 2 hours) or a custom choice of
    subjects, question counts and time.
  - **The room:** the full paper loads at the start. It has subject tabs, a question palette,
    flag for review, A–D/N/P/F/S keys and a scientific calculator (its own parser, 32 tests).
  - **Anti-cheating:** full screen required and every exit logged; tab switches logged; no
    copy, paste or text selection; the server owns the clock; it auto-submits at 0:00.
  - **The report:** right ÷ answered per subject and overall, unanswered questions, and the
    integrity log. The history list can resume or delete a test.
  - Open to every student; no check-up is needed first.
- **Where:**
  - migration `029_mock_exams.sql`;
  - the API: `apps/api/src/app/routers/mock.py`;
  - the web: `apps/web/src/prep/mock/` and `pages/Mock*.tsx`;
  - merged from the `cbt-exam-mode` branch.
- **Status:** committed locally; 445 API tests and 32 calculator tests pass.
- **Open:**
  - the founder's UI notes were cut off mid-sentence;
  - full screen can't be forced on iPhone Safari;
  - mocks don't feed the predicted score yet.

### All 1,043 UTME Maths lessons taught the Nigerian classroom way
- **What:** every Maths board lesson now reads like a Nigerian SS3 exercise book. Each one
  goes "Solution", the givens, "Let …", the rule, the substitution, ∴, then a check. It also
  has:
  - reasons in brackets on geometry lines;
  - North lines on bearings;
  - the standard tables;
  - the division ladder;
  - place values written above the digits.

  Six question errors were corrected at the source.
- **Where:**
  - commits 3c152cb (the ladder), e8dd26f (the first 290 lessons) and d60ed1d (the rest);
  - the method is in `docs/lesson-style-guide.md` §9 and `docs/content-review/`.
- **Status:** deployed to the Stack Junior and Binaax servers (CI run 38252060611, all green).

### Parked
- Exact lip-sync for the talking mouth: planned in
  `docs/plans/2026-10-01-exact-lip-sync.md`, not built.
- Pre-made Kokoro voice clips for the oral English lessons.
- Pythagoras wording in lessons: the textbook "|AC|² = |AB|² + |BC|²" is kept for now.
