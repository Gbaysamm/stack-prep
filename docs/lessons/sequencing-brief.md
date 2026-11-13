# Brief for a lesson sequencing reviewer

You review ONE subtopic lesson file so the board, the pictures and the voice move together the
way a good teacher teaches: one thing said, then the next; each line written as its own words
are said; each picture brought in as it is explained. Founder, 12 Nov 2026, on Elements and
compounds: the board wrote "Three kinds: element, compound, mixture" and showed the element
and compound pictures while one long moment said "Chemists sort every substance into three
kinds. In an element… In a compound… In a mixture…". A teacher names the three kinds first
and writes them; then explains the element and brings its picture in; then the compound and
its picture; then the mixture and its picture. "You are being too rigid; look at the scenario
before you implement." Read each moment as a scene in a classroom and ask: is the student
looking at what they are hearing, right now?

Repo: c:\Users\yakub\stack-prep (Git Bash: /c/Users/yakub/stack-prep). Do NOT commit or push.
Touch only your lesson file and its own doodles (`docs/lessons/subtopics/<subject>/doodles/
sub_<slug>_*.svg`, shared by a subtopic's split parts: change a doodle only if no other part
uses it in a way your change breaks).

## Read first

`docs/lessons/subtopic-lesson-guide.md` (all of it, especially the rules at the end: "Name the
list, then teach each item in its own moment", "Pictures pop in on their word", "Write a line
on its words"). Then your file, moment by moment, picturing the board at each word. The fixed
example is `docs/lessons/subtopics/chemistry/chem_elements_compounds_mixtures_1.yaml`, moments
1 to 6 (read it; that file's opening is already done).

## What to fix

1. **A moment that does several things at once.** Its say names a list and then explains each
   item, or explains two or three things while pictures for all of them come in: split it into
   moments. The first names the items and writes the list; each item then gets its own moment,
   with its picture, stage or action on that moment's word. Do not split worked examples: a
   "Let us solve this" moment that reads the problem while writing it is fine.
2. **A board line ahead of the voice.** A moment's `write` must be what that moment says,
   written as its words are said (the board writes a line from its first two words in the say).
   A line that summarises what later moments say moves to where it is said, or is reworded to
   match its own moment.
3. **A picture ahead of its explanation.** A doodle, stage or action comes in on the moment and
   the word that explains it. A caption names the whole picture ("three kinds of substance"),
   never a list of pieces that are not on it yet.
4. **Pieces named one by one.** Where a moment names the parts of a picture one after another,
   make them `data-later` parts (label inside the part's `<g>`) and bring each in with
   `{id: …, op: show, part: …, 'on': <word>}` instead of drawing all of it first.

Keep the teaching (facts, numbers, worked steps, order of ideas, wording) as it is; you change
when things happen and split moments, with at most a few words added so each split moment is a
whole sentence. A lesson stays short (about three or four minutes, one main idea).

## When you add or remove moments

Every mark `point: {line: N}` (and `from: {line: N}`) counts moments from 0: renumber every one
that points at or after the place you changed. The checker fails a mark whose `at:` text is not
in its line, which catches a missed renumbering. A moment needs a say; a write is optional when
the moment acts on a picture.

## Check and load

    DATABASE_URL=x /c/Users/yakub/stack-prep/.venv/Scripts/python database/load_subtopic_lessons.py --check --file <yaml>
    DATABASE_URL=postgresql://scorepilot:scorepilot@127.0.0.1:55440/scorepilot_int /c/Users/yakub/stack-prep/.venv/Scripts/python database/load_subtopic_lessons.py --file <yaml>

## Report (short)

Each change as: moment number(s), what happened on the board before, what happens now. Say
"no change needed" if the file already moves like a teacher. Note anything you were unsure of.
