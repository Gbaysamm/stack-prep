# Stack Prep lesson style guide

This is how a lesson on the board should look, sound and read. It is the standard for every
lesson (Maths, English, and the subjects to come) and for the board that plays them. It
borrows what works in the SternHost explainer videos (C:\Users\yakub\SternHost, STYLE_GUIDE.md)
and goes further, because a lesson has to *teach*, not just inform.

The audience is a Nigerian secondary school student preparing for UTME or WAEC, often on a
phone and often in a second language. **If a 15-year-old who has never met the topic can't
follow every step, the lesson is wrong.**

---

## 1. The shape of a lesson

1. **Hook (moment 0).** Open a curiosity gap; don't just restate the question.
   - "Most students pick 6 here, and it's a trap. Let's see why."
   - "Two clubs, 40 students, and some are in both. How many are in neither?"

   The picture (doodle or sketch) is already on the board when the voice starts, so the
   board is never blank.
2. **Set the scene.** Say what we know and what we want, in plain words, with the picture.
   Every given is pointed at on the picture, not just written.
3. **The working, one idea per step.** Never skip a step a student would have to do in their
   head. If a line combines two moves, split it into two moments.
4. **Check.** Put the answer back in, or test it against the picture.
5. **The answer,** with why the trap options are wrong.

## 2. Explaining: more, slower, simpler

- **Never jump a step.** Moving a term across the = sign, cancelling, expanding a bracket,
  converting units: each gets its own moment.
- **Say why, not just what.** "We divide both sides by 3 *because* we want n by itself."
- **Name the rule before using it,** in words first, then symbols. The rule is written in its
  named form first (hypotenuse² = opposite² + adjacent²), then the question's letters are
  matched to it, then numbers are put in.
- **Short sentences,** one idea each. Everyday words; explain a term the moment it first
  appears ("the union, which means everything in either set").
- **One everyday picture per lesson,** kept all the way through: a class for sets, a jar for
  interest, a staircase for progressions.
- **Pace:** after a key step, give the student a breath. A short pause moment ("Look at what
  just happened…") is better than rushing on.
- **Hard topics get more moments, not denser ones.** Set theory, probability, logs, matrices
  and variation start from the picture and build the symbols out of it.

## 3. How we say maths in Nigeria

Say it the way a Nigerian teacher says it in class, in the order it's written:

| Write | Say | Never say |
|---|---|---|
| 8 − 7 = 1 | "8 minus 7 is 1" | "7 from 8 is 1", "take 7 from 8" |
| 3 × 4 | "3 times 4" | |
| x² | "x squared" | |
| ½ | "a half", "one over two" | |
| √9 | "square root of 9" | |
| n(A ∩ B) | "the number in A intersection B" | |
| ₦500 | "five hundred naira" | |

- Use "naira" and "kobo", Nigerian names (Ade, Ngozi, Musa, Chidi), and Nigerian settings
  (market, danfo, school, farm).

## 4. The picture is part of the explanation

- **Pictures are introduced by the voice:** "Let me draw the two clubs." Then the pen draws
  them.
- **Label with meaning, not just letters.** Write "radius 7 cm", "the ladder, 10 m", "students
  in both", never only "r", "AB" or "x".
- **Every given and every result is put on the picture as the working reaches it,** and linked
  to its line. The picture fills up as the solution does.
- **The voice describes what the pen is doing to the picture:** "Now I'll shade the part where
  the circles overlap: that's the students in both clubs."
- **Doodles form one connected scene, not separate stickers.**
  - The same characters and objects stay for the whole lesson and are acted on (moved,
    filled, split, counted, labelled).
  - A later doodle refers to an earlier one (an arrow, a link, the same colour).
  - Values travel along arrows from the picture into the working.

## 5. Look and feel

- **Paper:** a warm off-white sheet with faint grain.
- **Handwriting everywhere.** Everything the pen writes, including the maths, is in a
  handwriting font, so it looks like writing on a board, not printed text. Fractions, powers
  and roots keep their layout but are drawn in the handwriting style.
- **Room to breathe.**
  - The working is in clear sections ("What we know", "Find the union", "Check").
  - There is space between sections, and at most one or two marks fight for attention at
    once.
  - A new section starts with a short heading chip.
- **Colours mean the same thing in every lesson:**

  | Colour | Meaning |
  |---|---|
  | green | right, the answer, "after" |
  | red | trap, wrong, "before" |
  | purple | the key idea or rule being named |
  | blue | what the question gives us |
  | orange | what we're looking for ("?"), warnings |
  | yellow | highlighter only |

- **Nothing is ever perfectly still:** finished drawings keep a slight hand-drawn shimmer.
  It stops when paused and when reduced motion is on.

## 6. Motion and sound

- **Things appear on the word that names them** (`on:` in the lesson file), never before and
  never long after.
- **One focal point at a time.** If three things happen in one second, cut one.
- **Motion vocabulary:**
  - draw-on (default);
  - spring pop (things arriving, with overshoot);
  - shake (wrong or trap);
  - float (idle life);
  - travel (a value moving along an arrow).
- **Sound effects,** quiet under the voice and about 2–4 per moment at most, with a mute
  button:

  | Sound | Use |
  |---|---|
  | pop | arrivals |
  | scribble | the pen starting |
  | tick | counting or checking options |
  | error | a trap |
  | ding | the answer |
  | whoosh | movement |

- **No captions.** The coach card at the bottom already shows what is being said.

## 7. The lesson file (YAML)

- **The existing fields stay:** say, write, answer, point, show_sketch, doodle, doodle_do.
  - Doodles follow docs/plans/doodles-v2-contract.md.
  - Marks follow the existing rules: at most 3 per moment.
- **New, optional fields:**
  - `on: 'word'` (plus `on_nth` for a later occurrence) on the moment (times its write and
    sketch), a point item, a doodle or a doodle_do item: it appears when that word in this
    moment's `say` is spoken. Words inside `$…$` don't count; whole words only.
  - `travel` marks: a value rides an arrow from a picture part into a line.
  - `section: 'Find the union'` on a moment: starts a new titled section of the working.

## 8. Review checklist (every lesson)

- [ ] **The hook** opens a question; the picture is on the board from the start.
- [ ] **No skipped steps:** a student could redo every line from the one before it.
- [ ] **Every rule** is named in words before it's used.
- [ ] **Maths is said the Nigerian way,** in written order ("8 minus 7").
- [ ] **The picture is labelled with meaning,** and every given and result is put on it.
- [ ] **Doodles form one scene** that is acted on, not separate stickers.
- [ ] **Things appear on their words;** one focal point at a time.
- [ ] **Colours keep their meaning.**
- [ ] **The working is in sections,** with room between them.
- [ ] **The answer is checked,** and every trap option is explained.

---

## 9. Maths: the Nigerian classroom method

A Maths lesson teaches the solution a good Nigerian SS3 student writes in the exam, in the
order they write it. The board is their exercise book: nothing on it should be something they
would not write, and nothing they must write should be missing. The full reasoning is in the
[Maths content review](content-review/maths-review.md) (§1, §4, §8.2), drawn from three research
notes: [number and algebra](content-review/nigerian-methods/number-and-algebra.md),
[geometry and trigonometry](content-review/nigerian-methods/geometry-and-trigonometry.md) and
[calculus and statistics](content-review/nigerian-methods/calculus-and-statistics.md).

### 9.1 The habits on the board

| Habit | What the board shows |
|---|---|
| **"Solution"**, then a sketch or table with the givens on it | "Solution", the sketch, the given values written on it |
| **Givens listed** | "P = ₦800, R = 12½%, T = ?"; "a = 1, d = ?, n = 6"; "r = 21 cm, θ = 60°, π = 22/7" |
| **"Let …" for the unknown** | "Let the number of students offering both be x"; "Let n(M ∩ P) = x" |
| **The formula in general first**, then substitute, then simplify, one line each | "L = θ/360 × 2πr", "= 60/360 × 2 × 22/7 × 21", "= 22 cm" |
| **∴ before the answer**, with units and accuracy | "∴ minor arc = 22 cm"; bearings in three figures, "085°" |
| **A check** after the answer | put the answer back in, or a second route |
| **Reasons in brackets** on geometry lines | "∠PQS = 50° (base ∠s of isos. △)" |
| **Named procedures** | BODMAS; SOH CAH TOA; CAST; "Product = ac, Sum = b"; "Either … = 0 or … = 0"; "equate indices"; "expand along the first row"; "at turning point, dy/dx = 0" |
| **Numbered equations** | "… (1)", "… (2)", "(2) − (1):" |
| **The standard tables** for any data | x \| f \| fx \| cf; the deviation table; Item \| Frequency \| Sectoral angle; the 6 × 6 dice table; the sign table for inequalities; the Venn diagram with region expressions (32 − x \| x \| 24 − x) |
| **North lines** on every bearings sketch | a North line at each point a bearing is taken from |
| **Place-value indices above the digits** for base conversions | 241₅ with the indices 2, 1, 0 written over the digits, then 2 × 5² + 4 × 5¹ + 1 × 5⁰ |
| **The division ladder** for bases, prime factors, LCM and HCF | repeated division down the page, remainders at the side, read upwards |
| **Vertical arithmetic** | long multiplication and long division, not mental splits |

### 9.2 Restructuring rules

1. **Write the exercise-book solution first.** Each of its lines becomes one moment's `write`,
   in the same order and with the same symbols.
2. **The voice teaches the line:** it reads it as a Nigerian teacher would ("one-zero-seven
   base eight", "A union B", "by BODMAS") and says *why* in one sentence.
3. **Pictures support, never replace.** A doodle sits beside a written line to show why it
   works (bundles beside the ladder, counted-twice beside the n(A ∪ B) formula). No step is
   done by the picture alone, and metaphor words stay out of the working ("the remainder", not
   "the loose sticks").
4. **The standard method first, shortcuts second.** Option testing, −b/2a, "counted twice",
   the cover-up rule and special-case formulas come after it, labelled "Exam tip" or "Check".
5. **Use the standard tables and diagrams** (§9.1) as live diagrams.
6. **Say each rule once.** Name it on its own line, then use it; don't restate it in the next
   moment.
7. **Sketch lines name the picture.** "Let me draw the sector", "Let me plot $P$ and $Q$",
   never a stock line ("Let me draw a diagram of the circle first…") that may not match.
8. **Re-work the maths independently.** A taught answer must be exact, or the question and its
   key are corrected at the source; a lesson never says the question or the key is wrong.

### 9.3 Words and notation

| Use | Avoid |
|---|---|
| ε (or U) for the universal set, read "epsilon, the universal set"; n(A) | "E, for everyone" |
| A ∪ B "A union B"; A ∩ B "A intersection B"; A′ "A complement" | "the U sign", "the cup / cap sign", "the upside-down U", "Y with a small c" |
| {x : …} "the set of x such that …" | the colon left unread |
| probability; P(E) = n(E)/n(S), "favourable outcomes over total possible outcomes" | "chance", "balls you want", "and rule" on the board |
| entries (elements), rows and columns, cofactor, adjoint | "seats" for matrix entries |
| ∴, ∝ ("y ∝ x ⇒ y = kx"), C.P. and S.P., L.C.M., H.C.F. | "So the answer is …" in place of ∴ |
| Σ, x̄, cf, S.D. (one symbol throughout a lesson) | "sum of distances", "running totals" for cf |
| du/dx, dy/dx, "differentiate with respect to x" | "u dash" |
| BODMAS | "order of operations" |
| numerals in other bases read digit by digit: "one-zero-one base two" | "one thousand in base 2" |
| \|AB\|, ∠ABC, △ABC \|\|\| △PQR | |
| "times", "multiplied by" | "lots of" |

### 9.4 Topic templates

Each topic follows its outline in the review's
[§3 topic outlines](content-review/maths-review.md#3-topic-by-topic-the-standard-method-our-departures-and-the-fix):
the standard method, the known departures, and a line-by-line model board. Number bases have a
full worked example in §2.4. Until the content expert agrees each template, the §3 outline is
the template.

### 9.5 Maths review checklist (add to §8)

- [ ] **Exercise-book test:** a student could copy the board, line for line, as their exam
      answer; every line is one they would write, and nothing they must write is missing.
- [ ] **Method test:** it is the textbook method in the review's §3; any shortcut or picture
      comes only after it.
- [ ] **Notation and wording:** ∴, "Let x be", ∝, C.P./S.P., ε, n(A), A′, ∪/∩ read as
      union/intersection, P(E), Σ, du/dx, |AB|; reasons in brackets; other bases read digit by
      digit.
- [ ] **Picture test:** every picture sits beside a written step and explains why it works; no
      step is done by the picture alone.
- [ ] **One move per line:** a student can redo each line from the one before.
- [ ] **Check and traps:** a check after the answer; each wrong option traced to its slip, in
      the same vocabulary.
- [ ] **Maths re-worked independently:** the taught answer is exact and matches the key.
- [ ] **Phone test:** no written line wider than the screen; no voice moment over about 30
      words.
