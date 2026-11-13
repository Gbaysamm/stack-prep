# Brief for splitting a subtopic lesson into short lessons

A lesson is short: about three or four minutes, one main idea, usually 18 to 30 moments; a guide, not a limit (founder, 12 Nov 2026). You split
ONE checked subtopic lesson into two to four short lessons. Its facts, calculations and past
questions were already checked: **restructure, do not rewrite the teaching.** Change wording
only where a new lesson needs its own opening, objective, recap or link line.

Repo: c:\Users\yakub\stack-prep (Git Bash: /c/Users/yakub/stack-prep). Do NOT commit or
push. Touch only your lesson's files. Keep working files in a scratch folder named after your
lesson.

## Read first

`docs/lessons/subtopic-lesson-guide.md` (especially "Short lessons"), `docs/lessons/writer-brief.md`,
then your lesson file and its doodles (`docs/lessons/subtopics/<subject>/doodles/sub_<slug>_*.svg`).

## Do

1. Choose the seams: two to four lessons, each a natural part of the subtopic, each at most
   about 30 moments (aim for 18–30), one main idea each. Fewer, fuller lessons beat many thin ones.
2. Write `<slug>_1.yaml`, `<slug>_2.yaml`, … next to the original, each with the same
   `subtopic_id`, `subject`, `subtopic`, `sources`, plus `part: N` and `title: '<what it
   covers>'`. Then delete the original `<slug>.yaml`.
3. Each lesson is complete and short: a welcome that names it ("Welcome. This is lesson two
   of three on the gas laws: Charles's law and the general gas equation."), its title written
   on the board, one or two objectives, its terms with their worked examples, its own JAMB
   traps, a one-line check yourself, a short recap. A later lesson does not repeat an
   earlier one; at most "In the last lesson you met …" in one line.
4. **Exactly one problem per lesson** under `problems:`. Reuse the original problems where
   they fit their lesson; write a new one where a lesson has none: short, on that lesson's
   content, with `ask`, `answer`, `accept`, `working`, `needs_working`, and its arithmetic
   checked by you.
5. **Doodles are shared** by the subtopic's lessons (the files keep their names). A lesson
   that acts on a diagram must first bring that diagram in itself (its own `doodle:`), at the
   stage it needs: a `stage` action in lesson 2 cannot assume lesson 1 already drew it. Every
   doodle file should still be used by some lesson. Board `point:` line numbers count from
   the start of each new file: renumber them.
6. Check and load each new file:

       DATABASE_URL=x /c/Users/yakub/stack-prep/.venv/Scripts/python database/load_subtopic_lessons.py --check --file <yaml>
       DATABASE_URL=postgresql://scorepilot:scorepilot@127.0.0.1:55440/scorepilot_int /c/Users/yakub/stack-prep/.venv/Scripts/python database/load_subtopic_lessons.py --file <yaml>

## Report (short)

The lessons: number, title and moment count of each; the problem of each (and whether new);
anything you had to reword beyond openings and recaps; the check results.
