# AI-written questions: the JSON format and the prompt

Questions written by an outside AI (ChatGPT, Gemini, Claude) come into the bank as JSON, into
a subject's **AI-generated set** (Reviewer → subject → Our own sets), never into a past paper.
Every one is checked by a reviewer before any student sees it.

## How to do a batch

1. In the reviewer side, open the subject and its AI-generated set, and press **Import JSON**.
   Copy the **subtopic list** for the subject from there: each subtopic's code, name, what it
   covers, and how many questions it has (the thin ones first).
2. Paste the prompt below into the outside AI, with the subtopic lines you want questions for
   (a few subtopics at a time works best).
3. Paste the AI's JSON into the import panel and press **Check**. Each question comes back as
   passed, or with its exact problem. Fix or drop the problems, then **Import**.
4. The questions wait in the set as **To check** until a reviewer has re-solved and approved
   each one.

## The format

One JSON array of questions:

```json
[
  {
    "subtopic": "CHEM.1.a",
    "stem": "Which of the following is an element?",
    "options": {"A": "Water", "B": "Sodium chloride", "C": "Copper", "D": "Carbon(IV) oxide"},
    "answer": "C",
    "steps": [
      "An element has only one kind of atom.",
      "Copper has only copper atoms, so it is an element.",
      "Water, sodium chloride and carbon(IV) oxide each have two kinds of atom, so they are compounds."
    ],
    "hint": "Look for the substance with only one kind of atom.",
    "why": {
      "A": "Water, H₂O, has hydrogen and oxygen atoms: a compound.",
      "B": "Sodium chloride, NaCl, has sodium and chlorine: a compound.",
      "D": "Carbon(IV) oxide, CO₂, has carbon and oxygen: a compound."
    },
    "level": 1
  }
]
```

| Field | Required | What it is |
|---|---|---|
| `subtopic` | yes | A code from the subject's subtopic list, exactly (`CHEM.1.a`). Any other code is refused. |
| `stem` | yes | The question. Maths in LaTeX between `$…$`; chemistry formulas as `$\ce{H2O}$` or H₂O. |
| `options` | yes | Two to six options, keyed `A`, `B`, `C`, `D` (JAMB uses four). No two the same. |
| `answer` | yes | The key of the one right option. |
| `steps` | yes | The working, one step per line, each step's reason given. |
| `hint` | no | One line that points the way without giving the answer. |
| `why` | yes | For every wrong option: why it is wrong (the likely slip, if a real one leads to it). |
| `level` | no | 1 (recall) to 5 (multi-step, unfamiliar). |
| `figure_svg` | no | A drawing as one `<svg>…</svg>` (viewBox about 320×200, no scripts, no links). |
| `figure_alt` | with a figure | What the drawing shows, in words. |
| `figure_needed` | no | When a picture is needed but not drawn: what it must show. The question is held back until a reviewer adds it. |

## The prompt for the outside AI

Copy everything in the box, then add your subtopic lines at the end.

```
You write multiple-choice questions for Nigerian students preparing for JAMB UTME.

Write {N} new questions for each subtopic listed at the end. Use only those subtopic codes,
exactly as given. Never invent a subtopic or change a code.

Each question:
- tests that subtopic at JAMB level, in the style of real UTME questions, but is new (not
  copied from any past paper);
- has four options A to D, exactly one correct; the wrong options are plausible, each based
  on a real mistake students make;
- uses Nigerian English and Nigerian school conventions (carbon(IV) oxide, ₦ for money,
  SI units);
- has worked steps that a student can follow without gaps, each step with its reason;
- has a reason for each wrong option ("why"), naming the slip only when that slip really
  gives that option;
- has a hint that points the way without giving the answer;
- has a level from 1 (recall) to 5 (multi-step).

If a question needs a diagram, either draw it as a simple SVG in "figure_svg" (with
"figure_alt" describing it) or, if you cannot draw it accurately, describe it in
"figure_needed". Never refer to a figure you have not given or described.

Check each answer yourself by solving the question again before you give it.

Reply with ONLY a JSON array, no other text, in exactly this shape:
[{"subtopic": "...", "stem": "...", "options": {"A": "...", "B": "...", "C": "...", "D": "..."},
  "answer": "A", "steps": ["...", "..."], "hint": "...",
  "why": {"B": "...", "C": "...", "D": "..."}, "level": 2}]

Subtopics:
```

Then paste the subtopic lines, for example:

```
CHEM.1.a  Elements, compounds and mixtures. Covers: … (has 3 questions)
```
