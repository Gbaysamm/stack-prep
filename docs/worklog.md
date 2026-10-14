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

## 2026-10-14

### Mock exams list: separate cards, four subjects in two columns, phone alignment
- **What:**
  - Each attempt is its own card again, not rows joined in one box.
  - On a laptop, a mock with three or four subjects shows its bars in two columns, so the
    card is no taller than a two-subject one.
  - On phone, the subject bars start at the card's left edge, lined up with the score tile,
    instead of being indented under the title.
- **Why:** founder feedback on the redesign.
- **Where:** `MockHub.tsx` and `Mock.css`.
- **Status:** committed locally. Checked at 1440 and 390, with a four-subject row faked in
  the browser because the bank only has English and Maths.

### Mock exams list redesigned as one clean list
- **What:**
  - Past mocks are rows in a single list card, not stacked boxes.
  - Each row has a score tile coloured by result (green 70%+, yellow 50%+, pink below),
    the type and one details line (date · time allowed · answered · exits), each subject as
    a small labelled bar, and an arrow. The whole row opens the report.
  - Delete moved off the list to a quiet "Delete this mock" at the foot of each report.
- **Why:** the founder found the card design itself poor, not just where Delete sat.
- **Where:** `MockHub.tsx`, `MockReport.tsx` (`DeleteMock`) and `Mock.css`.
- **Status:** committed locally; checked with 4 mocks at 1440 and 390, and empty at 390.

### Mock exams list: Delete moved onto the details line
- **What:** "Delete" is now the last quiet item on each card's details line ("30 minutes ·
  27/35 answered · Left the test 3 times · Delete"). It no longer floats in the bottom-right
  corner, where it sat under the score on short cards. The card still opens its report from
  anywhere, through a link stretched over the whole card.
- **Where:** `MockHub.tsx` and `Mock.css`.
- **Status:** committed locally; checked at 1440.

### Mock exams page: tidier list, a proper first-time state, average and improvement
- **What:**
  - Each past mock is one clickable card that opens its report: the subjects, then the score
    with an arrow. The soft "Report" button is gone, and Delete is quiet text in the corner
    instead of a floating ×.
  - Before the first mock, a faded example card shows what the list will look like.
  - The top section shows your best mock score, then one line with your average and the
    change since your first mock.
- **Why:** the founder disliked the button on white, the misaligned score and ×, and the
  empty state, and asked for an average and progress without cluttering the top.
- **Where:** `apps/web/src/prep/pages/MockHub.tsx` and `Mock.css`.
- **Status:** committed locally; checked empty at 1440 and with a mock at 390.

### Mock exams and check-ups each have one job
- **What:**
  - **Check-ups** alone set the predicted score and unlock practice.
  - **Mocks** are practice under exam conditions, with their own report.
  - **Before the first check-up nothing is scored,** so a mock no longer fills "Your score"
    or "Started at". After that, mock answers count in topic scores like practice answers.
  - The Mock exams page now says so.
- **Why:** the founder saw a mock showing up like a check-up on an account that had never
  taken one, while the app still asked for the first check-up. The two had overlapped.
- **Where:** `apps/api/src/app/scoring.py` (`subject_score`), `MockHub.tsx` and
  `docs/student-scoring.md` §3a. The test is in `test_scoring.py`.
- **Status:** committed locally.

## 2026-10-13

### Deployed: the mock exam work, the spoken-lesson rewrite and its audio fix
- 16 commits were pushed (up to c49dca7). CI run 38422063878 passed, and both servers were
  updated.

### Real UTME English: a passage is never cut
- **What:**
  - The comprehension and cloze parts now use whole passages only, choosing the mix of
    passages whose total comes nearest the usual count (15 and 10). Exact is best.
    Otherwise the nearest total is used: a shortfall before an excess, and unseen passages
    first.
  - Whatever that leaves of the 60 is shared across the other parts in proportion to their
    usual sizes. For example, two 8-question passages give comprehension 16, so the other
    parts give up 1 between them.
- **Why:** the founder ruled that a passage must always be used completely, and that the
  difference should be made up by the other sections.
- **Where:** `routers/mock.py` (`nearest_whole_passages`, `share_out`,
  `utme_english_paper`), with a test in `test_mock.py`.
- **Status:** committed locally. 18 mock tests pass, and three live papers each used 4
  whole passages, none cut, 60 questions.

### Real UTME mock: JAMB's English layout and JAMB's pace
- **What:**
  - **Time:** the Real UTME preset gets 40 seconds a question, rounded up, so English
    alone gets 40 min, English and one more subject 67 min, and all four 120 min. Custom
    mocks keep the student's own time.
  - **English order:** under the preset, Use of English is laid out in JAMB's order:
    - comprehension passages (15);
    - cloze passage (10);
    - sentence interpretation (5);
    - antonyms (5);
    - synonyms (5);
    - grammar (10);
    - oral forms (10: 2 each of vowels, consonants, rhymes, word stress and emphatic
      stress).

    Passages come whole, in printed order, with unseen questions first. (Superseded the same
    day: see "a passage is never cut" above.)
- **Why:** the founder pointed out that the real English paper has a set order and set
  counts, and that fewer subjects should never get the full two hours.
- **Where:** `routers/mock.py` (`UTME_ENGLISH_BLUEPRINT`, `utme_english_paper` and
  `utme_minutes`), `MockSetup.tsx` and `MockHub.tsx`. The tests are in `test_mock.py`.
- **Open:**
  - Third-party guides differ by a question or two per part; there is no official JAMB
    breakdown online.
  - The bank has no questions yet on the approved reading text (5 in the real paper), so
    comprehension stands in for them.
- **Status:** committed locally. 17 mock tests pass, and a live English + Maths sitting got
  67 minutes with the English parts in order.

### Mock setup: one slider for the time allowed
- **What:** the stepper, the chips and the pace box are replaced by:
  - the chosen time shown large ("120 min · 2 hours");
  - one slider in 5-minute steps, with a green tick at the real exam's pace;
  - one line with the time per question against JAMB's 40 s, and a "Use exam pace" link.
- **Why:** the founder found the previous card very poor, especially on phone, where the
  chips wrapped.
- **Where:** `apps/web/src/prep/pages/MockSetup.tsx` and `Mock.css`.
- **Status:** committed locally; checked at 1440 and 390.

### Mock report: the subjects live in the summary only
- **What:**
  - the "Subject by subject" section below the summary is removed;
  - each subject in the summary has its score, a bar and one brief line (right, wrong,
    skipped, time);
  - "Sit another" is off the summary, so it stays compact; it's still on the Mock exams
    page.
- **Why:** the founder wanted the summary to hold the subject breakdown, not repeat it
  below, and found the button made the summary bigger than it needed to be.
- **Where:** `MockInsights.tsx`, `MockInsights.css` and `MockReport.tsx`.
- **Status:** committed locally; checked at 1440 and 390, with and without answers.

### Lesson audio follows rewritten lines
- **What:** each lesson clip's address now carries a short fingerprint of its spoken line
  (`…/voice/3?v=<12 hex>`).
- **Why:** after the spoken-line rewrite, the founder heard the old audio over the new
  captions. Clips are cached by the browser for a day under a fixed address, so the old
  recording replayed even though the server would have made the new one.
- **Where:** `routers/practice.py` (the lesson's `voice_url`), with a test in
  `test_practice.py`.
- **Status:** committed locally.

### Mock report: a calmer summary at the top
- **What:**
  - the counts and the time are one quiet line of text ("5 right · 22 wrong · 8 skipped ·
    Handed in at 0:01 of 30:00"), not pill chips;
  - the subjects sit on the right without a boxed panel;
  - a mock with no answers says "No answers this time" with one sentence why. There is no
    clock tile, no row of zeros and no empty bars; a subject reads "20 questions, none
    answered".
- **Why:** the founder disliked the busy summary, especially the no-answer version.
- **Where:** `apps/web/src/prep/pages/MockInsights.tsx` and `MockInsights.css`.
- **Status:** committed locally; checked at 1440 and 390, with and without answers.

### Mock report becomes an insights page
- **What:**
  - the hero is the summary: the overall score big (with the change on the last mock),
    right / wrong / skipped and time used as chips, and each subject's score with a small
    bar on the right. The separate result card is gone.
  - nothing answered shows "No answers" with why (time ran out, or handed in), not a dash;
  - then: test conditions (slim line), "What to do next" (two or three sentences built from
    the data), subject by subject (counts, time, score), topics to work on (most wrong
    first, each with "Practise this topic"), your time (time used, average a question, JAMB
    pace against 40s, time per subject, right vs wrong vs skipped, a time spread chart, and
    the slowest questions, which open the question modal), your progress (a line chart of
    every scored mock and this mock against the last, per subject with sparklines), topic by
    topic per subject, and the existing question grid and modal;
  - drawn with plain CSS and SVG; every class is `mi-`; phone first.
- **Why:** the founder asked for the report to be a page of insights, not a duplicated
  result card, and for it to never look broken (one subject or four, no answers, first
  mock or many).
- **Where:** `apps/web/src/prep/pages/MockReport.tsx`, `MockInsights.tsx`,
  `MockInsights.css`, `apps/web/src/prep/mock/insights.ts` (+ `insights.test.ts`); the old
  result-card CSS is removed from `Mock.css`.
- **Status:** done on branch `mock-insights`, not merged.

### Mock room: time per question counts only time the question is in view
- **What:**
  - a question's time is now the time it was open and visible, summed across visits;
  - the count pauses while the tab is hidden, and while the full-screen gate, the Submit
    dialog or the palette covers the paper;
  - leaving a question (or pausing) saves its new total straight away, so the time survives
    a closed tab or the server submitting on the clock. Before, time was only saved with an
    answer or a flag, and hidden-tab time was counted.
- **Why:** the mock report now shows time per subject, per question and pace; the numbers
  must be honest.
- **Where:** `apps/web/src/prep/pages/MockRoom.tsx` (`bankTime`, the `timing` effect).
- **Status:** done on branch `mock-insights`, not merged.

### Mock report API: each question's topic and time, each subject's topics
- **What:**
  - report items carry `response_ms` (time the question was open in the room), and its JAMB
    topic: `subtopic_id`, `subtopic_name` and the syllabus section `topic_name`;
  - each subject in a report carries `time_ms` (its questions' time, summed) and `topics`
    (right / wrong / unanswered per topic, most wrong first);
  - the paper still names no topic, and history stays light (no items, no topics).
- **Why:** the report is becoming an insights page: weak areas with "Practise this topic",
  a topic breakdown, and time per subject and per question.
- **Where:** `apps/api/src/app/routers/mock.py` (`topics_of`, the topic join in `_sheet`),
  `apps/api/tests/test_mock.py`, `apps/web/src/prep/mockApi.ts`.
- **Status:** done on branch `mock-insights`, not merged.

### Every spoken lesson line now flows as one connected thought
- **What:** 5,572 spoken (`say`) lines across all English and Maths lessons were rewritten so
  the voice never meets a colon, semicolon or dash.
  - Ideas are joined with words ("which is", "so", "because", "that is") or split into two
    sentences.
  - Facts, numbers, `$…$` maths, answer letters and every word a board mark is timed to were
    kept.
  - Mismatches with the board were fixed: Lemoti's lesson now says "sculptor", not "statue",
    and 1984 Q40 says "second die".
  - All 16,949 spoken lines are now free of these marks outside quotations and maths.
- **Why:** the founder found a lesson confusing because the voice stopped mid-thought at
  colons ("the first gift, the painting: as a painter").
- **How:** eight helpers rewrote the lines in batches. A merge script refused any line that
  broke a rule. The rule is now in `docs/lesson-style-guide.md` §2.
- **Where:** `docs/questions/utme/*/lessons_*.yaml`.
- **Status:** committed locally. Both loaders pass (1,043 Maths and 736 English
  deliverable), and the 158 lesson-content tests pass. The new lines are re-voiced the
  first time each lesson plays.

### Mock report: question grids, a question modal, and the lesson from the report
- **What:**
  - "Every question" is now one grid per subject. Cells are green (right), pink (wrong) or
    white (not answered), with a yellow dot for flagged.
  - Tapping a number opens a modal with:
    - the question, your answer, the correct answer, and why your choice tempts (when the
      option has a note);
    - the reviewed working, step by step;
    - "Watch the lesson", which opens the full board lesson;
    - ← → (buttons and keys) to move through the whole paper across subjects, and Esc to
      close.
  - On phone the modal is a bottom sheet.
  - The old long list with subject tabs, filters and paging is gone.
- **API:**
  - report items carry `solution_steps`, and each wrong option carries `why` (its distractor
    note or misconception);
  - a submitted mock's questions open their lesson through the practice lesson endpoints,
    using that subject's mock session.
- **Why:** the founder found the old list hard to navigate and asked for a grid with clues
  and a modal with the answer, the explanation and the lesson.
- **Where:** `apps/web/src/prep/pages/MockReport.tsx`, `Mock.css`, `routers/mock.py`, and
  `routers/practice.py` (`_in_a_finished_mock`).
- **Status:**
  - committed locally;
  - 446 API tests pass, including a new test that the lesson opens only once the mock is
    handed in;
  - checked at 1440 and 390.

### Mock report: a slim "Test conditions" line
- **What:** the card is now one row:
  - the title;
  - a badge, "Clean" or "N things recorded";
  - chips only for what actually happened ("Left full screen 2 times");
  - a "When it happened" toggle that opens the timeline in columns.

  The big zero counters are gone.
- **Why:** the founder found the old panel poorly designed: four large counters, mostly
  zeros, across empty space.
- **Where:** `apps/web/src/prep/pages/MockReport.tsx` and `Mock.css`.
- **Status:** committed locally; checked at 1440 and 390.

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

## 2026-10-12

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
