# Brief for a line-by-line review of past-question lessons

You review every past-question lesson in ONE `lessons_YYYY.yaml` file, sentence by sentence,
and rewrite what fails. These lessons play after a student got the question wrong in a run.
Their job (founder's reviewer, 13 Nov 2026): **repair the knowledge gap, not reproduce a whole
classroom lesson.** The student has met the topic before and has just tried the question; they
may know what a mole is, what molar mass means and what Avogadro's constant is, but not how to
connect them. Teach that connection, and explain briefly any prerequisite they need to follow
it. The final test: after this video, could the student solve another question on the same
idea without needing the video again?

Repo: c:\Users\yakub\stack-prep (Git Bash: /c/Users/yakub/stack-prep). Do NOT commit, push or
load. Touch only your lessons file (and, if you remove a doodle or sketch from a lesson, that
lesson's own file in the subject's `doodles/` or `sketches/` folder, named `YYYY_qNN…`).

## The founder's decisions (13 Nov 2026)

1. **No answer checks.** Remove every "Check" step that re-verifies the answer after the
   working (its section and its moments). The lesson goes from the working to the answer.
2. **Few analogies, few pictures.** The student is solving a question and does not want
   comparisons to everyday things or decorative drawings. Remove an analogy ("Picture his pay
   as a pile") unless it truly makes the idea clearer and is relatable. Keep a drawing only
   where the question needs it (a figure, a graph, a diagram the working uses); remove a
   doodle that only decorates.

## The one test for every sentence

If the student hears this for the first time, will they understand it using only what has been
explained so far? If not, simplify it or explain the missing piece first.

## Standards (check each lesson against all six)

- **Context.** Open by saying what we are given and what we must find. No hint about the
  options before teaching ("Two options differ by a factor of two" goes).
- **Continuity.** Each line follows from the one before; say why a step is taken ("Since one
  mole contains 6.02 × 10²³ atoms, 0.25 mole contains 0.25 times that number").
- **Completeness.** No essential step skipped; a value used is explained once (Mg = 24 means
  one mole of magnesium weighs 24 g).
- **Conciseness.** No repetition that adds nothing (one statement of what an idiom means, not
  five); no stray labels said aloud ("Solution."); each line has its own job.
- **Diagnosis.** Each option gets its own verdict, in its own moment. A trap names the
  student's likely slip only when the wrong option can be traced to a plausible calculation or
  reading ("half a mole, as if magnesium were 12"); never invent a mistake to explain a
  distractor; otherwise say plainly why it is wrong and what the right reasoning is.
- **Subject, not template.** Chemistry and Physics: what is asked, the principle, any term,
  the steps, the misconceptions. Mathematics: the givens, the principle and why it applies,
  the steps, the likely errors. English: the sentence or passage, the language idea, the
  meaning, the options one by one, the common misreadings. They share a teaching philosophy,
  not sentence patterns. Precision matters in every subject (an idiom can mean "extremely
  unlikely", not a logical impossibility).

No fixed length: some questions need 45 seconds, others three minutes.

Keep the facts, the answer and the options. Keep whole spoken sentences, formulas written as
formulas, names before symbols, board lines with a capital, no colons, semicolons or "e.g." in
what is said. Never say JAMB or the key is wrong.

## Board timing and marks (founder, 13 Nov 2026)

What is written goes up while its own words are said, and never before the point before it is
finished. When you reword or split, keep the board in step:

- **A line goes up on its own words.** The board writes a moment's line when the line's first
  two words are said (or else the first weighty word of the speech that is also on the line).
  So open each `write` with words the voice says as that point begins, and do not put the next
  point's line on a moment whose speech is still finishing the last point: split the moment.
- **One point said, then written, then the next.** A moment whose speech goes through several
  items one after another, while its line holds all of them, is split into one moment each.
- **Marks land on their word.** A mark (circle, underline, arrow, label) lands on its `'on':`
  word, or else on its `at:` text when the speech says it. When you reword, keep the word the
  mark lands on in the speech at the place where that thing is talked about; a mark whose word
  is no longer said comes too early. When you split, the mark goes on the moment that talks
  about what it marks, and its `line:` still points at the line holding its `at:` text.

## Keep (the checker fails otherwise)

- The answer moment (`answer: true`) and the traps' option letters.
- Every action you do not deliberately remove stays, in order, on the moment that says its cue
  word (`'on': …`).
- Marks: `point: {line: N}` counts moments from 0 within the lesson. Renumber every line that
  points at or after a moment you add, split or remove; a mark's `at:` text must be in the
  write of the moment it points at. A mark on a removed moment goes with it.

## Check

    cd /c/Users/yakub/stack-prep && .venv/Scripts/python database/check_lesson_edit.py --review <your file>

Run it after every few lessons and at the end, until it prints `ok`.

## Report

Lessons changed; checks removed; analogies removed; doodles or sketches removed (with their
files); traps rewritten; three before → after examples; anything you were unsure of, and any
factual error you saw (with the question number; do not fix facts beyond the lesson's wording).
