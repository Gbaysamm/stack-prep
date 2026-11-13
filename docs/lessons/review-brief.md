# Brief for a line-by-line lesson review

You review a subtopic's short lessons sentence by sentence, the way the founder's reviewer
went through Elements (13 Nov 2026), and rewrite what fails. The finished example is
`docs/lessons/subtopics/chemistry/chem_elements_compounds_mixtures_1.yaml`: read it first, and
compare it with its previous version (`git show 831f04c:docs/lessons/subtopics/chemistry/
chem_elements_compounds_mixtures_1.yaml`) to see the kind of change wanted.

Repo: c:\Users\yakub\stack-prep (Git Bash: /c/Users/yakub/stack-prep). Do NOT commit or push.
Touch only your subtopic's lesson files.

## The one test

For every sentence: **if a student hears this for the first time, will they understand it
using only what has been explained so far?** If not, simplify it or teach the missing piece
first. A sentence can be correct in grammar and in science and still be poor teaching when
it does not follow from the one before. The student is not new to school, but no step is left
for them to fill in.

## What to look for, line by line

1. **Repetition that adds nothing.** The same idea said twice in a row, or the same word
   leaned on in consecutive lines ("matter… matter… all matter"). Repetition that reinforces
   with something new may stay; repetition that only restates goes.
2. **Each line has its own job.** When three lines explain the same thing (a molecule, then
   its formula, then that it is still an element), give each one job: introduce, explain the
   notation, draw the conclusion.
3. **Unnatural or vague phrases** ("the atoms go about in small groups", "the small number
   tells us how many atoms there are" — how many of what?). Say it plainly and exactly.
4. **Transitions.** "Now let us use this" — use what? Join each section to what came before
   ("Now that we know how symbols are written, let us use them to…"). A worked example states
   what we are given, what we must find, and the one question we ask of each item, as its own
   line, before the verdicts.
5. **Traps** give the general rule behind the mistake ("What matters is the kind of atoms, not
   how many"), not the worked example said again.
6. **One verdict per moment.** A moment that explains three items in one breath is split, so
   each is said and then written; a summary line goes on the moment that says the summary.
7. **Recaps** say exactly what was taught, precisely enough to use.
8. Keep everything else in the guide (`docs/lessons/subtopic-lesson-guide.md`): whole spoken
   sentences, names before symbols, no colons or "e.g." in what is said, formulas as written.

Keep the facts, numbers, worked answers, problems and the order of ideas. Keep each lesson
about three or four minutes; if a fix makes it much longer, say so in the report.

## Keep (the check fails otherwise)

- Cue words (`'on': …`) stay in the say of the moment carrying the action.
- Marks: `point: {line: N}` counts moments from 0 in the file; renumber when you add or split.
  A mark's `at:` text must be in the write of the moment it points at.
- Every doodle, stage and action stays, on the moment that says its word.

## Check and load each file

    DATABASE_URL=x /c/Users/yakub/stack-prep/.venv/Scripts/python database/load_subtopic_lessons.py --check --file <yaml>
    DATABASE_URL=postgresql://scorepilot:scorepilot@127.0.0.1:55440/scorepilot_int /c/Users/yakub/stack-prep/.venv/Scripts/python database/load_subtopic_lessons.py --file <yaml>

## Report

Per file: lines changed, moments added, and the three changes that matter most (before →
after). Anything you were unsure of.
