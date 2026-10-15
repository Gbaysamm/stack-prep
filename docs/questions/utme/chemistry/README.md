# UTME Chemistry: how the papers are written up

Source: `source/past-questions-2010-2018.pdf` (toppers.com.ng, 84 pages, papers 2010 to 2018
with printed answer keys) and `source/syllabus.pdf` (the JAMB UTME Chemistry syllabus).

| Year | PDF pages | Printed paper type |
|---|---|---|
| 2010 | 2–11 | A |
| 2011 | 12–21 | B |
| 2012 | 22–31 | Red |
| 2013 | 32–40 | I |
| 2014 | 41–50 | E |
| 2015 | 51–58 | |
| 2016 | 59–66 | |
| 2017 | 67–75 | |
| 2018 | 76–84 | |

(The page ranges are approximate at the edges. A paper's answer key can run onto the next page.)

Each year has two files:

- `retranscribed_YYYY.yaml` holds each question as it should be asked, with its right answer,
  its subtopic and its level.
- `explanations_YYYY.yaml` holds the worked answer and why each wrong option is wrong.

`database/check_chemistry.py` checks both files. Run it until it says OK:

    uv run --frozen python database/check_chemistry.py 2010

## The rules

1. **Copy the questions from the page images, not from the text layer.** Read the PDF pages
   themselves. The text layer loses subscripts, superscripts, arrows and nuclide notation, and
   it mixes the two columns together. `source/pq_flow.txt` is only a typing aid.
2. **Leave out the "Which paper type is given to you" question.** It is usually Q1, and it is
   not a chemistry question. Everything else keeps its printed number.
3. **Self-heal: the answer must be right.**
   - Work every question out yourself. Never copy the printed key.
   - `answer` is the correct option. `printed_key` is what the key printed: a letter, or `null`
     for "No answer", "–" or a missing key.
   - When the two differ, write `key_note` (one line, internal): why `answer` is right.
   - If no option is correct, repair the question at the source:
     - fix the option that was clearly meant to be right (a misprint, a lost subscript or a
       slipped digit), and say what you changed in `corrected`;
     - if the stem itself is broken, repair it the smallest way that makes it a sound
       question, and say so in `corrected`.
   - If a question cannot be repaired honestly (for example, its figure is missing and cannot
     be described), set `drop: true` with a one-line `drop_reason`.
   - The explanation always teaches the right answer. It must **never** say the key, JAMB, the
     paper or the examiner is wrong, and never mention a correction. Students only see the
     right question and the right answer.
4. **Chemistry notation** uses KaTeX with mhchem, between single dollar signs:
   - formulae: `$\ce{H2SO4}$`, `$\ce{CuSO4.5H2O}$`, `$\ce{SO4^2-}$`, `$\ce{Fe^3+}$`
   - equations: `$\ce{N2 + 3H2 <=> 2NH3}$` and `$\ce{CaCO3 ->[heat] CaO + CO2}$`
   - nuclides: `$\ce{^{2}_{1}H}$`, `$\ce{^{235}_{92}U}$`
   - state symbols: `$\ce{NaCl(aq)}$`
   - ΔH: `$\Delta H = -57.3\ \text{kJ mol}^{-1}$`

   Use plain text for names ("calcium trioxonitrate(V)") and for units ("25 cm³", "0.1 mol dm⁻³",
   "2 g", "273 K"), with Unicode superscripts. Bracket relative atomic masses as printed:
   "[Ca = 40, N = 14, O = 16]". Keep IUPAC names as JAMB prints them. Fix plain typos
   ("hydroscopic" becomes "hygroscopic", "AgNO4" becomes "AgNO3") and record each fix in
   `corrected`.
5. **Figures.** Every image embedded in the PDF has been extracted to
   `figures/raw/img-PPP-NNN.jpg`, where PPP is the PDF page.
   - Copy the right one to `figures/YYYY_qNN.jpg` and set `figure: figures/YYYY_qNN.jpg` and
     `figure_alt` (one sentence describing what it shows, for a screen reader).
   - Several questions sharing one diagram each point at the same file, named after the first
     of them. Put the shared instruction ("Use the diagram below to answer questions 32 and
     33") at the start of each stem.
   - Some raw images are not figures (page logos). Ignore those.
   - If a question needs a structure or apparatus the PDF printed only as text, write it in
     mhchem in the stem, or as `figure_svg` (a small hand-drawn SVG with `role="img"` and an
     `aria-label`, as in the Mathematics files).
6. **`subtopic`** is one code from `subtopics.yaml`. Pick the one the question is really
   testing.
7. **`level`**, from 1 to 5, with a short `level_reason`:
   - 1: recall a single fact, name or definition.
   - 2: recognise or apply one idea in one step.
   - 3: one calculation, or reasoning in two steps.
   - 4: a multi-step calculation, or two ideas combined.
   - 5: several ideas together, data or graph interpretation, or a long calculation.

## retranscribed_YYYY.yaml

```yaml
# UTME 2010 Chemistry, written up by hand from source/past-questions-2010-2018.pdf, pages 2-11.
# <one short paragraph: what was repaired, which keys were wrong or missing, what was dropped>
format_version: 1
source:
  file: docs/questions/utme/chemistry/source/past-questions-2010-2018.pdf
  exam_year: 2010
  paper_label: UTME 2010 Chemistry (objective)
  paper_code: UTME-2010-CHEM
  pages: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
  printed_paper_type: A
  transcribed_by: hand
questions:
  - number: 3
    stem: 'Calculate the percentage by mass of nitrogen in calcium trioxonitrate(V), $\ce{Ca(NO3)2}$. [Ca = 40, N = 14, O = 16]'
    options:
      A: '8.5%'
      B: '13.1%'
      C: '17.1%'
      D: '27.6%'
    answer: C
    printed_key: C
    subtopic: CHEM.2.a
    level: 3
    level_reason: one molar-mass calculation
    # optional: corrected, key_note, figure, figure_alt, figure_svg, drop, drop_reason
```

## explanations_YYYY.yaml

```yaml
format_version: 1
exam_year: 2010
subject: CHEM
explanations:
  3:
    answer: C
    steps:
      - 'Percentage by mass of an element = (mass of that element in one mole ÷ molar mass) × 100.'
      - 'Calcium trioxonitrate(V) is $\ce{Ca(NO3)2}$, so one mole holds two nitrogen atoms.'
      - 'Molar mass = 40 + 2(14 + 3 × 16) = 40 + 2 × 62 = 164 g mol⁻¹.'
      - 'Mass of nitrogen = 2 × 14 = 28 g.'
      - '% N = 28 ÷ 164 × 100 = 17.1%.'
      - 'The trap is B, 13.1%. It takes the formula as $\ce{CaNO3}$ and counts only one nitrogen. Calcium is +2 and nitrate is −1, so the formula needs two nitrate groups.'
    hint: 'Write the formula first. How many nitrate groups does Ca²⁺ need?'
    why:
      A: 'Uses the wrong formula mass, or counts a single nitrogen.'
      B: 'Counts one nitrogen, as if the formula were CaNO3.'
      D: 'Divides by the mass of one nitrate group instead of the whole compound.'
```

How to write an explanation. Use the Nigerian classroom method, the way a good chemistry teacher
works on the board:

1. State the rule, law or formula first, in words.
2. Write the balanced equation or the formula needed.
3. Substitute, with units, one step at a time. Show the arithmetic.
4. Give the answer, then check it makes sense.
5. Last, name the tempting wrong option and say why it tempts.

For a fact question, give the fact, the reason behind it, and a way to remember it.

- Use 3 to 7 steps, each one or two sentences.
- `hint` points at the next move without giving the answer.
- `why` gives one line for each wrong option.
- Use plain words and British spelling. Write as if you are speaking to the student. No
  em dashes.

## lessons_YYYY.yaml (the board lesson)

A lesson is taught on the board by a voice, one moment at a time. Read docs/lesson-style-guide.md
sections 1, 2, 4, 7 and 8, and look at docs/questions/utme/mathematics/lessons_2002.yaml for the
shape. The Chemistry version of the Nigerian classroom method:

1. **The question.** Restate what is given and what is asked.
2. **The rule.** Name the law, definition or fact in words, then write it ("Boyle's law:
   $P_1V_1 = P_2V_2$ at constant temperature").
3. **The equation.** Write the balanced equation, with state symbols where they matter. Balance
   it on the board when that is the point.
4. **The working.** Substitute with units, one step per moment. Convert units in a moment of
   their own (cm³ to dm³, °C to K).
5. **The check.** Is the size right, and does the unit make sense?
6. **The answer** moment (`answer: true`) names the option.
7. **`traps`** gives one kind line for each wrong option.

For a fact question, use the same shape: the fact, the reason behind it, a real example from
Nigerian life (kerosene stoves, the refinery at Warri, a borehole, the market), and a way to
remember it.

```yaml
format_version: 1
exam_year: 2010
lessons:
  3:
    moments:
      - section: 'The question'
        say: 'We want the percentage by mass of nitrogen in calcium trioxonitrate five. First we need its formula.'
        write: '% N in calcium trioxonitrate(V) $= ?$  [Ca = 40, N = 14, O = 16]'
      - section: 'The formula'
        say: 'Calcium is plus two and the trioxonitrate ion is minus one, so we need two nitrate groups.'
        write: '$\ce{Ca^2+}$ and $\ce{NO3-}$ give $\ce{Ca(NO3)2}$'
      ...
      - section: 'Answer'
        say: 'So the percentage of nitrogen is seventeen point one percent, which is option C.'
        write: '$\therefore$ % N $= 17.1\%$'
        answer: true
    traps:
      A: '...'
      B: 'You went for thirteen point one percent. That counts one nitrogen, as if the formula were C a N O three. Calcium needs two nitrate groups.'
      D: '...'
```

Rules the checker enforces:

- **Every kept question has a lesson,** with `answer: true` on exactly one moment. That
  moment's `say` names the option letter that matches `answer`.
- **`traps` covers exactly the wrong options.**
- **`say` is heard, not read.**
  - It has no `$`, no `\ce` and no symbols the voice would mangle. Formulae are spelled
    the way a Nigerian teacher says them: "H two S O four", "C a C O three", "N a plus",
    "S O four two minus", "delta H".
  - Units are said in words: "twenty-five centimetres cubed", "mol per decimetre cubed",
    "kilojoules per mole".
  - It has no `:`, `;`, `—`, `–` or ` - `.
  - Say numbers the way they are spoken ("zero point one", "ninety-six thousand five
    hundred coulombs").
  - Each `say` is one or two short sentences.
- **`write` uses mhchem** for formulae and equations, as in the questions. Each lesson has
  6 to 16 moments.
- **Doodles are optional.** Use one only when a picture really helps (particles in a gas, an
  electrolysis cell, a separating funnel). A custom doodle is an SVG at
  `doodles/YYYY_qNN_x.svg` that follows docs/plans/doodles-v2-contract.md and
  database/lesson_doodles.py. Never invent library doodle names.
- **No lesson mentions the key, JAMB, a misprint or a correction.**
