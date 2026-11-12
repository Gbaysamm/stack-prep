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

## 2026-11-12

### The board's dock, second pass: buddy on the right, no words unless asked, chat in the controls
- **What:** on a desktop the buddy sits at the right of the dock, after the ask box. The words
  of what the coach says are no longer shown under the board even where there is no voice: a
  CC button among the controls turns them on (off by default, remembered). On a phone the chat
  button is one of the controls (no button floating over the board); it opens the ask box as
  a card above the dock. A lesson package in the studio voice is made four lines at a time,
  so the first student to open a lesson does not wait for 40 lines one after another.
- **Why:** founder, 12 Nov 2026, on the first pass: the buddy's place on desktop, the
  read-along words still showing on a phone, the floating chat button's place.
- **Where:** `apps/web/src/student/Board.tsx` (`captions`, the CC and chat buttons, the
  buddy's place), `apps/web/src/prep/board.css`, `apps/api/src/app/lesson_package.py`.
- **Status:** done locally; screenshots at 1440 and 390. Not pushed.

### The board's dock on a phone: one slim row; asking as a floating chat; the buddy by the controls
- **What:** on a phone the timeline is one line (the track and "20 / 40"; the section's name
  only in a bubble while it is held), and the controls run the whole width in one row. The
  ask box is no longer always under the board: where asking is open it is a round chat button
  over the board's corner that opens the box as a card (and pauses the lesson); in a bank
  lesson, where asking is not open yet, nothing is shown. On every screen the buddy sits beside
  the controls instead of over the board, and Next is a plain control like the others (only the
  last step's Done stands out).
- **Why:** founder, 12 Nov 2026: on a phone the dock took a lot of the screen and too much was
  going on at once; the ask box can come later, as a floating chat; Next drew too much attention.
- **Where:** `apps/web/src/student/Board.tsx` (`askOpen`, the chat button, the buddy's place,
  the timeline's bubble), `apps/web/src/prep/board.css`.
- **Status:** done locally; screenshots at 1440 and 390. Not pushed.

### Lessons: one download, kept on the phone; a timeline to move through; no caption box
- **What:**
  - A bank lesson now comes down as ONE file (its board, every line's voice, the voice's word
    timings), with a progress bar ("Getting your lesson ready… 70%"), and is kept in the
    browser's Cache Storage. Opened again, the phone only asks "is this still current?" (a
    304, a few bytes); with no network the kept copy plays. Once downloaded, a lesson plays to
    the end with no network at all.
  - The roadmap fetches lessons ahead: every lesson stop not yet taken, and the next run's
    subtopic while it is still weak (level 2 or below). Not on a "save data" connection.
  - The free voice's clips go in at 32 kbps: a 40-line lesson is about 1.5 MB (it was about
    4 MB as separate 64 kbps clips). The API makes every bank lesson's package in the free
    voice after start-up, behind any student waiting on a voice (`LESSON_PACKAGES_WARM`).
  - The board's caption box is gone while the lesson is heard: the student listens and
    watches the writing. It comes back only where it is needed (no voice, read along; the
    voice blocked; a tap to start; the coach answering a question).
  - A timeline under the board: one mark where each section starts (Welcome, Objectives, each
    term, Recap). Drag or tap to go to any point; it says where it will land while held.
    "Replay this step" is now Back (the previous step).
- **Why:** founder, 12 Nov 2026: a lesson fetched a line at a time stops dead on a weak
  network and the student leaves; many students at once must not all hit that. The caption
  pulled eyes off the board. Replay-this-step alone was too limiting.
- **Where:** `apps/api/src/app/lesson_package.py` (the file format, building, warm-up),
  `routers/roadmap.py` (`GET …/lessons/{subtopic}/package`, ETag/304), `voice_store.py`
  (`packaged`, the lite copy), `kokoro_voice.py` (`LITE_KBPS`), `main.py` (start-up warm-up);
  `apps/web/src/prep/lessonPackage.ts` (download, keep, unpack, fetch ahead),
  `prep/pages/Lesson.tsx`, `prep/roadmapApi.ts` (`lessonsAhead`), `student/Board.tsx`
  (`Timeline`, `seek`, the caption only when needed; the room under the board is now measured
  from the coach's dock, which is always there), `prep/board.css`.
- **Status:** done locally, tested (API 210, web 63; screenshots at 1440 and 390). Not
  pushed. On a server, the first start-up after deploy voices the bank lessons once (the free
  voice on the CPU took about 10 seconds a line here).

### The voice reads plain-written maths properly
- **What:** a coordinate written as plain text is said with its comma ("the point 5, 7" →
  "the point 5 comma 7"; "(2, 4)" → "2 comma 4"; "A(1, -2)" → "A 1 comma minus 2"); a bracket
  holding a sum is said as one ("3(2 + x)" → "3 times the bracket 2 plus x"; "f(3)" → "f of
  3"); "$y$-intercept" no longer comes out as "y -intercept". Brackets in prose ("(1)", "(like
  air)") are left alone.
- **Why:** founder, 12 Nov 2026: a coordinate in an algebra lesson was heard as "2 to 4". 19
  question-lesson lines said a point as "the point 5, 7" with no comma said.
- **Where:** `apps/api/src/app/tutor.py` (`for_the_voice`, `_BARE_BRACKETS`, `_SAID_POINT`),
  `tests/test_tutor.py`.
- **Status:** done locally. Lines it changes get new audio when next played (their words
  changed). The homepage showcase lessons are recorded files: they keep the old reading until
  they are re-made (`scripts/showcase_lessons.py`).

## 2026-11-11

### Subtopic lesson bank: three pilot lessons, played on the board
- **What:** a written lesson per subtopic, played on the whiteboard (voice, handwritten lines,
  doodles) at the roadmap's lesson stop. Three pilots, written by parallel agents from our
  syllabus, the subtopic's JAMB past questions and Nigerian school and tutorial explanations
  (in our own words), in the style the founder pointed to (an AI tutor that teaches cell
  structure "like gossip" while drawing one picture that grows):
  - Chemistry "Elements, compounds and mixtures" (30 moments; singles, couples, the party).
  - Mathematics "Indices, Logarithms and Surds" (36 moments; the Tower of Twos).
  - Biology "Cell structure and functions of cell components" (32 moments; the cell compound).
  The lesson is the same for every student and stands on its own: it does not replay the
  student's mistakes (the founder: the run's own board already went over each missed question;
  an opening of trap lines with no question on the board made no sense). A subtopic with no
  written lesson keeps the missed questions' working page. Asking mid-lesson is not wired yet (the box says it is coming).
- **Where:** `docs/lessons/subtopics/<subject>/<slug>.yaml` and `doodles/sub_<slug>_x.svg`;
  migration `045_subtopic_lesson_bank.sql`; loader `database/load_subtopic_lessons.py`
  (`DATABASE_URL=... python database/load_subtopic_lessons.py`); `database/lesson_doodles.py`
  (custom:sub_ names); API `routers/roadmap.py` (lesson board, voice, words),
  `routers/practice.py` (`beats_from_moments`), `lesson_doodles.py`; web `pages/Lesson.tsx`,
  `student/Board.tsx` (`questionLabel`).
- **Status:** done locally; played on the board at 1440 and 390. Not pushed. Needs a teacher's
  read for accuracy before students see them. Polish found: on the Biology board the link lines
  from words to the drawing cross the written text, and one label is clipped at the edge.

### Lessons on the roadmap, an 80% bar, answers after a lesson count, topic tests
- **What:**
  - The bar to pass a subtopic is 80% (was 40%). Below it after a run, the path's next stop on
    that subtopic is a **lesson**, then the run again. Until the written lesson bank exists, the
    lesson is the reviewed working of the questions the student missed there (`/lesson/:id`).
  - After a lesson, the student's answers in that subtopic are their real attempt: once there is
    an answer after the lesson, earlier answers there stop counting (`scoring.after_lessons`),
    and the questions missed before it are not served again as comebacks.
  - When every subtopic of a topic is done (answered, at least one passed, the rest passed or
    moved past), the path adds one **topic test**: a run across the whole topic.
  - The 4-run limit and running out of new questions still move the path on.
- **Why:** the founder's rule, 11 Nov: weak means taught then tried again on new questions;
  80% to move on; a test once a topic is complete.
- **Where:** migration `044_roadmap_lessons.sql`; `packages/engine/src/engine/roadmap.py`
  (`needs_lesson`, `topics_to_test`, `SECURED = 0.80`), `projection.py`, tests; API
  `routers/roadmap.py` (lesson GET and done, starts), `scoring.py`, `routers/practice.py`,
  `routers/dev.py`, `tests/test_scoring_lessons.py`; web `pages/Lesson.tsx`, `PrepApp.tsx`,
  `roadmapApi.ts`, `pages/Roadmap.tsx`.
- **Status:** done locally; engine 108 and the API roadmap, practice, scoring and check-up tests
  pass; lesson page checked at 1440 and 390. Not pushed. The lesson bank is next.

### The path's level reads as the topic's, not the subject's
- **Then:** every stop's name is one line, cut with "…" when long (the full name on hover), so
  the words never stand taller than the tile; on a phone the level sits at the far right of the
  subject's line.
- **Phone (later the same day):** on a phone the boxes and level word sit on the subject's line
  ("Chemistry ▪▫▫▫▫ Weak"), so the topic name keeps the full width instead of wrapping to three
  lines; on a wide screen they stay at the row's end.
- **What:** a path stop's line is just its subject ("Chemistry"); the level word sits beside
  the five boxes ("▪▫▫▫▫ Weak"), so it reads as that topic's level, not "Chemistry is weak".
- **Why:** the founder read "Chemistry · Weak" as the whole subject being weak.
- **Notes (from checking the data):** "Elements, compounds and mixtures" has 3 questions in all
  (two at difficulty 1, one at 2). Chemistry has 16 sections ("topics" in the data) and 61 of
  JAMB's topics ("subtopics"); a weekly check-up asks one question in each of the 15
  heaviest sections, never-seen questions and unasked subtopics first.
- **Where:** `apps/web/src/prep/Journey.tsx`, `Journey.css`, `pages/Roadmap.tsx`.
- **Status:** done locally, checked at 1440 and 390; not pushed.

### Home's score bar no longer catches the public site's band style; no "Done" word on the path
- **What:** the gain stretch on Home's score bar was class `band`, which the public site also
  styles (64px padding, for its edge-to-edge sections). After visiting the site in the same
  tab, that stretch became a tall green strip hanging out of the card. It is `home-band` now.
  The path's finished stops show only the purple tick, not the word "Done" (read as "topic
  mastered" when it means "today's run finished").
- **Why:** the founder asked what the strip and "Done" meant.
- **Where:** `apps/web/src/prep/pages/Home.tsx`, `Home.css`, `Journey.tsx`, `Journey.css`.
- **Status:** done locally, checked at 1440 after loading a site page first; not pushed.

### The API finds the checkout's .env wherever it starts; tests never see a paid key
- **What:** settings read the checkout's own `.env` (found from `config.py`) as well as one in
  the working directory, so an API started from `apps/api` has its AI key. Started that way it
  had none: every coach question fell back ("The answer is A.") and the studio voice was not
  found. The test setup now blanks the OpenAI and Paystack keys, so running tests on a laptop
  with a real `.env` can never spend money. The coach's fallback, when it truly cannot answer,
  now says so on the board ("I can't answer questions right now. The working above shows why
  the answer is A.") instead of only the letter.
- **Why:** the founder asked the coach twice and got "The answer is A." both times.
- **Where:** `apps/api/src/app/config.py`, `tests/conftest.py`, `app/tutor.py`, `tests/test_tutor.py`.
- **Status:** done locally; tutor tests pass. Not pushed. Production reads its settings from its
  own environment, unaffected.

### Kokoro makes one line at a time, the line a student waits on first
- **What:** the free Kokoro voice is now made one line at a time on the server, and a line the
  board is waiting on goes ahead of lines being made in advance. Opening a lesson still makes
  its lines in advance, but in step order, one at a time, and only while no student is
  waiting. Before, a lesson's advance job (two at once) and the board's three prefetches ran
  together on the same processor, each took about three times as long, the waited-on line
  timed out (15 s, then 10 s), and after three misses the board went silent for the lesson.
- **Why:** the founder: the board was slow and the voice sometimes did not talk (Kokoro chosen
  in the board's settings).
- **Measured on the dev laptop:** about 5 s per sentence alone, 5-11 s under load; a sentence
  lasts about 4 s spoken. So on this processor Kokoro still cannot keep up live; the queue stops
  the silent failures but some waiting remains. Making each lesson's Kokoro lines ahead of time
  would remove it (free, but hours of processor time; not started).
- **Where:** `apps/api/src/app/voice_store.py` (`_kokoro_turn`), `routers/practice.py` (warm).
- **Status:** done locally; voice and lesson tests (112) pass. Not pushed.

### Home: "Where you stand" is back
- **What:** Home is now the hero (next stop, today's dots, Start or Carry on), "Up next" (the
  next stops, fading on), and "Where you stand" with its subject switcher (score, predicted
  score, target and the bar). The slim "Your subjects" rows stay on the Roadmap page only.
- **Why:** the founder liked the score card and wanted it on Home.
- **Where:** `apps/web/src/prep/pages/Home.tsx`.
- **Status:** done locally, checked at 1440 and 390; not pushed.

### The path never "ends"; runs never outnumber a subtopic's new questions; a half-done run carries over
- **What:**
  - The path is shown day by day ("Today", "Tomorrow", then the weekday), at most 14 stops,
    and it fades out with its line running off the card, as Duolingo's path never shows an
    end. Home's "Up next" fades the same way.
  - The planner caps a subtopic's runs at its new questions for the student (one run per 10
    unseen; `UnitStanding.fresh`, `_runs_left`); a subtopic out of new questions stops holding
    the syllabus back (its misses still come back as comebacks). A three-question subtopic no
    longer gets a week of runs that each serve three questions.
  - A run left half-done is attached to the first stop on its subtopic after a re-plan, so the
    path says "Carry on", not "Start".
  - The 1-2-3 strip and "2 to go" are gone from the hint box after a miss; the bar at the top
    already counts the run's questions.
- **Why:** the founder: the path looked like all there was to do; "1/3" and "2 to go" read as
  three chances; a started run showed "Start".
- **Where:** `apps/web/src/prep/Journey.tsx`, `Journey.css`, `pages/Roadmap.tsx`, `Home.tsx`,
  `PracticeRoom.tsx`; `packages/engine/src/engine/roadmap.py`, `projection.py`, tests;
  `apps/api/src/app/routers/roadmap.py` (`_fresh_by_subtopic`, run carry-over).
- **Status:** done locally; engine 106, roadmap and practice API tests pass; checked at 1440 and
  390. Not pushed.

### Home redone around today; the week's runs spread in syllabus order, never piled up
- **What:**
  - Home: the hero holds the next stop (its name and subject), today's progress as dots
    ("0 of 12 today") and ▶ Start; under it the next four stops on the ladder and one slim row
    per subject (score now → by exam day, target). "Where you stand" and "Your practice so
    far" left Home (Progress has scores and runs).
  - The week's runs per subject (`_syllabus_queue`): the open subtopics in syllabus order, a
    few at a time, each up to its runs left under the 4-run limit; if that cannot fill the
    subject's share of the week, the next subtopics open, still in order; only then reviews of
    secured ones. The day loop no longer wraps round a short list (which gave one subtopic 11
    runs in a week), and a subtopic never answered is no longer judged "probably fine" from
    its topic and swapped for mixed practice (which gave the founder's Physics only mixed runs).
  - Path labels: no "N runs", no "3 of 3 done this week"; a mixed run reads "Physics review ·
    Topics you have covered".
  - Check-up card: with the question number gone, the topic and tools start on the left and
    the topic may use the full width.
- **Why:** the founder: Home was very bad and overwhelming; "11 runs", "3 of 3 done this week"
  and "Mixed practice · Physics" made no sense; a gap on the left of the check-up card.
- **Where:** `packages/engine/src/engine/roadmap.py` (+ tests; `_queue`, `_coverage`,
  `_value_bands` removed); `apps/web/src/prep/pages/Home.tsx`, `Home.css`, `Roadmap.tsx`,
  `roadmapApi.ts`, `CheckupRoom.css`.
- **Status:** done locally; engine 105, roadmap API and web tests pass; checked at 1440 and 390.
  Not pushed.

### A slow student is never stuck: a run limit, a pace check, and each student's own run time
- **What:**
  - Run limit: a subtopic not secured after 4 runs (`STUCK_AFTER_RUNS`) stops holding the rest
    of the syllabus back; it stays open, and its missed questions keep coming back.
  - Pace check, each morning: per subject, the subtopics not yet moved past × the student's
    runs-to-secure (their own average once 3 are secured, else 2) against the runs that
    subject has before exam day (75% of them; the rest are reviews, mixed runs, check-ups).
    When short, more subtopics open at once in proportion, and the roadmap's one line says
    "Add 30 minutes a day to cover everything in time." (or, beyond five hours, that the
    most-asked topics come first).
  - Run time: a student's own minutes per run (the median of their last 10 finished runs,
    per 10 questions, held between 10 and 30) replace the 15-minute guess once they have 3
    runs, so runs a day = their minutes ÷ their run time.
- **Why:** the founder: with daily re-planning and the syllabus order, a slow student could
  stall on the first subtopics and never reach the rest; the hours per run were a guess.
- **Where:** `packages/engine/src/engine/roadmap.py` (`moved_past`, `_pace`, `_pace_advice`,
  `runs_to_secure`, `RoadmapInput.run_minutes`), `projection.py` (`UnitStanding.runs`), tests;
  `apps/api/src/app/routers/roadmap.py` (`_runs_by_subtopic`, `_run_minutes`, `pace_advice`);
  `apps/web/src/prep/pages/Roadmap.tsx`, `roadmapApi.ts`.
- **Status:** done locally; engine 104 tests, roadmap/practice/check-up API tests pass. Not pushed.

### The roadmap follows the syllabus order, re-plans each morning; difficulty moves on two in a row
- **What:**
  - Syllabus order is the prerequisite order (founder's rule). A subject's subtopics are taken
    in the syllabus's order (`display_order`); every secured one (≥ 40% from 3+ answers) stays
    open, and only the next three not yet secured are open; everything after waits. Runs and
    mixed runs come only from open subtopics; subtopics with no questions are stepped over.
    Scores and the expected total still count every subtopic. (`engine.roadmap.open_units`,
    `OPEN_AHEAD = 3`; `UnitStanding.teachable`.)
  - The plan is re-built each morning (`new_day`, migration 043) as well as after a check-up or
    a goal change, so yesterday's runs shape today; today's stops are not re-planned mid-day
    except by those two. The weekly record counts a stop only while its plan was the current
    one, or when it was taken, so replaced plans leave no phantom missed stops.
  - Practice difficulty (spec §9.5): two right in a row at the same level move up one, two
    wrong move down one; anything else stays (was: every answer moved it).
  - The path shows each subtopic once, with its runs ("Biology · 4 runs"), and ends with the
    next steps: no "Exam day" stop and no "more runs" row, as on Duolingo; the target stays in
    the hero and the subjects column.
  - Scoring stays right ÷ answered (founder: keep it easy to follow).
- **Why:** the founder: a student without the basics (algebra) must not be sent to what builds
  on them (differentiation); a weak run should not wait a week to change the plan; ten stops
  then "Exam day" read as all it takes.
- **Where:** `packages/engine/src/engine/roadmap.py`, `projection.py`, tests;
  `apps/api/src/app/routers/roadmap.py`, `practice.py`; `database/migrations/043_roadmap_daily.sql`;
  `apps/web/src/prep/pages/Roadmap.tsx`, `Journey.tsx`, `Journey.css`.
- **Status:** done locally; engine 101, API 568 and web tests pass; checked at 1440 and 390.
  Not pushed.

### The path's Start button and level squares
- **What:** the roadmap's Start (and Carry on) button has a play icon in front instead of an
  arrow behind, and a step's button can no longer shrink or wrap (the arrow had dropped under
  the word in the founder's window). The five level squares show only once a topic has a level
  (three or more answers); a topic not started shows none. They carry their meaning as a
  tooltip and for screen readers ("Level 1 of 5: Weak"). The button also keeps at least its
  own width (`min-width: max-content`), as it was still squeezed in one window.
- **Why:** the founder asked what the dots meant (grey squares on unstarted topics said
  nothing) and did not like the arrow under "Start".
- **Where:** `apps/web/src/prep/Journey.tsx`, `Journey.css`, `pages/Roadmap.tsx`.
- **Status:** done locally, checked at 1440 and 390; not pushed.

### The check-up and practice bar: a floating rounded bar the width of the content
- **What:** the top bar of the check-up and practice rooms (`FocusShell`) is now a floating,
  fully rounded light-glass bar, like the public site's, no wider than the content under it
  (the check-up's two columns, the practice card). On one line: leave, the subject, a thick
  rounded progress bar, the count ("6/15"), then the timer or score. The "QUESTION 6 OF 15"
  label is gone (kept for screen readers), and so is the "QUESTION 06 / 15" repeated on the
  question cards. The focus pages are on the lavender paper all the way up, so no white band
  shows round the bar. On a phone the subject is left out to give the bar room.
- **Why:** the founder: the old header was a full-width white band with a thin line, too long,
  and the question number was said twice.
- **Where:** `apps/web/src/prep/shell.tsx` (`FocusShell`, new `step`), `prep.css`
  (`.sj-focusbar`, `.sr-only`), `pages/CheckupRoom.tsx`, `pages/PracticeRoom.tsx` and `.css`.
- **Status:** done locally, checked at 1440 and 390; not pushed.

### A chosen chip is the height of its row
- **What:** chosen chips and toggles no longer carry the 3-4px purple ledge underneath
  (`.sj-chip` pressed, onboarding and Goal days, the calendar's day and month chips, the run
  builder's year and length, the run report's filters), so a chosen one lines up with the rest.
  The study-time line is hidden when the least is 15 minutes, as it then rules nothing out.
- **Why:** the founder: the heights were still not aligned when one item was selected.
- **Where:** `prep.css`, `lib/DatePicker.css`, `Onboarding.css`, `Goal.css`, `RunBuilder.css`,
  `RunReport.css`, `prep/StudyMinutes.tsx`.
- **Status:** done locally, checked at 1440; not pushed.

### Study time: only workable times, up to five hours, a custom stepper; no Weekdays / Every day
- **What:** a shared `prep/StudyMinutes` replaces the minute chips on onboarding and the Goal
  page. It offers only times that work for the days left: the least the plan needs, then the
  next longer ones (1 h 30, 2 h, 3 h, 4 h, 5 h), plus Custom, a − / + stepper in 15-minute steps
  between the least and five hours. Times are shown as "1 h 15". One quiet line says why
  ("92 days to go, so at least 1 h 15 a day"). The planner now fits up to 20 runs a day (five
  hours) instead of 6 (`MAX_RUNS_PER_DAY`), so a month out with four subjects asks for 4 h 30
  rather than "even 90 min won't do". The Weekdays / Every day switch is gone: students tap the
  days. The "In 1 month" chips beside the date field are its height (42px), with no ledge.
- **Why:** the founder: don't show times that can't work, offer longer ones and a custom time,
  allow 4-5 hours a day; remove the switch; the quick chips were taller than the date field;
  the number box for a custom time looked bad.
- **Where:** `apps/web/src/prep/StudyMinutes.tsx` and `.css`, `studyTime.ts` (+ tests),
  `pages/Onboarding.tsx`, `pages/Goal.tsx`, `prep.css`, `Onboarding.css`;
  `packages/engine/src/engine/roadmap.py` (`MAX_RUNS_PER_DAY = 20`) and its test.
- **Status:** done locally, checked at 1440 and 390; engine 98, web 59 and roadmap API tests pass.
  Not pushed.

### The least study time a day follows the days left; smaller chips; a Weekdays / Every day switch
- **What:** onboarding and the Goal page no longer let a student pick less time a day than the
  plan needs. `prep/studyTime.ts` works it out from the planner's own rules: every subtopic we
  teach in the student's subjects gets at least one 15-minute run before its exam day, and in
  the last 42 days only 60% of runs count (40% are mixed practice). The least runs a day is the
  topics over the counted study days, rounded up, capped at 6 (90 min). Shorter times are struck
  through, a time below the least is raised to it, saving below it is refused, and one line says
  why ("92 days to go: at least 75 min a day to cover all your topics"). When even 90 min will
  not do, it says so in red and suggests more days, or that the plan will put the most-asked
  topics first. Example, Use of English and three sciences on weekdays: 30 min at six months,
  75 min at three, the 90-min cap at one.
  Weekdays / Every day is now a small switch (shared `.sj-seg`). Chips are 38px app-wide (were
  42), onboarding's day and minute buttons 38px, the date field 42-44px, and the Goal page's
  day buttons 38px without the tick circle (were 72px).
- **Why:** the founder: 15 minutes a day with a month to go cannot work, so the time must depend
  on how long is left; the Weekdays / Every day buttons looked wrong; the buttons were too tall.
- **Where:** `apps/web/src/prep/studyTime.ts` (+ `studyTime.test.ts`), `pages/Onboarding.tsx`,
  `pages/Goal.tsx`, `prep.css` (`.sj-chip`, `.sj-seg`, `.sj-least`), `Onboarding.css`, `Goal.css`.
- **Status:** done locally, checked at 1440 and 390; web tests pass (58). Not pushed. The API does
  not yet refuse a too-short time sent directly; the screens do.

### Our own date picker instead of the browser's
- **What:** a new `lib/DatePicker` replaces every `<input type="date">` the app uses (onboarding's
  exam date and paper dates, the Goal page, the admin Premium "Ends on"). The field shows the day
  in words ("Thu 14 May 2027") and opens a calendar in the app's style: Monday first, today
  dotted, the chosen day a purple tile, days before tomorrow greyed. Tapping the month name
  opens a year row and the twelve months, so a date a year away is a few taps. Keyboard works
  (arrows, Page Up/Down, Enter, Escape). Optional dates can offer a clear button (`clearLabel`).
- **Why:** the founder: the browser's picker ("mm / dd / yyyy", grey boxes) looked wrong, and
  the year was hard to change.
- **Where:** `apps/web/src/lib/DatePicker.tsx` and `.css`; `prep/pages/Onboarding.tsx`,
  `Goal.tsx`, `admin/PremiumPage.tsx`. The unused `student/StudentApp.tsx` was left alone.
- **Status:** done locally, checked at 1440 and 390; web tests pass; not pushed.

### Onboarding cannot be skipped; the path's lit row is even
- **What:** a new student has no "Skip for now" and the logo is not a link while setting up;
  only a student changing an existing goal gets "Back to home". The side rail goes back only
  to steps already reached, and ticks a step only when it is really complete (no more "Your
  goal" ticked while it says "Not picked yet"). In the ladder card, rows have 3px more padding
  below than above (the tiles' ledge), and an empty end slot is hidden, so the current row on
  a phone no longer carries an empty line under it.
- **Why:** the founder: these steps are important and should not be skippable; the lit row's
  bottom padding looked wrong.
- **Where:** `apps/web/src/prep/pages/Onboarding.tsx` (`canLeave`, rail state and disabling),
  `apps/web/src/prep/Journey.css`.
- **Status:** done locally, checked at 1440 and 390 (onboarding and the roadmap); not pushed.

### Onboarding: English ticked for real; a calmer top; no red outlines when the list is full
- **What:** Use of English is now part of the saved choice everywhere (on load, on every change,
  on save), never more than the exam allows, and its card shows the tick; the "Everyone sits
  this" badge is gone. Trying a fifth UTME subject shows the note but no longer outlines every
  card in red. The top bar is no longer a frosted white band with a line under it: the logo and
  a small "Skip for now" pill sit on the page itself.
- **Why:** the founder: English showed unticked with four others picked, the badge was not
  wanted, and the header band looked wrong (the pink glow smudged through it).
- **Where:** `apps/web/src/prep/pages/Onboarding.tsx` (`withCompulsory` now caps at the limit,
  `update` applies it), `Onboarding.css` (`.onb-bar`, `.onb-skip`).
- **Status:** done locally, checked at 1440 and 390; not pushed.

### Onboarding: Use of English is picked for the student
- **What:** a compulsory subject (UTME's Use of English) is ticked from the start, cannot be
  unticked, and sits first in the list. The yellow "UTME is four subjects…" box is gone; the
  line under the title now reads "Use of English is in. Pick the rest."
- **Why:** the founder: everyone sits English, so it should be selected already, and everyone
  knows UTME is four subjects.
- **Where:** `apps/web/src/prep/pages/Onboarding.tsx` (`withCompulsory`, `SubjectCard`), `Onboarding.css`.
- **Status:** done locally, checked at 1440 and 390; not pushed.

### Onboarding: the State list no longer opens under the Back button
- **What:** the step's slide-in animation now leaves no transform behind (`backwards` instead
  of `both`), so a dropdown opened in a step sits above Back and Continue.
- **Why:** the founder: the Back button covered the State list. The kept transform put the step
  in its own layer below the buttons, whatever the list's z-index.
- **Where:** `apps/web/src/prep/pages/Onboarding.css` (`.onb-body`).
- **Status:** done locally, checked at 1440 and 390; not pushed.

### Onboarding: a welcome page of its own, "Your exam" with what the exam is like, shorter buttons
- **What:** a new student first sees a welcome page ("Hi Ada, let's set up your plan", one
  line, Let's start, and the setup path drawn as the ladder card). The first step is now
  "Your exam", and the exam card shows what the exam is like: 4 subjects (Use of English for
  everyone), one sitting, top score 400. These come from the exam's own rules, not our bank.
  Back and Continue are shorter (44px, 42px on a phone) with a thinner ledge, and the label is
  nudged so it sits in the middle of the face and ledge together.
- **Why:** the founder: the welcome and the exam card did not belong in one box, the exam page
  was too blank, the old card looked poor, and the button was too tall with its text sitting high.
- **Where:** `apps/web/src/prep/pages/Onboarding.tsx` (`Welcome`, `examFacts`), `Onboarding.css`.
- **Status:** done locally, checked at 1440 and 390; not pushed.

### Onboarding: no counts, "About you" on its own step, smaller phone buttons
- **What:** the exam card no longer shows how many subjects and past questions we have, and the
  subject cards no longer show question and topic counts. "A little about you" moved off the
  exam step into its own optional step: Exam, About, Subjects, Your goal, Review. The first
  step's line is now just "UTME is picked for you." On a phone, Back and Continue keep their
  own width (Continue on the right) instead of stretching across the bar.
- **Why:** the founder: students do not need our numbers; exam and "about you" are separate
  things; the phone button was too big.
- **Where:** `apps/web/src/prep/pages/Onboarding.tsx` (named step constants EXAM to REVIEW
  replace the bare 0 to 3), `Onboarding.css` (unused facts and about-box rules removed).
- **Status:** done locally, checked at 1440 and 390; not pushed.

### Onboarding: the "Then 01 02 03" steps are gone
- **What:** the first onboarding step no longer lists the steps to come (subjects, goal,
  first check-up) under the exam card.
- **Why:** the founder: not needed. The step strip at the side (or across the top on a phone)
  already names them, so it said the same thing twice.
- **Where:** `apps/web/src/prep/pages/Onboarding.tsx`, `Onboarding.css` (unused `.onb-next` rules removed).
- **Status:** done locally, checked at 1440 and 390; not pushed.

## 2026-11-10

### The path as a ladder card, and a roadmap that is never blank
- **Why:** the founder: the winding, dotted path did not fit the app's look; a student with no
  goal yet saw an almost empty roadmap.
- **What:** the founder chose the "ladder card" style. `Journey` is now one white card with
  the app's purple offset shadow: square icon tiles on a line down the left (purple when
  done, lime for the current step, grey ahead, gold for exam day), the words in one column,
  level pips and a lock on the right, and the current step as a lit row with its button
  (full width under the words on a phone). A student with no subjects sees the starting path
  on the Roadmap too (Set your goal, check-up, plan, daily runs, check-ups, exam day), headed
  "Start with your goal"; the path then takes the full row.
- **Where:** `apps/web/src/prep/Journey.tsx`, `Journey.css`, `pages/Home.tsx`,
  `pages/Roadmap.tsx`, `pages/Roadmap.css`.
- **Status:** done locally.

### The roadmap on the path, with levels
- **Why:** the founder wants the roadmap fun and levelled, like Duolingo's path but our own.
- **What:** each planned subtopic has a level from the spec's mastery bands (§9.1): 1 Weak
  (<40%), 2 Developing (40–65%), 3 Exam-ready (65–80%), 4 Strong (80–90%), 5 Mastered (≥90%);
  0 until it has 3 answers. The roadmap API returns it per run (`level`). The Roadmap page is
  now the path: today's finished items done, the next one glowing with its Start (or Carry
  on) in a callout, what follows ahead with five level pips under each circle, check-ups as
  checkpoints, and a gold Exam day with the target at the end. On a wide screen the subjects
  sit beside the path; the hero no longer repeats the Start button.
- **Where:** `apps/api/src/app/routers/roadmap.py` (`level_of`, `_levels`),
  `tests/test_roadmap_api.py`, `apps/web/src/prep/Journey.tsx`, `Journey.css`,
  `roadmapApi.ts`, `pages/Roadmap.tsx`, `pages/Roadmap.css`.
- **Status:** done locally. Next: points, daily goal, streak freezes and a run-complete screen
  with level-ups.

### The journey path, and say less in the practice room
- **Why:** the founder: a new student's Home was either an essay (three explained steps and an
  example score card) or, cut down, blank; it should look like a learning path, in our own
  design, nicer than Duolingo's. And the practice room repeated itself.
- **What:** a reusable `Journey` component: a winding trail of raised circles (done in purple,
  current in lime with a breathing ring and a callout carrying its one action, ahead locked)
  ending in a gold "Exam day". A new student's Home is the greeting and that path: Set your
  goal (the action), Take a check-up, Your plan, Daily runs, Check-ups, Exam day. In the
  practice room: praise lines are one short sentence; "Recommended…" and "Optional…" notes
  under the buttons removed; one name for the action ("See the working"); the missed-twice
  dialog shows the tries and the answer without a "What happens now" list; after the
  check-in a "Saved" toast and straight on, instead of a screen explaining each answer. The
  student is now told once, not three times, that a missed question comes back. Also cut: the
  "How sure are you?" dialog's explanation and the sentence under each choice; the hint
  panel's "You said you knew it…" and "This one won't count now…" lines; the screen before
  the board is now the question, one line (sound on), the answer and "Start the lesson".
- **Where:** `apps/web/src/prep/Journey.tsx`, `Journey.css`, `pages/Home.tsx`, `Home.css`,
  `pages/PracticeRoom.tsx`.
- **Status:** done locally. The roadmap page moves onto the path next.

### Say less: Home and Practice
- **Why:** the founder: the app is far too wordy; each page should carry only what the student
  needs. Guided by a page-by-page audit of repeated and explanatory text.
- **What:** Home: "Your weakest topics" removed (the roadmap now chooses what comes next, so
  it was a second, competing suggestion); section subtitles that defined terms removed; the
  score card's notes cut to their titles; the hero says what to do, not why. Practice: the
  hero's long sentence and the "What a run is" section removed; the duplicate score block
  removed from the subject panel (Home has it); "Build your own" is one line and one button
  (with the roadmap's "Opens after N more planned runs" and a link to it); captions cut to a
  few words.
- **Where:** `apps/web/src/prep/pages/Home.tsx`, `Home.css`, `PracticeHub.tsx`,
  `PracticeHub.css`.
- **Status:** done locally; the run screens, check-ups and the rest follow.

### Topic weights from JAMB's past papers
- **Why:** the founder asked whether planning uses how often topics come up in past papers.
  It did not: weights came only from an approved printed paper structure, which no subject
  has, so every subtopic was weighted equally everywhere (check-up, practice, roadmap).
- **What:** migration 042 adds `subtopic_past_paper_frequency` (questions per subtopic on
  dated past papers; our own sets never count). Where no printed structure is approved, a
  subtopic's share of the paper is its share of past-paper questions, smoothed by one (spec
  §9.2 `historical_share`), once a subject has at least 100 such questions; topic shares are
  the sum of theirs. Labelled "estimated from N past papers". In Biology (9 papers, 421
  questions) Animalia carries 5.3% and Animal nutrition 3.8% against 1.4% each before, and
  the roadmap now starts with the topics JAMB sets most. Maths has a subtopic at about 24%.
- **Where:** `database/migrations/042_past_paper_frequency.sql`,
  `apps/api/src/app/routers/checkup.py` (`_subtopics`, `_topics`).
- **Status:** done locally; deploy needs a push.

### The roadmap picks the runs
- **Why:** the founder: a student shouldn't build their own runs at first; the plan says what
  to do.
- **What:** with a roadmap, a run narrowed to topics the student picked is refused (428) until
  10 planned items are done (`practice.OWN_RUNS_AFTER`, the first milestone for now), and a
  general run until today's plan is done. Bookmark revision stays open; planned runs pass.
  Every "Practise" button in the app that is refused this way starts the plan's next item
  instead and says so; the run builder shows "Your roadmap picks your runs for now" with how
  many planned runs are left. The roadmap reports that count (`record.own_runs_in`).
- **Where:** `apps/api/src/app/routers/practice.py` (`roadmap_lock`), `routers/roadmap.py`,
  `tests/test_roadmap_api.py`, `apps/web/src/prep/pages/Home.tsx` (`useStartPractice`),
  `pages/RunBuilder.tsx`, `roadmapApi.ts`.
- **Status:** done locally; deploy needs a push.

### The student roadmap, first step: Stack Prep plans, the student follows
- **Why:** the founder's direction: drive each student to their target instead of handing them
  a toolbox; later a money-back promise for students who follow the plan and miss their
  target. It builds the planner the original spec designed and never built
  (`docs/product-spec.md` §9.4, roadmap sprints S6 and S14).
- **What:**
  - Engine (`packages/engine/src/engine/roadmap.py`): from each subject's subtopic standings,
    the target (out of 400, split per subject), exam date and study time, it splits the
    sessions left between subjects (by gap to target, 30% floor for two subjects, 15% for
    four) and subtopics (the existing marks projection), judges the target (on track, a
    stretch, out of reach, with one plain fix), draws the expected line week by week, and
    fixes the next seven days run by run. The spec's rules are kept: every weak topic within
    14 days, mixed practice at least 40% in the last six weeks plus a weekly mock, no new
    skill that needs more than 10% of the time left in the last three weeks, no backlog after
    missed days, value bands (high, medium, low) instead of marks, and a total out of 400
    only when all four subjects are measured. 16 golden-profile tests.
  - Migration 041 and `routers/roadmap.py`: the roadmap is built on first read and re-built
    when a check-up finishes, the goal changes or its week runs out; old plans are kept.
    Each item links to the sitting that did it (done, started, missed, to do), so following
    the plan is recorded from day one. Starting a planned run never counts as a custom run
    against plan limits. Check-ups and mocks taken from their own pages count too.
  - App: Home's main card is today's plan with one button; a Roadmap page (in the menu)
    shows today, what comes after (no dates: the plan re-builds as results come in, so only
    a check-up or mock carries one), and each subject's now, expected and target.
- **Where:** `packages/engine/src/engine/roadmap.py`, `packages/engine/tests/test_roadmap.py`,
  `database/migrations/041_student_roadmap.sql`, `apps/api/src/app/routers/roadmap.py`,
  `routers/practice.py` (`begin_run`), `tests/test_roadmap_api.py`,
  `apps/web/src/prep/roadmapApi.ts`, `pages/Roadmap.tsx`, `pages/Home.tsx`, `shell.tsx`,
  `PrepApp.tsx`; design in `docs/plans/2026-11-10-student-roadmap.md`.
- **Status:** done locally; deploy needs a push. Next: lock the run builder until the first
  milestone, reminders, then parents.

### Check-up report: hero and What next tidied
- **Why:** the founder found the report's hero and What next card broken-looking: the colon
  in "result: 13%" ran into the number, the score card's note wrapped into four short lines
  with a tiny "%", and What next filled only the left half with cramped rows.
- **What:** the title reads "Your check-up result is 20%" ("check-up" never splits at its
  hyphen); the score card is wider, its note two calm lines, the "%" sized beside the number.
  What next is two columns on a wide screen (words and buttons left, a "Start with these"
  panel of the weakest topics right, with roomier numbered rows); on a phone it stacks in
  reading order.
- **Where:** `apps/web/src/prep/pages/CheckupReport.tsx`, `CheckupReport.css`.
- **Status:** done locally; deploy needs a push.

### Check-up: the next question shows at once
- **Why:** the founder saw "Saving…" on every Next. On the live site each save is a round trip
  of about a second.
- **What:** the check-up adapts within a topic, and the answer key never leaves the server, so
  a next question in the same topic still has to wait for the answer. But topics change on
  almost every question, and then this answer can't change what comes next. In that case the
  server now sends the next question ahead (`upcoming`); Next shows it at once and the answer
  saves behind it, in order, with the same attempt id on every retry (three tries). If it
  still won't save, the student is told and Try again saves it before anything else goes. In
  a Biology check-up locally, 12 of 14 Nexts took under 30 ms; the two same-topic ones about
  0.4 s. A test checks that whatever is sent ahead is exactly what comes next, right or wrong.
- **Where:** `apps/api/src/app/routers/checkup.py`, `tests/test_checkup_upcoming.py`,
  `apps/web/src/prep/pages/CheckupRoom.tsx`, `apps/web/src/student/api.ts`.
- **Status:** done locally; deploy needs a push.

### Public pricing when only Free is on sale
- **Why:** the live site has no paid plans on sale yet, so the home page showed a lone Free
  card under a "1 month / 3 months / Exam season" switch that changed nothing, listing daily
  limits that don't apply while limits are off.
- **What:** until a paid plan is on sale with a price, the plans are left out: the home page
  has no pricing section and the Pricing page no plans band (a one-card version was tried and
  the founder found it cramped). Paid plans added in Admin > Pricing & plans bring the full
  cards back by themselves.
- **Where:** `apps/web/src/site/PlanGrid.tsx` (`hasPaidPlans`), `Landing.tsx`, `Pages.tsx`,
  `site.css`.
- **Status:** done locally; deploy needs a push.

### Admin: AI for questions (settings for the reviewers' "Add with AI")
- **Why:** the founder doesn't yet know whether the key will be Anthropic's or OpenAI's, and
  asked for an optional monthly spending cap the admin can set.
- **What:** Admin > System > AI for questions: choose Anthropic or OpenAI and the model (Claude
  models come with their prices filled in; OpenAI models are listed from the key, prices
  entered by the admin), paste the API key, set an optional monthly cap in US dollars. The key
  is stored encrypted (the key that opens it is in the server's environment, never in the
  database) and is never sent back, only its last four characters. Checking a key is free: it
  lists the provider's models. This month's spend and runs are shown, with a bar against the
  cap. Every change is in the audit log. Migration 040 adds the settings and a log of runs and
  their cost, which "Add with AI" will write to and the cap counts against.
- **Where:** `apps/api/src/app/ai_writer.py`, `secret_box.py`, `routers/admin_ai.py`,
  `tests/test_admin_ai.py`, `database/migrations/040_ai_writer.sql`,
  `apps/web/src/admin/AiWriterPage.tsx`. New dependencies: `anthropic`, `cryptography`.
  Optional `SECRETS_KEY` in `.env.example`.
- **Status:** done locally; deploy needs a push. Nothing calls a paid model yet.

### Reviewer dashboard: Reviewers, for admins
- **Why:** the founder wanted reviewers added from the reviewer dashboard too.
- **What:** an admin sees Reviewers in the reviewer menu: the same staff page as the admin
  dashboard (give a role by email or phone, remove one). A reviewer doesn't see it; only an
  admin can change roles (routers/admin.py).
- **Where:** `apps/web/src/review/ReviewApp.tsx`, reusing `apps/web/src/admin/StaffPage.tsx`.
  On a phone each person is now their own card (name and "(you)" together), the hint sits
  under the email field and the button is a normal size (`staff/staff.css`).
- **Status:** done locally; deploy needs a push.

### Reviewer dashboard: a Topics page
- **Why:** the founder asked for a page to see each subject's topics, add and remove them, see
  the questions under each, with a guardrail so removing a topic never strands its questions.
- **What:** Topics in the reviewer menu lists every subject; a subject shows its topics on the
  left and the chosen topic's subtopics and skills on the right, each with how many questions
  are filed under it (a click lists them). A "⋯" menu adds, renames or removes. A part with
  questions under it can only be removed once a skill outside it is chosen; the questions
  move there and stay approved, then the part and all under it are withdrawn (never deleted).
  A subject with no topics gets its syllabus the first time one is added. Migration 038 lets an
  approved topic's name change; its code, place and scope stay frozen. On a phone the list and
  the topic show one at a time.
- **Where:** `apps/api/src/app/routers/topics.py`, `apps/api/tests/test_topics.py`,
  `database/migrations/038_rename_topics.sql`, `apps/web/src/review/TopicsPages.tsx`.
- **Status:** done locally; deploy needs a push.

### Check-up stuck at question 1 for the founder's account
- **Why:** on the live site a check-up refused every answer with "Some of what was entered is
  not quite right". The account had been made on the server with `database/create_admin.py`,
  which left `requires_guardian_consent` at its default (true) and recorded no consent, so the
  `check_attempt_consent` trigger refused to store any answer. The trigger's own sentence was
  hidden because the driver prefixes it with its class name, which the app never shows.
- **What:** migration 039 gives every staff account without consent the same footing as a
  sign-up (adult, consent recorded, with a note saying how). `create_admin.py` now makes new
  accounts that way. The check-up strips the driver's prefix, so a refusal shows its reason.
  Accounts made by signing up were never affected.
- **Where:** `database/migrations/039_staff_accounts_consent.sql`, `database/create_admin.py`,
  `apps/api/src/app/routers/checkup.py`.
- **Status:** done locally (reproduced, then fixed: the same answer saves); deploy needs a push.

### Showcase lessons: a clearer first lesson, instant tabs
- **Why:** the founder found the number bases lesson unclear and its doodle unhelpful, and the
  lesson tabs slow to switch.
- **What:** the first lesson is now UTME 2002 Q11, the midpoint of a line's intercepts (answer
  D, (1, −2), checked against the paper): plain handwritten steps, no doodle, voiced with the
  free Kokoro voice. It is also the home page's hero picture and on the About page. The lesson
  frame now loads once; a tab tells it which lesson to show, and every poster is there from
  the start, so a switch takes about 50 ms instead of a page load.
- **Where:** `scripts/showcase_lessons.py`, `apps/web/public/showcase/11*`,
  `apps/web/src/site/` (showcase.ts, LessonPlayer, Watch, Landing, Art), `index.html`.
- **Status:** committed.

### Public site: the lesson keeps its shape, sharper screenshot, softer corners, home when signed in
- **Why:** the founder's review on a phone: the lesson window was too tall, the mock
  screenshot blurry with empty space under it, corners too round, and a signed-in visitor
  was always sent from the home page to their dashboard.
- **What:** the lesson window keeps the board's 16:10 shape at every size, scaled like a video
  (no special phone height). The mock exam picture is retaken at double resolution, cropped
  to its content, and is the desktop shot on phones too. Large corner radii across the public
  site are cut by about a third (32px to 20px, 24px to 16px, …). `/` now shows the home page
  to everyone; the sign-up and log-in forms still send a signed-in person to their home.
  On phones the home page's subjects are compact chips that wrap, not a long list.
  Plans on phones: "Prices for" and the length switch start at the left like the heading,
  the switch spans the width, and the Free card has a default line ("Every question,
  check-ups and the working, free.") when the admin has given it none, so it has no gap.
  Corners cut again (16px to 10px, 12px to 8px…), and the hero's board picture has a green
  border.
  The mock exam screenshot is renamed (`mock-exam-screen.jpg`) so browsers drop the old,
  uncropped copy they had kept, and it has a border and a soft shadow.
  The shadows under the tour's pictures were cut off at the bottom on phones: the
  skip-painting-until-near speed rule clips anything outside a section's box, so it is now
  only on the FAQ teaser.
- **Where:** `apps/web/src/site/` (LessonPlayer, Landing, site.css, depth.css),
  `apps/web/public/showcase/mock-room.jpg`, `apps/web/src/prep/PrepApp.tsx`.
- **Status:** committed.

### Sign-up asks for both an email and a phone number
- **Why:** the founder wants both on every account: email for reset codes and receipts, a
  phone number to reach the student.
- **What:** "Create your account" has an Email field and a Phone number field, both required,
  each checked as what it is (an email can't go in the phone box). Either signs in afterwards.
  A taken one is named on its own ("An account already uses that phone number") with "Log in
  instead". The API still accepts the old single-login shape from clients not yet updated.
  Also: the home page's lesson window on a phone is sized to the phone (about 15% taller than
  wide) instead of a fixed 600 px.
- **Where:** `apps/api/src/app/routers/accounts.py`, `apps/web/src/prep/AuthForms.tsx`,
  `authApi.ts`, `apps/web/src/site/LessonPlayer.tsx`; tests in `tests/test_auth.py`.
- **Status:** committed.

### Deploy fix: httpx is a runtime dependency
- **Why:** the Binaax deploy built, then the API would not start: `app/paystack.py` imports
  `httpx`, which was only installed for tests, so the server image lacked it and the site
  answered 502 (sign-up said "something went wrong on our side").
- **What:** `httpx` is now in the API's dependencies (`apps/api/pyproject.toml`, `uv.lock`).
- **Status:** committed and pushed.

### CI: System health copes with a database that has no migration ledger
- **Why:** the deploy of 7527343 stopped in CI: CI builds its database by applying the
  migration files directly, so `public.schema_migrations` doesn't exist there, and the health
  check (and the dashboard front page, which uses it) failed on it. 635 of 637 tests passed.
- **What:** the check looks for the ledger first; without one it says which changes are
  applied is unknown, as a warning, instead of failing.
- **Where:** `apps/api/src/app/routers/admin_system.py`.
- **Status:** committed and pushed.

### Public site, second round: glass navbar, new footer, plans, no figures
- **Why:** the founder's review of the redesigned site, point by point.
- **What:** a floating dark-glass navbar with a smaller, centred "Start free"; a new footer
  (rounded, the brand and the way in, the links, the name written large, "Back to top");
  the call to action before it is a purple card on the light page; everything lines up with
  the navbar. Pricing, About, FAQ and Contact rebuilt with layered pictures in their heroes,
  a plan comparison table, and no mention of schools. Plan cards redone: a colour and icon
  per plan, smaller prices, every part lined up across the cards, each paid plan listing what
  it adds. The mock exam picture is now a real screenshot of the mock screen. On phones,
  pictures are no longer squeezed inside two boxes. The pink glow is gone from the heroes.
  The site shows no question counts and no year ranges ("thousands of questions"), and the
  public endpoint no longer sends them.
- **Where:** `apps/web/src/site/` (SiteShell, Landing, Pages, Faq, Art, PlanGrid, Mockups,
  site.css, depth.css), `apps/web/public/showcase/mock-room*.jpg`,
  `apps/api/src/app/routers/site.py`, `apps/web/src/prep/pages/Welcome.tsx`.
- **Status:** committed, not pushed.

### The reviewer dashboard, rebuilt as a question bank (part 1)
- **Why:** the founder found the old dashboard (one queue with filters) poor, and wants
  reviewers without Claude Code to grow the bank themselves
  (docs/plans/2026-11-10-reviewer-question-bank.md).
- **What:** /review now opens on the exams in the menu (UTME, plus "Add an exam" for WAEC,
  Post-UTME…). An exam shows its subjects as cards (papers, questions, share approved,
  reports), with "Add a subject", which can copy the topics of an existing subject so its
  questions can go live. A subject shows its past papers by year and our own sets, with "Add
  a paper". A paper lists its questions (filter: to check, ready, approved, reported); one
  opens beside the list to check and approve (the old panel), edit, or remove. "Add a
  question" writes one by hand. "Reported" lists every flagged question. "Add with AI" is in
  place, switched off, for part 2.
- **Rules kept:** an approved question's working and hints change in place; changing what it
  asks, its options or its key makes a new version that waits for a second check; whoever
  wrote or last edited a question can't approve it (now said in plain words); removing a
  question retires it, so scores that point at it stay whole.
- **Where:** migration 037 (a paper carries its year, `own` sets, who retired a question);
  `apps/api/src/app/routers/bank.py`; `apps/web/src/review/` (ReviewApp, BankPages, bankApi,
  bank.css); tests in `tests/test_bank.py`.
- **Status:** committed, not pushed.

### The review server goes public: production mode, no site password
- **Why:** the founder wants the password prompt in front of stackprep.binaax.app removed.
  It was there because the server ran as `local` with no login, so the `/v1/dev` routes
  (which create and delete students) and the reviewer tool were open to anyone who got past
  it. With accounts, staff roles and admin sign-in in the app, the password can go, but only
  once that version is deployed and the server runs as `production`.
- **What:** the binaax release check no longer asks `/v1/dev/subjects` (refused in
  production); it checks `/v1/curriculum/subjects` returns subjects. The binaax README now
  says the instance runs as `production` with no `basic_auth`, and never `local` again.
- **Server steps (the founder runs them):** deploy the current code first; set
  `APP_ENV=production`; create the admin; then remove the `basic_auth` block from the
  `stackprep.binaax.app` site in `/etc/caddy/Caddyfile` and reload Caddy.
- **Where:** `deploy/binaax/release.sh`, `deploy/binaax/README.md`.
- **Status:** committed, not pushed.

## 2026-10-28

### The public site, redesigned: a real lesson to watch, a tour of the app, and fast loading
- **Why:** the founder found the home page weak and the other pages blank, wanted the lesson
  "video" shown, the app's own design used, no per-subject question counts, a calmer hero
  with a picture of the board, the lessons in the handwritten whiteboard style, nothing
  playing in the background, and the lesson to load fast and not lag.
- **What:** the home page now opens on a calm hero (headline, one line, two buttons, a picture
  of the board), then **Watch a lesson**: three real lessons (number bases, trigonometry,
  English comprehension) that play on the coach's board in the whiteboard style with the free
  Kokoro voice, only when the visitor presses Play. Then a tour of the app, each part beside a
  picture of its own screen (check-up, practice, asking the coach, the mock exam, progress),
  the smaller features, the subjects, plans and questions. Every other page opens with the
  app's dark hero band and has fuller content (How it works carries the lesson too; About
  explains how every answer is checked; Pricing says what every plan includes). The public
  endpoint and pages give only a rounded total ("5,000+"), never a subject's count.
- **Speed:** the app is split so a visitor downloads only what the page needs (the home page
  no longer carries the dashboards or the board: about 100 KB of code instead of 480 KB); the
  lesson page is its own small app with no sign-in check, shows its poster at once and loads
  the board and every voice clip behind it, so Play starts at once and steps never wait on the
  network; the lesson frame loads only as it nears the screen; fonts no longer hold the page
  up; the hero picture is fetched first; a first-time visitor sees a public page without
  waiting for the session check; the question count is kept for ten minutes on the server;
  sections below the first screen are laid out only as they come near.
- **Fixed on the way:** the lesson window grew wider than a phone (its height and shape rule
  set its width), and the off-screen layout hint widened the tour rows on phones.
- **Where:** `apps/web/src/site/` (Landing, LessonPlayer, Watch, WatchApp, Mockups, showcase,
  Pages, Faq, Legal, site.css), `apps/web/public/showcase/` (lessons, voice, posters, made by
  `scripts/showcase_lessons.py`), `apps/web/src/App.tsx`, `prep/PrepApp.tsx`, `prep/store.tsx`,
  `student/boardPrefs.ts`, `index.html`; `apps/api/src/app/routers/site.py`.
- **Checked:** the web tests and build, the API tests for the site and support; screenshots
  at 1440 and 390; load timings of the production build (this machine was heavily loaded by
  another project's video render, so absolute times were several times slower than normal).
- **Status:** committed, not pushed.

### Part C: the public site
- **Why:** a visitor who wasn't signed in only saw the sign-up form; the founder asked for a
  home page, About, Pricing, FAQ, Contact, Terms and Privacy (plan C).
- **What:** the bare address now shows a **home page** to anyone not signed in (a student still
  goes straight to their home): what Stack Prep does, four steps, why it's different, the
  subjects with live question counts, the plans on sale, the first FAQ answers and a way in.
  New pages: **How it works** (check-up, practice, the board, mocks, progress), **Pricing**
  (the admin's plans, by length, with the paying questions), **About**, **FAQ** (in four
  groups), **Contact** (a form into the Support inbox, plus the support email and WhatsApp
  from Settings), **Terms of use** and **Privacy**. The sign-up form moved to `/?mode=signup`
  (log in stays at `/?mode=login`), and its logo goes back to the home page. A new public
  endpoint, `GET /v1/app/site`, counts the UTME subjects and questions live, so the site never
  states a number that has gone stale. Every claim on the pages was checked against the code
  (the check-up length, the mock format, the score rule, what the coach is and isn't told).
- **Needs the founder:** Terms and Privacy are plain-language drafts written from what the app
  does; a lawyer should read both before launch.
- **Where:** `apps/web/src/site/` (SiteShell, Landing, Pages, Faq, Legal, PlanGrid, site.css);
  `apps/web/src/prep/PrepApp.tsx`, `pages/Welcome.tsx`; `apps/api/src/app/routers/site.py`;
  tests in `tests/test_site.py`.
- **Checked:** the API and web tests and build; screenshots at 1440 and 390 of every page.
- **Status:** committed, not pushed.

### Admin dashboard, part B4: Support and Announcements
- **Why:** the admin had no way to hear from students or tell them anything in the app
  (plan B, support and announcements).
- **What:** students now **write to us** from the foot of Help & guides (what it's about, a
  title, the message) and read replies in a conversation at `/help/messages/…`; an unread reply
  shows as a green note at the top of every page until they open it. People without an account
  write through `POST /v1/contact` (for the public Contact page): a hidden field turns robots
  away, and there is a cap of 3 a day per address and 60 an hour in all. The admin gets a
  **Support** inbox (count in the menu and on the dashboard): waiting, replied and closed,
  search, the conversation beside the list, reply, close or reopen. A reply shows in the
  student's app and is also emailed when there is an address and email is set up (it says
  which, before sending). **Announcements**: the admin writes a banner (along the top until
  closed) or a pop-up (once), picks who sees it (everyone, with or without a plan, a class),
  a colour, a button, and when it starts and ends; each shows as it looks in the app, with how
  many it reaches and how many closed it. The `notice` setting now shows to students as a
  yellow bar. Every reply, close and announcement change goes in the audit log.
- **Where:** `apps/api/src/app/routers/support.py`, `announcements.py` (tables from migration
  036); `apps/web/src/prep/Notices.tsx`, `supportApi.ts`, `pages/Support.tsx`;
  `apps/web/src/admin/SupportPages.tsx`; tests in `tests/test_support.py`.
- **Checked:** the API tests against the local database, the web tests and build;
  screenshots at 1440 and 390 of the inbox, a conversation, announcements and the editor, the
  student's banners and pop-up, Help & guides and a conversation.
- **Status:** committed, not pushed (deploys wait on GitHub billing). Replies by email need
  the SMTP settings on the server.

### Admin dashboard, part B3: subjects, the question bank, question quality, mocks, check-ups
- **Why:** the admin could see students and money but not the content itself, or which
  questions were teaching the wrong thing (plan B, content pages).
- **What:** a **Content** menu with **Subjects & topics** (each subject's questions, topics,
  papers, worked solutions, students, how often answered right and open reports; open one for
  its topics), the **Question bank** (search every live question by words or number, filter
  by subject, sort by paper, most answered, least accurate or most reported; open one to see
  how many chose each option with the key marked, the worked solution, lesson check-ins and
  reports), and **Question quality**, the list to look at first: **Check the key** (more
  students chose one wrong option than the key, the usual sign of a wrong key, so every
  student is taught the right answer), most reported, lessons not landing, and most missed.
  An **Activity** menu lists every **mock** sat (score, subjects, whether they left the test)
  and every **check-up**. The dashboard's front page was redesigned after the founder said it
  wasn't good enough: coloured icon tiles that link to their pages, a "waiting for someone"
  list, quick-action tiles, subject badges, avatars for the newest students and payments.
- **Fixed on the way:** the quality page failed when nobody had picked a question's key yet
  (the key was looked up only among chosen options); the pages kept an old error after a
  later load worked; "1 answers".
- **Where:** `apps/api/src/app/routers/admin_content.py`; `apps/web/src/admin/ContentPages.tsx`,
  `HomePage.tsx`, `AdminApp.tsx`, `staff/staff.css`; tests in `tests/test_admin_content.py`.
- **Checked:** the API tests against the local database, the web tests and build;
  screenshots at 1440 and 390 of each page.
- **Status:** committed, not pushed (deploys wait on GitHub billing).

### Admin dashboard, part B2: a front page, Engagement, Feature usage, AI usage, Revenue
- **Why:** the founder couldn't find statistics in the admin dashboard
  (docs/plans/2026-10-28-plans-admin-and-public-site.md, B).
- **What:** `/admin` now opens on a **Dashboard**: ten figures (students and today's sign-ups,
  active this week and today, questions live and topics covered, questions answered, mocks,
  check-ups, money this month and today, students on a plan, open reports, support waiting),
  each linking to its page; anything not set up (from System health); what's waiting for
  someone (support and question reports); quick actions; questions per subject; the newest
  students and the latest payments. The Phase 7 overview is now **Analytics**. New reports:
  **Engagement** (active today, 7 and 30 days; how often students come back; minutes a day;
  active students a day; weekly cohorts of new students and the share active each week after;
  days active in the last 30), **Feature usage** (eleven features, each with its total, the
  change on the period before and how many students used it, and a day-by-day chart of the
  one chosen), **AI usage** (questions to the coach, answered by the model or not, tokens,
  answer times, an estimated cost from the prices in Settings, by model, and who asks most),
  and **Revenue** (taken all time, paying students and their share, per payer, discounts
  given, money each month, and by plan, length and how they paid).
- **Where:** `apps/api/src/app/routers/admin_reports.py`; `apps/web/src/admin/HomePage.tsx`,
  `ReportPages.tsx`, `AdminApp.tsx`; tests in `tests/test_admin_reports.py`.
- **Checked:** the API tests against the local database, the web tests and build;
  screenshots at 1440 and 390 of each page.
- **Status:** committed, not pushed (deploys wait on GitHub billing).

### Pricing & plans redesigned as a comparison table
- **Why:** the founder didn't like the admin's Pricing & plans page: tall, mostly empty number
  cards, plan cards that left the right side of the page blank, prices run together in one
  line, and rough tick marks.
- **What:** the figures (on a plan now, taken in 30 days and all time) and the limits switch
  sit in one slim bar. The plans are a table across the whole width: a column per plan (name,
  badges, how many are on it and sold, Edit) and a row per price and per feature, with ticks,
  dashes and amounts lined up for comparing; on a phone the table scrolls sideways with the
  feature names held in place. Editing a plan opens a panel from the right instead of pushing
  the page down.
- **Where:** `apps/web/src/admin/PremiumPage.tsx`, `apps/web/src/staff/staff.css`.
- **Checked:** the web tests and build; screenshots at 1440 and 390 of the page and the edit
  panel.
- **Status:** committed, not pushed (deploys wait on GitHub billing).

### Admin dashboard, part B1: settings, system health, the audit log, grouped menu
- **Why:** the founder found the admin dashboard far too thin (five pages) and shared a
  reference dashboard for its functions. This first part lays the ground the rest stands on
  (docs/plans/2026-10-28-plans-admin-and-public-site.md, B).
- **What:** the admin menu is grouped (Main, People, Content, Money, System). **Settings**:
  switches and details changed without a release: new sign-ups open or closed (enforced at
  sign-up), the coach on or off for everyone (enforced when a student asks), a notice for every
  student, the support email and WhatsApp number, and the coach's token prices for the AI cost
  estimate. **System health**: database, migrations, email, Paystack (test or live), the coach,
  lesson voice and sign-ups, each working / needs a look / not working, with totals and server
  details. **Audit log**: every change staff make from the dashboard is written with the
  change itself, as a sentence ("Gave Basic to Tolu Premium for 14 days"), searchable and
  filtered by kind; plans, lengths, discounts, gifts, limits, temporary passwords, suspensions,
  roles, staff, report closing and settings are all recorded. Migration 036 also adds the
  tables for support messages and announcements, which come in B4.
- **Where:** `database/migrations/036_admin_tools.sql`, `apps/api/src/app/audit.py`,
  `app_settings.py`, `routers/admin_system.py`, audit calls in `routers/admin.py`,
  `admin_billing.py`, `admin_students.py`; `apps/web/src/admin/SystemPages.tsx`,
  `staff/StaffShell.tsx` (menu sections); tests in `tests/test_admin_system.py`.
- **Checked:** all 549 API tests against the local database, the web tests and build;
  screenshots at 1440 and 390 of Settings, System health and the Audit log.
- **Status:** committed, not pushed (deploys wait on GitHub billing).

### Our own dropdown everywhere, and a tighter student page in the admin
- **Why:** the founder asked (again) that the browser's own dropdown never be used: its button
  and list look different on every device and don't line up with our inputs. He also pointed
  at the empty space under "About them" on a student's admin page.
- **What:** a `Select` component (`apps/web/src/lib/Select.tsx`) replaces every `<select>`:
  in account settings and onboarding (class, state), the admin's students filters, plan
  editor, discounts, staff roles and a student's actions, and the reviewer's queue, subject,
  paper and skill pickers. It matches the inputs, opens a styled list (upwards near the bottom
  of the screen), works with the keyboard (arrows, Home/End, Enter, Escape, type-ahead), and
  adds a search box to long lists (states, skills, subjects). On a student's admin page the
  cards no longer stretch to each other's height: "About them" and "Plan and payments" stack
  on the left beside the actions.
- **Where:** `apps/web/src/lib/Select.tsx`, `Select.css`; the pages above; `staff/staff.css`.
- **Checked:** the web tests and build; screenshots at 1440 and 390 of the dropdowns open
  (admin students, reviewer, account settings) and the student page.
- **Status:** committed, not pushed (deploys wait on GitHub billing).

### Plans by benefit, set by the admin, with discounts (follow-up part A)
- **Why:** after seeing the plans locally the founder asked for plans by benefit rather than by
  month: the length a separate choice, a higher plan giving more, the admin deciding what each
  plan includes and creating plans freely, and plans given to a student at a discount, at 100%
  off or for a set time. He also disliked the half-empty row of plan cards and the separate
  "everything is open" card (docs/plans/2026-10-28-plans-admin-and-public-site.md).
- **What:** every plan, Free included, is a row the admin edits in **Pricing & plans**:
  practice questions a day, mock exams a day/week/month/in total, lessons explained aloud,
  coach questions a day, choosing topics and years, revising bookmarks, and selling points
  shown on the card. Each is enforced by the API (a 402 with a sentence opens the student's
  "Choose a plan" prompt). Lengths (1 month, 3 months, exam season by default) are their own
  list; each plan has a price per length. A plan's order is its rank: with two running, the
  higher one applies; more time on the same plan follows on. **Discounts:** promo codes
  (percent off, optionally one plan or length, a usage cap, an end date; once per student)
  and offers to one student, made from their page in Students, applied by themselves and shown
  on their plans page; 100% off gives the plan at once with no payment page. Admins can still
  give a plan for N days. `/plans` now says where the student stands in the hero, has a length
  switch, and shows the plans side by side across the page (Free first, features ticked or
  crossed, the featured plan marked, an offer's price on its card); checking out shows the
  price, any discount and a promo-code box. The limits switch stays off by default.
- **Where:** `database/migrations/035_premium_and_payments.sql` (rewritten: it was never
  pushed), `apps/api/src/app/premium.py`, `routers/billing.py`, `routers/admin_billing.py`,
  `routers/practice.py` (custom/bookmark runs, the coach's daily allowance);
  `apps/web/src/prep/pages/Plans.tsx`, `billingApi.ts`, `premium.tsx`,
  `apps/web/src/admin/PremiumPage.tsx`, `StudentPage.tsx`; tests in `tests/test_billing.py`.
- **Checked:** all 545 API tests against the local database, the web tests and build;
  screenshots at 1440 and 390 of /plans (free with an offer, on a plan), checkout with an
  offer, and the admin's plans, plan editor, discounts and a student's offer form.
- **Status:** committed, not pushed (deploys wait on GitHub billing).

### The reviewer dashboard redesigned (plan phase 8), and one hero on the Premium page
- **Why:** the founder asked for the reviewer dashboard in the same design as the rest of the
  app. The old screen was unstyled, could not narrow to a subject (the bank now holds twelve),
  and opened on an empty queue while flagged questions waited. Separately, the founder didn't
  like two dark cards stacked at the top of `/plans` for a Premium student.
- **What:** `/review` now uses the staff frame (sidebar on a laptop, menu on a phone), with
  the flagged count beside Questions. The page shows progress meters (answers, levels and
  skills checked, approved) and a Flagged tile that opens that queue; filters for queue,
  **subject** and paper year; the queue beside the question on a laptop, and on a phone the
  queue first with the question opening over it and a way back. The question panel: who
  flagged it, where and why, closed in place as **fixed** or **not a problem** with a note;
  the passage, stem and options with the key marked; level buttons; the skill and its
  approval; the worked solution and hints; and an approve bar that says what is still
  needed. The keyboard works as before (A–F, 1–5, S, Enter, J/K) and is ignored while typing.
  An empty queue points to the flagged one. API: `subject_id` on `/v1/review/queue`,
  `/years` and `/progress`; new `/v1/review/subjects` with flagged counts; reports in the
  question detail say who and where; closing a report takes an outcome. On `/plans`, a
  Premium student's hero now says "You have Premium" and when it ends, instead of a second
  dark card under it.
- **Where:** `apps/api/src/app/routers/review.py`; `apps/web/src/review/ReviewApp.tsx`,
  `ReviewPage.tsx`, `review.css`, `api.ts`; the old reviewer rules removed from
  `apps/web/src/styles.css`; `apps/web/src/prep/pages/Plans.tsx`; a test in
  `tests/test_review.py`.
- **Checked:** all 542 API tests against the local database, the web tests and build;
  screenshots at 1440 and 390 of the empty queue, the flagged queue, a question open, closing
  a report, and the Premium page for a Premium student.
- **Status:** committed, not pushed (deploys wait on GitHub billing).

### The admin dashboard: overview with charts, students, and a full student profile (plan phase 7)
- **Why:** the founder asked for a very comprehensive admin dashboard with charts and full
  student profiles, and the actions to look after accounts.
- **What:** `/admin` now opens on **Overview**: for the last 7, 30 or 90 days, totals
  (students and new ones, active students and today's, questions answered, money taken, and
  how many are on Premium) and a day-by-day chart of each of sign-ups, active students,
  questions answered, mocks submitted and money; how students' latest mocks scored, in bands
  of ten; which subjects students aim at; and the question bank with open reports by
  subject. Hover or focus a column for its value; each chart also has a hidden table for
  screen readers. **Students** lists everyone (staff left out unless asked for) with search
  by name, email, phone or school, filters for class, Premium and recent activity, sorting,
  and pages of 50. A student's page shows who they are and what they're aiming for, their
  activity with a 30-day chart, each subject's score, last check-up, target and exam date
  (the same numbers the student sees), their mocks, their Premium and payments. Actions there:
  a temporary password (shown once, readable aloud, signs out every device) for a student who
  can't reset by email, give Premium days, change role, and suspend or restore (an admin can't
  do any of these to themselves). Days are Nigerian days.
- **Where:** `apps/api/src/app/routers/admin_students.py`; the student overview and mock
  history are now plain functions (`build_overview` in `routers/progress.py`, `mock_history`
  in `routers/mock.py`) that the admin profile calls; `apps/web/src/admin/OverviewPage.tsx`,
  `StudentsPage.tsx`, `StudentPage.tsx`, `charts.tsx`; tests in
  `tests/test_admin_students.py`.
- **Checked:** all 541 API tests against the local database, the web tests and build;
  screenshots at 1440 and 390 of the overview, the students list, a student's page, and the
  temporary password.
- **Status:** committed, not pushed (deploys wait on GitHub billing).

### Premium with Paystack: free basics, paid plans, set by the admin (plan phase 6)
- **Why:** the founder chose Paystack, with free basics and paid Premium, limits and prices set
  by an admin rather than in code.
- **What:** a payment buys a plan once: card, bank transfer or USSD on Paystack's own page,
  with no saved card and no renewal. Its days start when any current Premium ends. The free
  allowance is a number of practice questions a day (Nigerian time; a question counts once
  however many tries), a number of mocks, check-ups, and the board's full written working.
  Premium adds unlimited practice and mocks, the lesson's voice and the coach. **The limits
  stay off until an admin turns them on**, so deploying this holds nobody back. A limit
  reached anywhere opens a "Go Premium" prompt with the reason. On the board, a free student
  gets the whole written working, and a Premium note where the ask box would be. New student
  pages: `/plans` (where they stand, the plans, their receipts; an account with no email is
  asked for one for the receipt) and `/plans/paid` (back from Paystack: checks the payment
  and says how it went). New admin page `/admin/premium`: totals, the free limits, plans (add,
  change, take off sale; never deleted, so receipts keep what was bought) and payments.
  Payments are only ever trusted after the server asks Paystack itself: on the return page
  and through the signed webhook, whichever comes first, and only once.
- **Server setup needed:** `PAYSTACK_SECRET_KEY` (Paystack dashboard, Settings > API Keys &
  Webhooks; `sk_test_` first) and `PUBLIC_URL` (the site's address). In the same Paystack
  page set the webhook URL to `https://<domain>/v1/billing/webhook`. Paystack's webhook
  can't get past Caddy's basic_auth, so take that off (or exempt `/v1/billing/webhook`)
  before relying on webhooks; the return page still confirms payments without it. Then add
  plans in `/admin/premium` and turn the limits on.
- **Where:** `database/migrations/035_premium_and_payments.sql`, `apps/api/src/app/paystack.py`,
  `app/premium.py`, `routers/billing.py`, `routers/admin_billing.py`, gates in
  `routers/practice.py`, `routers/mock.py`, `routers/mouth.py`; `apps/web/src/prep/premium.tsx`,
  `billingApi.ts`, `pages/Plans.tsx`, `apps/web/src/admin/PremiumPage.tsx`, the board's
  `askLocked` (`student/Board.tsx`), and a 402 event in `lib/friendlyError.ts`; tests in
  `tests/test_billing.py` (Paystack stubbed; nothing is called).
- **Checked:** all 535 API tests against the local database, the web tests and build;
  screenshots at 1440 and 390 of Plans (free, Premium, checkout open), the receipt-email
  dialog, the return page, the Go Premium prompt, the board for a free student, and the
  admin Premium page with its plan form.
- **Status:** committed, not pushed (deploys wait on GitHub billing).

### Report a question, bookmarks, and an admin Reports page (plan phase 5)
- **Why:** the founder asked that students can report a question, above all during an exam,
  and that reports reach the admin side; and that bookmarked questions can be revised as a
  practice run.
- **What:** every question now carries **Bookmark** and **Report** buttons: in practice, in
  check-ups, in the mock room while the clock runs, and when looking back over an answer (the
  mock report's question view and a run's report). On a phone they shrink to icons. Report
  opens a short form (what is wrong, plus an optional note); during a mock it says the timer
  keeps running. A student can send at most 30 reports a day, and a second report on the same
  question is acknowledged without a duplicate. New page `/bookmarks` (sidebar "More" and the
  account menu) lists kept questions by subject, newest first, with "Revise N in a run",
  which starts a practice run of up to 20 of them, oldest first. Questions pulled for checking
  stay listed but are left out of runs. Admins get a **Reports** page at `/admin` with an
  open count in the nav; each report shows the question, the student, where they were and
  their note, and is closed as fixed or not a problem with a note. Keyboard answer shortcuts
  in the practice and mock rooms now pause while any dialog is open, so typing in the report
  form cannot answer the question behind it.
- **Where:** `database/migrations/034_bookmarks_and_student_reports.sql`,
  `apps/api/src/app/routers/saved.py`, `routers/admin.py` (reports), `routers/practice.py`
  (bookmark runs); `apps/web/src/prep/QuestionTools.tsx`, `savedApi.ts`,
  `pages/Bookmarks.tsx`, `apps/web/src/admin/ReportsPage.tsx`; tests in `tests/test_saved.py`
  and `tests/test_practice.py`.
- **Checked:** all 525 API tests against the local database, the web tests and build;
  screenshots at 1440 and 390 of Bookmarks, the tools in a practice run, the report form in
  practice and during a mock, the mock report's question view, and the admin Reports page.
- **Status:** committed, not pushed (deploys wait on GitHub billing).

## 2026-10-27

### Forgot password, account settings, school and aim in onboarding (plan phase 4)
- **Why:** the founder asked for "forget password" and account settings on the student side,
  and for fuller student profiles (school, target school and course) for the admin dashboard.
  Until now "Forgot password?" only said to ask a teacher.
- **What:** "Forgot password?" opens a two-step dialog: the account's email, then the 6-digit
  code from it and a new password, which signs the student in. Codes (migration 033) last 15
  minutes, allow 5 wrong tries, are kept only as hashes, and a reply never says whether an
  account has that email; at most 3 are sent an hour. Resetting signs out every other device.
  New page `/settings` ("Account settings", in the account menu and on Profile): name, class,
  school, state, university and course aimed for; how mock results are shown and the UTME
  target (moved here from Profile); email and phone (changing either needs the current
  password, one must remain); and a password change that signs out other devices. Onboarding's
  first step asks the same school-and-aim questions, all optional, saved with the goals.
- **Server setup needed:** reset emails go out over SMTP, set by `SMTP_HOST`, `SMTP_PORT`,
  `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_SSL` and `MAIL_FROM` (see `.env.example`). Without a
  host nothing is sent; locally the code is written to the API log instead.
- **Where:** `apps/api/src/app/routers/accounts.py`, `app/mailer.py`, `app/config.py`,
  `database/migrations/033_password_resets.sql`, `apps/web/src/prep/AuthForms.tsx`,
  `AboutFields.tsx`, `profileFields.ts`, `pages/Settings.tsx`, `pages/Onboarding.tsx`; tests
  in `tests/test_account_settings.py`.
- **Checked:** all 521 API tests against the local database, the web tests and build;
  screenshots of both reset steps, Settings, onboarding and Profile at 1440 and 390.
- **Status:** committed, not pushed (deploys wait on GitHub billing).

### Mock scores counted over every question, the UTME aggregate, an overall target (plan phase 3)
- **Why:** a mock's score was right ÷ answered, so skipping hard questions raised it (12 of 20
  answered with 2 right showed 17% instead of 10%). The founder asked for results out of 400 as
  well as percentages, chosen by the student, and for an overall UTME target.
- **What:** a mock's score, per subject and overall, is now right ÷ every question set; a
  skipped question earns nothing, as in the real exam. Each result also carries the aggregate:
  the average of the subject percentages × 4, out of 400, however many subjects the mock had.
  Migration 032 adds profile columns to `students` (school, state, class, target institution and
  course for phase 4; `score_display`; `target_aggregate`), read and changed through
  `GET`/`PATCH /v1/student/{id}/profile`. Profile has a "Mock results" section: show results as
  Percentage or Out of 400, and "My UTME target" out of 400. In aggregate mode the report, the
  mock hub and Progress lead with the aggregate with the percentage beside it, and the report
  shows the target and how far there is to go. `docs/student-scoring.md` §3a states the rule.
  Check-ups keep right ÷ answered.
- **Where:** `apps/api/src/app/routers/mock.py`, `routers/student.py`,
  `database/migrations/032_student_profile.sql`, `apps/web/src/prep/scoreDisplay.tsx`,
  `pages/ResultSettings.tsx`, `MockInsights.tsx`, `MockHub.tsx`, `Progress.tsx`; tests in
  `test_mock.py` and `test_profile.py`.
- **Checked:** all 516 API tests against the local database, the web tests and build; a seeded
  mock (4 right of 20, 8 skipped) shows 20% and 80/400; screenshots of Profile, the hub, the
  report and Progress in both modes at 1440 and 390.
- **Status:** committed, not pushed (deploys wait on GitHub billing).

### Friendly errors, sign-in when a session ends, Mock in the phone bar (plan phase 2)
- **Why:** the audit found raw server text reaching students ("Failed to fetch", "[object
  Object]", proxy pages), an ended session showing as errors inside a page, the mock exam missing
  from the phone's bottom bar, and mocks not counted in Progress or Profile.
- **What:** every student API client (progress, runs, mock, lesson feedback, the student API)
  now goes through `lib/friendlyError.ts`: a dropped connection, a server fault, a 422 list or
  an HTML page each becomes one plain sentence, and every page shows that sentence. A 401 from
  any call signs the student out on the spot and sends them to "Welcome back" with a note and
  their login filled in; after signing in they return to the page they were on. The phone's
  bottom bar is Home, Practice, Check-up, Mock, Progress (Profile is the avatar at the top).
  Profile's record counts mock questions and finished mocks; Progress has a "Your mock exams"
  section opening each report.
- **Checked:** the web build and tests pass; Profile, Progress, Home and the ended-session
  sign-in at 1440 and 390 with a seeded student who sat a mock.
- **Status:** committed, not pushed.

### Staff roles: admin and reviewer dashboards with real sign-in (plan phase 1)
- **Why:** the founder asked for an admin dashboard and a reviewer dashboard with roles (admin
  can use everything; reviewer only the reviewer dashboard; a student only the student app), and
  for the student app to move to the bare address. The review tool had no sign-in at all
  (a reviewer picked a name from a list), so only the server's shared password protected it.
- **What:** migration 031 adds `account_roles` (reviewer, admin) and links academic_reviewers
  to an account. Staff sign in like anyone; `/v1/review/*` needs a reviewer or admin session and
  records each decision under the signed-in reviewer (the name list is gone); new `/v1/admin/*`
  needs an admin, starting with staff management (list, grant by login, remove; an admin cannot
  remove their own role). A reviewer account is kept out of the student app with a clear note.
  `database/create_admin.py` makes the first admin on a server. Web: the student app is at `/`
  (old `/student/...` links redirect), the reviewer dashboard at `/review`, the admin dashboard
  at `/admin`, each behind its own sign-in that comes back over the page when a session ends;
  admins see a Staff section in the student app's menu. A shared friendly-error helper turns
  every failure into one plain sentence.
- **Checked:** all 512 API tests pass against the local database (the review tests now sign in
  as a reviewer; signed-out is refused 401, a student 403); the web build and tests pass; sign-in,
  staff, reviewer-refused and admin-menu screens at 1440 and 390.
- **Server step (after deploy):** run `create_admin.py` once for the founder's account; then the
  shared password in the Caddy block can come off.
- **Status:** committed, not pushed.

### Lesson doodles cut to the pictures that teach
- **Why:** the founder found the board doodles in Use of English and Mathematics lessons too many
  and often beside the point (a teacher with a book on a mean-age sum, Amina beside a plane on
  an emphatic-stress item).
- **The rule (founder's choice):** keep a doodle only where the picture carries the idea; at most
  one per lesson. English keeps pictures only on word-meaning items (synonyms, antonyms,
  idioms, a word's meaning in a passage) and only where the picture shows the meaning; every
  stress, grammar, concord, cloze and comprehension item lost its picture. Mathematics keeps
  models the working uses (bar and area models, tiles, number lines, factor cards, balances,
  sketches, probability trees) and lost story pictures (people, calendars, places, objects).
- **Numbers:** English 660 lessons with doodles (677 doodles) to 273; Mathematics 617 (637) to
  493; 713 drawing files that nothing uses any more deleted. Every cut doodle's actions, board
  links and timing cues went with it, and spoken lines that pointed at a removed picture were
  reworded; nothing taught and no answer changed.
- **Checked:** both subjects' lessons read cleanly as their loaders read them; loaded locally
  (142 Mathematics and 388 English lessons updated, nothing pending); all API tests pass.
- **Status:** committed, not pushed.

### The 15 "unrecoverable" Use of English questions rebuilt
- **Why:** the English loader left 15 items marked `unrecoverable` exactly as they were in the
  bank, and some were live and broken: 2013 Q67's stem stopped mid-sentence with two identical
  options, stress items had lost the capitals that mark stress, five printed only three options,
  and 2015 Q7-10 were set on a passage the paper never printed. The founder's rule is that a
  broken question is rebuilt, never left or dropped.
- **What:** each is now a normal question with an explanation and a lesson: a sound fourth
  option for the three-option items (2010 Q18, 2016 Q14, Q15, Q19, Q43); the duplicates
  replaced and Q67's stem completed (2013 Q67, Q85); stress capitals restored so one option is
  right (2013 Q97 inforMAtion, 2018 Q60 enCOUragement); a short original passage on native
  language and the language of instruction for 2015 Q7-10; 2015 Q20 a word-meaning item on the
  cloze passage; 2015 Q71 a preposition item. The last three bank rows that named paper
  question numbers were among these.
- **Checked:** the loader reports 0 unrecoverable and nothing pending after loading locally;
  the local bank's current versions hold no paper question numbers; all API tests pass.
- **For a teacher:** the two stress patterns, and the new 2015 passage with its four questions.
- **Status:** committed, not pushed.

### Paper question numbers taken out of shared-data stems
- **Why:** a stem such as "Use the information below to answer questions 11 and 12" showed up as
  Q1 of 15 in a mock, pointing the student at questions that are not there. Mocks, practice and
  check-ups all shuffle questions, so a paper number in what a student reads is always wrong.
- **What:** 252 lead-ins across every subject's retranscribed files now end without the numbers
  ("Use the information below."); "Questions 21 to 30 are based on ..." became "This question
  is based on ..."; six stems that named the numbers mid-sentence were trimmed; and seven
  explanation lines that sent the student to "question 25" now say what they meant in their own
  words (Accounts, Economics, Mathematics).
- **Checked:** every subject's checker passes; each loader picked the changes up and the local
  bank's current versions hold no paper numbers outside English. English's last three (2013 Q67,
  Q85, Q97, from its older transcription) are among the questions its loader leaves as they
  are.
- **Status:** committed, not pushed.

### UTME Principles of Accounts 2010-2018: questions, explanations and lessons
- **What:** 405 questions from the JAMB papers, none held back, each with an explanation, a
  true reason for every wrong option and a board lesson in the Accounts method (name it, the
  rule or formula, the working or double entry, a Nigerian example, a way to remember it, the
  trap). Every calculation was worked in full; 76 answers differ from the compilation's printed
  keys (some keys are blank or say "no option"), and 350 questions were repaired or rebuilt:
  missing or garbled data rewritten as clean figures, options added where none matched the
  working, second right options replaced. Repeated questions are answered the same way in
  every year.
- **Curriculum:** the syllabus's 18 topics and 84 subtopics in its own lettering, coded
  ACC.15.d.
- **Tables:** ledger, cash book and trading extracts are KaTeX T accounts and tables;
  formula options are KaTeX.
- **Where:** docs/questions/utme/accounts/, database/load_retranscribed_accounts.py,
  database/check_accounts.py, apps/api/tests/test_accounts_content.py; both
  `deploy/*/release.sh` run the loader after Commerce.
- **Checked:** check_accounts.py --lessons OK for all nine years; the hardest sums reworked by
  hand (control accounts, statement of affairs, provisions, FIFO and simple average, bank
  reconciliation, interest on drawings, ratios); loaded locally (405 questions, 84 skills); the
  Accounts subject page at 390 and a mock review at 1440; ruff, mypy and the content tests
  pass.
- **Status:** committed, not pushed.

### Phone hero stats made smaller and calmer
- **Why:** the founder found the subject page hero at phone width too packed: three 40px numbers,
  labels forced onto one line and the info buttons pressed against the dividers.
- **What:** at 560px and below (apps/web/src/prep/pages/Home.css) the hero stats use 28px
  numbers, 10px labels that may wrap under their info button, 12px units and notes and 12px
  column padding; the "Where you stand" figures drop from 64px/44px to 48px/34px. Desktop is
  unchanged.
- **Checked:** the Commerce subject page and Home at 390.
- **Status:** committed, not pushed.

### UTME Commerce 2010-2018: questions, explanations and lessons
- **What:** 405 questions from the JAMB papers, none held back, each with an explanation, a
  true reason for every wrong option and a board lesson in the Commerce method (name it,
  define it, how it works or the worked sum, a Nigerian example, a way to remember it, the
  trap). 70 answers differ from the compilation's printed keys (the compilation prints no key
  for 2011); 269 questions were repaired or rebuilt, mostly by replacing a second defensible
  option. The 49 questions the later papers reuse are answered the same way in every year.
  Changed facts (the Nigerian Exchange, the Alternative Securities Market, the FCCPC, ECOWAS
  members) are taught as they stood, with one step on how they stand now.
- **Curriculum:** the syllabus's 16 topics and 71 subtopics, coded COM.6.d.
- **Figures and tables:** the tree of commerce (2011 Q9, 2015 Q31) and the marketing mix (2018
  Q32) are drawn as SVG; the insurance table, trading figures and the 2016 balance sheet are
  KaTeX tables. The API image now copies commerce/figures/svg.
- **Where:** docs/questions/utme/commerce/, database/load_retranscribed_commerce.py,
  database/check_commerce.py, apps/api/tests/test_commerce_content.py; both
  `deploy/*/release.sh` run the loader after Literature.
- **Checked:** check_commerce.py --lessons OK for all nine years; every calculation reworked by
  hand; loaded locally (405 questions, 71 skills); the Commerce subject page at 390 and a mock
  review at 1440; ruff, mypy and the content tests pass.
- **Status:** committed, not pushed.

### UTME Literature in English 2010-2018: questions, explanations and lessons
- **What:** 425 questions from the JAMB papers, none held back, each with an explanation, a
  true reason for every wrong option and a board lesson in the Literature method (name it,
  define it, show it in the words, why it matters, a way to remember it, the trap). 116
  answers differ from the compilation's printed keys. Set-text questions of the time (Sons and
  Daughters, Romeo and Juliet, Othello, Purple Hibiscus and others) are kept and name their
  text; a plot detail that could not be confirmed is rebuilt on the printed extract, the
  theme or the device; garbled quotations are restored to the authors' words.
- **Curriculum:** the syllabus's 5 topics and 11 subtopics (drama, prose, poetry, terms,
  appreciation), coded LIT.3.b.
- **Copyright:** extracts are kept to the few lines the paper prints; the README says so,
  after a helper writing out long passages was refused.
- **Where:** docs/questions/utme/literature/, database/load_retranscribed_literature.py,
  database/check_literature.py, apps/api/tests/test_literature_content.py; both
  `deploy/*/release.sh` run the loader after Economics.
- **Checked:** check_literature.py --lessons OK for all nine years; loaded locally (425
  questions, 425 lessons, 11 skills); a Literature check-up at 390 and a mock at 1440;
  ruff, mypy and the content tests pass.
- **Status:** committed, not pushed.

### UTME Economics 2010-2018: worked answers, drawn graphs, explanations and lessons
- **What:** 425 questions from the JAMB papers, none held back, each with a worked explanation,
  a true reason for every wrong option and a board lesson in the Economics method (name it,
  the rule, how it works or the worked calculation, a Nigerian example, a way to remember it,
  the trap). Every answer is worked out afresh: 154 differ from the compilation's printed keys
  (the 2012 key is a copy of 2011's). Broken or unanswerable questions are rebuilt on the same
  concept. 33 graphs, cost curves, indifference maps, pie charts and histograms are drawn as
  SVG; tables are KaTeX arrays in the stem.
- **Curriculum:** the syllabus's 23 topics and 110 subtopics, coded ECO.4.c.
- **Where:** docs/questions/utme/economics/ (README.md holds Economics' rules),
  database/load_retranscribed_economics.py, database/check_economics.py,
  apps/api/tests/test_economics_content.py; both `deploy/*/release.sh` run the loader after
  Government, and the API image ships economics/figures/svg (Dockerfile, .dockerignore).
- **Checked:** check_economics.py --lessons OK for all nine years; loaded locally (425
  questions, 425 lessons, 110 skills); all 33 figures rendered and looked at; an Economics
  check-up at 390 and a mock at 1440 with a pie-chart question; ruff, mypy and 561 tests pass.
- **Status:** committed, not pushed.

### Never drop a past question: the 16 held back are rebuilt
- **What:** every question that was held back is now a sound question on the same concept,
  with its explanation and lesson: Government 7 (cut-off or several-right options, a repeat),
  Biology 6 (diagrams missing from the PDF, now asked in words), Chemistry 2 and Physics 1
  (missing graph or circuit, now asked in words). Counts: Chemistry 405, Physics 405, Biology
  421, Government 425. The subject READMEs now say "rebuild, never drop" in place of
  `drop: true`.
- **Why:** the founder's rule: if a question has any problem, reconstruct it; students only
  ever see a good question and the concept, never that anything was wrong.
- **Where:** docs/questions/utme/{government,biology,chemistry,physics}/ (year files and
  READMEs).
- **Checked:** every subject's checker OK for all nine years; reloaded locally; content tests
  pass.
- **Status:** committed, not pushed.

### UTME Government 2010-2018: questions, explanations and lessons, with the printed keys put right
- **What:** 418 questions from the JAMB papers, each with a worked explanation, a true reason
  for every wrong option and a board lesson in the Government method (name it, state the fact,
  why, a Nigerian link, a way to remember it, the trap). Every answer is worked out afresh:
  101 differ from the compilation's printed keys (42 of 49 in 2011). Broken options are
  repaired at the source; seven questions are held back because they cannot be made sound
  (2010 Q45, 2011 Q17 and Q45, 2013 Q50, 2015 Q7 and Q32, and 2016 Q43, which repeats Q37).
- **Curriculum:** 33 topics and 94 subtopics from the JAMB syllabus, coded by its Roman parts
  (GOV.II3 is part II, topic 3); `topic_label` now cites these as "part II, topic 3".
- **Why:** arts and social-science students need their subjects, and the printed keys were
  too unreliable to teach from.
- **Where:** docs/questions/utme/government/ (README.md holds Government's rules),
  database/load_retranscribed_government.py, database/check_government.py,
  apps/api/tests/test_government_content.py; both `deploy/*/release.sh` run the loader after
  Biology.
- **Checked:** check_government.py --lessons OK for all nine years; loaded locally (418
  questions, 418 lessons, 94 skills); a Government check-up at 390 and a mock with Government
  at 1440; ruff, mypy and 530 tests pass.
- **Status:** committed, not pushed.

## 2026-10-18

### UTME Biology 2010-2018: questions, explanations, lessons and drawings that make sense
- **What:** 415 questions from the JAMB papers, each answer worked out, broken stems and
  options repaired at the source, with a worked explanation, a true reason for every wrong
  option and a board lesson in the Biology method (structure, how it works, a Nigerian
  example, a way to remember it). Six are held back because the PDF never printed their
  diagram (2012 Q24-25, 2014 Q12-13, 2015 Q45, Q47).
- **Drawings:** every organism, organ, cell and plant is an SVG drawn over the exam's own
  picture with `database/figure_trace.py` (guide, contours, red-over-original overlay), then
  made anatomically right: the founder rejected sketches from memory, scan crops and outside
  images, and caught a crocodile read as a lizard, a stuck-on rabbit tail, an oversized head,
  stick limbs and toes without webbing. Where a scan is too poor (the toads in amplexus), the
  drawing is a realistic textbook composition with the same labels.
- **Why:** students must see accurate pictures and be taught only right answers.
- **Where:** docs/questions/utme/biology/ (README.md holds the drawing standard),
  database/check_biology.py, database/figure_trace.py.
- **Checked:** check_biology.py --lessons OK for all nine years; loaded locally (415
  questions, 415 lessons, 73 skills); a Biology check-up, practice run and mock at 390 and
  1440, with a traced figure in the mock report; ruff, mypy and 538 tests pass.
- **Status:** committed, not pushed.

## 2026-10-16

### UTME Biology: a loader on the shared core, shipped by every release
- **What:** `database/load_retranscribed_biology.py` is `retranscribed_loader.py` with
  Biology's settings, copied from Physics: subject BIO, papers UTME-YYYY-BIO, syllabus label
  utme-2027, drawn figures only (`jpg_figures=False`, `figure_svg` and `option_figures`). Its
  `SYLLABUS_PAGES` map gives each of the 73 subtopics the page of source/syllabus.pdf (12 pages)
  its content starts on, read off one page at a time with pdftotext; section E ends on page
  11, and page 12 is the recommended texts.
  - Core: Biology's topics are numbered within lettered sections (BIO.A1 ... BIO.E2), so a
    topic is now named by `topic_label`: "section B, topic 2", excerpt "2. Nutrition". Numbered
    codes (CHEM.3, PHY.12) read exactly as before, so no Chemistry or Physics citation changes.
    Order was already the order of subtopics.yaml, never a sort of the codes.
  - Release: both `deploy/*/release.sh` run it after Physics. The API image ships
    `docs/questions/utme/biology/figures/svg` (Dockerfile, .dockerignore, a .gitkeep).
  - Tests: `apps/api/tests/test_biology_content.py`, modelled on Physics's; the checks of the
    real files skip a year that is not written yet.
- **Why:** Biology is being written up 2010-2018 and needs the same path into the bank as
  Chemistry and Physics.
- **Where:** `database/load_retranscribed_biology.py`, `database/retranscribed_loader.py`.
- **Checked:** all nine years pass `check_biology.py`; 15 figures exported; loaded into the
  local integration bank (416 questions, 5 dropped, 73 skills, 9 papers), and a second run is
  "Nothing to do"; Chemistry and Physics `--pending` still exit 0; `/v1/student/catalogue`
  lists BIO as ready.
- **Status:** done locally, not committed. No Biology lessons yet.

### Phone: the plan card's exam date no longer runs into its countdown
- **What:** on a subject's page at phone width, "Mon 26 Apr" wrapped onto two lines inside a
  row of fixed height and spilled over "192 days to go". The date now stays on one line, and
  under 520 px both figures and their padding shrink, the target to 28 px so it reads as a pair with the 21 px date, to fit half a
  narrow card (`SubjectHub.css`).
- **Checked:** screenshots of the Physics subject page at 390 and 1440.

### Picture options: each drawn option shows its own figure, never the question's
- **What:**
  - API: every option a client is sent (check-up, practice, practice-run review, mock paper
    and report, reviewer detail) carries `figure: {id, url, alt_text, width, height} | null`
    from `question_assets.option_key` (`app.figures.option_figures_for`); old shapes are kept,
    `figure` is only added. Every question-figure query now keeps to `option_key IS NULL`
    (`figures_for`, the coach's `_figures`, the mock's batch). The coach reads a drawn option
    as its label plus its alt text. A reviewer route, `/v1/review/figures/{id}`, serves a
    figure before it is approved, since the student route serves only cleared ones;
  - web: `OptionBody.tsx` puts the picture in the option after the letter, the label small
    under it (still read aloud); `sp-pic-options` turns the list into a 2×2 grid, one column
    under 560 px. Used in the check-up, practice (and its echo rows), mock room, mock report
    modal, run report, the reviewer page and the bare check-up page. The board shows no
    options, so it is unchanged.
- **Why:** UTME Physics has questions whose options are drawings (transistor symbols).
- **Where:** uncommitted; `apps/api/src/app/figures.py`, `routers/{checkup,practice,mock,review}.py`,
  `apps/api/tests/test_option_figures.py`, `apps/web/src/OptionBody.tsx`, `apps/web/src/styles.css`.
- **Status:** tests pass; checked in headless Edge at 1440 and 390 against loaded Physics data.

### UTME Physics loader, sharing Chemistry's: 40 topics, 404 questions, option pictures
- **What:**
  - the Chemistry loader split into `database/retranscribed_loader.py` (all the loading)
    and a per-subject `Subject` settings object; `load_retranscribed_chemistry.py` and the
    new `load_retranscribed_physics.py` are each their settings plus the same command line.
    Chemistry's rows, hashes and messages are unchanged (`--pending` still exits 0);
  - Physics's syllabus page map read off `source/syllabus.pdf` page by page; Physics
    refuses JPG figures (drawn only);
  - migration 030: `question_assets.option_key` (A to E, or NULL for the question's own
    figure), one picture per option of a version; the loader exports `option_figures` to
    `figures/svg/YYYY_qNN_<letter>.svg` (+ PNG), writes one asset row each and puts them in
    the version hash (only when present, so no existing question re-versions);
  - added to CONTENT_LOADERS after Chemistry in both release.sh files; the API image ships
    `physics/figures/svg` (a `.gitkeep` keeps the folder) and no longer copies Chemistry
    JPGs, which no longer exist;
  - `spoken_maths` reads Physics units: "metres per second", "joules per kilogram per
    kelvin", ohms, microfarads, degrees Celsius, nuclides; a lone capital is a unit only
    after a number, and not in an expression that uses capitals as names.
- **Why:** Physics selectable everywhere Chemistry is, reaching servers only by deploy.
- **Where:** uncommitted; `database/retranscribed_loader.py`,
  `database/load_retranscribed_physics.py`, `database/migrations/030_option_figures.sql`,
  `apps/api/src/app/spoken_maths.py`, `apps/api/tests/test_physics_content.py`.
- **Status:** loaded locally (scorepilot_int): PHY in the catalogue with 404 questions and
  68 teachable skills; not deployed.

## 2026-10-15

### UTME Chemistry loader: the subject, its curriculum, 403 questions and their lessons
- **What:**
  - `database/load_retranscribed_chemistry.py`, on the Mathematics loader's pattern
    (`--reviewer`, `--reviewer-name`, `--apply`, `--pending` exit 10/0, one transaction,
    a new version on change with the old withdrawn, every row naming the reviewer);
  - when CHEM is missing it makes it: both source PDFs recorded and licensed, 18 topics,
    69 subtopics (subtopics.yaml) with one skill each, citations to syllabus.pdf pages,
    the `utme-2027` version published, and the subject switched on;
  - questions per year (both files present and sound), `why` stored as each option's
    distractor_note, JPG figures as image/jpeg assets and drawn ones exported to
    figures/svg (with PNGs for the coach), `drop: true` skipped (retired if
    already in the bank); lessons, cues and doodles loaded as in Mathematics;
  - added to CONTENT_LOADERS in both release.sh files; the API image ships the JPGs and SVGs;
  - mhchem: `render_maths.js` loads it, and `spoken_maths` reads `\ce{...}` aloud.
- **Why:** Chemistry selectable everywhere Mathematics is, reaching servers only by deploy.
- **Where:** uncommitted; `database/load_retranscribed_chemistry.py`,
  `apps/api/tests/test_chemistry_content.py`, `deploy/*/release.sh`, `apps/api/Dockerfile`.
- **Status:** loaded locally (scorepilot_int); not deployed.

## 2026-10-14

### Exact lip-sync for the talking mouth (British RP)
- **What:**
  - **Server:**
    - each word's sounds come from espeak-ng's British RP voice, normalised to the 44 RP
      phonemes, with a checked lexicon on top;
    - the sounds are fitted exactly into the word's time in the clip;
    - older clips are converted on first read.
  - **Web:**
    - a measured shape for every one of the 44 phonemes (jaw, rounding, spreading,
      protrusion, teeth, tongue; sources Cruttenden and Roach), with diphthongs gliding;
    - coarticulation 60–120 ms ahead, and p b m held closed;
    - a front view of the lips as the main view, with the side view a small inset for
      consonant place;
    - a voice box that buzzes for voiced sounds;
    - a word strip showing one small mouth per phoneme, lit as it is said.
  - **Voice stops mid-line:**
    - the board no longer pauses and restarts a clip when its narration effect re-runs;
    - the sound engine is made when the board opens, not as the first voice starts. Making
      it then blocked the page for up to a second.
- **Why:** the founder's requirement: the mouth must show each word's exact lip sequence.
  The founder also heard the voice stop between words, and found the side cross-section did
  not show the lips.
- **Where:**
  - server: `apps/api/src/app/phonemes_rp.py` and `mouth_voice.py`;
  - web: `apps/web/src/student/mouthShapes.ts`, `mouthTimeline.ts`, `Mouth.tsx`,
    `mouth.css` and `Board.tsx`;
  - the plan: `docs/plans/2026-10-01-exact-lip-sync.md`.
- **Status:**
  - committed locally;
  - 61 mouth API tests and 53 web tests pass;
  - screenshots of sheep, ship, vision, enclosure and think at 1440 and 390;
  - the shape table still needs an English teacher's or phonetician's sign-off, as the plan
    says.

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
