# Brief for a subtopic lesson writer

You are writing ONE subtopic lesson for Stack Prep, a JAMB/UTME exam-prep app for Nigerian
secondary students. The lesson plays on a whiteboard: a voice says each moment's `say` while
its `write` line is handwritten, and an annotated diagram (doodle) grows as it is taught.
After the lesson the student rates their understanding, tries the lesson's 1–2 `problems`,
and can ask the coach.

Repo: c:\Users\yakub\stack-prep (Git Bash: /c/Users/yakub/stack-prep). Do NOT commit or
push. Touch only your own lesson file and its doodles.

## Read first, fully

1. `docs/lessons/subtopic-lesson-guide.md`: the shape and the rules. Follow it exactly.
2. `docs/lessons/sources.md`: the Nigerian sources and the rules for writers.
3. `docs/lesson-style-guide.md`: board rules.
4. The model lesson: `docs/lessons/subtopics/chemistry/chem_elements_compounds_mixtures.yaml`
   and its doodles in `docs/lessons/subtopics/chemistry/doodles/`. Copy its file format.
5. `docs/plans/doodles-v2-contract.md`: the doodle format, as you need it.

Then your subtopic's syllabus scope and real JAMB past questions:

    export DATABASE_URL=postgresql://scorepilot:scorepilot@127.0.0.1:55440/scorepilot_int
    /c/Users/yakub/stack-prep/.venv/Scripts/python database/subtopic_brief.py <subtopic_id>

## The rules that matter most (founder, 11–12 Nov 2026)

- **Shape:** Welcome (title written), Introduction, Objectives, then each term/rule/law one at
  a time (definition or statement written, plain explanation, **worked examples straight
  after**, the diagram acted on), Comparison where there is one, JAMB traps (from the real
  past questions and the WAEC Chief Examiner's named weaknesses), Check yourself (ask, pause,
  work it), Recap.
- **Worked examples:** after each rule, one or two textbook-style problems solved step by
  step on the board ("Let us solve this…"), every step written as it is said. Calculations
  show every step by hand with units kept, rounding only at the end. Theory applied, not
  stories. An everyday Nigerian example may follow but never replaces the worked one.
- **Teach literally:** plain short sentences at secondary-school level, explanatory, never
  complex. No story framing; a comparison at most one line inside an example.
- **Never speak over an empty board:** every moment writes a line or acts on the diagram.
- **Formulas as formulas:** in `say`, Unicode subscripts and superscripts (H₂O, CO₂, SO₄²⁻,
  2³); never "H two O". In `write`, `$\ce{H2O}$` for chemistry and `$...$` for maths.
- **Nigerian conventions:** Roman-numeral names (carbon(IV) oxide, tetraoxosulphate(VI)
  acid, trioxonitrate(V) acid; the older name once in brackets), signed oxidation numbers,
  JAMB's terms and order. Nigerian everyday examples where they fit.
- **Diagram:** one annotated diagram that grows (coloured labels, an arrow from label to
  part, a short note), acted on by circles and pulses on the spoken word. Only where the
  topic has something to draw; a calculation topic may instead use worked steps and a table.
- **problems:** 1–2 short ones on what was taught, each with `ask`, `answer` (as a student
  would type it), `accept` (other right forms), `working` (steps), `needs_working` (true only
  where a photo of the working makes sense).
- **Correct at JAMB level.** Every fact checked. In our own words: nothing copied from WAEC
  reports or textbooks.
- Length: as long as the subtopic needs, typically 35–60 moments.

## Check and load

    DATABASE_URL=x /c/Users/yakub/stack-prep/.venv/Scripts/python database/load_subtopic_lessons.py --check --file <your yaml>

until it passes, then load it:

    DATABASE_URL=postgresql://scorepilot:scorepilot@127.0.0.1:55440/scorepilot_int /c/Users/yakub/stack-prep/.venv/Scripts/python database/load_subtopic_lessons.py --file <your yaml>

## Report (short)

Moment count; the worked examples; the problems; any fact a teacher should double-check; the
check result.
