# Mathematics lessons: content review

*Prepared 1 October 2026 for the founder and the external content expert. A read-only review: no
lesson, code or content file was changed.*

**How to read this.**
- **Part A** (§1–4) is the core. It asks whether our lessons teach each topic the way a Nigerian
  classroom does, and how to fix them where they don't.
- **Part B** (§5–7) measures how hard the lessons are to follow.
- **Part C** (§8–9) is the rewrite plan and the open questions for the expert.

**Where "the Nigerian method" comes from.**
- Three research notes in [nigerian-methods/](nigerian-methods/) set out the Nigerian method:
  - [geometry and trigonometry](nigerian-methods/geometry-and-trigonometry.md);
  - [calculus and statistics](nigerian-methods/calculus-and-statistics.md);
  - [number and algebra](nigerian-methods/number-and-algebra.md).
- Those notes draw on Nigerian lesson notes, WAEC marking schemes and Chief Examiner reports,
  past-question solutions, and the texts the JAMB syllabus recommends:
  - Channon & Smith, *New General Mathematics*;
  - Adelodun, *Distinction in Mathematics*;
  - Anyebe, *Basic Mathematics*;
  - David-Osuagwu, *New School Mathematics*;
  - *Further Mathematics Project*;
  - *Pass at Once JAMB*.
- All three notes were checked against this report's standard methods. The places where the
  number-and-algebra note added detail are folded in (bases arithmetic, ε and A′, ratio wording).

---

## Executive summary

**1. The main finding: our Maths lessons are correct, but in many places they do not teach the
Nigerian classroom method.**
- A Nigerian student is trained to write each answer in a fixed exercise-book layout:
  - the formula first;
  - "Let x be…";
  - the index numbers over the digits;
  - the division ladder;
  - "Product = …, Sum = …";
  - "y ∝ x ⇒ y = kx";
  - the reason in brackets beside every angle;
  - an x | f | fx table;
  - "∴".
- Our lessons usually reach the same answer another way: by reasoning in words, a picture, a
  shortcut or mental arithmetic. The board therefore does not look like what the student must
  write in the exam. That gap, more than the speed, is likely why the lessons "feel difficult".
- The founder's example is real and typical. In number bases:
  - **only 1 of 22** base-n → base-ten conversions writes the powers (2 × 5² + 4 × 5¹ + 1 × 5⁰);
  - **none** writes the index numbers above the digits;
  - **none** sets out the repeated division as the ladder;
  - **23 lessons** lean on "bundles of sticks" or "blocks" instead.

**2. How widespread it is.** About 750 of the 1,043 lessons were read against the Nigerian
method.
- **About 45% have at least one clear departure.** That is 37% if the geometry layout issue in
  the next list is left out.
- A whole-corpus scan finds the same gaps everywhere:

| Nigerian habit | How often our lessons do it |
|---|---|
| "∴" written on the board | **0 of 1,043** lessons |
| "Let x be…" | 34 lessons |
| BODMAS named | **0** |
| Quadratics: "Product = ac, Sum = b" written | **1 of 54** lessons that factorise this way |
| Variation: "∝" written before "= k…" | 7 of 18 |
| Geometry: the reason in brackets beside the angle step | **5 of 115** angle lessons |
| Statistics: an x \| f \| fx (or deviation) table on the board | **2 of 24** frequency-table lessons |
| Set surveys: "Let n(A ∩ B) = x" and the Venn equation | **0 of 8** |
| Number bases: powers written in the expansion | **1 of 22** |
| Number bases: repeated-division ladder | **0 of 9** |
| Mensuration: the general formula in symbols before the numbers | 42 of 78 |
| SOH CAH TOA named | 13 of 59 trigonometry lessons |
| Probability: "favourable outcomes / total possible outcomes" | 25 of 40 |

**3. The six kinds of departure,** with the topics where each matters most:

| Kind | Where it matters most | Examples |
|---|---|---|
| **A different method from the textbook's** | application of differentiation, sets, bases, circle geometry, bearings, ratio, profit and loss, loci | max/min by −b/2a instead of dy/dx = 0 (7 lessons); set surveys by "counted twice" instead of x; "find the base" by column reasoning instead of a polynomial in b; arcs instead of angle theorems (1995 Q27, 1999 Q32, 2004 Q26); bearings by east/north components (2000 Q26); ratio by "1 part = …" instead of "total parts = 9, share = 4/9 × total"; profit by "0.95 × cost" instead of C.P. = 100/95 × S.P.; loci proved instead of named and constructed |
| **A picture doing the work** | bases, product rule, pie charts, simultaneous equations | sticks and bundles; the product rule as rectangle strips with "u dash"; pie charts by "each coin is 20°"; tiles instead of "Let 1/x = a" (1997 Q12) |
| **Missing exam layout** | everywhere | no ∴; no Product/Sum line; no "Either … = 0 or … = 0"; no numbered equations (1), (2); no tables; no reasons in brackets; formulas written after the numbers |
| **Non-Nigerian wording** | sets, probability, matrices, everywhere | "E for everyone" and "the U sign"; "chance"; "seats" for matrix elements; "lots of"; "u dash"; "order of operations" for BODMAS |
| **Unusual order** | progressions, probability, statistics | the picture or answer first and the formula last, "as a check" |
| **Template slips** | loci, geometry, sets | "Let me draw a diagram of the circle first" in 36 lessons, many with no circle |

**4. Not everything is off-method.**
- Coordinate geometry, matrices, progressions, indices/logs/surds and most of integration already
  follow the Nigerian layout closely.
- Many lessons add things a classroom rarely gives: a check after every answer, an explanation
  of every wrong option, and "why" moments ("gain is measured against the cost", "don't divide
  by p or you lose a root"). These should stay.

**5. The 16 model lessons** (11 Maths) made the lessons slower and clearer, but **moved some
further from the Nigerian method.**
- **1994 Q7 and 2003 Q9 (sets)** build the answer on "counted twice" reasoning. They call the
  universal set "E, for everyone" and the union "the U sign", and bring in the formula only after
  the answer. A Nigerian student writes "Let n(M ∩ P) = x" and solves a Venn equation.
- **1997 Q28 (arc)** never writes L = θ/360 × 2πr; a cake slice carries the method.
- **1994 Q19 (AP)** derives T₆ from a staircase before writing Tₙ = a + (n − 1)d.
- **2003 Q43 (probability)** has the right method, but says "chance", "balls you want" and
  "and rule" where the board should read P(E) = n(E)/n(S) and P(A and B) = P(A) × P(B).
- **1989 Q44, 1989 Q8, 2002 Q11 and 1983 Q50** largely follow the classroom method.

**6. What to do: the Nigerian exercise-book method becomes the backbone of every lesson.**
- The board shows exactly what a student should write, in the order they would write it:
  1. "Solution";
  2. sketch or table;
  3. "Let …";
  4. formula;
  5. substitute;
  6. simplify;
  7. "∴ …";
  8. check.
- The voice reads it the way a Nigerian teacher would.
- Pictures and doodles stay, but only beside a written step, to explain *why* it works, never
  in place of it.
- Shortcuts (option testing, −b/2a, "counted twice") appear only after the standard method, as a
  check or "exam tip".
- §3 gives the standard method, our departures (with year, question and moment) and a model
  outline for every topic. §2 gives a full number-bases example.

**7. Priority.**
- First fix the topics where the method itself differs and UTME asks often:
  - number and algebra: bases, fractions, ratio and percentages, polynomials and quadratics,
    variation;
  - sets;
  - statistics: mean, median, dispersion and probability;
  - circle geometry and bearings;
  - application of differentiation.
- Then the layout-only topics.
- One cross-cutting change will fix a large share of all lessons at once: add ∴, "Let x be",
  formula-before-numbers, reasons in brackets and the standard tables to the lesson-writing
  standard.
- Estimated effort is about **500–650 reviewer hours** for a full rewrite, plus 4–6 weeks to
  agree the 23 topic templates with the expert (§8).

**8. Secondary findings (Part B).**
- Lessons are uniform in length (9–16 moments, about 2 minutes), whatever the difficulty.
- They often do two steps in one breath (81% of lessons) and use rules or terms before naming
  them (about half).
- Pictures are often not referred to by the voice.
- These still matter, but writing the standard method line by line fixes many of them as a side
  effect.

---

# Part A. Method alignment

## 1. What "the Nigerian method" means on the board

These habits run through every topic. They came up in nearly every Nigerian source, and WAEC
Chief Examiners repeat several of them every year.

| Habit | What the student writes | What our lessons do |
|---|---|---|
| A worked answer opens with **"Solution"** and a **sketch or table** with the givens on it | "Solution", then a sketch, then the given values | The sketch is often decorative ("Let me draw a diagram, so we can see…"), and tables are almost never drawn |
| **Givens listed** | "P = ₦800, R = 12½%, T = ?"; "a = 1, d = ?, n = 6"; "r = 21 cm, θ = 60°, π = 22/7" | Often only spoken |
| **"Let x be …"** for the unknown | "Let the number of students offering both be x" | Rare (34 lessons) |
| **The formula first**, then substitute, then simplify, each on its own line | "L = θ/360 × 2πr", "= 60/360 × 2 × 22/7 × 21", "= 22 cm" | Often the numbers come first and the formula later "as a check" |
| **Standard abbreviations and symbols** | ∴, ∝, C.P., S.P., L.C.M., H.C.F., ε (or U), n(A), A′, \|AB\|, ∠ABC, △ABC \|\|\| △PQR, Σ, x̄, cf, P(E), n(S) | ∴ never; C.P./S.P. never; "E" for the universal set; "chance" for probability |
| **Reasons in brackets** on geometry lines | "∠PQS = 50° (base ∠s of isos. △)" | A separate "The rule:" moment before the step, or none |
| **Named procedures** | BODMAS; SOH CAH TOA; CAST; "Product = …, Sum = …"; "equate indices"; "change to index form"; "expand along the first row"; "At turning point, dy/dx = 0" | Often described in our own words instead |
| **Tables for any data question** | x \| f \| fx \| cf; Class \| class mark \| f \| fx; the deviation table; Item \| Amount \| Sectoral angle; the 6 × 6 dice table | Loose lines of arithmetic |
| **Numbered equations** | "… (1)", "… (2)", "(2) − (1):" | Sometimes |
| **Vertical arithmetic** | long multiplication and long division, the division ladder (for bases, LCM/HCF and prime factors) | Mental splits ("16324 × 40 + 16324 × 3") and "try 250" |
| **Answer with units and accuracy, then ∴** | "∴ minor arc = 22 cm"; bearings as three figures, "085°" | Usually "So the answer is…" |
| **How numbers and symbols are read** | "one-zero-one base two"; "x such that…"; "A union B"; "A complement"; "the probability of E" | "one thousand in base 2"; the colon not read; "the U sign"; "the chance" |

**Pictures in the Nigerian classroom.**
- Teachers do use pictures: the Venn diagram, sketches with North lines, the ladder against a
  wall, the bag of balls.
- But the picture is part of the written answer, or a short aid to understanding *before* the
  procedure. It never replaces it.
- Our doodles (sticks, cakes, jars, taps, machines, seats, tiles) are welcome as support,
  provided the standard written line is on the board in the same moment.

---

## 2. Number bases: the founder's example, in full

### 2.1 The standard Nigerian method

**Base n → base ten (expansion with powers).**
1. Write the **index numbers above the digits**, starting from 0 at the right: ³ ² ¹ ⁰.
2. Multiply each digit by the base raised to its index, and add:
   1011₂ = 1 × 2³ + 0 × 2² + 1 × 2¹ + 1 × 2⁰.
3. Work out each power: = 1 × 8 + 0 × 4 + 1 × 2 + 1 × 1.
4. Add: = 8 + 0 + 2 + 1 = 11₁₀.

**Base ten → base n (repeated division).** Divide by the base again and again. Write each
remainder (R) beside the line. Stop at 0. Read the remainders **from the bottom up**.

```
   8 | 71
   8 |  8   R 7   ↑
   8 |  1   R 0   ↑
     |  0   R 1   ↑      ∴ 71₁₀ = 107₈
```

**Base n → base m.** Go through base ten: expand first, then divide.

**Arithmetic in base n.**
- Work column by column, in the base.
- Addition: "4 + 3 = 7 = 1 × 5 + 2: write 2, carry 1".
- Subtraction: "borrow 1, which is worth 5".
- Multiplication: work directly in the base (turn each product into the base, carry the quotient). WAEC's Chief Examiner criticises candidates who convert to base ten when the question is set in a base, so converting is the fallback, not the method. When subtracting an expanded number, keep it in a bracket: −(1 × 5 + 4), not −5 + 4.
- Modulo tables: give the answer as a truth set, e.g. {9}, when asked.

**"Find the base" questions.**
- Expand both sides as polynomials in the unknown base, then solve:
  - 263_b + 441_b = 714_b
  - ⇒ (2b² + 6b + 3) + (4b² + 4b + 1) = 7b² + b + 4
  - ⇒ b² − 9b = 0
  - ⇒ b = 9.
- Reject any base not bigger than the largest digit.

**Wording.** Read numerals digit by digit with the base: "one-zero-seven base eight", "two-four-one
base five". Never "one hundred and seven". Say "base ten" or "denary".

### 2.2 Where our lessons depart (all 11 lessons in the topic, plus 3 base questions filed elsewhere)

| Lesson | Moment | What it does | Kind | What the Nigerian method writes |
|---|---|---|---|---|
| 1987 Q1 (241₅ → base 8) | 0, 4, 5 | "Picture it as bundles of sticks… Count the sticks in each kind of bundle… Loosen every bundle" | picture doing the work | Index numbers over 2 4 1, then 2 × 5² + 4 × 5¹ + 1 × 5⁰ |
| 1987 Q1 | 2–3 | "Place values in base 5: 25, 5, 1" and "2 × 25 + 4 × 5 + 1 × 1" | missing layout | Powers 5², 5¹, 5⁰ written, then evaluated |
| 1987 Q1 | 7–10 | Division as three separate sentences ("71 ÷ 8 = 8 remainder 7") | missing layout | The division ladder, remainders read upward |
| 1993 Q1 (71₁₀ → base 8) | 1, 3, 4 | "Picture 71 sticks that we tie up in groups of 8… the eight bundles tie together" | picture doing the work | The division ladder |
| 1993 Q1 | 8 | Check: "places worth 64, 8 and 1… like the three columns of sticks" | missing layout | 1 × 8² + 0 × 8¹ + 7 × 8⁰ |
| 1984 Q12 (base-5 trader) | 2, 4, 5 | "1(25) + 0(5) + 3(1)… The crate holds the twenty-five" | missing layout / picture | 1 × 5² + 0 × 5¹ + 3 × 5⁰ |
| 1984 Q12 | 8–11 | Division as four sentences | missing layout | The ladder |
| 1985 Q3 (equation in base 2) | 0 | Reads 11, 1000, 101 as "11 over x equals 1000 over x plus 101" (voiced as eleven, one thousand…) | wording | "one-one", "one-zero-zero-zero", "one-zero-one base two" |
| 1985 Q3 | 1–4 | "count the sticks… One bundle of 8 sticks… A bundle of 4 and one stick" | picture doing the work | 1 × 2³ + 0 × 2² + 0 × 2¹ + 0 × 2⁰ = 8 |
| 1985 Q3 | 11 | Converts 3 back with "one 2 plus one 1" | missing layout | The ladder: 2 \| 3, 2 \| 1 R 1, 0 R 1 → 11₂ |
| 1984 Q2 (which base?) | 3–5 | Counters doodle: "Loop one full base of counters… 10 = b + 1" | different method | Expand: 2b² + 6b + 3 + 4b² + 4b + 1 = 7b² + b + 4 ⇒ b² − 9b = 0 ⇒ b = 9 |
| 1984 Q2 | 7–10 | Check by "2(81) + 6(9) + 3" | missing layout | 2 × 9² + 6 × 9¹ + 3 × 9⁰ |
| 1991 Q2 (find n) | 0, 2 | "Picture base n as sticks… untie a bundle" | picture doing the work | Expand as an equation in n, or the column rule written as "borrow n" |
| 1991 Q2 | 6–13 | Place values "512, 64, 8 and 1" listed; powers never written | missing layout | 7 × 8³ + 0 × 8² + 5 × 8¹ + 6 × 8⁰ |
| 2003 Q3 (213₄ × 23₄) | 3 | "Picture them as blocks: the digits count the blocks" | picture doing the work | 2 × 4² + 1 × 4¹ + 3 × 4⁰ |
| 2003 Q3 | 8–12 | Converts 429 back by subtracting the largest place values (256, 64, 16, …) | different method | The ladder: 4 \| 429 → remainders 1, 3, 2, 2, 1, read upward 12231₄ |
| 2004 Q1 (base-5 subtraction) | 0–9 | The sum written across one line ("4243₅ − 13x4₅ = y344₅"); "untying one bundle of 5 sticks" | missing layout / picture | The subtraction set out in columns, with borrow marks above each column |
| 2004 Q1 | 10–13 | Check by base-ten conversion with "4(125) + 2(25)…" | missing layout | Powers written; or add back in base 5 |
| 2004 Q2 (451₆ − p₇ = 305₆) | 2, 10–12 | "4 squares of 36, 5 rods of 6"; 62 → base 7 by "how many 49s fit" | picture / different method | Expansion with powers; the ladder for 62 → base 7 |
| 2004 Q2 | trap A | "The first division, by 49, gives the leftmost digit" | wording that contradicts the classroom rule | In the ladder the first remainder is the *rightmost* digit; read from the bottom |
| 2003 Q6 (filed under location) | 3, 8–10 | "bundles of sticks"; converting back by subtracting place values | picture / different method | Index numbers, expansion, the ladder |
| 1994 Q23 (modulo table) | 4 | "a clock with ten hours" | — | Fine: the clock is the standard picture for modular arithmetic |

**Count:** 10 of the 11 lessons depart; only the modulo lesson follows the method. Across all
base-related lessons, sticks, bundles or blocks appear in 23.

### 2.3 How number-base lessons should be built

- **Backbone:** the index numbers, the expansion with powers, and the division ladder. These are
  written exactly as in an exercise book.
- **Voice:** reads numerals digit by digit, and says "index", "base", "remainder", "read from
  the bottom up".
- **Pictures:** the bundles picture may appear **once**, beside the ladder, to show *why* the
  remainders give the digits ("the remainder is what's left over after grouping in eights").
  It is never the method.
- **Checks:** convert back with the expansion.
- **Board tools needed:**
  - Index numbers can already be written above digits with `\overset{2}{2}\,\overset{1}{4}\,\overset{0}{1}_5`.
  - The ladder needs either a small new board layout (divisor | number | remainder, with an
    upward arrow), or the live `table` diagram with three columns.

### 2.4 Full example: 1987 Q1, "Convert 241₅ to base 8"

| # | Section | Board (as the student writes it) | Voice |
|---|---|---|---|
| 0 | The question | Convert 241₅ to base 8. | "Two-four-one base five, to base eight. There is no direct road from base five to base eight, so we go through base ten." |
| 1 | | Solution | "First, change two-four-one base five to base ten." |
| 2 | Step 1: base 5 → base 10 | ²  ¹  ⁰ written over 2  4  1₅ | "Write the index numbers over the digits, starting from nought on the right: nought, one, two." |
| 3 | | 241₅ = 2 × 5² + 4 × 5¹ + 1 × 5⁰ | "Each digit times five to the power of its index: two times five squared, plus four times five to the power one, plus one times five to the power nought." |
| 4 | | = 2 × 25 + 4 × 5 + 1 × 1 | "Five squared is 25. Five to the power one is 5. Anything to the power nought is 1." |
| 5 | | = 50 + 20 + 1 | "2 times 25 is 50. 4 times 5 is 20. 1 times 1 is 1." |
| 6 | | = 71₁₀ | "50 plus 20 plus 1 is 71, base ten." |
| 7 | Step 2: base 10 → base 8 | 8 \| 71 | "Now divide 71 by 8 again and again, and write the remainders by the side." |
| 8 | | 8 \| 8  R 7 | "71 divided by 8 is 8, remainder 7." *(Optional picture: 71 sticks in bundles of 8, with 7 left over: "the remainder is what is left after making bundles of eight".)* |
| 9 | | 8 \| 1  R 0 | "8 divided by 8 is 1, remainder 0." |
| 10 | | \| 0  R 1 | "1 divided by 8 is 0, remainder 1. We stop at 0." |
| 11 | | ↑ arrow beside the remainders; 71₁₀ = 107₈ | "Read the remainders from the bottom up: one, zero, seven. So 71 is one-zero-seven base eight." |
| 12 | Check | ²  ¹  ⁰ over 1  0  7₈ = 1 × 8² + 0 × 8¹ + 7 × 8⁰ | "Check by expanding back. Index numbers over the digits again." |
| 13 | | = 64 + 0 + 7 = 71 ✓ | "64 plus 0 plus 7 is 71. It agrees." |
| 14 | Answer | ∴ 241₅ = 107₈  (B) | "Therefore two-four-one base five is one-zero-seven base eight: option B." |

**Traps, in the same language:**
- A, 71₈: "71 is the base-ten value. You stopped halfway: divide by 8 and read the remainders."
- C, 176₈: "You read the remainders from the top down, or slipped in the division. Read from the
  bottom up."
- D, 241₈: "You changed only the label. The digits change when the base changes."

That is 15 moments, each with one written line, and every line is one a student would copy.

**The same backbone for the other question types:**
- **"Which base?"** (1984 Q2):
  1. "Let the base be b."
  2. Index numbers over each numeral.
  3. Expand each side.
  4. Collect into b² − 9b = 0.
  5. b(b − 9) = 0.
  6. "b = 0 or b = 9; a base must be bigger than the largest digit, 7"
  7. ∴ b = 9.

  The column-carry idea can follow as an "exam tip".
- **Arithmetic in base n** (2004 Q1):
  - Set the subtraction out in columns.
  - Above each column, write the borrowed value ("5 + 3 = 8; 8 − 4 = 4").
  - Explain each borrow in the voice: "borrow one five".
  - Check by adding back in base 5.

---

## 3. Topic by topic: the standard method, our departures, and the fix

For each topic:
- **Standard** is the Nigerian method: its layout, wording and order.
- **Departures** gives our lessons that differ, as year Q and moment, with the kind of departure.
- **Fix** is what to change.
- **Outline** is one model lesson, as board lines.

"Read" is how many on-topic lessons were checked. Moments are numbered from 0, as in the lesson
file.

### Summary table

| Topic | Read | Depart | Main departure |
|---|---|---|---|
| Number bases | 11 (+3 filed elsewhere) | 10 | sticks and blocks replace index-number expansion and the division ladder |
| Fractions, decimals, approximation, percentages | 71 | 31 | BODMAS never named; no "LCM ="; ratio by "1 part"; profit by decimal multipliers; I = PRT/100 written then bypassed; mental arithmetic instead of vertical working |
| Indices, logs, surds | 74 | 15 | "without tables" logs recalled instead of "Let log₄2 = y ⇒ 4ʸ = 2"; multiplying out before factorising |
| Sets | 20 | 11 | no "Let n(A ∩ B) = x" Venn equation; "E for everyone"; "the U sign"; set-builder not read as "such that" |
| Polynomials | 55 | 22 | no "Product = ac, Sum = b" line; no "Either … or …"; synthetic or spoken division instead of long division; equations not numbered |
| Variation | 16 | 11 | "∝" not written; a, b instead of k₁, k₂; metaphors carried through the working |
| Inequalities | 12 | 11 | answer never shown on a number line; no sign table for quadratic inequalities |
| Progressions | 33 | 5 | formula after the picture; sums added term by term instead of Sₙ |
| Binary operations | 13 | 5 | identity found from one trial value; inverse not written a⁻¹ |
| Matrices and determinants | 22 | 4 (+16 wording) | 3 × 3 determinants not expanded along the first row; "seats" for elements |
| Euclidean geometry | 74 | 72 layout / 12 method | no reasons in brackets; arc and secant methods instead of angle theorems |
| Mensuration | 61 | 19 | formula never written in one line; non-textbook shortcuts |
| Loci | 20 | 10 | standard loci proved instead of named and constructed; "diagram of the circle" with no circle |
| Coordinate geometry | 14 | 5 (1 method) | close to the Nigerian method; "change in x" wording |
| Trigonometry | 44 | 15 | bearings by components without North lines; "tan repeats every 180°" instead of CAST |
| Differentiation | 21 | 8 | product rule as rectangle strips with "u dash"; chain rule without "Let u = …" |
| Application of differentiation | 17 | 10 | max/min by −b/2a or completing the square instead of dy/dx = 0 and d²y/dx² |
| Integration | 13 | 5 | ready-made (ax + b)ⁿ formula or "think backwards" instead of substitution; "+ c" missing from the rule |
| Representation of data | 36 | 8 | pie charts by a "unit value" instead of a sectoral-angle table |
| Measures of location | 46 | 19 | no x \| f \| fx \| cf table; median by counting, with no (n + 1)/2 or N/2 |
| Measures of dispersion | 25 | 14 | no deviation table; formula written after the working |
| Permutation and combination | 10 | 5 (mild) | complement route first; general formula not written |
| Probability | 38 | 17 | "chance"; "balls you want"; no 6 × 6 sample-space table; formula after counting |
| **Total** | **about 750** | **333 (45%)** | |

### 3.1 Fractions, decimals, approximation, percentages (including ratio, profit and loss, interest)

**Standard.**
- **Fractions.** Name **BODMAS**. Turn mixed numbers into improper fractions. Write "LCM of 3, 6, 5
  = 30". Divide by multiplying by the reciprocal.
- **Arithmetic.** Use vertical long multiplication and long division. Clear decimals and
  **cancel first**.
- **Approximation.** "Correct to 2 s.f.": mark the cut, "next digit 5 or more, add 1".
  Standard form is A × 10ⁿ with 1 ≤ A < 10.
- **Percentages.** "x/100 × quantity"; percentage change = change/original × 100%.
- **Profit and loss.** "Profit % = profit/C.P. × 100%"; C.P. = 100/(100 + gain%) × S.P.
- **Ratio.** "Sum of ratio = 9; share = 4/9 × total".
- **Simple interest.** I = PRT/100 written, then substituted; A = P + I.
- **Compound interest.** A = P(1 + R/100)ⁿ, or a year-by-year table.

**Departures.**
- **BODMAS never named.** 1991 Q1 m1 ("the order of operations"), 1988 Q1 m1, 2001 Q3 m1.
- **No "LCM =" line.** 1984 Q1 m1, 1986 Q5 m2, 1994 Q1 m1 ("picture one bar of chocolate cut
  into 20"), 1985 Q6 m9, 2003 Q1 m8, 2004 Q3 m4.
- **Ratio by "1 part = …" (the unitary method), not "total parts, then each share as a fraction of the total".** Saying "total parts" is fine; the research note uses it. 1983 Q2 m1–6, 1986 Q10 m1–6, 1987 Q7 m4–7, 1988
  Q5 m5–7. 1989 Q7 m1–2 "picks numbers".
- **Profit and loss.**
  - 1984 Q4 m1–8 ("0.95 × Q's cost = 209"), 1987 Q10 m1–7 ("1.08C = 1.35"), 2002 Q1 m3–6.
    Write C.P. = 100/95 × 209.
  - 1999 Q3 and 2003 Q4 never say C.P. or S.P.
- **Interest formula written then bypassed.** 1985 Q2 m2–5 ("I = 4 × 8% = 32% of P", "1.32P =
  330"), 2001 Q1 m2–7. The formula comes only as a check in 1991 Q6 m6 and 2000 Q2 m9.
- **Mental arithmetic in place of vertical working.**
  - 1983 Q9 m5, 1983 Q30 m5–6, 1990 Q3 m6, 2001 Q3 m2–4, 2002 Q5 m3–8.
  - "Try 8" or "try 250": 1988 Q4 m3–6, 1987 Q9 m8–9, 1985 Q2 m8–9.
  - The division is stated, not done: 1994 Q2 m9, 1986 Q8 m11, 2000 Q5 m7.
  - Not cancelling first: 1994 Q2, 2001 Q4.
- **Wording.** "lots of" (13 times, e.g. 1983 Q31 m7, 1995 Q4 m8). "0.05 × 20,000" in place of
  "5/100 × 20,000" (1991 Q5).

**Keep.** Rounding with a marked cut and a stated rule (1987 Q4, 1989 Q6), standard-form lessons
(1983 Q9, 1986 Q8), the "measure against the cost" and "of the remainder" explanations, trap
explanations, and checks. 1986 Q9, 1990 Q4, 1997 Q8 and 2001 Q2 are already model layouts.

**Outline: 1985 Q2** (₦330 after 4 years at 8% simple interest; find P).

| # | Board |
|---|---|
| 0 | Solution. A = ₦330, R = 8%, T = 4 years, P = ? |
| 1 | A = P + I |
| 2 | I = PRT/100 |
| 3 | I = (P × 8 × 4)/100 = 32P/100 = 8P/25 |
| 4 | ∴ P + 8P/25 = 330 |
| 5 | (25P + 8P)/25 = 330  [LCM = 25] |
| 6 | 33P = 330 × 25 |
| 7 | P = (330 × 25)/33 = 250 |
| 8 | Check: I = (250 × 8 × 4)/100 = ₦80; A = 250 + 80 = ₦330 ✓ |
| 9 | ∴ P = ₦250.00 |

A picture of a jar with four equal interest slices may sit beside line 3.

### 3.2 Indices, logarithms, surds

**Standard.**
- **Indices.** State the laws of indices (aᵐ × aⁿ = aᵐ⁺ⁿ, …). "Express as the same base", then
  "equate the indices". A negative index means a reciprocal. For aᵐ⁄ⁿ, take the root first, then
  the power.
- **Logs.** "Let log₄2 = y ⇒ 4ʸ = 2" (change to index form). Use the laws of logarithms. For
  "without tables" questions, use exact powers. For older questions, use four-figure tables
  (characteristic and mantissa).
- **Surds.** Use a perfect-square factor (√50 = √(25 × 2) = 5√2). Rationalise by multiplying by
  the conjugate.

**Departures.** This is the topic closest to the Nigerian method: laws are written before use, and
"equate the indices" and "index form" are already used. The departures are:
- **"Without tables" logs recalled or counted, not derived.**
  - 1985 Q8 m3–6 ("4^½ = 2, so log₄2 = ½").
  - 1999 Q8 m6–8 ("2 is one of the three equal steps that build 8").
  - 2003 Q7 m2–7 counts tiles, though m8–11 of the same lesson do it properly.
- **Multiplying out before factorising.** 1987 Q15 m2–9 (√2352), 1990 Q10 m7–10 (46,656), 1999 Q7
  m6–8.
- **Pictures leading.**
  - 1984 Q14 m1–7 ("picture 3ⁿ⁻¹ as one block, B") cites no law.
  - 1992 Q3 m6–9's "tower split into thinner b's" confuses more than it helps.
- **Wording.** "match the powers" (1983 Q32 m8). "match the whole numbers and the root-3 parts"
  (1988 Q10 m9) should be "equate rational and irrational parts". "lots of" appears 5 times.
- **Gap.** No lesson anywhere teaches four-figure log tables. Some 1983–1990 questions may expect
  them; the expert should decide.

**Keep.** Laws written before use (1986 Q15, 2003 Q11, 2004 Q6). "Let u = 3ʸ" with the negative
root rejected (1985 Q18). "Why we rationalise" (1994 Q6 m7). The area pictures for (√a)² = a.

**Outline: 1985 Q8** (log₂4 + log₄2 − log₂₅5).

| # | Board |
|---|---|
| 0 | Solution |
| 1 | Let log₂4 = x ⇒ 2ˣ = 4 = 2² ∴ x = 2 |
| 2 | Let log₄2 = y ⇒ 4ʸ = 2 |
| 3 | (2²)ʸ = 2¹ ⇒ 2²ʸ = 2¹  [(aᵐ)ⁿ = aᵐⁿ] |
| 4 | 2y = 1 ∴ y = ½ (equating indices) |
| 5 | Let log₂₅5 = z ⇒ (5²)ᶻ = 5¹ ⇒ 2z = 1 ∴ z = ½ |
| 6 | ∴ log₂4 + log₄2 − log₂₅5 = 2 + ½ − ½ |
| 7 | = 2 |

### 3.3 Sets

**Standard.**
- **Notation.** ε (or U) is the universal set; older texts and WAEC often use ε. The complement is written A′, not Aᶜ. Write n(A), A ∪ B ("A union B"), A ∩ B ("A
  intersection B"), A′ ("A complement"), and ∅ or { }. Read {x : …} as "the set of x such that…".
- **Two-set survey.**
  1. List the givens with n( ).
  2. "Let n(A ∩ B) = x".
  3. Label the Venn regions 32 − x, x, 24 − x, and 4 outside.
  4. Write the equation "(32 − x) + x + (24 − x) + 4 = 40", then solve.
  5. Or use n(A ∪ B) = n(A) + n(B) − n(A ∩ B).
- **Three sets.** Put x (or the given number) in the centre and fill outwards.

**Departures.**
- **1994 Q7 (model).**
  - m1 says "We call the whole class E, for everyone".
  - m6–8 build the answer on "counted twice", with no x.
  - m10 says "The U sign, union…", and the formula comes only after the answer.
  - The Venn regions are never labelled with expressions.
- **2003 Q9 (model).** The same: m1 "E", m8 "written with a U sign", m9–11 "counted twice", m13
  the rule after the answer.
- **1999 Q9 (model).** Filling from the centre is right. But the written lines never use n( ),
  ε or set symbols ("Yam 10, plantain 14…"), and the three-set formula is in words only (m18).
- **Letter clashes.**
  - 2000 Q4 m2: "Let n be the number who like neither" clashes with n( ).
  - 2004 Q10 m2 and m6: "call that number b", "P + C − b = 40" uses set names as numbers.
- **Odd wording for symbols.**
  - 1993 Q9 m4 and m6: "Y with a small c", "the upside-down U".
  - 1992 Q8 m8 and m10: "the cup sign", "the cap sign".
- **Set-builder notation not read as "such that".** 1995 Q10 m1, 1992 Q9 m0, 1994 Q8 m5.
- **A template slip.** 1992 Q8 m3: "Let me draw a diagram of the circle first" in the middle of a
  prime-factor tree.

**Keep.** "Counted twice" is an excellent *explanation of why* the formula subtracts n(A ∩ B).
Keep it as a supporting picture after the x-equation. Filling a three-set Venn from the centre is
the textbook order.

**Outline: 2003 Q9.**

| # | Board |
|---|---|
| 0 | Solution. n(ε) = 40, n(M) = 32, n(P) = 24, n(M ∪ P)′ = 4 |
| 1 | Let n(M ∩ P) = x |
| 2 | Venn: ε = 40; regions 32 − x \| x \| 24 − x; 4 outside (live Venn, regions filled with these labels) |
| 3 | (32 − x) + x + (24 − x) + 4 = 40 |
| 4 | 60 − x = 40 |
| 5 | x = 60 − 40 = 20 |
| 6 | ∴ 20 students offer both subjects |
| 7 | Check: 12 + 20 + 4 + 4 = 40 ✓ (numbers replace the labels on the Venn) |
| 8 | Or: n(M ∪ P) = n(M) + n(P) − n(M ∩ P) ⇒ 36 = 32 + 24 − x ⇒ x = 20 |

Line 8 is where the "counted twice" picture explains the minus sign. The voice says "M union P"
and "ε, the universal set" throughout.

### 3.4 Polynomials (expansion, factorisation, quadratics, remainder theorem, algebraic and partial fractions, change of subject, simultaneous equations)

**Standard.**
- **Factorising a quadratic.**
  1. "Product = ac = −6, Sum = b = −5; Factors: −6, +1".
  2. Replace the middle term: x² − 6x + x − 6.
  3. Group: x(x − 6) + 1(x − 6).
  4. Take out the bracket: (x − 6)(x + 1).
  5. "Either x − 6 = 0 or x + 1 = 0".
  6. "∴ x = 6 or −1".
- **Quadratic formula** ("almighty formula"). Write the formula, then list a = , b = , c = , then
  substitute.
- **Completing the square.**
- **Sum and product of roots.** α + β = −b/a, αβ = c/a.
- **Remainder and factor theorems.** "Let f(x) = …; f(2) = …".
- **Long division** in the bracket layout.
- **Algebraic fractions.** LCM, factorise, cancel factors.
- **Partial fractions.** "Let … ≡ A/(…) + B/(…)", then substitute or equate coefficients.
- **Simultaneous equations.** Number them (1) and (2); eliminate or substitute.

**Departures.**
- **No Product/Sum line.** Written in only 1 of 54 lessons that factorise this way. Examples:
  1983 Q5 m8–9, 1984 Q17 m7–8, 1985 Q17 m6 and m8, 1986 Q23 m8–9, 1987 Q21 m8, 1988 Q23 m1, 1991
  Q23 m6, 1992 Q12 m4 ("Numbers:"). Trial brackets in 1985 Q22 m9.
- **"Either … or" skipped.** 1984 Q17 m8, 1985 Q13 m10–11, 1991 Q23 m6.
- **Division.**
  - Synthetic division, or division told in words, instead of the long-division bracket: 1983 Q5
    m2–7, 1990 Q18 m1–8 ("a quick way is synthetic division"), 1998 Q15 m1–12 ("Round 1…").
  - 2001 Q11 m9 skips the division altogether.
- **Unnumbered simultaneous equations.** 1985 Q23 m0–2, 1985 Q24 m1–4.
- **A picture doing the work.** 1997 Q12 m1–5 uses tiles in place of "Let 1/x = a, 1/y = b".
- **Different method.** 2000 Q19 m1–5 factorises instead of using f(1) = f(−1) = f(2) = 0.
- **Wording.**
  - 1987 Q20 m3: "we flip both sides upside down"; say "take the reciprocal".
  - 1984 Q26 m2: no "Let f(x) =".
  - 1988 Q23 m4: "Common denominator", where students write "LCM =".

**Keep.**
- 1984 Q16 and 1987 Q22 are already the model factorisation layout.
- Formula lessons that list a, b, c (1986 Q21).
- The "RHS must be 0 first" point (1991 Q23 m1).
- "x + 1 means put x = −1" (1984 Q26 m5).
- "Don't divide by p, or you lose a root" (1985 Q13).
- The square-minus-square picture.

**Outline: 1991 Q23** (solve (x − 2)(x − 3) = 12).

| # | Board |
|---|---|
| 0 | Solution. (x − 2)(x − 3) = 12 |
| 1 | x² − 3x − 2x + 6 = 12 |
| 2 | x² − 5x + 6 − 12 = 0 |
| 3 | x² − 5x − 6 = 0 |
| 4 | Product = −6, Sum = −5; Factors: −6, +1 |
| 5 | x² − 6x + x − 6 = 0 |
| 6 | x(x − 6) + 1(x − 6) = 0 |
| 7 | (x − 6)(x + 1) = 0 |
| 8 | Either x − 6 = 0 or x + 1 = 0 |
| 9 | ∴ x = 6 or x = −1 |
| 10 | Check: x = −1: (−3)(−4) = 12 ✓ |

### 3.5 Variation

**Standard.**
- "y ∝ x ⇒ y = kx".
- "When x = 2, y = 6: 6 = 2k ∴ k = 3".
- "∴ y = 3x".
- Inverse variation: y ∝ 1/x ⇒ y = k/x.
- Joint variation: x ∝ yz ⇒ x = kyz.
- Partial variation: y = k₁ + k₂x, with numbered equations.

**Departures.**
- **"∝" not written before "= k…".** It is written in only 7 of 18 lessons: 1984 Q15 m1, 2003 Q22
  m1, 2004 Q14 m1–4, 1983 Q23 m1–2 ("First link: w = k/V"), 1990 Q13 m0–1.
- **a, b instead of k₁, k₂, with unnumbered equations.** 1983 Q14 m1, 1985 Q16 m1–5, 1989 Q15
  m1–3.
- **Metaphors carried into the working.**
  - 1983 Q14: "two taps", "the tank holds 2".
  - 1984 Q15 m2 and m7: "5 by 5 tiles over 2 plates".
  - 1985 Q16: "menu board".
  - 2003 Q19 m0–2: "a machine… the machine's fixed setting", with no "x ∝ UV/(U + V)".
- **Wording.** 2002 Q33 m1–2: "Days = k/men", with no "Let T = number of days". 1990 Q13's
  "Plan:" line is not an exercise-book line.

**Keep.** 1986 Q16, 1987 Q19, 1988 Q14, 1991 Q15 and 2002 Q42 are already the model layout. Keep
sense checks ("inverse: bigger x, smaller y") and "man-days" as the voice's explanation of k.

**Outline: 1984 Q15** (p varies directly as q² and inversely as r).

| # | Board |
|---|---|
| 0 | Solution. p ∝ q²/r |
| 1 | ∴ p = kq²/r |
| 2 | When p = 36, q = 3, r = 4: 36 = k × 3²/4 |
| 3 | 36 = 9k/4 ⇒ 9k = 144 ⇒ k = 16 |
| 4 | ∴ p = 16q²/r |
| 5 | When q = 5, r = 2: p = 16 × 5²/2 |
| 6 | = 400/2 = 200 |
| 7 | ∴ p = 200 |

### 3.6 Inequalities

**Standard.**
- **Linear.** Solve like an equation. Reverse the sign when multiplying or dividing by a
  negative. **Show the answer on a number line**: an open circle for < and a closed circle for ≤.
- **Quadratic.** Factorise (with Product/Sum), find the critical values, then draw a **sign
  table** with the regions as columns and the brackets as rows. Write ∴, then the number line.
- **Graphical inequalities.** Draw the boundary lines from intercepts. Shade the region. Many
  Nigerian classes shade the *unwanted* side; the convention should be stated.

**Departures.**
- **The number-line sketch is put in the wrong place.**
  - At moment 1, before anything is solved: 1984 Q19, 1985 Q4, 1995 Q16, 1997 Q17.
  - In the middle of the algebra: 1986 Q19 m7, 1987 Q26 m7, 1992 Q16 m7.
  - It is never the final written representation of the answer.
- **No sign table.**
  - 1993 Q20 m6 asserts "positive outside the roots".
  - 2000 Q21 m7 says "between the roots", with no written line.
  - 1995 Q16 tests points instead. That is acceptable, but it is not the textbook layout.
- **No Product/Sum line.** 1993 Q20 m2–3, 2000 Q21 m4.
- **Content error.** 1995 Q20 m9 writes "−1 ≤ x ≤ 1" after deriving the strict inequality
  −1 < x < 1.

**Keep.** The sign-flip rule with the mirror doodle (1992 Q16). "15 is positive, so the sign
stays" (1986 Q19). The test-point method for regions (1994 Q18).

**Outline: 1993 Q20** (y² − 3y > 18).

| # | Board |
|---|---|
| 0 | Solution. y² − 3y − 18 > 0 |
| 1 | Product = −18, Sum = −3; Factors: −6, +3 |
| 2 | y² − 6y + 3y − 18 > 0 ⇒ y(y − 6) + 3(y − 6) > 0 |
| 3 | (y + 3)(y − 6) > 0 |
| 4 | Critical values: y = −3, y = 6 |
| 5 | Sign table (live table): columns y < −3 \| −3 < y < 6 \| y > 6; rows (y + 3): − + +; (y − 6): − − +; product: + − + |
| 6 | ∴ y < −3 or y > 6 |
| 7 | Number line: open circles at −3 and 6, arrows outward (live number line) |
| 8 | Check: y = 7: 49 − 21 = 28 > 18 ✓ |

### 3.7 Progressions

**Standard.**
- Write the givens: "a = , d = , n = ".
- AP: Tₙ = a + (n − 1)d; Sₙ = n/2[2a + (n − 1)d] or n/2(a + l).
- GP: Tₙ = arⁿ⁻¹; Sₙ = a(rⁿ − 1)/(r − 1); S∞ = a/(1 − r) for |r| < 1.
- Simultaneous equations from two terms, labelled (i) and (ii).
- Means: arithmetic (a + b)/2, geometric √(ab).

**Departures** (5 of 33; this topic is mostly on-method).
- **1994 Q19 (model).** m0–5 derive T₆ = a + 5d from a staircase. The formula comes at m6.
- **Sums added term by term.**
  - 1988 Q29 m5–9: Sₙ appears only as a check.
  - 2004 Q19 m6–11 has no sum formula at all.
- **1992 Q19 m2–4.** "Second differences constant: quadratic" is outside the syllabus.
  JAMB-text practice tests the options with n = 1, 2, 3.
- **1998 Q20.** It writes Sₙ and S∞ correctly, but never states "|r| < 1".
- **A slip.** 2002 Q43 m5 talks about "tape" when the picture is a bouncing ball.

**Keep.** "a = −10, d = 2, n = 21" lines (1987 Q29, 1990 Q28). "−1 < r < 1" stated before S∞
(1992 Q18, 2004 Q20). (2k − 1)² = (k + 1)(3k + 1) (1993 Q23). The staircase and pairing pictures,
*beside* the formula.

**Outline: 1994 Q19.**

| # | Board |
|---|---|
| 0 | Solution. a = 1, T₆ = 11, d = ? |
| 1 | Tₙ = a + (n − 1)d |
| 2 | T₆ = a + 5d  (staircase beside it: 5 rises from the 1st to the 6th step) |
| 3 | 1 + 5d = 11 |
| 4 | 5d = 10 |
| 5 | ∴ d = 2 |
| 6 | Check: 1, 3, 5, 7, 9, 11 ✓ |

### 3.8 Binary operations

**Standard.**
- Substitute into the rule, working inside the brackets first.
- **Identity.** "Let e be the identity element: a * e = e * a = a". Solve *for e in general*.
- **Inverse.** "a * a⁻¹ = e". Solve for a⁻¹.
- **Properties.** Closure, commutative (a * b = b * a) and associative, each checked
  symbolically.
- **Tables.** Read the row, then the column. The identity's row or column copies the headings.

**Departures.**
- **Identity from one trial value.** 1992 Q21 m6–7 ("For m = 2: 3e = 0"). It should be
  e(m + 1) = 0 ⇒ e = 0.
- **Identity checked, not solved, and the inverse called b, q or x instead of a⁻¹.** 1994 Q22
  m2–6, 1999 Q11 m1–6, 2000 Q14 m1–5.
- **No Product/Sum line.** 2000 Q12 m5–6.
- **Machine and door metaphors.** 10 of 13 lessons use them; the voice leaks into the working
  ("the card in the machine must read zero").
- **1995 Q21.** It rules options out with numbers. That is acceptable, but the textbook writes
  a * b and b * a for each option.

**Keep.** Checking the identity from both sides. "Don't divide by x, you lose x = 0". Checking
the inverse both ways.

**Outline: 1992 Q21** (m * n = mn + m + n).

| # | Board |
|---|---|
| 0 | Solution. Let e be the identity element |
| 1 | m * e = e * m = m |
| 2 | m * e = me + m + e |
| 3 | ∴ me + m + e = m ⇒ me + e = 0 |
| 4 | e(m + 1) = 0 |
| 5 | ∴ e = 0 |
| 6 | Check: m * 0 = 0 + m + 0 = m ✓ |

### 3.9 Matrices and determinants

**Standard.**
- Order m × n. Add and subtract element by element. Multiply "row by column".
- 2 × 2 determinant: |A| = ad − bc.
- Inverse: A⁻¹ = (1/|A|) × adjoint (swap a and d, change the signs of b and c).
- 3 × 3 determinant: **expand along the first row** with cofactors and the sign pattern + − +.
- Transpose.
- Solving equations by the matrix method: X = A⁻¹B.

**Departures** (this topic is close to the Nigerian method).
- **Not expanded along the first row.** 1992 Q22 m6 expands down the first column. 2004 Q23 m2
  "expands along the middle column": a shortcut, which should come after the first-row method.
- **Not the textbook route.** 1998 Q24 multiplies out PQ = I instead of using Q = P⁻¹. 1997 Q23
  uses substitution, where the matrix method would be expected.
- **"Seats" instead of "elements".** 16 of 22 lessons (e.g. 1999 Q10 m2, 2000 Q15 m1 "seats in a
  cinema"). The words "cofactor" and "adjoint" are never used.
- **Repeated lines.** The 2 × 2 rule is said twice in a row in 1992 Q22, 1994 Q25 and 2000 Q18.

**Keep.** Row-by-column entries written one at a time (2002 Q40). "Cover the row and column" for
minors. ad − bc written before substituting. Multiply-back checks.

**Outline: 2002 Q36** (3 × 3 determinant).

| # | Board |
|---|---|
| 0 | Solution. Expand along the first row; signs + − + |
| 1 | \|N\| = 3\|−3 −5; 2 1\| − 5\|6 −5; −2 1\| + (−4)\|6 −3; −2 2\| (cover the row and column, highlighted) |
| 2 | = 3[(−3)(1) − (−5)(2)] − 5[(6)(1) − (−5)(−2)] − 4[(6)(2) − (−3)(−2)] |
| 3 | = 3(7) − 5(−4) − 4(6) |
| 4 | = 21 + 20 − 24 = 17 |

### 3.10 Euclidean geometry

**Standard.** The sources agree:
- Start with "Solution" and a sketch (or "re-draw the diagram").
- Write **one step per line, with the reason in brackets on the right**, in the short form:
  - "(alt. ∠s)", "(corr. ∠s)", "(co-int. ∠s)", "(vert. opp. ∠s)";
  - "(∠s on a str. line)", "(∠ sum of △)", "(ext. ∠ of △)", "(base ∠s of isos. △)";
  - "(∠ at centre = 2 × ∠ at circumference)", "(∠s in same segment)";
  - "(opp. ∠s of cyclic quad.)", "(∠ in a semicircle)";
  - "(tangent ⊥ radius)", "(alt. segment theorem)".
- Polygons: interior angle sum = (n − 2) × 180°; exterior angle = 360°/n.
- Similar triangles: write "△ABC ||| △PQR (equiangular)", then all three ratios of corresponding
  sides.
- For a bent line between parallels: draw a third parallel through the bend.
- Pythagoras: the sources write "(Pythagoras)" beside a line such as l² = r² + h².

**Departures.**
- **Reasons not in brackets beside the step.** By scan, only 5 of 115 angle lessons do it.
  Instead there is either a separate "The rule:" moment before the step (35 lessons, e.g. 1983
  Q36 m5–6), or a prefix ("Exterior angle: ∠PRQ = …", 1984 Q35 m3).
- **Isosceles steps** never write "(base ∠s of isos. △)" (1983 Q36 m4, 1984 Q35 m8, 1989 Q34 m1).
- **Arc-measure and secant methods,** not used in the Nigerian syllabus:
  - 1995 Q27 m1–8 ("the angle between a tangent and a chord is half the arc").
  - 1999 Q32 m1–8 ("parallel chords cut equal arcs").
  - 2004 Q26 m1–7 ("half the difference of the two arcs").

  Each has a standard angle-theorem route, given in the helper notes kept with the review.
- **Direction words in place of angle facts.**
  - 1991 Q37 m1–4: "tilted 28° above the horizontal… the path turns back through 30°"
    (should be a line through the bend).
  - 1998 Q26 m2 and m4: "60 degrees with the rightward direction".
- **1994 Q26 m2–3.** Two straight-line steps, where "(vert. opp. ∠s)" does it in one.
- **Similar triangles.** Written "△PRQ ∼ △PST" without the three ratios: 1984 Q44 m2, 1988 Q35
  m1, 1990 Q34 m2.
- **Pythagoras wording.** "Pythagoras: hypotenuse² = opposite² + adjacent²" in 32 lessons uses
  the trigonometry words opp and adj with no angle. The research note uses "(Pythagoras)"
  beside the squared lengths, and opp/adj only "relative to θ" in trigonometry. One of the
  lesson-reading helpers thought some Nigerian texts do say it this way. This is for the expert
  to settle (§9).
- **Template slips.** "Let me draw a diagram of the circle first" with no circle: 1989 Q38, 1995
  Q28, 1999 Q22. A rule said twice in a row: 1985 Q43, 1987 Q36, 1988 Q37, 1994 Q27, 1998 Q28,
  1995 Q28.

**Keep.** "Join QS" construction lines. A third parallel line through a bend (1988 Q31, 1991
Q30). "In △PQS:" headers. Second-route checks. Matching corners before ratios (1984 Q44 m3–4).

**Outline: 1983 Q36** (tangent, isosceles triangle, cyclic quadrilateral).

| # | Board |
|---|---|
| 0 | Solution. Sketch with the tangent at P; PQ = PS; ∠TPQ = 50°. Join QS |
| 1 | ∠PSQ = ∠TPQ = 50°  (alt. segment theorem) |
| 2 | ∠PQS = ∠PSQ = 50°  (base ∠s of isos. △) |
| 3 | ∠QPS = 180° − (50° + 50°) = 80°  (∠ sum of △) |
| 4 | ∠QRS + ∠QPS = 180°  (opp. ∠s of cyclic quad.) |
| 5 | ∠QRS = 180° − 80° = 100° |
| 6 | ∴ ∠QRS = 100° |

Each angle is written on the sketch as it is found, in the same colour as its line.

### 3.11 Mensuration (arcs and sectors, solids, the earth as a sphere)

**Standard.**
- List the givens (r = , h = , π = 22/7). Write the formula, substitute, and cancel the 7
  visibly.
- Arc: L = θ/360 × 2πr. Sector: A = θ/360 × πr².
- Cylinder: V = πr²h; CSA = 2πrh; TSA = 2πr(r + h).
- Cone: V = ⅓πr²h; CSA = πrl; l² = r² + h².
- Sphere: V = 4/3 πr³; SA = 4πr².
- Pyramid: V = ⅓ × base area × h.
- Frustum: by subtraction, using similar triangles.
- Similar solids: V₁/V₂ = (l₁/l₂)³.
- Earth: the radius of a latitude circle is R cos α. Distance along a parallel = θ/360 × 2πR
  cos α. Same side of the equator: subtract; opposite sides: add.

**Departures.**
- **Formula never written in one line.**
  - 1997 Q28 (model): "Fraction = 60/360", then "Circumference = 2 × π × r", then "Arc = 1/6 ×
    132". The cake slice carries the method.
  - 1984 Q27 m5–7 does the same.
- **Non-textbook methods.**
  - 1985 Q31 m5–9: "27 parts = 351", instead of V₁/V₂ = (l₁/l₂)³.
  - 1985 Q39: "units of r³".
  - 1986 Q38: "Sector area = ½rl" as the main method.
  - 1989 Q9 m2: "A = πd²" and a scale factor.
  - 1990 Q44 and 2002 Q9: frustum shortcut formulas.
  - 1992 Q2 m3–7: "relative error doubles", with the textbook method only as a check.
- **Formula after the numbers.**
  - 1991 Q45 m3–7: the TSA formula comes only as a check.
  - 1993 Q38: the "same side: subtract" rule comes last.
- **Same thing worked twice.** 1988 Q44, 1990 Q42.
- **Pythagoras wording** in 7 lessons. "Legs" (US) in 1991 Q32.

**Keep.** 1997 Q29, 2003 Q32, 2001 Q23, 1998 Q30 and 2002 Q12 are already the model layout.
Supporting pictures such as the orange peel (sphere), the tin label (2πrh) and "one cone fills a
third". "Radius, not diameter" and "convert units first".

**Outline: 1997 Q28.**

| # | Board |
|---|---|
| 0 | Solution. d = 42 cm ⇒ r = 21 cm; θ = 60°; π = 22/7 (sketch: circle, O, chord AB, 60° marked) |
| 1 | L = θ/360 × 2πr |
| 2 | L = 60/360 × 2 × 22/7 × 21 |
| 3 | = 1/6 × 2 × 22 × 3 |
| 4 | = 22 |
| 5 | ∴ minor arc = 22 cm |
| 6 | Check: 6 equal slices × 22 = 132 = 2πr ✓ (the cake picture belongs here, or at line 3) |

### 3.12 Loci

**Standard.**
- Name the four standard loci:
  - a fixed distance from a point is a circle;
  - equidistant from two points is the perpendicular bisector;
  - a fixed distance from a line is a pair of parallel lines;
  - equidistant from two lines is the angle bisector.
- **Construct with ruler and compasses**: arcs from each end with radius more than ½ AB, then
  join the crossings.
- In coordinates: "PV = PW ⇒ PV² = PW²", the distance formula, expand, simplify.

**Departures.**
- **No lesson shows the compass construction.** Four lessons prove the locus with congruent
  triangles instead of naming it: 1990 Q45 m3–8, 1992 Q31 m3–10, 2000 Q31 m3–9, 2002 Q15 m3–9.
- **"Let me draw a diagram of the circle first" where there is no circle.** 9 lessons: 1990 Q45,
  1992 Q31, 1995 Q31, 1997 Q32, 1999 Q23, 2000 Q31, 2001 Q26, 2002 Q15, 2003 Q31.
- **2001 Q26.** It uses the cosine rule where the perpendicular bisector gives a quicker route.

**Keep.** 1999 Q23 and 2003 Q31 follow the coordinate method exactly. The midpoint check is good.
1988 Q46 combines two loci. 1990 Q45 m9 has a good summary.

**Outline: 2002 Q15** (equidistant from S and T).

| # | Board |
|---|---|
| 0 | Solution. \|PS\| = \|PT\| |
| 1 | Standard loci: (i) circle (ii) ⊥ bisector (iii) parallel lines (iv) angle bisector |
| 2 | Construction: draw ST; with S as centre, radius > ½\|ST\|, draw arcs above and below |
| 3 | With T as centre, same radius, cut the arcs at X and Y; join XY |
| 4 | ∴ the locus of P is the perpendicular bisector of ST |

The villagers doodle can follow as the "why", in the voice only.

### 3.13 Coordinate geometry

**Standard.**
- Label the points (x₁, y₁), (x₂, y₂) first.
- Distance = √((x₂ − x₁)² + (y₂ − y₁)²).
- Midpoint = ((x₁ + x₂)/2, (y₁ + y₂)/2).
- Gradient m = (y₂ − y₁)/(x₂ − x₁), or m = tan θ.
- Equation of a line: y − y₁ = m(x − x₁), or y = mx + c.
- Parallel lines: m₁ = m₂. Perpendicular lines: m₁m₂ = −1.
- Intercepts: put x = 0 or y = 0.

**Departures** (5 of 14; the topic is close to the Nigerian method).
- **1992 Q33 m6–9.** It uses the shortcut "7x + 5y = k" instead of y − y₁ = m(x − x₁).
- **Wording.** "Change in y: y₂ − y₁" (1991 Q26 m5–6; 9 times in the topic). "Rise over run"
  (2001 Q28 m3) should be m = tan θ.
- **Unlabelled equations.** 1997 Q34 m2.

**Keep.** Formulas written before substituting. m₁m₂ = −1. Substituting back as a check. The
model lesson 2002 Q11 follows the method; m6's "0 + 8 = 4x − 8 + 8" can be shortened to "4x = 8".

**Outline: 1992 Q33** (the line through (5, 7) parallel to 7x + 5y = 12).

| # | Board |
|---|---|
| 0 | Solution. 5y = −7x + 12 ⇒ y = −7/5 x + 12/5 ∴ m₁ = −7/5 |
| 1 | Parallel: m₂ = m₁ = −7/5 |
| 2 | y − y₁ = m(x − x₁) |
| 3 | y − 7 = −7/5 (x − 5) |
| 4 | 5y − 35 = −7x + 35 |
| 5 | ∴ 7x + 5y = 70 |
| 6 | Check: 7(5) + 5(7) = 70 ✓ |

### 3.14 Trigonometry

**Standard.**
- **SOH CAH TOA,** with opp, adj and hyp labelled relative to θ.
- **Special angles** from half an equilateral triangle (1, √3, 2) and half a square (1, 1, √2),
  often tabulated.
- **Quadrants** by **CAST** ("All Students Take Coffee"); sin(180° − θ) = sin θ, and so on.
- **Elevation and depression.** Draw the horizontal line and use alternate angles.
- **Bearings.** Draw a **North line at every point**. Use three-figure bearings measured
  clockwise. Use alternate angles between North lines, and the back bearing ± 180°. Then use the
  sine or cosine rule, or Pythagoras.
- **Tables.** Angles are given in degrees and minutes from four-figure tables.

**Departures.**
- **2000 Q26 (bearings).** It resolves each leg into east and north components, then uses
  "tan α ≈ 0.088". There are no North lines. The textbook route gives ∠ABC = 90° by alternate
  angles, then 45°, then 085°.
- **1988 Q40.** "Turn: 113° − 23° = 90°" uses no North line at B. "tan⁻¹(1.3333) = 53.13°" is
  calculator notation. The answer 76°8′ is not given in three figures.
- **1992 Q29 m5.** It silently changes 31.7° to "≈ 30°" to fit an option. It should say "nearest
  option".
- **1993 Q39 m6.** "Tan repeats every 180 degrees" should be CAST: tan is positive in the 1st and
  3rd quadrants.
- **1995 Q37.** It tests points at π/2 in radians; school trigonometry graphs use 0°–360°.
- **Formula rearranged before the triangle is written.** 1986 Q34 m3 ("distance = height /
  tan θ"), 1998 Q37, 1989 Q41.
- **Tables read to decimal degrees.** 1983 Q20 and 1983 Q37 ("10.70°", then "0.70 × 60 = 42′").
  Four-figure tables give 10°42′ directly.
- **SOH CAH TOA** is named in only 13 of 59 lessons. The Pythagoras wording appears in 9.

**Keep.** Half-equilateral triangles (1985 Q34, 1989 Q42). "All Students Take Coffee" (1987 Q38).
North lines (1991 Q42, 1999 Q30, 2001 Q31, 2003 Q29). Back bearings (1985 Q32). The triangle
method for ratios given in letters (1984 Q43).

**Outline: 2000 Q26** (bearings).

| # | Board |
|---|---|
| 0 | Solution. Sketch A, B, C with a North line at A and at B |
| 1 | AB = 50 km on 130° (S50°E); BC = 50 km on 040° (N40°E) |
| 2 | ∠ABN = 50°  (alt. ∠s, N lines parallel) |
| 3 | ∠ABC = 50° + 40° = 90° |
| 4 | AB = BC ⇒ ∠BAC = (180° − 90°)/2 = 45°  (base ∠s of isos. △) |
| 5 | Bearing of C from A = 130° − 45° = 085° |
| 6 | ∴ N85°E |

### 3.15 Differentiation

**Standard.**
- **Power rule.** "If y = axⁿ, dy/dx = naxⁿ⁻¹": multiply by the power, then reduce the power by
  1. Rewrite roots and fractions as indices first.
- **Chain rule.** "Let u = (inside), y = uⁿ; dy/du = …, du/dx = …; dy/dx = dy/du × du/dx".
- **Product rule.** "Let u = …, v = …; du/dx = …, dv/dx = …; dy/dx = u dv/dx + v du/dx".
- **Quotient rule.** (v du/dx − u dv/dx)/v².
- Standard trigonometric derivatives.

**Departures.**
- **Product rule as rectangle strips, with "u dash" or u′ instead of du/dx.** 1999 Q37 m1, m4 and
  m7. 2001 Q33 m1–4 ("u prime… the yellow strip"). 1998 Q39 m2 and m7. 1999 Q39 m1.
- **Chain rule without "Let u = …".** 1998 Q38 m1 writes it in words ("power down, power minus
  1, times derivative of inside"). 1999 Q37 m5 does it inline.
- **1998 Q39 m1–2.** It rewrites x/cos x to avoid the quotient rule.
- **"+ c" missing from the rule line.** 2002 Q48 m2.

**Keep.** 2002 Q49 is exactly the Nigerian layout. 2003 Q39 m3 says "multiply by the index and
reduce the index by one". 1997 Q40 rewrites to indices first. The family-of-curves doodle for
"+ c".

**Outline: 1999 Q37** (y = 3x²√(x³ + 1)).

| # | Board |
|---|---|
| 0 | Solution. y = 3x²(x³ + 1)^½ |
| 1 | Let u = 3x², v = (x³ + 1)^½ |
| 2 | dy/dx = u dv/dx + v du/dx |
| 3 | du/dx = 6x |
| 4 | For v: let t = x³ + 1 ⇒ v = t^½; dt/dx = 3x², dv/dt = ½t^(−½) |
| 5 | dv/dx = dv/dt × dt/dx = 3x²/(2√(x³ + 1)) |
| 6 | dy/dx = 3x² · 3x²/(2√(x³ + 1)) + √(x³ + 1) · 6x |
| 7 | = [9x⁴ + 12x(x³ + 1)] / (2√(x³ + 1))  [LCM = 2√(x³ + 1)] |
| 8 | ∴ D |

The rectangle picture may sit beside line 2, to show *why* the rule has two terms.

### 3.16 Application of differentiation

**Standard.**
- "dy/dx = …".
- "At turning point, dy/dx = 0", then solve for x.
- "d²y/dx² = …; < 0 ⇒ maximum (> 0 ⇒ minimum)".
- Substitute x to get y_max.
- Rates of change: dA/dt = dA/dr × dr/dt.
- Tangent: y − y₁ = m(x − x₁).

**Departures.**
- **Maxima and minima by −b/2a or completing the square instead of dy/dx = 0.** 7 lessons: 1987
  Q28, 1990 Q30, 1991 Q27, 1997 Q13, 1999 Q33, 2002 Q31, 2003 Q38. This is a different method in
  a calculus topic.
- **No second-derivative test.** 2001 Q37.

**Keep.** 1992 Q39 and 1999 Q40 are fully Nigerian. Keep −b/2a as a one-line check *after* the
calculus.

**Outline: 2002 Q31** (the maximum of y = 1 − 2x − 3x²).

| # | Board |
|---|---|
| 0 | Solution. dy/dx = −2 − 6x |
| 1 | At turning point, dy/dx = 0 ⇒ −2 − 6x = 0 ⇒ x = −⅓ |
| 2 | d²y/dx² = −6 < 0 ∴ maximum (sketch: ∩ curve, flat tangent at the top) |
| 3 | y_max = 1 − 2(−⅓) − 3(−⅓)² = 1 + ⅔ − ⅓ = 4/3 |
| 4 | Check: x = −b/2a = −(−2)/(2 × −3) = −⅓ ✓ |

### 3.17 Integration

**Standard.**
- "∫xⁿ dx = xⁿ⁺¹/(n + 1) + c": add 1 to the power, divide by the new power.
- Substitution: "Let u = 2x + 1, du = 2 dx".
- Definite integrals: [F(x)] with the limits on the bracket, then F(b) − F(a).
- Area = ∫ y dx, in square units.

**Departures.**
- **Ready-made (ax + b)ⁿ formula instead of substitution.** 1994 Q42 m2, 2001 Q38 m1–2.
- **"Think backwards… twice too big".** 1992 Q41 m2–3.
- **"+ c" missing from the rule line.** 1994 Q41 m3.
- **Template slip.** 1999 Q36 m1: "diagram of the circle" for a parabola.

**Keep.** Most lessons already write [F(x)]ₐᵇ = F(b) − F(a) (1995 Q41, 2001 Q39, 2003 Q36). The
expand-and-check in 1994 Q42. The odd-function shortcut, *after* the working (1997 Q42).

**Outline: 1995 Q41** (the area under y = 3x² − 2x + 1 from 1 to 3).

| # | Board |
|---|---|
| 0 | Solution. Area = ∫₁³ (3x² − 2x + 1) dx (sketch, shaded) |
| 1 | = [x³ − x² + x]₁³ |
| 2 | = (27 − 9 + 3) − (1 − 1 + 1) |
| 3 | = 21 − 1 = 20 square units |

### 3.18 Representation of data

**Standard.**
- Frequency table with a tally.
- Bar chart; histogram (with class boundaries).
- **Pie chart: a table Item | Frequency | Sectoral angle, each row f/Σf × 360°,** and a total row
  of 360°.

**Departures.**
- **Pie charts by a "unit value".** 1983 Q27 m4 ("One unit = 5°"), 1984 Q8 m5, 1986 Q45 m5, 1990
  Q46, 1991 Q47. 1993 Q42 m2–5 does it with "each coin is worth 20 degrees".
- **Products as loose lines with no table.** 1987 Q47.
- **Content caution.** 2004 Q41 m2 implies histograms need equal class widths. A histogram is
  defined by area ∝ frequency.

**Keep.** "Angle = item/total × 360°" is written in most lessons. Checks that the angles sum to
360°.

**Outline: 1983 Q27.**

| # | Board |
|---|---|
| 0 | Solution. Σf = 72; sectoral angle = f/Σf × 360° |
| 1–5 | Live table, one row per moment: A \| 6 \| 6/72 × 360° = 30° … E \| 26 \| 130° |
| 6 | Total \| 72 \| 360° ✓ (the pie fills sector by sector) |

### 3.19 Measures of location (mean, median, mode, cumulative frequency)

**Standard.** **Every statistics answer starts with a table.**
- **Mean.** x | f | fx, then x̄ = Σfx/Σf. Grouped data uses class marks. The assumed-mean
  method: x̄ = A + Σfd/Σf.
- **Median of ungrouped data.** The (n + 1)/2 th value, or N/2 with a cf column.
- **Grouped median.** Find N/2, name the median class, list L₁ = , cf = , f = , c = , then
  L₁ + ((N/2 − cf)/f)c.
- **Grouped mode.** L₁ + (D₁/(D₁ + D₂))c.
- **Ogive.** Plot against the upper class boundaries. Read at N/2, N/4 and 3N/4.

**Departures.**
- **Median by counting positions, with no "(n + 1)/2 th".** 1983 Q1 m4, 1983 Q17 m4, 1986 Q46,
  1987 Q48, 1988 Q48, 1989 Q49, 1998 Q42, 2003 Q50.
- **"Running totals" instead of a cf column.** 1983 Q38 m2–6, 1988 Q49 m5–8, 1991 Q48 m8, 1992
  Q44, 1997 Q45, 1999 Q47.
- **No x | f | fx table.** 1985 Q28 m1–2, 1984 Q48 m5–7.
- **Assumed mean used without its name.** 1983 Q48 m8–9.
- **1995 Q48 m10.** It takes the median as the mid-point of the median class, with (n + 1)/2 for
  grouped data. The formula gives about 3.38, nearer option B than the C taught. **Re-check this
  answer.**
- **1995 Q47.** It treats the mid-point of the modal class as the mode before the formula.
- **2003 Q6 (bases, filed here).** It uses bundles of sticks (see §2).

**Keep.** The grouped median and mode formulas in 1993 Q45, 1993 Q47, 1994 Q47 and 1998 Q43 are
the textbook layout. "Total = mean × count". The see-saw picture for the mean, as support.

**Outline: 1991 Q48.**

| # | Board |
|---|---|
| 0 | Solution. Live table x \| f \| fx \| cf, filled one row per moment |
| 1 | Σf = 50, Σfx = 333 |
| 2 | x̄ = Σfx/Σf = 333/50 = 6.66 ≈ 6.7 |
| 3 | Median: N = 50, so the 25th and 26th values; the cf column reaches 26 at x = 6 |
| 4 | ∴ median = 6 |

### 3.20 Measures of dispersion

**Standard.**
- Range = highest − lowest.
- Mean deviation = Σf|x − x̄|/Σf.
- Variance = Σf(x − x̄)²/Σf, divided by n and not n − 1. The alternative is Σfx²/Σf − x̄².
- S.D. = √variance.
- **All of it in the long table**: x | f | fx | x − x̄ | (x − x̄)² | f(x − x̄)², with Σ row.

**Departures.**
- **No deviation table.** 1992 Q45, 1993 Q49, 1995 Q46, 1997 Q47, 2000 Q47, 2001 Q45, 2003 Q42.
- **Grouped data inline.** 1995 Q45.
- **1994 Q48.** The alternative formula is used, but there is no fx² column.
- **Formula after the working.** 1994 Q46 m7, 2004 Q45 m8, 1995 Q45 m10, 1995 Q44, 1993 Q49.
- **Wording.** 1999 Q44 m2 says "mean of the squares minus the square of the mean". 1999 Q50 and
  2000 Q42 say "sum of distances" instead of Σ|x − x̄|/n. The symbols σ, SD, S.D. and s.d. are
  mixed.
- **Tiles as squares.** 1998 Q44, 1998 Q45, 2001 Q45 (mild).

**Keep.** "Why the deviations are squared: they add to 0" (1992 Q45, 1995 Q46). "SD = √variance"
said every time.

**Outline: 1995 Q45** (grouped S.D.).

| # | Board |
|---|---|
| 0 | Solution. S.D. = √[Σf(x − x̄)²/Σf] |
| 1–3 | Live table Class \| x \| f \| fx, one row per moment (x = class mark) |
| 4 | Σf = 18, Σfx = 90 ⇒ x̄ = 5 |
| 5 | Columns x − x̄ \| (x − x̄)² \| f(x − x̄)² filled: −3, 9, 45 \| 0, 0, 0 \| 3, 9, 45 |
| 6 | Σf(x − x̄)² = 90 ⇒ variance = 90/18 = 5 |
| 7 | ∴ S.D. = √5 |

### 3.21 Permutation and combination

**Standard.**
- ⁿPᵣ = n!/(n − r)!; ⁿCᵣ = n!/((n − r)! r!). Write the formula, then expand the factorials and
  cancel.
- Repeated letters: n!/(p! q!).
- "At least" questions: list the cases directly. Use the complement as a check.

**Departures** (all mild).
- **The link reasoned from meaning, not from the formulas.** 1999 Q43 m1–2.
- **General formula not written.** 2000 Q43.
- **Complement route first.** 2000 Q49 m1 and 2004 Q47 m1.
- **2003 Q47.** "a loop of 4" for a circular arrangement.

**Keep.** Formulas written before substituting (2003 Q49, 2004 Q46). "Treat the couple as one
unit" (1992 Q49). Listing pairs to verify.

**Outline: 2000 Q49** (3 from 5 men and 3 women, at least one of each).

| # | Board |
|---|---|
| 0 | Solution. ⁿCᵣ = n!/((n − r)! r!) |
| 1 | Case 1: 2 men, 1 woman: ⁵C₂ × ³C₁ = 10 × 3 = 30 |
| 2 | Case 2: 1 man, 2 women: ⁵C₁ × ³C₂ = 5 × 3 = 15 |
| 3 | Total = 30 + 15 = 45 |
| 4 | Check: ⁸C₃ − ⁵C₃ − ³C₃ = 56 − 10 − 1 = 45 ✓ |

### 3.22 Probability

**Standard.**
- n(S) = …, n(E) = …, then **P(E) = n(E)/n(S) = number of favourable outcomes / total number of
  possible outcomes**.
- P(E′) = 1 − P(E).
- Mutually exclusive events: P(A or B) = P(A) + P(B).
- Independent events: P(A and B) = P(A) × P(B).
- Two dice: the 6 × 6 sample-space table.
- Tree diagrams. Without replacement, the total goes down by one.

**Departures.**
- **"Chance" where the word should be "probability".** 1985 Q44 m2, 1995 Q50 m3, 1985 Q30 m10,
  1999 Q41 m0, 2003 Q43 (model) throughout.
- **Our own wording for the definition.** 2003 Q43 m3 ("balls you want / balls in the bag"),
  1994 Q49 m1, 2002 Q25 m7.
- **No 6 × 6 table for dice.** 1984 Q40, 1988 Q50, 1992 Q47, 2003 Q48. 1998 Q50 is the same with
  a 4 × 4 table.
- **Formula after counting.** 1985 Q30, 1985 Q35, 1987 Q50, 1988 Q50, 1998 Q50, 2003 Q48, 2004
  Q50.
- **2003 Q43 (model).**
  - It says "And rule: multiply the chances" and "Or rule: add the chances".
  - It writes "First black: 5/8" where the board should read P(B₁) = 5/8.
  - It writes "P(B then R)" where the board should read P(B₁R₂).
  - It never shows ⁵C₁ × ³C₁/⁸C₂, even as a check.
- **No complement notation.** 1999 Q41 never writes P(A′).

**Keep.** Complement checks (1991 Q50, 2004 Q50). The addition rule with the overlap (1985 Q35).
"Mutually exclusive" named (1998 Q49). The bag and tree pictures: they are the standard Nigerian
pictures.

**Outline: 2003 Q48** (two dice; the sum is divisible by 3).

| # | Board |
|---|---|
| 0 | Solution. P(E) = n(E)/n(S) |
| 1 | Live 6 × 6 table of sums |
| 2 | n(S) = 36 |
| 3 | Sums divisible by 3: 3, 6, 9, 12 (cells ringed in the table) |
| 4 | n(E) = 2 + 5 + 4 + 1 = 12 |
| 5 | P(E) = 12/36 = 1/3 |

---

## 4. Rules for restructuring every Maths lesson

1. **The backbone is the exercise-book solution.** Before writing a lesson, write out the
   solution as a good Nigerian SS3 student would write it in the exam:
   - "Solution";
   - sketch or table;
   - givens;
   - "Let …";
   - formula;
   - substitution;
   - simplification;
   - "∴";
   - check.

   Each line of that solution becomes one moment's `write`, in the same order and with the same
   symbols. Nothing on the board should be something the student would not write.
2. **The voice teaches the line.** It reads the line as a Nigerian teacher would, and says *why*
   in one sentence:
   - "one-zero-seven base eight";
   - "A union B";
   - "by BODMAS";
   - "product, sum";
   - "the reason: alternate angles".
3. **Pictures support, never replace.** A doodle may appear beside a written line to show why
   it works (bundles beside the ladder, counted-twice beside the n(A ∪ B) formula, cake beside
   θ/360). It must not carry a step that has no written line. Metaphor words should stay out of
   the working sentences: say "the remainder", not "the loose sticks".
4. **The standard method comes first; shortcuts come second.** Option testing, −b/2a, "counted
   twice", the cover-up rule, a quicker column or a special-case formula come after the standard
   working. They are labelled "Exam tip" or "Check".
5. **Use the standard tables and diagrams** with live diagrams:
   - x | f | fx | cf and the deviation table;
   - the sectoral-angle table;
   - the 6 × 6 sample space;
   - the sign table for inequalities;
   - the Venn diagram with region expressions (32 − x | x | 24 − x);
   - North lines on bearings sketches;
   - the reasons in brackets on geometry lines.

   One new board layout is needed: the **division ladder**, for bases, prime factors, LCM and
   HCF.
6. **Use the standard vocabulary and notation** (§1 table). Fix the known clashes everywhere: no
   "E for everyone", no "the U sign", no "chance", no "seats", no "u dash", no "lots of".
7. **Fix the template slips once:** "diagram of the circle" lines, rules said twice, misfiled
   pictures.
8. **Re-check the content errors found:**
   - 1995 Q48: a grouped median whose answer may be wrong;
   - 1995 Q20: ≤ written where the working gives <;
   - 1999 Q10: trap D's figures;
   - 2004 Q41: the histogram definition;
   - 1992 Q29: 31.7° silently becomes 30°;
   - 1994 Q48: no option equals the exact answer;
   - 1998 Q4: the logs of negative numbers.

---

# Part B. How hard the lessons are to follow

This part is unchanged in substance from the first version of this review, and is now secondary.
Rewriting each lesson as the line-by-line standard method (Part A) fixes many of these issues as
a side effect.

## 5. Measured difficulty across all 1,043 lessons

**How it was measured.** A script read every lesson and counted, for each one:
- words and sentences per moment;
- symbols and operations per written line;
- moments that do two calculations at once;
- how much one line changes from the previous one;
- numbers that are never said;
- terms with no explanation;
- rules used without being named;
- the hook, the check, and pictures that are never used.

The signals were combined into a teaching-load score. Topics come from the stem's words and
symbols, which are about 80% accurate.

| Measure | All 1,043 lessons |
|---|---|
| Moments per lesson | 12.0 on average (9 to 22); 87% have 9–14 |
| Estimated length | about 1.9 minutes |
| Link between the question's difficulty level and lesson length | none (correlation 0.02) |
| Lessons with a moment that does two or more calculations | 81% (17 in every 100 moments) |
| Lessons where a line rewrites most of the line before it | 79% |
| Lessons using a rule before naming it | 46% |
| Lessons using a term without explaining it | 55% (factorise, quadratic, hypotenuse, denominator, derivative, logarithm, union, conjugate, …) |
| Lessons that open with a real hook | about 3% |
| Lessons with no check | 39% |
| Sketch lessons where the voice never mentions the picture again | 49% (135 of 277); in 83% of the moments that mark a sketch, the voice doesn't mention it |
| "Let me sketch the graph, so we can see its shape" / "diagram of the circle" | 50 / 47 lessons (19 with no circle) |
| Lessons using sections / live diagrams | 1% (only the models) / 0% |

**By topic,** in order of how much each lesson packs in:
1. Integration
2. Matrices
3. Indices, logs and surds
4. Polynomials
5. Permutation and combination
6. Differentiation
7. Progressions
8. Trigonometry
9. Dispersion
10. Bases
11. Fractions
12. Application of differentiation
13. Inequalities
14. Binary operations
15. Mensuration
16. Coordinate geometry
17. Euclidean geometry
18. Sets
19. Location
20. Representation of data
21. Probability
22. Loci
23. Variation

Sets, probability and loci score "light" because their lessons use few symbols. Their difficulty
is in the method and the notation (Part A).

## 6. The 40 hardest lessons, read by hand

Picked from the top of the ranking, at least one per topic. The "Fix" column is updated to put
the Nigerian method first.

| Year / Q | Topic | What makes it hard | Fix |
|---|---|---|---|
| 1984 Q30 | Algebraic fractions | m1 does three moves in one line; m7–8 factorise by "multiply to −3, add to −2" with no Product/Sum line and no grouping; m11 computes a = −4 silently | One move per line; "Product = −3, Sum = −2", split, group; "try x = 2" as the check |
| 1991 Q25 | Indices | m1 "take out the lower power" is a trick; m4 splits ½ = −½ + 1 backwards | Write the negative index as 1/√(x² − 1) and take the LCM; the index law cited in brackets; check with x = √5 |
| 1998 Q16 | Partial fractions | m5 cancelling not shown; m7 two sums in one line; pizza metaphor | "Let … ≡ A/(3x + 1) + B/(2x − 1)"; multiply through, with each step shown; substitute x = ½ and x = −⅓, one per moment |
| 1999 Q2 | Polynomials / surds | m4 two moves; m5 hidden "1x"; "conjugate" undefined; tilted-square doodle | Cross-multiply, expand, collect, factorise, each on its own line; define the conjugate; drop the doodle |
| 1984 Q14 | Indices | Blocks doodle in place of the law (m1–7); cancels before forming the fraction | 3ⁿ = 3ⁿ⁻¹ × 3¹ (aᵐ × aⁿ = aᵐ⁺ⁿ); factorise top and bottom; cancel |
| 1997 Q7 | Surds | Never says why we rationalise; four cross products with no grid | "Multiply numerator and denominator by the conjugate"; expand term by term in a 2 × 2 grid |
| 2003 Q8 | Sets | {x ∈ U : x ∉ P ∪ Q} not read aloud; Venn unused | Read "such that"; fill the live Venn; shade P ∪ Q; the unshaded part is the complement |
| 1998 Q8 | Sets | Two competing pictures (Venn and bags) | List with set notation; one Venn |
| 1992 Q9 | Sets | Colon never read "such that"; Venn unused | Read the notation; n(F) = 0 ⇒ F = ∅; (E ∩ F)′ = ∅′ = ε |
| 1999 Q4 | Sets | ∈/∉ written but never explained | Step-by-step listing with the symbols read aloud; Venn shading |
| 2004 Q1 | Bases | Horizontal sum; "untying bundles"; borrow and subtract in one line | Column layout with borrow marks (§2.4) |
| 1991 Q1 | Fractions | No BODMAS; three conversions in one moment | "By BODMAS, × first"; "LCM = 30"; one conversion per line |
| 1988 Q17 | Polynomials | Announces difference of two squares, then a different route | State the route; take out the common factors, then a² − b² = (a − b)(a + b) |
| 1983 Q14 | Variation | No ∝; a, b instead of k₁, k₂; "taps and tank" | "y ∝ x² and y ∝ 1/√x ⇒ y = k₁x² + k₂/√x"; equations (1) and (2) |
| 2000 Q21 | Inequalities | "Between the roots" asserted; graph unused | Product/Sum, critical values, sign table, number line |
| 1993 Q20 | Inequalities | "Positive outside the roots" asserted | Sign table (§3.6) |
| 1998 Q20 | Progressions | Sₙ and S∞ unexplained; |r| < 1 missing | Givens, the formulas with |r| < 1, substitute; the bar picture as the "why" |
| 1993 Q23 | Progressions | Rule said twice; three subtractions in one move | Remove the repeat; one move per line |
| 1995 Q21 | Binary operations | Mostly good | Write a * b and b * a for each option |
| 2000 Q14 | Binary operations | "Identity" unexplained; inverse called q | "Let e be the identity: a * e = a"; "p * p⁻¹ = e" |
| 1999 Q10 | Matrices | "Leading diagonal" unexplained; trap D's numbers wrong | Say "elements"; \|A\| = ad − bc first; fix trap D |
| 2002 Q40 | Matrices | Seats metaphor; dense 2 × 2 line | Row by column, one element per moment |
| 1989 Q36 | Euclidean geometry | Key fact not shown on the figure; Pythagoras wording | Diagonals bisect at 90° (property of rhombus), in brackets; mark it on the sketch |
| 1992 Q26 | Euclidean geometry | Dense angle chase; similar triangles not set out | Reasons in brackets; △PSQ \|\|\| △QSR (equiangular) with all three ratios |
| 2002 Q12 | Mensuration | Stock sketch line; no check | A = θ/360 × πr² written first; the givens listed |
| 1987 Q43 | Mensuration | 3-D triangle never drawn | "Re-draw" the right-angled triangle flat, then Pythagoras |
| 1999 Q23 | Loci | "Diagram of the circle" with no circle; long expansion | Keep PV² = PW² (it is the Nigerian method); remove the wrong line; one move per line |
| 2004 Q31 | Coordinate geometry | Stock graph line; the crux gets one moment | Distance formula first; "−2(α + β)" step on its own line |
| 1985 Q38 | Trigonometry | 30-60-90 triangle from nowhere; co-function jargon | Special-angles triangle (half an equilateral) drawn and tabulated; read each ratio from it |
| 1987 Q39 | Trigonometry | Pythagoras said twice; the perfect square spotted without help | Draw the triangle (tan = opp/adj), hyp by Pythagoras, name the (a + b)² pattern; numbers as a check |
| 1999 Q37 | Differentiation | Chain rule in one moment; "u dash", rectangle | "Let u, v"; "let t = x³ + 1"; du/dx notation (§3.15) |
| 1999 Q33 | Application of differentiation | −b/2a in a calculus topic | dy/dx = 0 and d²y/dx² (§3.16) |
| 1994 Q41 | Integration | "+ c" not in the rule | ∫xⁿ dx = xⁿ⁺¹/(n + 1) + c |
| 1994 Q42 | Integration | Area never shown; shortcut formula first | Expand first (or let u = 2x + 1); the shaded area on the graph |
| 1987 Q47 | Representation of data | Two pictures; Σ not said | x \| f \| fx table |
| 1994 Q44 | Location | Five brackets expanded in one line; four products in one moment | x \| f \| fx table in terms of y; Σfx/Σf = 43/14; the option test as a check |
| 1999 Q44 | Dispersion | SD meaning skipped; heavy algebra | Mean, deviations and squares in a table (try x = 4 as the check) |
| 1994 Q48 | Dispersion | Formula unexplained; no option equals the exact answer | Table with an fx² column; flag the question |
| 1999 Q43 | Permutation and combination | Good | Write ⁶Cᵣ/⁶Pᵣ from the formulas |
| 1999 Q41 | Probability | Three products per moment; "chances" | P(A)P(B′)P(C′) + …, with complement notation |

## 7. The model lessons: a combined verdict

| Lesson | Clearer than before? | Follows the Nigerian method? | What to change |
|---|---|---|---|
| 1994 Q7 sets | Yes | **No**: counted-twice backbone, "E", "U sign", formula last | Use the x-equation layout (§3.3); counted-twice as the "why" |
| 2003 Q9 sets | Yes | **No**, same reasons | Same |
| 1999 Q9 sets, three sets | Yes (filled from the middle) | **Partly**: no n( ), ε or symbols on the board | Write n(Y ∩ P ∩ M) = 3 etc.; the three-set formula in symbols |
| 2003 Q43 probability | Yes | **Method yes, wording no** | P(E), P(B₁), "and/or rules" as formulas; add the ⁵C₁³C₁/⁸C₂ check |
| 1983 Q50 speed | Yes | Yes ("Let the first speed be v") | Add ∴ |
| 1989 Q8 interest | Yes | **Partly**: year-by-year jar first, I = PRT/100 as the check | Formula first; jar as the "why" |
| 1997 Q28 arc | Yes | **No**: formula never written; cake carries the method | §3.11 outline |
| 1989 Q44 pipe | Yes | Mostly: V = πr²h written; outer − inner | Lead with V = π(R² − r²)h, or keep and add ∴ |
| 1994 Q19 AP | Yes | **Partly**: staircase before Tₙ | Formula first (§3.7) |
| 2002 Q11 intercepts | Yes | Yes | Shorten the balancing line |
| 1998 Q4 logs | Yes | Yes (laws written, index form) | Show −(xy + x) = −xy − x; move the "honest note" |

The models also grew by about 50% (12.5 → 19 moments) and say more per moment (1.8 → 2.4
sentences). Writing the standard method one line per moment gives a natural length, usually 8–15
moments. That is shorter than most models and less dense.

---

# Part C. Plan and questions

## 8. Plan for rewriting all Maths lessons

### 8.1 Order

| Wave | Topics | About how many lessons | Q per paper | Why |
|---|---|---|---|---|
| 0 | **Lesson standard.** Add the §1 habits and §4 rules to the lesson style guide. Build the division ladder layout. Agree one template per topic (the §3 outlines) with the expert | — | — | The fixes repeat across hundreds of lessons |
| 1 | Number bases, fractions/percentages/ratio/interest, polynomials and quadratics, variation, inequalities | 400 | about 16 | The founder's complaint. The method differs (bases, ratio, profit, factorising) and these are the most-asked algebra and number questions |
| 2 | Sets, location, dispersion, representation, probability | 185 | about 9 | Method and table layout differ (x-equation, tables, sample space, sectoral angle). Live diagrams fit |
| 3 | Euclidean geometry, trigonometry (bearings), mensuration, loci | 300 | about 14 | Reasons in brackets, North lines, formula-first, constructions. Mostly layout, partly mechanical |
| 4 | Application of differentiation, differentiation, integration | 60 | about 3 | Few questions, but a different method (dy/dx = 0) and wrong notation (u dash) |
| 5 | Indices/logs/surds, progressions, matrices, coordinate geometry, binary operations, permutation and combination | 200 | about 9 | Already close to the Nigerian method; light edits |

**Quick fixes before wave 1** (2–4 days, searchable):
- remove the "diagram of the circle" and stock sketch lines;
- remove rules said twice;
- fix the set notation (E, "U sign"), "chance" and "seats";
- fix the content errors in §4.8.

### 8.2 What the reviewer checks (Maths)

1. **Exercise-book test.** Could a student copy the board, line for line, as their exam answer?
   Is every line one they would write? Is anything they must write missing?
2. **Method test.** Is it the textbook method named in §3? Does any shortcut or picture come only
   after it?
3. **Notation and wording test.**
   - ∴, "Let x be", ∝, C.P./S.P., ε, n(A), A′, ∪/∩ read as union/intersection, P(E), Σ,
     du/dx, |AB|.
   - Reasons in brackets.
   - Numerals in other bases read digit by digit.
4. **Picture test.** Does every picture sit beside a written step and explain why it works? Is
   any step done by the picture alone?
5. **One move per line.** A student can redo each line from the one before.
6. **Check and traps.** A check after the answer. Each wrong option traced to its slip, in the
   same vocabulary.
7. **Maths re-worked independently.** The review found 7 content issues (§4.8).
8. **Phone test.** No written line wider than the screen. No voice moment over about 30 words.

### 8.3 Effort

| Item | Effort |
|---|---|
| Wave 0: the standard, 23 topic templates with the expert, the ladder layout | 4–6 weeks (founder + expert; a few days of engineering) |
| Quick fixes | 2–4 days |
| Drafting about 1,040 lessons from the templates (model-written) | Quick per lesson; the work is in review |
| Human review against §8.2 | 30–40 minutes a lesson, so **500–650 hours**: about 13–16 weeks for one reviewer, or 7–8 for two |
| Pilot | 5–10 students per wave, two lessons each: where do they stop, replay, or copy the board? |
| Re-voicing | Depends on the voice. With a paid voice, estimate and agree the cost first; the free Kokoro voice has no per-lesson cost |

---

## 9. Open questions for the content expert

1. **How strict should the layout be?** Should every lesson copy the exercise-book solution
   exactly (∴, "Solution", reasons in brackets), or is a lighter version acceptable on a phone
   screen?
2. **Shortcuts.** May lessons show exam shortcuts at all: option testing, −b/2a, "counted
   twice", the carry method for bases? If so, always after the standard method, and labelled?
3. **Pythagoras wording.** "Hypotenuse² = opposite² + adjacent²" (our lessons; one helper says
   some Nigerian texts use it) or "(Pythagoras)" beside the squared lengths, as in the research
   note?
4. **Set notation.** The research note finds ε (or U) and A′ (not Aᶜ) in Nigerian books and WAEC. Should lessons use ε throughout, and mention U and ᶜ only when a question prints them?
5. **Quadratics.** Is "Product = …, Sum = …" plus splitting the middle term the method to
   standardise on? Should the formula and completing the square be shown too, and when?
6. **Log and trig tables.** Should lessons on 1983–1990 questions teach four-figure tables
   (characteristic, mantissa, degrees and minutes)? No lesson does now.
7. **Synthetic division and other non-syllabus methods** (secant angles, the frustum formula,
   second differences, the co-function rule). Remove them, or keep them as "another way"?
8. **Loci.** Should lessons show the ruler-and-compass construction step by step, even in
   multiple-choice questions?
9. **Faulty questions.**
   - 1998 Q4 (logs of negative numbers).
   - 1994 Q48 (no exact option).
   - 1995 Q48 (the answer may be wrong by the grouped-median formula).

   Teach these as printed with a note, or withdraw them?
10. **Length.** Writing the standard method one line per moment gives about 8–15 moments per
    question. Is a separate, slower "explain it to me" path needed for weak students, or is the
    standard method with supporting pictures enough?
11. **Order of rewriting.** Does the wave order in §8.1 match where Nigerian students lose most
    marks?

---

*Method note.*
- The measurements, the topic dumps and the per-topic notes behind §2–3 were kept in the
  reviewer's scratch folder, outside the repository. They can be added to the repository on
  request.
- Lesson sampling covered about 750 lessons (all lessons in 17 topics; at least 44–74 lessons in
  each of the others).
- All three research notes agree with the standard methods used here. The number-and-algebra
  note arrived after the first draft; its extra detail (work directly in the base, ε and A′,
  "total parts" for ratio, truth sets for modulo tables) has been folded in.
