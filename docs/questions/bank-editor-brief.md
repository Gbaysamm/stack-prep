# Brief for a question-bank lesson language editor

You edit the WORDING of one `lessons_YYYY.yaml` file of past-question lessons so every
spoken line is natural, complete, correct English that a good Nigerian teacher would say,
and every board line reads as a clean note. Each lesson teaches one JAMB past question on
the board: moments (`say` is spoken by the voice, `write` is written on the board as it is
said) and `traps` (spoken to a student who chose that wrong option).

The teaching was already checked: the facts, numbers, answers, working, order and options
stay exactly as they are. You change words, not content. Founder, 12 Nov 2026: "The air, the
water you drink, the salt in your food." is not a sentence; it should be "The air, the water
you drink and the salt in your food are all matter."

Repo: c:\Users\yakub\stack-prep (Git Bash: /c/Users/yakub/stack-prep). Do NOT commit, push,
load into the database, or touch any file but your own lessons file. Edit it in place with
the Edit tool (several lines per edit is fine). Never rewrite the whole file.

## Read first

`docs/lessons/subtopic-lesson-guide.md`, the "Rules" section only. Then read your file from
top to bottom, every `say`, `write` and trap, out loud in your head.

## Fix

1. **Every spoken sentence is complete and correct** (`say` and traps). A list joins its last
   item with "and" (or "or") inside a sentence with a verb. No fragment that leaves the
   listener waiting ("Six grams of magnesium." becomes "We have six grams of magnesium.").
   Short teacher signposts stay as they are: "Check.", "Now the second bracket.", "Let us
   solve this.", "Pause and work it out.". Fix grammar, agreement and missing words.
2. **Natural spoken English,** plain and short, as said aloud: no colons, semicolons or
   dashes joining clauses in `say` or traps (make two sentences, or join with "and", "so",
   "because"); no "i.e." or "e.g." (say "that is", "for example"); no brackets in `say`.
3. **Formulas as they are written, never spelled out.** The voice reads a chemical symbol or
   formula letter by letter by itself ("NaOH" is read "N A O H", "H₂O" is "H 2 O"). So in
   `say` and traps write the formula as one word: "N a O H" becomes "NaOH", "H C O O H"
   becomes "HCOOH", "C O two" or "C O 2" becomes "CO₂", "H two S O four" becomes "H₂SO₄".
   Element and compound NAMES stay words ("sodium hydroxide"). Numbers, units and maths
   that are already said in words stay in words ("one hundred degrees Celsius", "x squared",
   "zero point two five mole"): do not turn them into digits or symbols.
4. **Board lines** (`write`) start with a capital letter when they start with an ordinary
   word ("moles = …" becomes "Moles = …", "distil, so…" becomes "Distil, so…"). Leave alone
   a line that starts with maths, a symbol, a variable, a number, a unit or an abbreviation
   ("x = 4", "pH", "b.p.", "e.g.", "$…$", "∴", "mol"). Do not change any LaTeX (`$…$`,
   `\ce{…}`), symbols or numbers in a write. Do not make a write longer.
5. **No restating.** If a `say` repeats, word for word, the sentence before it, trim the
   repeat. Do not remove meaning.

Most lines are already fine: leave them exactly as they are. Do not polish for style. Do not
add teaching, jokes or new sentences of content. Keep each line about as long as it was.

## Keep (the checker fails otherwise)

- **Cue words.** Where a moment or one of its marks, doodles or actions has `on: <word>` (or
  `'on': …`), that word or phrase must still appear in that moment's `say`, the same number of
  times. Reword around it, never drop it.
- **Mark targets.** A mark's `at: '<text>'` with `line: N` points at the `write` of moment N
  (counted from 0). That text must still appear in that line. Be careful when editing a
  `write` that a later mark points at: leave the quoted part untouched.
- Everything that is not a `say`, `write` or trap stays byte for byte: sections, answer
  flags, doodles, diagrams, points, mouths, sketches, the order and number of moments.
- YAML quoting: lines are single-quoted, and a single quote inside is doubled (`Avogadro''s`).

## Check

    cd /c/Users/yakub/stack-prep && .venv/Scripts/python database/check_lesson_edit.py <your file>

Run it after your edits (and fix anything it reports) until it prints `ok`.

## Report (short)

The number of lines changed, the kinds of fix (counts), five representative before → after
examples, and any place you were unsure the meaning stayed the same or saw a factual error
(do not fix facts; report them with the question number).
