# Brief for restructuring a subtopic into short lessons

You rebuild ONE subtopic's lessons into short lessons that teach like a good Nigerian teacher at
the board: about three or four minutes each, one main idea each, no gaps, one thing said and
then written. The founder reviewed Elements, compounds and mixtures line by line (12 Nov 2026)
and it is now the model: `docs/lessons/subtopics/chemistry/chem_elements_compounds_mixtures_1.yaml`
to `_5.yaml`. Read all five first, and copy how they work, not their content.

Repo: c:\Users\yakub\stack-prep (Git Bash: /c/Users/yakub/stack-prep). Do NOT commit or push.
Touch only your subtopic's lesson files and its doodles (`doodles/sub_<slug>_*.svg`).

## Read first

1. `docs/lessons/subtopic-lesson-guide.md`, all of it. Every rule there applies; the newest
   (founder, 12 Nov 2026) matter most: short lessons; no gaps, no rushing (teach before you
   use, examples introduced as examples, stay at the topic's level, guided worked examples,
   join the ideas, sentences a teacher says); name the list, then teach each item in its own
   moment; one thing said, then written; not while the last line is still being talked about;
   pictures pop in on their word (`data-later` parts and `op: show`); whole sentences; names
   before symbols.
2. The five model lessons, moment by moment.
3. `docs/lessons/sources.md` and your subtopic's current lesson files: they hold the checked
   facts, worked examples, JAMB questions and traps. Keep all of that teaching; rebuild how it
   is delivered.

## What to make

- Split the subtopic into lessons of about three or four minutes (usually 18 to 30 moments),
  one main idea each, in the syllabus's order. That is a guide, not a limit: never cut an
  explanation short to fit. Files `<slug>_1.yaml`, `<slug>_2.yaml`, … with `part:` and `title:`
  (what that lesson covers). A subtopic that was one file becomes `<slug>_1.yaml` … too; delete
  the old file name once its content is moved.
- Each lesson: a welcome naming it once ("Welcome. Today's lesson is …"); for lesson 2 on, one
  line linking back ("In the last lesson, …"); the objectives in one short line; the teaching
  with worked examples straight after each rule, each guided (given, find, why each step, what
  the answer tells us); its traps; a check; a two-line recap; one problem (`problems:` with
  answer, accept, working, needs_working), simple, on what that lesson taught.
- The first lesson keeps the subtopic's big-picture introduction.
- Pictures: reuse the subtopic's doodles; each lesson that uses one brings it in itself (on the
  word that explains it). Where pieces of a picture are named one by one, make them `data-later`
  parts (label inside the part's group) and bring each in with `op: show`.
- Marks: `point: {line: N}` counts moments from 0 within each file; renumber with care.

## Check and load

    DATABASE_URL=x /c/Users/yakub/stack-prep/.venv/Scripts/python database/load_subtopic_lessons.py --check --file <yaml>
    DATABASE_URL=postgresql://scorepilot:scorepilot@127.0.0.1:55440/scorepilot_int /c/Users/yakub/stack-prep/.venv/Scripts/python database/load_subtopic_lessons.py --file <yaml>

Check and load every file you make. Do not run the loader without `--file` (other agents are
working on other subtopics at the same time).

## Report

The new lessons (file, title, moments, estimated minutes at 140 spoken words a minute), what
was moved or rebuilt, any teaching you added to close a gap, files deleted, and anything you
were unsure of.
