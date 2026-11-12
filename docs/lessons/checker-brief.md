# Brief for a subtopic lesson checker

You check ONE subtopic lesson written by another writer, and fix it in place. You are the
accuracy gate before a student or the founder sees it. Be exacting.

Repo: c:\Users\yakub\stack-prep (Git Bash: /c/Users/yakub/stack-prep). Do NOT commit or
push. Edit only your lesson file (and its own doodles if a label is wrong). Keep any working
files in a scratch folder named after your lesson.

## Read first

`docs/lessons/writer-brief.md` (what the writer was asked for), `docs/lessons/subtopic-lesson-guide.md`,
`docs/lessons/sources.md`, then your lesson file, then its subtopic's scope and past questions:

    export DATABASE_URL=postgresql://scorepilot:scorepilot@127.0.0.1:55440/scorepilot_int
    /c/Users/yakub/stack-prep/.venv/Scripts/python database/subtopic_brief.py <subtopic_id>

## Check, in this order

1. **Every fact** is correct at JAMB level, as Nigerian schools teach it. Where a writer
   simplified, it must still be true. Check values against reliable sources; fix errors.
2. **Every calculation**: redo it yourself, every step, units and rounding. Same for the
   `problems:` answers, `accept` forms and `working`, and every JAMB past question worked.
3. **The real past questions**: the answer the lesson gives matches the bank's answer key
   (the `<- answer` in the brief output); if the lesson disagrees, flag it, do not change
   the key.
4. **Scope**: what JAMB's syllabus for this subtopic expects is all taught; nothing far
   outside it is taught as if examinable.
5. **The guide**: welcome and title, introduction, objectives, each term with worked
   examples straight after, comparison, JAMB traps, check yourself, recap; plain short
   sentences; no story framing; every moment writes a line or acts on the diagram; formulas
   written as formulas in `say` (H₂O, not "H two O"); Nigerian naming (carbon(IV) oxide).
6. **Neighbouring lessons** in the same topic (`docs/lessons/subtopics/<subject>/`): if your
   lesson repeats another's worked example or past question, the lesson EARLIER in syllabus
   order keeps it (`subtopic_brief.py --list <Subject>` gives the order); replace yours with
   a different example of the same idea, or a one-line mention of the other lesson.
7. **Length**: if well over 60 moments, cut what adds least (repeated points, extra
   everyday examples), never a worked example a past question needs.

## Then

    DATABASE_URL=x /c/Users/yakub/stack-prep/.venv/Scripts/python database/load_subtopic_lessons.py --check --file <yaml>
    DATABASE_URL=postgresql://scorepilot:scorepilot@127.0.0.1:55440/scorepilot_int /c/Users/yakub/stack-prep/.venv/Scripts/python database/load_subtopic_lessons.py --file <yaml>

## Report (short)

Each error found and how you fixed it; calculations you re-did (say all were right if so);
overlaps removed; the moment count before and after; and a short list of points only a
human teacher can settle.
