# Brief for a lesson language editor

You edit the WORDING of one subtopic's lesson files so every spoken line reads as natural,
correct English a good Nigerian teacher would say, and every board line reads well. The
teaching (facts, numbers, order, examples, worked steps) was already checked: do not change
it. Founder, 12 Nov 2026: "The air, the water you drink, the salt in your food." is not a
sentence; it should be "The air, the water you drink and the salt in your food are all matter."

Repo: c:\Users\yakub\stack-prep (Git Bash: /c/Users/yakub/stack-prep). Do NOT commit or push.
Touch only your lesson files. Keep working files in a scratch folder named after your lesson.

## Read first

`docs/lessons/subtopic-lesson-guide.md` (all of it, especially the rules at the end), then
every `say` and `write` of your files, out loud in your head, in order.

## Fix

1. **Every spoken sentence is complete and correct.** Lists join their last item with "and"
   (or "or"); a list of examples belongs in a sentence with a verb ("…are all matter",
   "…are elements"). No fragments that leave the listener waiting. Short teacher signposts
   are fine and stay: "Now a plant cell.", "Pause and work it out.", "Let us solve this."
2. **Natural spoken English**, plain and short, as said aloud: no stiff written phrasing, no
   colons or semicolons in `say`, no "i.e."/"e.g." in `say` (say "for example").
3. **Names before symbols on the board:** the first time an element or compound is written,
   its name comes first with the symbol in brackets ("sodium (Na)", "water (H₂O)"); later
   lines may use the symbol alone.
4. **Board lines** read as clean notes: start with a capital; no line that only repeats the
   title or the line before.
5. **The opening** (Welcome, Introduction, Objectives): the welcome names the lesson once
   ("Today's lesson is …"), never "lesson one of two"; the introduction says something real
   about the topic, not what the lesson "covers"; the objectives are one or two short lines.
   Nothing is said three times before the teaching starts. Do not add new pictures.

## Keep (the checker fails otherwise)

- Every cue word: a moment's `'on': <word>` (on the moment, a doodle, an action or a mark)
  must still appear in that moment's `say`. If you reword around it, keep the word.
- Every mark's `at:` text must still appear in the line it points at (`point: {line: N}` is
  the moment number, from 0). Do not add or remove moments, so the numbers stay right.
- Formulas in `say` as written (H₂O, CO₂); the voice reads them letter by letter.

## Check and load each file

    DATABASE_URL=x /c/Users/yakub/stack-prep/.venv/Scripts/python database/load_subtopic_lessons.py --check --file <yaml>
    DATABASE_URL=postgresql://scorepilot:scorepilot@127.0.0.1:55440/scorepilot_int /c/Users/yakub/stack-prep/.venv/Scripts/python database/load_subtopic_lessons.py --file <yaml>

## Report (short)

How many lines you changed per file, five representative before → after examples, and any
place you were unsure the meaning stayed the same.
