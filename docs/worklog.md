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

## 2026-10-12

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

### CBT mock exam (started)
- **What:** a JAMB-style computer-based test:
  - up to 4 subjects, a timer and a question palette;
  - flag for review and keyboard controls;
  - a scientific calculator;
  - anti-cheating: full screen, tab-switch logging, no copy or paste, a server-owned clock and
    auto-submit.
- **Where:** being built on the `cbt-exam-mode` branch in a separate worktree.
- **Status:** in progress. The founder's UI notes were cut off mid-sentence and are still to
  come.

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
