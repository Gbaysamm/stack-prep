# Brief for a question-bank teaching editor

You make every past-question lesson in ONE `lessons_YYYY.yaml` file teach the way a good
Nigerian teacher explains at the board: no gaps, no rushing, each step said and then written.
Each lesson teaches one JAMB question: moments (`say` is spoken, `write` goes on the board as
it is said) and `traps` (spoken to a student who chose that wrong option). The wording was
already edited for grammar; the facts, numbers, answers and options were already checked. You
fix how the explanation TEACHES.

Founder, 12 Nov 2026, on a lesson that read like a list of facts: "It should not feel rushed
such that the users notice gaps in the explanation. It is better to explain it from scratch
than to rush it and have gaps." The student is not new to school, but no step is left for
them to fill in.

Repo: c:\Users\yakub\stack-prep (Git Bash: /c/Users/yakub/stack-prep). Do NOT commit, push,
load, or touch any file but your own lessons file. Edit in place with the Edit tool.

## Read first

`docs/lessons/subtopic-lesson-guide.md`, the "Rules" section (especially "No gaps, no
rushing", "One thing said, then written", "Whole sentences when spoken", "Names before
symbols"). Then read your file lesson by lesson, picturing the board and hearing the voice.

## Fix, in each lesson

1. **Gaps.** A step that jumps ("so the answer is 25" with no reason), a number that appears
   from nowhere, a rule used but never stated: add the missing step as its own moment, or
   reword so the reason is said ("because…", "so…").
2. **Teach before use.** A symbol, term, unit or notation the student needs to follow the
   working is explained in one plain sentence the first time it matters ("The small 2 in O₂
   means two oxygen atoms"). Keep to the question's level: a harder idea is named in passing,
   not taught.
3. **Guided working.** A calculation says what we are given, what we must find, which rule we
   use and why, then each step, then what the answer tells us and which option it is.
4. **One thing said, then written.** A moment whose say goes through several items or steps
   one after another while its write holds all of them is split: one moment per item or step,
   each with its own line. A summary line sits on the moment that says the summary.
   And the next line never goes up while the voice is still talking about the last one: a
   line is written when its own first words are said, so it opens with the words the voice
   says as its point begins.
5. **Examples introduced as examples** ("For example, …"), and ideas joined ("so", "because",
   "now", "this means"), so the lesson runs as one explanation, not a list.
6. **Traps** explain the student's likely thinking and why it fails, in a sentence or two.

Do not change facts, numbers, the answer, the options or what the question asks. Keep each
lesson focused: a few added or split moments where they are needed, not a longer lecture. If
you find a factual error, do not fix it: report it with the question number.

## Keep (the checker fails otherwise)

- **Every action stays, in order:** doodles, diagrams, sketches, marks (`point`), mouths,
  `answer: true`. When you split a moment, its actions stay on the part whose `say` holds
  their cue word (`on: …`); a new moment you add only says and writes (and may start a
  `section`).
- **Cue words** stay in the `say` of the moment that carries the action.
- **Marks:** `point: {line: N}` (and `from: {line: N}`) count moments from 0 within the lesson.
  When you add or split moments, renumber every line that points at or after the change. A
  mark's `at:` text must be in the `write` of the moment it points at.
- Formulas written as formulas (NaOH, H₂O, Ca²⁺); numbers and units said in words where the
  file already says them in words; board lines start with a capital (except maths, symbols,
  abbreviations); no colons, semicolons or "e.g." in `say`.

## Check

    cd /c/Users/yakub/stack-prep && .venv/Scripts/python database/check_lesson_edit.py --teaching <your file>

Run it after each few lessons and at the end, until it prints `ok`.

## Report

Lessons changed, moments added, the kinds of fix (counts), three before → after examples, and
any factual error or place you were unsure, with the question number.
