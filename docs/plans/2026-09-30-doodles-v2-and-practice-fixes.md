# Plan: doodles v2, topic practice, syllabus topics, and the "I guessed" flow

Written 29 September 2026 for work starting 30 September. It comes from the founder's testing
notes and a read of the code; every file reference below was checked against `integration` at
c8cd7d8.

Order of work:
1. **Quick fixes that students hit today:** parts B and D. About half a day.
2. **Syllabus topics on screen:** part C.
3. **Doodles v2:** part A. Build the engine first, then the content in parallel batches.

Each part ends with its own checks. As always, nothing is pushed without a yes.

---

## A. Doodles v2: pictures that change, gather, and get referred to

### What's wrong now
- **Too few.** 146 of 1,043 Maths lessons (13%) and 292 of 768 English lessons (38%) have a
  doodle. In the founder's test of 20 Maths questions, only a few had one.
- **One still picture per lesson.** No lesson has more than one doodle. After it is drawn, a
  doodle only idles (it bobs or blinks). It is never changed, added to or used again as the
  explanation moves on.
- **Not woven into the explanation.** The voice and the working rarely refer back to the doodle
  once it is drawn. Nothing on the board or in the passage points at a part of it.

### What explainer videos do, and what we'll copy
1. **Change the picture as the story moves.** Examples:
   - a money jar fills from ₦1,000 to ₦1,240;
   - a seed grows into a cob;
   - a group splits into those who passed and those who failed;
   - a crossed-out wrong idea is redrawn as the right one.
2. **Gather a community.** Draw many small figures, then group, count, circle, split or line
   them up:
   - the 42 students, 18 of whom take both subjects;
   - "10 pupils, mean age 16";
   - the villagers in a passage who all fled.
3. **Refer back.** When the voice or a board line mentions the trader's price again, that part
   of the doodle pulses or gets circled, and a numbered dot or line connects the two, the same
   way working and figure are already linked.
4. **Move things.** A car drives 3 km east and then 4 km north. A tank's water level rises. A
   coin flips. Money passes from one person to another.

### Engine (one helper; lesson files untouched until the contract is fixed)
The engine lives in `apps/web/src/student/DoodleLayer.tsx`, `Doodle.tsx`, `drawIn.ts` and
`doodle.css`, with validation in `database/lesson_doodles.py` and
`apps/api/src/app/lesson_doodles.py`.

1. **Named parts.** Artists tag groups `<g data-part="price-tag">`. Marks and links can then
   target a part: `{doodle: '<id>', kind: circle|highlight|underline|cross|label|arrow, part:
   'price-tag', text?}`. They use the same pair dots and connectors as figure marks, and a
   board line can link to a part with `to: {doodle: '<id>', part}`.
2. **Doodle ids and actions across moments.** A moment's `doodle:` gets an optional
   `id: 'jar'`. Later moments can act on it:
   ```yaml
   doodle_do: [{id: jar, op: pulse|add|move|grow|shrink|fill|count|split|cross|redraw|swap, part?, to?, stage?, n?}]
   ```
   - **`stage`**: redraw into a later version (`custom:2001_q15_a` → `…_a2`). This reuses the
     sketch build-up rule: if the later SVG keeps every shape of the earlier one, the pen adds
     only the new strokes. Otherwise it crosses out and redraws. This is how a picture
     changes form, and nothing fades.
   - **`move`**: along a path given in the art (`data-path="route"`).
   - **`fill`**: a level rising in a shape (`data-fill="water"`).
   - **`count`**: numbers written by each member of a group, one at a time.
   - **`split`**: a group separates into two labelled sub-groups.
3. **Communities.**
   ```yaml
   doodle: {name: person-small, id: class, repeat: 12, layout: row|grid|cluster, caption}
   ```
   draws N small figures one by one. Then `doodle_do` with `op: circle|split|count, n: 5`
   works on the first N or on a chosen subset. The library gets small, repeatable figures:
   person, student, coin, ball, seed and house.
4. **A bigger stage when a lesson needs it.** A doodle "scene" can take a wider area (up to
   about 320×200 on laptop): beside the working, or in the right panel when the lesson has no
   figure or passage. On phone it sits in the room made under the line.
5. **Voice timing.** An action happens during the moment that carries it, in time with the
   voice. It waits for the line to be written, like the marks do.
6. **Checks and demos.**
   - Validator rules: parts exist; ids are unique and defined before use; stages are real
     files; repeat is 50 or fewer.
   - Loader, API and `api.ts` fields added.
   - Harness demos: a money jar filling over three moments; 42 students split into a Venn;
     a car on a two-leg journey; the snakes passage with the snake and a calendar that ticks
     "1–2×".
   - Real-time captures on laptop and phone.

### Content (after the engine; parallel helpers, one batch of years each)
Rule for every helper: **write only your own year prefixes, and never delete by wildcard in the
shared `doodles/` folders.** On 29 September a wildcard `rm` wiped other helpers' drawings.

- **Maths target:** at least 60% of lessons with a doodle, including the symbol-only topics
  where a concept picture helps:
  - indices as repeated-multiplication stacks, and logs as "how many times";
  - surds as square tiles, and matrices as seats in rows;
  - sets as bags, and number bases as bundles of sticks;
  - gradient as a hill, and a derivative as a speedometer;
  - probability as a bag, dice or coins.

  Most word problems should have 2–4 doodle actions, not one still picture.
- **English target:** at least 70% where a picture carries meaning, and multiple doodles where
  a passage has characters or groups. Doodles are referred to from the passage notes: a
  passage mark can carry `to: {doodle, part}`.
- **Never draw what the working already draws.** A sketch shows exact geometry; a doodle shows
  the situation or the idea.
- **QA.** Contact sheets for every stage, then real-time replays of 20 random lessons per
  subject. This is the founder's own test, run before he does.

---

## B. Topic buttons start a general run (bug)

**Cause:** every topic button drops the topic. `useStartPractice.start` in
`apps/web/src/prep/pages/Home.tsx:98-102` uses the subtopic id only as the key for the button's
busy spinner. `api.startPractice` in `apps/web/src/student/api.ts:464-468` sends only the
subject. The API then runs its own plan (`practice.py:309-326`), which puts the heaviest weak
area first: Statistics.

The API side is already correct. `subtopic_ids` and `topic_ids` filter strictly, and the run
builder uses them properly. Only the buttons are broken.

**Fix:**
1. `api.startPractice(studentId, subjectId, opts?: {subtopic_ids?, topic_ids?, exam_years?})`,
   or route everything through `runsApi.start`. `useStartPractice.start(subjectId, {subtopicIds?,
   topicIds?}, busyKey?)`.
2. Send the chosen topic from each of these:

   | Entry point | Where |
   |---|---|
   | Weakest spots (Home and subject page) | `WeakList`, Home.tsx:506 and SubjectHub.tsx:458 |
   | Check-up report, "Practise weakest topic" | CheckupReport.tsx:143 |
   | Worth another look | Progress.tsx:565; add `subtopic_id` to `LessonToRevisit`, progress.py:571-581 |
   | Check-ins | CheckIns.tsx:192; add `subtopic_id` to the entry model, progress.py:~625/682/707 |
   | "Another run" | RunSummary.tsx:102; reuse the finished run's filters |
3. **Home hero "starting with X":** that label ranks by check-up mastery, while the run ranks by
   marks gained. Either send `first.subtopic_id` or drop the claim. Recommended: send it, so the
   label is true.
4. **Run builder deep link:** read `?topic=` / `?subtopic=` in RunBuilder.tsx:43, preselect it,
   and link to it from topic views.
5. **When a topic has no fresh questions** (422 NOTHING_MATCHES), say so plainly and offer a
   general run. Never switch topic silently.
6. **Optional:** a soft `focus_subtopic_ids` that puts a topic first and then continues with the
   plan, for "continue" style buttons.
7. **Tests:**
   - API: a run started with `subtopic_ids` only ever serves that topic.
   - Web: `WeakList`'s Practise sends `subtopic_ids`.

---

## C. Topics as the syllabus has them (5 sections and 23 topics in Maths; 3 and 18 in English)

The data already has every JAMB topic, and every question is tagged to one. The trouble is
naming, one level off: the database's "topic" is JAMB's **section**, and its "subtopic" is
JAMB's **topic**.

1. **Students see JAMB's topics:**
   - Every card, weak-spot list, progress page, check-up report, run builder and scoring
     number works per topic (23 in Maths).
   - Sections are only headings that group them.
   - "Skill" is never shown.
2. **Names:**
   - Use JAMB's topic names as printed in the syllabus.
   - Check them against `docs/syllabus/utme-Mathematics.pdf` and the English PDF, and correct
     any that differ.
3. **API and database:**
   - Keep the column names; rename in the API models and the UI. For example, `WeakSubtopic`
     becomes a topic in the UI copy and types, and `topic` is shown as a section.
   - Update `docs/syllabus-database.md` to say which DB level is which JAMB level.
4. **Weights:** per-topic weights come from questions per paper (see the scoring document).
5. **Depends on:** the scoring decisions in `docs/student-scoring.md` (A–I), which are still
   open. The per-topic view in this part is the same unit that document scores.

---

## D. "I guessed", second tries, and an optional lesson after a right answer

**How it works now:**
- Only `apps/web/src/prep/pages/PracticeRoom.tsx` is live.
  `apps/web/src/student/Practice.tsx` is dead code; nothing mounts `StudentApp`.
- **Right on a second try with "I guessed":**
  - **Client:** it shows no lesson. `Result` (PracticeRoom.tsx:1148-1156) lets
    `kind === "second"` override the guessed tone, and `lessonRoute` (line 646) opens the
    review board only for `kind === "right"`.
  - **Server:** it already allows that lesson (`_right_but_doubted`, practice.py:1935-1947).
- **Right on the first try with "I knew it" or "Rather not say":** there is no way to see the
  working. The server refuses the lesson with a 409 (`test_a_sure_right_answer_has_no_lesson`,
  test_practice.py:494).
- **Guessed or unsure, right:** "Show me the working" is the main button, and there is no
  separate Next.
- **Existing mismatch:** the review board shows the ask box, but `/ask` and `/listen` refuse
  unless the student has missed twice. Asking gets an error.

**Fix:**
1. **Guessed or unsure, right on the second try:**
   - Show "Show me the working" as the main button.
   - Allow `kind === "second"` in `lessonRoute`.
   - Add a feedback context `after_second_guess` (a migration on the CHECK in
     023_lesson_feedback.sql, the Literal at practice.py:2283, lessonFeedbackApi.ts:6 and
     checkinWords.ts).
2. **Any right answer:** add a secondary "See how it's worked out" next to "Next question".
   - It is optional; Next stays the main button when the student was sure.
   - On the server, relax `_right_but_doubted` / `_lesson_is_open` (practice.py:1935-1964) to
     "the latest attempt was right", and update the test.
   - Record it as `after_right` feedback, or skip the check-in for an opt-in view (recommended:
     a single, lighter "Was this useful?").
3. **Guessed or unsure, right on the first try:** keep the working as the main button, but add a
   visible "Next question" beside it, so the lesson is recommended rather than forced.
4. **Scores:** no change. The lesson opens only after the answer is recorded, and opening it
   writes nothing to `attempts` (checked). Keep it that way.
5. **The ask box on review boards:** allow `/ask` and `/listen` there. They are metered at 20 a
   day per student (`config.py:51`), and past that they fall back to the written steps.
   Alternatively, hide the box. Recommended: allow it.
6. **Cost:** the lessons themselves are cached for everyone. There is one narration per
   question per first wrong choice (a right answer shares one), and written lessons need only
   voice lines, made once. Opening them after right answers adds at most one narration per
   question.
7. **Reload:** a reload on the result screen loses the review offer, because `outcome` is client
   state only. Keep it in the URL or session storage.
8. **Warm up:** start preparing the lesson (`/lesson/{qv}/warm`) when a right result is shown,
   so the board opens without waiting.
9. **Tests:**
   - API: sure-right and second-try-right can open `/lesson`, and `attempts` is unchanged
     afterwards.
   - Web: the Result buttons for each case.

---

## E. Small items noticed on 29 September
- **The pen and the buddy:** the idle pen can rest on top of the coach buddy (bottom right).
  Park it where it doesn't cover the buddy.
- **Dead code:** `apps/web/src/student/Practice.tsx` and `StudentApp.tsx` aren't mounted.
  Remove them, or mark them clearly, so nobody fixes the wrong file.
- **Exam mode** is still parked (docs/roadmap.md S11). The scoring document's decision I (mock
  answers) will feed into it.

## Checks for every part
- `uv run --frozen ruff check .`
- `uv run --frozen mypy packages/engine/src apps/api/src`
- `uv run --frozen pytest -q`
- `npm test`
- in apps/web: `npm run typecheck` and `npm run build`
- every migration plus the schema tests on a fresh database
- the loader dry runs for both subjects
- replays on laptop (1440) and phone (390)

Commit when a part is done; push only after a yes.
