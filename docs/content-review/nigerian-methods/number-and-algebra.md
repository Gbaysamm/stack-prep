# The Nigerian classroom method: Number and Numeration, and Algebra

Scope: JAMB UTME Mathematics, Section I (Number and Numeration) and Section II (Algebra). The topic list and objectives come from `docs/syllabus/utme-Mathematics.pdf`.

Purpose: our lessons should set out each method the way a Nigerian SS1 to SS3 student sees it on the board and writes it in an exercise book. That means the same order of steps, the same layout and the same wording.

## How this was researched, and how much to trust each part

Sources, roughly from most to least authoritative:

1. **WAEC Chief Examiner's reports** (waeconline.org.ng e-learning, General Mathematics Paper 2, 2009–2014). These give the solution WAEC "expected" and the mistakes candidates actually made. About 250 question pages were downloaded and read.
2. **Teacher lesson notes written in Nigeria:**
   - the Ministry-style SS1 First Term note on schoolings.org. It cites *Essential Mathematics* (A.J.S. Oluwasanmi), *New General Mathematics* (Macrae et al.) and *MAN Mathematics* as references, and sets homework from MAN Mathematics;
   - passnownow.com class notes;
   - stoplearn.com notes;
   - headteacher.ng lesson notes. These follow the NERDC scheme-of-work weeks, but they are generic and partly machine-written, so they were used only to confirm a point, not as layout evidence.
3. **Past-question solution sites:** myschool.ng (official answers plus student discussion threads) and schoolngr.com. The student threads are the best evidence of how Nigerian students actually write things down: the notation, "eqn 1", "Sub.", "collecting like terms" and so on.
4. **The NERDC scheme of work, as published by schoolings.org and headteacher.ng.** SS1 First Term covers number bases, indices, logarithms, standard form and approximation, and simple equations and variation. Modular arithmetic and sets come in SS1 Second Term. Binary operations are in Further Maths. Matrices and determinants are in SS3 First Term (General Maths).

What could not be reached: the textbook pages themselves (NGM, MAN, Oluwasanmi), because none are online in full, and YouTube transcripts. classnotes.ng blocks automated fetching, and its pages came back empty.

Evidence tags used below:
- **[Consensus]** means three or more independent Nigerian sources agree.
- **[Common]** means two sources, or one strong source (WAEC) plus standard textbook practice.
- **[Convention]** is standard Nigerian classroom practice that is only lightly evidenced online. Treat it as "very likely" and check it with a teacher if it matters.

---

## 0. Conventions that apply across all topics

Students and WAEC solutions write these the same way everywhere. Use them throughout our lessons.

| Convention | What it looks like | Evidence |
|---|---|---|
| "Solution" heading, or "Soln" in notes | `Solution` written under the question before any working | schoolings, passnownow, myschool threads [Consensus] |
| Therefore | `∴` on the board. Students type it as `.:` or write "Therefore"/"Hence" | myschool threads (`.: Y/Z`), schoolngr (`∴ x = −1`), WAEC ("Hence") [Consensus] |
| Numbered equations | `2x + 3y = 13 ............ (1)`, or `eqn (1)` / `eqn. 1` / `(i)` with a dotted leader | schoolings ("…………(1)"), WAEC ("------- eqn(1)", "(eqn. 1)"), myschool ("......eqn 1"), passnownow ("………. (i)") [Consensus] |
| Operating on equations by label | "subtract (1) from (2)", "(1) × 2", "Sub. (3) into (2)", "Substitute 3 for d in (1)" | schoolings, WAEC, myschool [Consensus] |
| Stock phrases | "Recall that…", "collect like terms", "cross multiply", "open the bracket", "divide both sides by…", "Let x be…", "L.C.M." | schoolings, myschool, WAEC [Consensus] |
| One step per line | Each line starts with `=` under the previous one, never a long chain across the page | all sources [Consensus] |
| Bases | JAMB writes `2434₆`. WAEC writes the base as a word: `231five`, `1011two`, `14five` | JAMB items on myschool and schoolngr; WAEC reports ("X3five − 14five = 2Xfive") [Consensus] |
| Money | `₦` before the amount, two decimals for kobo: `₦720.00` | WAEC reports, schoolings [Consensus] |
| Final answer | Restate it in words or in full notation: `∴ 25₁₀ = 11001₂`, "The cost of 18 bottles is ₦720" | headteacher, schoolings [Consensus] |

---

## 1. Number bases and modular arithmetic

### 1.1 Base n → base 10 (expansion method)

**The Nigerian method [Consensus]:**

1. Write the number with its base as a subscript.
2. **Write the place values (the powers/indices) above the digits, starting from 0 at the right-hand digit and counting up to the left.** Passnownow sets this out as a "reference table", with a row of powers above a row labelled "Number". Many teachers just write small numbers 3 2 1 0 over the digits.
3. Expand: (digit × base^index) + (digit × base^index) + …, keeping the brackets.
4. Work out each power: write "2³ = 8" and so on, or replace each bracket with (1 × 8).
5. Add, and write the answer with the subscript ₁₀.

**Worked example (as written in the exercise book):**

Convert 1011₂ to base ten.

```
Solution

   3 2 1 0          <- place values (indices), counted from the right
   1 0 1 1₂

1011₂ = (1 × 2³) + (0 × 2²) + (1 × 2¹) + (1 × 2⁰)
      = (1 × 8)  + (0 × 4)  + (1 × 2)  + (1 × 1)
      =    8     +    0     +    2     +    1
      = 11₁₀

∴ 1011₂ = 11₁₀
```

The same layout in passnownow's "reference table" form, for 32.51₆:

```
Place value | 6¹ | 6⁰ | 6⁻¹ | 6⁻² |
Number      |  3 |  2 .  5  |  1  |

32.51₆ = 3 × 6¹ + 2 × 6⁰ + 5 × 6⁻¹ + 1 × 6⁻²
       = 3 × 6  + 2 × 1  + 5 × 1/6 + 1 × 1/36
       = 18 + 2 + 5/6 + 1/36
       = 20.86₁₀ (2 d.p.)
```

A second example, in a base other than 2: 243₅

```
   2 1 0
   2 4 3₅

243₅ = (2 × 5²) + (4 × 5¹) + (3 × 5⁰)
     = (2 × 25) + (4 × 5)  + (3 × 1)
     = 50 + 20 + 3
     = 73₁₀
```

**Teacher wording:**
- "Write the place values on top of each digit, starting from zero on the right."
- "Each digit is multiplied by the base raised to the power on top of it."
- "Any number raised to power zero is 1."
- Passnownow: "The powers correspond to the place values of the number and they show the order of the digits." It calls the row of powers "the reference table, i.e. the table showing the digit position and place value of the given numbers."

**Alternative seen in passnownow:** "repeated/successive multiplication". Multiply the first digit by the base, add the next digit, multiply by the base again, and so on. Passnownow itself warns that "it is safer and faster to use the expanded form". **Use the expanded form in our lessons.**

### 1.2 Base 10 → base n (repeated division)

**The Nigerian method [Consensus]:**

1. Draw the division ladder. The base goes on the left of a vertical bar and the number on the right.
2. Divide by the base. Write the quotient on the next line down and the remainder beside it, marked `R`, `r` or `Rem`.
3. Keep dividing the new quotient until the quotient is 0. The last line reads `0 R 1`, or whatever the last remainder is.
4. **Read the remainders from bottom to top** (an upward arrow is often drawn beside the column).
5. Write the answer with the new base as a subscript.

Note the layout: each remainder is written **on the same line as the quotient it came with**. `2 | 19 R 1` means 39 ÷ 2 = 19 remainder 1. (Sources: schoolngr, schoolings, myschool threads, passnownow.)

**Worked example:** Convert 39₁₀ to base two.

```
Solution

2 | 39
2 | 19   R 1    ↑
2 |  9   R 1    ↑
2 |  4   R 1    ↑   read the remainders
2 |  2   R 0    ↑   from bottom to top
2 |  1   R 0    ↑
  |  0   R 1    ↑

∴ 39₁₀ = 100111₂

Check: 100111₂ = 32 + 0 + 0 + 4 + 2 + 1 = 39 ✓
```

The schoolngr explanation for this same JAMB question stops one division early and gives 10011₂, which is wrong. Third-party answers contain errors, so our lessons should always end with a "Check" line.

Headteacher writes the same method inline instead of as a ladder:

```
25 ÷ 2 = 12 R 1
12 ÷ 2 =  6 R 0
 6 ÷ 2 =  3 R 0
 3 ÷ 2 =  1 R 1
 1 ÷ 2 =  0 R 1
Reading the remainders from bottom up: 11001₂
```

**Teacher wording:**
- "Divide repeatedly by the new base and write down the remainders."
- "Continue until the quotient becomes zero."
- "Read the remainders from bottom to top" / "read upwards".
- Passnownow gives the reason: "we read the remainders upwards because… the last remainder is the largest number in that base."

### 1.3 Base n → base m (go through base ten)

**The Nigerian method [Consensus]:** "First express the number in base ten, then convert from base ten to the required base" (schoolings HINT, passnownow, headteacher). The page shows two clearly separated steps.

**Worked example:** Express 4104₅ in base eight. (This is passnownow's example.)

```
Solution

Step 1: change to base ten
   3 2 1 0
   4 1 0 4₅
4104₅ = (4 × 5³) + (1 × 5²) + (0 × 5¹) + (4 × 5⁰)
      = (4 × 125) + (1 × 25) + 0 + (4 × 1)
      = 500 + 25 + 0 + 4
      = 529₁₀

Step 2: change 529₁₀ to base eight
8 | 529
8 |  66   R 1
8 |   8   R 2
8 |   1   R 0
  |   0   R 1

∴ 4104₅ = 1021₈
```

### 1.4 Addition, subtraction and multiplication in a base (column method)

**The Nigerian method [Consensus]:** work directly in the base, column by column from the right, exactly as in base ten, except:
- **Addition:** if a column total is equal to or greater than the base, divide it by the base. Write down the remainder and carry the quotient. Headteacher: "divide the sum by the base, write down the remainder, and carry the quotient to the next column." The myschool thread says: "since it is in base 2 we can't put any number higher than 2, so we divide by the base… write down the remainder and carry 1 over."
- **Subtraction:** when the top digit is too small, borrow 1 from the next column. **The borrowed 1 is worth the base, not 10.** Schoolings: "the number carried from nearby to support the other becomes the base in operation added to the original number."
- **Multiplication:** multiply as in base ten, but turn each product into the base (write the remainder, carry the quotient). Then add the partial products in the base.

WAEC Chief Examiner (2009 Nov., Q6): "majority of them converted first to base ten, solved it and converted back to base 2. Very few candidates were reported to have worked in base 2." **Teachers and WAEC expect the work to be done in the given base.** Converting to base ten is the fallback, not the method.

**Addition (JAMB 2008).** Add 1101₂, 10111₂ and 111₂.

```
        1 0 1 1 1
          1 1 0 1
    +       1 1 1
    -------------
      1 0 1 0 1 1₂
    -------------
Column 1 (right): 1 + 1 + 1 = 3 = 1 two + 1    -> write 1, carry 1
Column 2:         1 + 0 + 1 + 1 (carried) = 3  -> write 1, carry 1
Column 3:         1 + 1 + 1 + 1 = 4 = 2 twos + 0 -> write 0, carry 2
Column 4:         0 + 1 + 0 + 2 = 3            -> write 1, carry 1
Column 5:         1 + 1 = 2                    -> write 0, carry 1
Column 6:         carried 1                    -> write 1
```

A single-pair version in passnownow's wording: "1st column: 1 + 1 = 10, write down 0 and carry 1."

**Addition in base five:** 342₅ + 244₅

```
      3 4 2
   +  2 4 4
   --------
    1 1 4 1₅

2 + 4 = 6 = 1 five + 1        -> write 1, carry 1
4 + 4 + 1 = 9 = 1 five + 4    -> write 4, carry 1
3 + 2 + 1 = 6 = 1 five + 1    -> write 1, carry 1
carried 1                     -> write 1
```

**Subtraction in base five** (headteacher's evaluation question): 41₅ − 23₅

```
      ³4 ⁶1        (borrow 1 five: 1 + 5 = 6)
   −   2  3
   --------
       1  3₅

Units: 1 − 3 is not possible; borrow 1 five from the 4. Now 1 + 5 = 6, and 6 − 3 = 3
Fives: 4 became 3; 3 − 2 = 1
∴ 41₅ − 23₅ = 13₅
```

**Multiplication in base five** (schoolings' example: "find the product of 214 and 23 both in base five"):

```
          2 1 4
       ×    2 3
       --------
        1 2 0 2      <- 214 × 3
      4 3 3 0        <- 214 × 2, shifted one place (write 0)
      ---------
      1 1 0 3 2₅

214 × 3:  4 × 3 = 12 = 2 fives + 2      -> write 2, carry 2
          1 × 3 + 2 = 5 = 1 five + 0    -> write 0, carry 1
          2 × 3 + 1 = 7 = 1 five + 2    -> write 2, carry 1 -> 1202
214 × 2:  4 × 2 = 8 = 1 five + 3        -> write 3, carry 1
          1 × 2 + 1 = 3                 -> write 3
          2 × 2 = 4                     -> write 4         -> 433
Add in base five: 1202 + 4330 = 11032₅
Check: 214₅ = 59, 23₅ = 13, 59 × 13 = 767 = 11032₅ ✓
```

**Unknown digit or unknown base (very common in JAMB):** expand both sides in base ten and solve.
- WAEC 2009 Nov.: "X3five − 14five = 2Xfive" gives 5X + 3 − (5 + 4) = 10 + X, so X = 4.
- WAEC warns that candidates wrote "−5 + 4 instead of −(5 + 4)". **Keep the expanded number in a bracket before subtracting it.**

### 1.5 Fractional parts

**Base n → base 10 [Consensus]:** the indices carry on past the point as −1, −2, −3… Write them above the digits too.

```
   2 1 0 . −1 −2
   1 1 0 .  1  1₂

110.11₂ = (1 × 2²) + (1 × 2¹) + (0 × 2⁰) + (1 × 2⁻¹) + (1 × 2⁻²)
        = 4 + 2 + 0 + 1/2 + 1/4
        = 6.75₁₀
```

Headteacher: "digits after the decimal point are multiplied by negative powers of the base, starting from −1". Schoolings calls a binary fraction a "bicimal".

**Base 10 fraction → base n [Convention; only lightly evidenced online]:** multiply the fractional part by the base again and again. The whole-number parts are the digits, **read from top to bottom**, which is the opposite of the division ladder.

```
0.375 × 2 = 0.75  -> 0   ↓
0.75  × 2 = 1.5   -> 1   ↓
0.5   × 2 = 1.0   -> 1   ↓
∴ 0.375₁₀ = 0.011₂
```

### 1.6 Modular arithmetic

**The Nigerian method [Consensus]:** divide by the modulus and keep the remainder. Write `15 (mod 4) = 15 ÷ 4 = 3 remainder 3, ∴ 15 ≡ 3 (mod 4)`.

Rules taught (schoolings, SS1 Week 4):
- the result must be less than the modulus;
- count clockwise to add and anticlockwise to subtract (the "clock" picture);
- for negative numbers, add multiples of the modulus until the result is positive.

```
a)  42 + 28 = 70;   70 ÷ 8 = 8 R 6       ∴ 42 + 28 ≡ 6 (mod 8)
b)  −17 (mod 10):   −17 + 2 × 10 = 3      ∴ −17 ≡ 3 (mod 10)
c)  4 × 5 = 20;     20 ÷ 7 = 2 R 6       ∴ 4 × 5 ≡ 6 (mod 7)
d)  Solve 3x ≡ 5 (mod 7):
       try x = 0, 1, 2, …  ->  3 × 4 = 12 = 1 × 7 + 5
       ∴ x = 4
e)  Today is Tuesday. What day is it in 40 days?
       40 ÷ 7 = 5 R 5  ->  Tuesday + 5 days = Sunday
```

**Modulo tables:** WAEC (2014 Q8) expected candidates to "complete the table by multiplying the figures, divide the result by 11 and record the remainder". It then wanted them to read solutions off the table and **give them as a truth set**, `{9}`. Some candidates lost marks for not writing the answer as a set. See the table layout in §9.

### Common mistakes (number bases and modular arithmetic)

- Reading the remainders downward instead of upward. This is the number-one warning in every source.
- Stopping at quotient 1 and forgetting the last line, `1 ÷ 2 = 0 R 1`. The leading digit is lost. (The schoolngr explanation of 39 → base 2 makes this exact error.)
- Starting the indices at 1 instead of 0, or counting them from the left.
- Using a digit equal to or bigger than the base, such as a 2 in base two or a 5 in base five. Schoolings' HINT: "No number must be equal or greater than the base."
- Carrying in tens instead of in the base (writing 6 in base five, or borrowing 10).
- Converting to base ten when the question says to work in the base (WAEC).
- Sign slip when expanding a subtracted number: −14five becomes −5 + 4 instead of −(5 + 4) (WAEC).
- Fractional part: using indices 1, 2 instead of −1, −2 after the point.
- Modular arithmetic: leaving the answer negative, or not giving it as a set when asked for a "truth set".

### Sources: number bases and modular arithmetic

- https://passnownow.com/conversion-bases-base-10-ten/ : expanded form; the "reference table" of powers above the digits; division ladder with "Rem"; "read the remainders upwards"; base 5 → base 8 via base 10; fractional parts.
- https://passnownow.com/classwork-series-exercises-mathematics-base-two-arithmetic/ : base-two addition table; column addition with "write down 0 and carry 1".
- https://schoolings.org/?p=70168 : Ministry-style SS1 First Term note (Weeks 2–4). Division ladders written as `8 | 125 r 7`, base-to-base HINT, rules of base numbers, base-five multiplication, modular arithmetic rules and examples. Cites Oluwasanmi, NGM and MAN Mathematics.
- https://www.headteacher.ng/lesson-note-on-number-bases-i-bases-and-conversions-for-sss-1/ : `25 ÷ 2 = 12 R 1` inline layout; "Reading the remainders from bottom up"; expansion with negative powers.
- https://www.headteacher.ng/lesson-note-on-number-bases-ii-operations-and-applications-for-sss-1/ : rules for carrying ("divide the sum by the base… carry the quotient") and borrowing ("the borrowed value is equal to the base").
- https://www.headteacher.ng/lesson-note-on-modular-arithmetic-integers-and-applications-for-sss-1/ : `a ≡ b (mod n)`, remainder method, negative results.
- https://www.schoolngr.com/classroom/mathematics/3887 : JAMB "39 to base 2" ladder using `2 | 19 R 1` (its final answer is wrong).
- https://myschool.ng/classroom/mathematics/9257 : JAMB 2008 binary addition; student writes the column-by-column carry wording.
- https://myschool.ng/classroom/mathematics/14 : JAMB 1999 base-six division; students expand with `(2 x 6^3) + (4 x 6^2) + …` and use a ladder `6 | 23 / 6 | 3r5`.
- https://waeconline.org.ng/e-learning/Mathematics/maths218nq6.html : Chief Examiner on candidates converting to base ten instead of working in base 2.
- https://waeconline.org.ng/e-learning/Mathematics/maths219Nq4.html : "X3five − 14five = 2Xfive"; the −(5 + 4) sign error; WAEC's word-subscript notation.
- https://waeconline.org.ng/e-learning/Mathematics/maths223mq8.html : modulo-11 table; truth-set answer.

---

## 2. Fractions, decimals, approximations and percentages

### 2.1 Significant figures and decimal places [Consensus]

**Method:**
1. Count to the required digit. For s.f., start counting at the **first non-zero digit**. For d.p., count from the decimal point.
2. Look at the **next** digit. If it is 5 or more, add 1 to the last digit you keep. If it is less than 5, leave it.
3. For s.f. in whole numbers, **fill with zeros up to the decimal point**. For d.p., **keep a trailing zero** (67.40, not 67.4).

```
78602    = 80000 (1 s.f.),  79000 (2 s.f.),  78600 (3 s.f.)
0.000057849 = 0.00006 (1 s.f.), 0.000058 (2 s.f.), 0.0000578 (3 s.f.)
67.3994  = 67.40 (2 d.p.),  67.399 (3 d.p.)
```

(These examples are from schoolings, SS1 Week 5.) Abbreviations: `s.f.` and `d.p.`. The required accuracy is always written in brackets after the answer.

**Common mistakes:**
- counting leading zeros as significant;
- dropping the place-holding zeros (writing 786 for 78602 to 3 s.f.);
- dropping the final zero in 67.40.

WAEC repeatedly took marks off for "not giving answers to 3 significant figures as required".

### 2.2 Percentage error [Common]

**Formula as written:**

```
Percentage error = (error / actual value) × 100%
                 = (|measured − actual| / actual) × 100%
```

**Nigerian staple:** when a measurement is "correct to the nearest…", the maximum error is **half of the unit of accuracy**.

```
A length is 5.2 cm, correct to 1 decimal place. Find the percentage error.

Solution
Maximum error = ½ × 0.1 = 0.05 cm
% error = 0.05 / 5.2 × 100%
        = 0.96%  (2 d.p.)
```

Direct case: actual 10 cm, measured 9.8 cm. % error = (0.2 / 10) × 100% = 2%.

**Common mistake:** dividing by the measured value instead of the actual value.

### 2.3 Simple interest [Consensus]

**Layout:** state the formula, list the values, substitute, then simplify.

```
Find the simple interest on ₦5,000 for 3 years at 8% per annum.

Solution
I = PRT/100
P = ₦5,000,  R = 8%,  T = 3 years
I = (5000 × 8 × 3)/100
  = ₦1,200
Amount, A = P + I = ₦5,000 + ₦1,200 = ₦6,200
```

**Common mistakes (WAEC 2009 May/June Q7):**
- mixing up simple and compound interest;
- applying the formula wrongly;
- for depreciation, using the starting value instead of "the amount at the end of the first year".

Also: forgetting to change months to years (T = 9/12).

### 2.4 Profit and loss percent [Consensus]

```
Profit = S.P. − C.P.            Profit % = (Profit / C.P.) × 100%
Loss   = C.P. − S.P.            Loss %   = (Loss / C.P.) × 100%
```

**Abbreviations:** C.P. (cost price), S.P. (selling price) and M.P. (marked price).

**WAEC working style (2010 Nov. Q6):** turn a percentage statement into "is equal to x% of":

```
A trader gave 8% discount and sold an article for ₦828. Find the marked price.
₦828 = 92% of the marked price
Marked price = 828 × 100/92 = ₦900.00
If ₦900 = 125% of the cost price (25% gain), then
Cost price = 900 × 100/125 = ₦720.00
```

**Common mistake:** working the percentage out on the S.P. instead of the C.P.

### 2.5 Ratio, proportion and rate [Consensus]

To share in a ratio: **add the parts, then take each part as a fraction of the total.**

```
Share ₦1,100 among Salem, Sunday and Shaka in the ratio 8 : 2 : 1.
Total parts = 8 + 2 + 1 = 11
Shaka's share = 1/11 × ₦1,100 = ₦100.00
```

Combining ratios (WAEC 2011 May/June): from x : y = 4 : 1 and y : z = 2 : 1, make the common term the same and get x : y : z = 8 : 2 : 1.

### 2.6 Shares and VAT [Common]

**Terms used:**
- **nominal (par) value**, the price printed on the share certificate;
- **market value**, the price the share is bought at;
- **dividend**, paid as a percentage of the **nominal** value;
- **yield**, the income as a percentage of the money invested.

```
A man buys 2,000 ₦1.00 shares at ₦1.50 each. A dividend of 10% is declared.
Cost of shares = 2000 × ₦1.50 = ₦3,000
Dividend       = 10% of (2000 × ₦1.00) = ₦200
Yield          = 200/3000 × 100% = 6.67%
```

```
VAT = rate × price.  A phone costs ₦12,000 before VAT at 7.5%.
VAT = 7.5/100 × 12,000 = ₦900
Total cost = ₦12,000 + ₦900 = ₦12,900
```

Nigeria's VAT rate has been 7.5% since 2020. Older past questions use 5%, so always take the rate given in the question.

**Common mistake:** working out the dividend on the market value instead of the nominal value.

### Sources: fractions, decimals and percentages

- https://schoolings.org/?p=70168 : SS1 Week 5 examples of nearest ten/hundred, s.f. and d.p.
- https://www.headteacher.ng/lesson-note-on-approximation-rounding-and-percentage-error-for-sss-1/ : rounding rules; percentage-error formula with |approx − actual|/actual × 100%.
- https://waeconline.org.ng/e-learning/Mathematics/maths217mq7.html : simple vs compound interest confusion; depreciation error.
- https://waeconline.org.ng/e-learning/Mathematics/maths219Nq6.html : the "₦828 = 92% of the marked price" working.
- https://waeconline.org.ng/e-learning/Mathematics/maths218nq6.html : profit on 20 TV sets set out with cost price p.
- https://waeconline.org.ng/e-learning/Mathematics/maths222mq2.html : ratio sharing 8 : 2 : 1.
- https://waeconline.org.ng/e-learning/Mathematics/maths219mq4.html : marks lost for not giving 3 s.f.
- JAMB syllabus (local PDF): "shares and value added tax (VAT)".

---

## 3. Indices, logarithms and surds

### 3.1 Laws of indices [Consensus]

Teachers number the laws on the board, and students quote them with "Recall, law of indices…":

```
1. aᵐ × aⁿ = aᵐ⁺ⁿ          (multiplication: add the powers)
2. aᵐ ÷ aⁿ = aᵐ⁻ⁿ          (division: subtract the powers)
3. (aᵐ)ⁿ = aᵐⁿ              (power of a power: multiply)
4. a⁰ = 1                   (zero index)
5. a⁻ⁿ = 1/aⁿ               (negative index: reciprocal)
6. a^(1/n) = ⁿ√a ;  a^(m/n) = (ⁿ√a)ᵐ   (fractional index: root first, then power)
```

**Worked example (JAMB 2008):** Simplify 16^(−1/2) × 4^(−1/2) × 27^(1/3)

```
= 1/16^(1/2) × 1/4^(1/2) × 27^(1/3)
= 1/√16 × 1/√4 × ∛27
= 1/4 × 1/2 × 3
= 3/8
```

**Teacher tip, seen in myschool threads:** when the terms are like 2ⁿ⁺¹ and 2ⁿ⁻¹, write 2ⁿ⁺¹ = 2ⁿ × 2 and 2ⁿ⁻¹ = 2ⁿ × 2⁻¹, then "let 2ⁿ = y":

```
[3(2ⁿ⁺¹) − 4(2ⁿ⁻¹)] / (2ⁿ⁺¹ − 2ⁿ)
= [3(2ⁿ × 2) − 4(2ⁿ × ½)] / (2ⁿ × 2 − 2ⁿ)      let 2ⁿ = y
= (6y − 2y) / (2y − y)
= 4y / y = 4
```

### 3.2 Indicial (exponential) equations: "equate the bases, then the powers" [Consensus]

**Method:**
1. Express both sides as powers of the **same base**.
2. "Since the bases are the same, equate the indices/powers."
3. Solve the linear (or quadratic) equation you get.

```
Solve 9^(x+1) = 27^(x−1)

Solution
(3²)^(x+1) = (3³)^(x−1)
3^(2x+2) = 3^(3x−3)
Equating the indices:
2x + 2 = 3x − 3
2 + 3 = 3x − 2x
∴ x = 5
```

**Factor-out variant (WAEC 2012 Nov.):** 3ˣ + 3ˣ⁺¹ = 36

```
3ˣ + 3ˣ × 3 = 36
3ˣ(1 + 3) = 36
3ˣ × 4 = 36
3ˣ = 9 = 3²
∴ x = 2
```

**Common mistakes (WAEC reports):**
- "divided the indices instead of subtracting them";
- equating the powers before the bases are the same;
- failing to get the second equation when the problem is a simultaneous-indices one.

### 3.3 Standard form [Consensus]

Written as `A × 10ⁿ`, where 1 ≤ A < 10 and n is an integer. Count how many places the point moves. Moving it to the left gives n > 0, and moving it to the right gives n < 0.

```
570200   = 5.702 × 10⁵
0.000175 = 1.75 × 10⁻⁴
(2 × 10³) × (4 × 10⁵) = (2 × 4) × 10³⁺⁵ = 8 × 10⁸
```

**Common mistake:** leaving A outside the 1 to 10 range, for example 51.96 × 10⁶. Schoolings shows the correction step: 51.96304 × 10⁶ = 5.196304 × 10⁷.

### 3.4 Laws of logarithms and how they are written out [Consensus]

**Definition, always taught first:** if aˣ = N, then logₐN = x. In words: "the logarithm of a number to a base is the power to which the base must be raised to give the number".

```
1. logₐ(MN) = logₐM + logₐN        (product)
2. logₐ(M/N) = logₐM − logₐN       (quotient)
3. logₐMᵖ = p logₐM                 (power)
4. logₐa = 1 ;   logₐ1 = 0
5. Change of base: logₐx = log_b x / log_b a
```

**Worked example (JAMB 2009).** Given log₁₀2 = 0.3010 and log₁₀7 = 0.8451, evaluate log₁₀280.

```
log₁₀280 = log₁₀(2² × 7 × 10)
         = 2 log₁₀2 + log₁₀7 + log₁₀10
         = 2(0.3010) + 0.8451 + 1
         = 0.6020 + 0.8451 + 1
         = 2.4471
```

**Worked example (JAMB 1999).** If log₈10 = X, evaluate log₈5 in terms of X.

```
log₈5 = log₈(10/2)
      = log₈10 − log₈2
      = X − log₈2
But 8^(1/3) = 2, so log₈2 = 1/3
∴ log₈5 = X − 1/3
```

**Change of base / same-base trick (JAMB 2003).** log_√2 4 + log_(1/2) 16 − log₄32

```
Let log_√2 4 = a  ->  (√2)ᵃ = 4  ->  2^(a/2) = 2²  ->  a = 4
Let log_½ 16 = b  ->  (2⁻¹)ᵇ = 2⁴ -> −b = 4      ->  b = −4
Let log₄32 = c    ->  2^(2c) = 2⁵                ->  c = 5/2
∴ 4 + (−4) − 5/2 = −2.5
```

Students convert each log to an index statement with "Let … = a", which is the Nigerian habit. They do not use a calculator.

**WAEC "express as a single logarithm" style:** combine the terms step by step on one line each, for example log₁₀(…) − 2log₁₀(…) + log₁₀(…) = log₁₀(…) = log₁₀10 = 1.

### 3.5 Logarithm tables [Consensus for classroom; less relevant for UTME]

JAMB CBT questions test the laws more than table reading, but every Nigerian student learns the table layout in SS1. If a lesson ever shows a table calculation, use the two-column "No. | Log" layout:

```
Evaluate 23.45 × 8.76 using tables.

No.        Log
23.45      1.3701
8.76       0.9425  +
           ------
           2.3126
Antilog of 2.3126 = 205.4
∴ 23.45 × 8.76 ≈ 205.4
```

Conventions:
- the **characteristic** is the whole-number part: one less than the number of digits before the point;
- the **mantissa** is read from the table: "check 23 under 4, difference 5";
- numbers less than 1 have a **bar characteristic**: log 0.0456 = 2̄.6590, read "bar two point six five nine zero";
- add logs to multiply and subtract to divide;
- to find a power, multiply the log by the power; to find a root, divide it;
- finally, take the antilog and place the decimal point using the characteristic.

**Common mistakes (WAEC 2011 May/June):** "inability to read from the anti-logarithm tables correctly", and mishandling the bar when dividing.

### 3.6 Surds [Consensus]

**Rules written on the board (stoplearn and headteacher):**

```
√(ab) = √a × √b          √(a/b) = √a / √b
√(a + b) ≠ √a + √b       p√a ± q√a = (p ± q)√a
```

**Simplify:** "find the largest perfect-square factor".

```
√75 − 2√3 + √12
= √(25 × 3) − 2√3 + √(4 × 3)
= 5√3 − 2√3 + 2√3
= 5√3
```

**Rationalise:** "multiply the numerator and denominator by the conjugate of the denominator".

```
3/(√5 + 2)
= 3/(√5 + 2) × (√5 − 2)/(√5 − 2)
= 3(√5 − 2) / ((√5)² − 2²)
= 3(√5 − 2) / (5 − 4)
= 3√5 − 6
```

The denominator is always shown as a **difference of two squares**: (√5)² − 2².

**Vocabulary:**
- "basic form": no perfect-square factor left under the root;
- "similar (like) surds";
- "conjugate surds": the conjugate of √x + √y is √x − √y.

**Common mistakes:**
- adding unlike surds (√2 + √3 = √5);
- multiplying by the denominator itself instead of the conjugate when the denominator is a binomial;
- sign slips in (a + √b)(a − √b).

### Sources: indices, logarithms and surds

- https://schoolings.org/?p=70168 : SS1 Weeks 5–9; standard form corrections; "NO | LOG" tables, characteristic and mantissa, antilog wording.
- https://www.headteacher.ng/lesson-note-on-indices-laws-and-exponential-equations-for-sss-1/ : the laws listed by name; "make the bases the same, equate the powers".
- https://www.headteacher.ng/logarithms-laws-change-of-base-for-sss-1/ : laws of logarithms; change-of-base formula.
- https://www.headteacher.ng/lesson-note-on-logarithm-ii-tables-for-multiplication-and-division-for-sss-1/ : "Number | Logarithm" table; add logs then antilog (23.45 × 8.76 = 205.4).
- https://stoplearn.com/surds-rules-basic-forms-simplification-addition-and-subtraction-multiplication-and-division-rationalization-and-equality-of-surds/ : rules, basic form, similar and conjugate surds, worked simplifications.
- https://www.headteacher.ng/surds-definition-manipulation-rationalization-for-sss-1/ : rationalising with the conjugate; denominator as (2)² − (√3)².
- https://myschool.ng/classroom/mathematics/9 : JAMB log₈5 = X − 1/3; student threads using "1st law of log" and "Recall".
- https://myschool.ng/classroom/mathematics/573 : "RECALL, law of indices"; "let 2ⁿ = y" technique.
- https://waeconline.org.ng/e-learning/Mathematics/maths220Nq1.html : express 27ˣ as 3³ˣ and equate the powers.
- https://waeconline.org.ng/e-learning/Mathematics/maths221Nq10.html : factorising 3ˣ out of 3ˣ + 3ˣ⁺¹.
- https://waeconline.org.ng/e-learning/Mathematics/maths219mq13.html : "divided the indices instead of subtracting them".
- https://waeconline.org.ng/e-learning/Mathematics/maths220mq1.html : poor use of log rules and antilog tables.
- https://waeconline.org.ng/e-learning/Mathematics/maths223Nq4.html : expressing logs as a single logarithm.

---

## 4. Sets

### 4.1 Notation [Consensus]

- Sets in braces: `A = {1, 2, 3}`.
- Set-builder: `U = {x : x is an integer and 1 ≤ x ≤ 20}`, read "x such that…".
- Symbols:
  - `∈` (is an element of), `∉`;
  - `⊂` (subset);
  - `∪` (union), `∩` (intersection);
  - `A'` (complement; Nigerian books use the prime, not Aᶜ);
  - `∅` or `{ }` (empty set);
  - `n(A)` (the number of elements, "cardinality");
  - `ε` or `U` (universal set). Older Nigerian texts and WAEC often use **ε** for the universal set.
- `A − B` (or `A \ B`): the elements in A but not in B. JAMB 2000: (P − Q) ∩ R = {x}.

### 4.2 Two-set problems [Consensus]

**Formula:** n(A ∪ B) = n(A) + n(B) − n(A ∩ B)

**Method:**
1. Draw the rectangle (ε or U) and two overlapping circles, and label them.
2. **Put the intersection in first**, as a number or as x.
3. Fill the "only" regions as (total − intersection).
4. Put the "neither" region outside the circles, inside the rectangle.
5. Add all the regions, set the sum equal to the total, and solve.

```
In a youth club of 94 members, 60 like modern music (M) and 50 like
traditional music (T). The number who like both is three times the
number who like neither. How many like only one type?

Solution
Let the number who like neither = x, so both = 3x

    ε = 94
   ┌────────────────────────────────┐
   │   M            T               │
   │  ( 60−3x ( 3x ) 50−3x )        │
   │                           x    │
   └────────────────────────────────┘

(60 − 3x) + 3x + (50 − 3x) + x = 94
110 − 2x = 94
−2x = −16
x = 8
∴ both = 3x = 24
Only one type = (60 − 24) + (50 − 24) = 36 + 26 = 62
```

### 4.3 Three-set problems [Consensus]

**Method, the "start from the middle" rule:**
1. Draw three overlapping circles inside ε.
2. Put the **all-three** region in first.
3. Fill each **"two only"** region as (given pair − all three). Watch the word "only": if the question already says "only", use the number as it is.
4. Fill each **"one only"** region as (set total − the three other regions inside that circle).
5. Add up, or form an equation in x if a region is unknown.

```
Market women sell at least one of maize (M), yam (Y), plantain (P).
n(M) = 12, n(Y) = 10, n(P) = 14; 5 sell P and M, 4 sell Y and M,
2 sell Y and P only, 3 sell all three. How many women are there?

Solution
All three                     = 3
M and P only = 5 − 3          = 2
Y and M only = 4 − 3          = 1
Y and P only (given "only")   = 2
M only = 12 − (2 + 1 + 3)     = 6
Y only = 10 − (1 + 2 + 3)     = 4
P only = 14 − (2 + 2 + 3)     = 7
Total = 6 + 4 + 7 + 2 + 1 + 2 + 3 = 25
```

**WAEC expected working:**
- In 2009 Nov. Q10 the unknown region was x: "100 + x + 49 − x + 47 − x + 24 = 200, from where x = 20".
- In 2011 May/June Q6: "x (the number who passed all the subjects) = 19 − (5 + 9 + 2) = 3".

**Common mistakes (WAEC):**
- "majority of the candidates did not draw the Venn diagram correctly. This affected their correct interpretation." Not drawing the diagram at all is a recurring complaint;
- not subtracting the centre from the pair totals, which counts the centre twice;
- ignoring the word "only";
- forgetting the "none" region outside the circles;
- "exactly two" means the sum of the three "two only" regions, not including the centre.

### Sources: sets

- https://www.headteacher.ng/set-ii-operations-venn-diagrams-for-sss-1/ : steps: "Fill in the innermost region (intersection of all sets) first… work outwards… 'only' regions… outside."
- https://myschool.ng/classroom/mathematics/6 : JAMB 1999 market women; students fill "only m & p = 5 − 3 = 2" first.
- https://myschool.ng/classroom/mathematics/556 : JAMB 2000 youth club; let neither = y, both = 3y.
- https://myschool.ng/classroom/mathematics/552 : (P − Q) ∩ R notation.
- https://waeconline.org.ng/e-learning/Mathematics/maths217nq10.html : unknown-region equation; "exactly 2 subjects".
- https://waeconline.org.ng/e-learning/Mathematics/maths220mq6.html : three-set working; the "did not draw the Venn diagram correctly" complaint.
- https://waeconline.org.ng/e-learning/Mathematics/maths219Nq6.html : n(H only) = 30 − 15.

---

## 5. Polynomials

### 5.1 Change of subject [Consensus]

**Method:** undo the operations in reverse order, one per line, and **say each operation** ("subtract b from both sides", "divide both sides by a", "square both sides", "cross multiply", "factorise out q").

```
Make g the subject of T = 2π√(l/g).

T = 2π√(l/g)
Divide both sides by 2π:     T/(2π) = √(l/g)
Square both sides:           T²/(4π²) = l/g
Cross multiply:              gT² = 4π²l
Divide both sides by T²:     g = 4π²l / T²
```

WAEC 2011 May/June Q2 expected: "square both sides… multiply through by r… factorize pq − r³q to have q(p − r³)".

**Common mistakes (WAEC):**
- squaring only one term instead of the whole side;
- failing to factorise out the new subject when it appears twice.

### 5.2 Factorisation: the "product and sum" method, and grouping [Consensus]

**Method for ax² + bx + c:**
1. Multiply a × c (the "product").
2. Find two numbers whose **product is ac** and whose **sum is b**.
3. Split the middle term using them.
4. **Group in pairs and factorise each pair.** The two brackets must be the same.
5. Write the result as two brackets.

```
Solve 3x² + 4x − 175 = 0.

Solution
Product = 3 × (−175) = −525;  Sum = +4
Two numbers: +25 and −21   (25 × −21 = −525;  25 + (−21) = 4)
3x² + 25x − 21x − 175 = 0
x(3x + 25) − 7(3x + 25) = 0
(x − 7)(3x + 25) = 0
Either x − 7 = 0 or 3x + 25 = 0
∴ x = 7 or x = −25/3  (−8⅓)
```

Students phrase it as: "we look for two factors of 525 that when subtracted or added together will give us 4" (myschool). Schoolngr writes it the same way: `p² + 5p − 2p − 10 = 0, p(p + 5) − 2(p + 5) = 0, (p + 5)(p − 2) = 0, ⇒ p + 5 = 0 or p − 2 = 0`.

Other factorisation types named in JAMB:
- **difference of two squares**: a² − b² = (a + b)(a − b). WAEC 2014 Nov.: m² − 2mn + n² − 9r² = (m − n)² − (3r)² = (m − n + 3r)(m − n − 3r);
- **perfect squares**;
- **grouping** of four terms: ax + ay + bx + by = a(x + y) + b(x + y) = (a + b)(x + y).

**Common mistakes:**
- not checking that the two brackets match after grouping;
- sign errors with a negative c;
- not recognising a difference of two squares (WAEC).

### 5.3 Factor and remainder theorems [Consensus]

**Remainder theorem:** "When f(x) is divided by (x − a), the remainder is f(a)."

**Method:**
1. **Set the divisor equal to zero**: "Let x + 1 = 0, ∴ x = −1".
2. Substitute into f(x), keeping each value in brackets.
3. Simplify.

```
Find the remainder when −2x³ + 6x² + 17x − 21 is divided by (x + 1).

Solution
Let p(x) = −2x³ + 6x² + 17x − 21
Let x + 1 = 0  ∴ x = −1
Remainder = p(−1) = −2(−1)³ + 6(−1)² + 17(−1) − 21
                  = 2 + 6 − 17 − 21
                  = −30
```

**Factor theorem:** "(x − a) is a factor of f(x) if f(a) = 0." Try a = ±1, ±2, … (the factors of the constant term) until f(a) = 0. Then divide to find the other factor.

### 5.4 Long division of polynomials [Common]

The layout is the same as long division of numbers. Write each subtraction line underneath, and **bring down the next term**. Write in descending powers, and put **0x** in for any missing power.

```
Factorise x³ − 6x² + 11x − 6 completely.

f(1) = 1 − 6 + 11 − 6 = 0   ∴ (x − 1) is a factor

               x² − 5x + 6
            ┌────────────────────
    x − 1   │ x³ − 6x² + 11x − 6
              x³ −  x²
              ────────
                  −5x² + 11x
                  −5x² +  5x
                  ──────────
                          6x − 6
                          6x − 6
                          ──────
                               0

x² − 5x + 6 = (x − 2)(x − 3)
∴ x³ − 6x² + 11x − 6 = (x − 1)(x − 2)(x − 3)
```

**Common mistakes:**
- leaving out a 0x term for a missing power;
- subtracting a negative term wrongly. Say "change the signs and add" when subtracting.

### 5.5 Quadratic formula [Consensus]

**Layout:** quote the formula, list a, b and c, substitute with brackets, then simplify.

```
Solve 2x² + 3x − 4 = 0, giving your answers correct to 2 d.p.

Solution
x = [−b ± √(b² − 4ac)] / 2a
a = 2,  b = 3,  c = −4
x = [−3 ± √(3² − 4(2)(−4))] / 2(2)
  = [−3 ± √(9 + 32)] / 4
  = (−3 ± √41) / 4
  = (−3 ± 6.403) / 4
x = 3.403/4  or  x = −9.403/4
x = 0.85  or  x = −2.35  (2 d.p.)
```

**Common mistakes (WAEC 2009 May/June Q7):** "majority… chose the formula method but were not able to quote the formula correctly". Typical slips are writing −b ± √(b² − 4ac) / 2a with the division covering only the root, and leaving out the brackets when c is negative.

### 5.6 Completing the square [Common]

**Method:**
1. Make the coefficient of x² equal to 1 by dividing through.
2. Move the constant to the right-hand side.
3. **Add (half the coefficient of x)² to both sides.**
4. Write the left-hand side as a perfect square.
5. Take the square root of both sides, with **±**.
6. Solve.

```
Solve 2x² − 8x + 3 = 0 by completing the square.

Divide through by 2:        x² − 4x + 3/2 = 0
Subtract 3/2:               x² − 4x = −3/2
Add (−4/2)² = 4 both sides: x² − 4x + 4 = −3/2 + 4
                            (x − 2)² = 5/2
Take square roots:          x − 2 = ±√(5/2) = ±1.581
                            x = 2 + 1.581 or 2 − 1.581
                            x = 3.58 or 0.42 (2 d.p.)
```

**Common mistakes:**
- adding the square to one side only;
- forgetting the ± sign;
- not dividing through by a first.

### 5.7 Sum and product of roots [Consensus]

For ax² + bx + c = 0 with roots α and β:

```
α + β = −b/a          αβ = c/a
Equation from its roots:  x² − (sum of roots)x + (product of roots) = 0
Useful identity:  α² + β² = (α + β)² − 2αβ
```

```
If α and β are the roots of 2x² − 5x + 3 = 0, find α² + β².
a = 2, b = −5, c = 3
α + β = −(−5)/2 = 5/2
αβ = 3/2
α² + β² = (α + β)² − 2αβ = (5/2)² − 2(3/2) = 25/4 − 3 = 13/4
```

Cubic (SS2): α + β + γ = −b/a, αβ + βγ + γα = c/a, αβγ = −d/a.

**Common mistake:** dropping the minus sign in −b/a.

### 5.8 Simultaneous equations [Consensus]

**Elimination layout:** number the equations; multiply them to make one variable's coefficients equal; add or subtract; then substitute back.

```
Solve: 2x + 3y = 13 and 3x − 2y = 0

2x + 3y = 13 ............ (1)
3x − 2y = 0  ............ (2)
(1) × 2:  4x + 6y = 26 .. (3)
(2) × 3:  9x − 6y = 0  .. (4)
(3) + (4):     13x = 26
                 x = 2
Substitute x = 2 in (1):  2(2) + 3y = 13
                          3y = 9
                          y = 3
∴ x = 2, y = 3
```

**Substitution, one linear and one quadratic.** Make one letter the subject of the **linear** equation, label it (3), then substitute into the quadratic:

```
x + y = 5 ............ (1)
x² + y² = 13 ......... (2)
From (1): y = 5 − x .. (3)
Substitute (3) in (2):  x² + (5 − x)² = 13
                        x² + 25 − 10x + x² = 13
                        2x² − 10x + 12 = 0
                        x² − 5x + 6 = 0
                        (x − 2)(x − 3) = 0
                        x = 2 or x = 3
When x = 2, y = 5 − 2 = 3;  when x = 3, y = 5 − 3 = 2
∴ (x, y) = (2, 3) or (3, 2)
```

**Common mistakes (WAEC):**
- "could not obtain the second equation" from a word problem. WAEC wants "Let x be… and y be…" written first;
- substituting back into the same equation used to make the subject;
- pairing the x and y values wrongly.

### Sources: polynomials

- https://schoolings.org/?p=70168 : SS1 Week 10 change of subject with each operation named ("Divide both sides by 2… cross multiply… divide both sides by T").
- https://www.schoolngr.com/classroom/mathematics/190023 : remainder theorem: "Let x + 1 = 0 ∴ x = −1… remainder will be p(−1)".
- https://www.schoolngr.com/classroom/mathematics/236 : "When you divide a polynomial p(x) by (x − a), the remainder = p(a)".
- https://www.schoolngr.com/classroom/mathematics/97690 : splitting the middle term and grouping: p(p + 5) − 2(p + 5) = 0.
- https://myschool.ng/classroom/mathematics/567 : student explains product-and-sum: "3 × 175 = 525… look for two factors of 525 that when subtracted or added together will give us 4".
- https://www.headteacher.ng/roots-of-quadratic-equation-meaning-sum-product-roots-for-sss-2 : α + β = −b/a, αβ = c/a, x² − (sum)x + (product) = 0, discriminant.
- https://www.headteacher.ng/polynomials-roots-cubic-equation-relationships-for-sss-2/ : cubic root relationships.
- https://passnownow.com/classwork-series-and-exercises-mathematics-ss2-linear-and-quadratic-solution-by-substitution-method/ : substitution method; equations labelled (i), (ii).
- https://waeconline.org.ng/e-learning/Mathematics/maths217mq7.html : formula method misquoted.
- https://waeconline.org.ng/e-learning/Mathematics/maths220mq2.html : change of subject (square both sides, factorise q).
- https://waeconline.org.ng/e-learning/Mathematics/maths223Nq1.html : difference of two squares not recognised.
- https://waeconline.org.ng/e-learning/Mathematics/maths223mq8.html : "------- eqn.(1)" layout; substitute into eqn (1).

---

## 6. Variation

**The Nigerian method [Consensus]:** always follow these four steps, in this order.

1. Write the statement with **∝** (the "sign of proportionality").
2. Replace ∝ with "= k" (k is the "constant of variation/proportionality").
3. Substitute the given values and **find k**.
4. Write "the equation connecting … is …" (or "the law of variation is …"), then use it to answer.

| Statement | With ∝ | Equation |
|---|---|---|
| y varies directly as x | y ∝ x | y = kx |
| y varies inversely as x | y ∝ 1/x | y = k/x |
| z varies jointly as x and y | z ∝ xy | z = kxy |
| x varies directly as y and inversely as z² | x ∝ y/z² | x = ky/z² |
| y is partly constant and partly varies as x | — | y = k + cx (two constants) |

**Worked example (joint and inverse):** x varies directly as y and inversely as the square of z. When y = 12 and z = 2, x = 6. Find x when y = 9 and z = 3.

```
Solution
x ∝ y/z²
x = ky/z²
When y = 12, z = 2, x = 6:
6 = k(12)/2²
6 = 3k
k = 2
∴ The equation connecting x, y and z is x = 2y/z²
When y = 9, z = 3:
x = 2(9)/3² = 18/9 = 2
```

**Worked example (inverse, from schoolings):** y ∝ 1/x, so y = k/x. Then 9 = k/4 gives k = 36. "The equation connecting x and y is y = 36/x."

**Partial variation (from schoolings):** two unknown constants, so you get two equations to solve simultaneously.

```
x is partly constant and partly varies as y. When y = 5, x = 7 and when y = 7, x = 8.
Find (a) the law of the variation (b) x when y = 11.

x = k + ay, where k and a are constants
When y = 5, x = 7:   7 = k + 5a ............ (1)
When y = 7, x = 8:   8 = k + 7a ............ (2)
(2) − (1):           1 = 2a  ∴ a = ½
Substitute a = ½ in (2):  8 = k + 7/2  ∴ k = 9/2
(a) The law of variation is x = 9/2 + ½y   or   2x = 9 + y
(b) When y = 11: 2x = 9 + 11 = 20  ∴ x = 10
```

**Teacher wording:**
- "write the variation statement";
- "introduce the constant k";
- "find the constant of variation";
- "the equation connecting x and y is…".

WAEC: "It involved finding the constant of variation and using the change of subject to find the unknown." That is, k first, then the equation, then make the asked-for letter the subject.

**Common mistakes:**
- writing y = x + k for direct variation;
- forgetting to square or square-root ("inversely as the square of r" becomes k/r instead of k/r²);
- using a single k in partial variation (it needs two constants);
- substituting the new values before finding k.

### Sources: variation

- https://schoolings.org/?p=70168 : SS1 Week 10 direct, inverse, joint and partial examples with "N ∝ C", "the equation connecting…", "(1)/(2), subtract (1) from (2)".
- https://www.headteacher.ng/variation-and-word-problems-for-jss-3/ : y ∝ x ⇒ y = kx; find k; then use the equation.
- https://waeconline.org.ng/e-learning/Mathematics/maths217mq6.html : "finding the constant of variation and using the change of subject".
- https://waeconline.org.ng/e-learning/Mathematics/maths220mq13.html : P = kQ/R² style; "k was the constant of proportionality".

---

## 7. Inequalities

### 7.1 Linear inequalities [Consensus]

**Method:**
1. Clear the fractions by **multiplying through by the L.C.M.**
2. Open the brackets.
3. Collect like terms.
4. Divide by the coefficient. **When you multiply or divide by a negative number, reverse the inequality sign.**
5. Show the solution on a number line: an **open circle (○)** for < and >, a **shaded/closed circle (●)** for ≤ and ≥, and an arrow in the direction of the solution.

```
Solve x/2 − 5(x + 2)/6 ≤ 1 + x and illustrate on a number line.

Solution
Multiply through by the L.C.M., 6:
3x − 5(x + 2) ≤ 6 + 6x
3x − 5x − 10 ≤ 6 + 6x
3x − 5x − 6x ≤ 6 + 10
−8x ≤ 16
Divide by −8 (reverse the sign):
x ≥ −2

  ──┼────●━━━━━━━━━━━━━━━━━━━━▶
   −3   −2   −1    0    1    2
```

This is the expected answer in the WAEC 2014 Nov. report.

"Greatest/least integer" questions: list the integers that satisfy the inequality, checking each one against the solution set. In WAEC 2010 May/June Q2, 7x − 2x < −13 gives x < −13/5 = −2.6, so "the three greatest integers are −3, −4, −5". The WAEC report says candidates solved the inequality but "were unable to get the three greatest integers required".

**Common mistakes (WAEC):**
- not reversing the sign, or reversing it when dividing by a positive number ("divided by −5 instead of 5 and therefore changed the direction");
- replacing the inequality sign with "=";
- not representing the answer on the number line, or using the wrong circle.

### 7.2 Quadratic inequalities (JAMB: integral roots only) [Common]

**Method:**
1. Bring everything to one side so the other side is 0.
2. Factorise.
3. Find the critical values.
4. Test the regions with a **sign table** (or a sketch of the parabola).

```
Solve x² − x − 6 < 0.

(x + 2)(x − 3) < 0          critical values: x = −2, x = 3

               x < −2    −2 < x < 3    x > 3
(x + 2)          −           +           +
(x − 3)          −           −           +
(x + 2)(x − 3)   +           −           +

The product is negative between the roots.
∴ −2 < x < 3
```

### 7.3 Graphs of linear inequalities [Convention]

- Draw the boundary line by finding two points (the intercepts: put x = 0, then y = 0).
- Use a **broken line** for < or > and a **solid line** for ≤ or ≥.
- Test a point such as (0, 0) to decide which side is wanted.
- **The common Nigerian textbook convention (NGM) is to shade the *unwanted* region and leave the required region clear.** WAEC accepts either, as long as the region is clearly indicated, so always say which convention the lesson uses ("the shaded part is NOT required").

From graphs of quadratics, WAEC asks for "the range of values of x for which y is negative" and reads it off as an interval: "the x-coordinates of the part of the graph below the x-axis", giving 0 < x < 6.

### Sources: inequalities

- https://www.headteacher.ng/linear-inequalities-one-two-variables-for-sss-1/ : rules (reverse the sign for a negative); open and closed circles; arrow direction.
- https://waeconline.org.ng/e-learning/Mathematics/maths223Nq10.html : multiply by the L.C.M. 6; answer x ≥ −2 on a number line.
- https://waeconline.org.ng/e-learning/Mathematics/maths222mq2.html : the "divided by −5 instead of 5" error; "=" instead of an inequality sign.
- https://waeconline.org.ng/e-learning/Mathematics/maths219Nq2.html : sign not changed when multiplying or dividing by a negative; clearing fractions with the L.C.M.
- https://waeconline.org.ng/e-learning/Mathematics/maths218mq2.html : "three greatest integers" question.
- https://waeconline.org.ng/e-learning/Mathematics/maths219Nq7.html : reading the range where y < 0 from a graph.

---

## 8. Progressions (AP and GP)

**The Nigerian layout [Consensus]:** first **list what is given** as "a = …, d = …, n = …" (or r = …), then quote the formula, then substitute. Terms are written **Tₙ** ("T n"), and sums **Sₙ**.

| | Arithmetic Progression (A.P.) | Geometric Progression (G.P.) |
|---|---|---|
| Common difference / ratio | d = T₂ − T₁ | r = T₂ / T₁ |
| nth term | Tₙ = a + (n − 1)d | Tₙ = arⁿ⁻¹ |
| Sum of n terms | Sₙ = n/2[2a + (n − 1)d] = n/2(a + l) | Sₙ = a(rⁿ − 1)/(r − 1) for r > 1; Sₙ = a(1 − rⁿ)/(1 − r) for r < 1 |
| Sum to infinity | — | S∞ = a/(1 − r), only when −1 < r < 1 |

WAEC defines the letters every time: "Tₙ = value of the nth term, a = first term, d = common difference and n = required term". Our lessons should do the same.

**AP nth term (WAEC 2010 May/June Q13):** How many numbers between 75 and 500 are divisible by 7?

```
Solution
The numbers form an A.P.: 77, 84, …, 497
a = 77,  d = 7,  Tₙ = 497
Tₙ = a + (n − 1)d
497 = 77 + (n − 1)7
420 = 7(n − 1)
n − 1 = 60
∴ n = 61
```

WAEC: "A good number of them counted these numbers out and thereby wasted time."

**Two terms given, find a and d (JAMB 2000):**

```
The 3rd term of an A.P. is 4x − 2y and the 9th term is 10x − 8y. Find d.
T₃ = a + 2d = 4x − 2y ............ (1)
T₉ = a + 8d = 10x − 8y ........... (2)
(2) − (1):  6d = 6x − 6y
∴ d = x − y
```

**AP sum (JAMB 2009):** Sum of the first n terms of 5, 11, 17, 23, …

```
a = 5,  d = 11 − 5 = 6
Sₙ = n/2[2a + (n − 1)d]
   = n/2[10 + 6(n − 1)]
   = n/2[6n + 4]
   = n(3n + 2)
```

**GP sum to infinity (JAMB 1999):** The first term of a G.P. is twice its common ratio, and its sum to infinity is 8. Find the sum of the first two terms.

```
a = 2r,  S∞ = 8
S∞ = a/(1 − r)
8 = 2r/(1 − r)
Cross multiply: 8(1 − r) = 2r
8 − 8r = 2r
8 = 10r
r = 4/5,  a = 2(4/5) = 8/5
Sum of first two terms = a + ar = 8/5 + (8/5)(4/5) = 40/25 + 32/25 = 72/25
```

**Common mistakes (WAEC):**
- using Sₙ when the question asks for Tₙ: "used the formula Sₙ = n/2(2a + (n − 1)d) instead of Tₙ = a + (n − 1)d";
- writing (n + 1) for (n − 1) (myschool thread);
- not forming the second equation from a word statement;
- using the S∞ formula when |r| ≥ 1;
- choosing the wrong form of the GP sum formula for r < 1. The answer is the same, but it gives messy negatives.

### Sources: progressions

- https://www.headteacher.ng/sequences-and-series-gp-ap-problems-for-sss-1/ : Tₙ = arⁿ⁻¹, both Sₙ forms, S∞ = a/(1 − r), convergent and divergent; "Here, a = 2, r = 6/2 = 3".
- https://myschool.ng/classroom/mathematics/582 : "a + 2d = 4x − 2y ......eqn 1… subtract equation 1 from 2".
- https://myschool.ng/classroom/mathematics/24 : GP sum to infinity, "Cross multiply… substitute r = 4/5 into a = 2r".
- https://waeconline.org.ng/e-learning/Mathematics/maths218mq13.html : AP divisible-by-7 problem; letters defined; "counted these numbers out".
- https://waeconline.org.ng/e-learning/Mathematics/maths220Nq10.html : AP with a = −6, d = 3 giving n = 23; the Sₙ-for-Tₙ mix-up; GP ar² − a = 42.
- https://waeconline.org.ng/e-learning/Mathematics/maths219Nq13.html : T₂ = a + d, T₄ = a + 3d working.
- https://waeconline.org.ng/e-learning/Mathematics/maths223Nq6.html : GP "a + ar² = 40 ----- eqn(1)".

---

## 9. Binary operations

**Definitions as taught [Consensus]:** * is a binary operation on a set S.

- **Closure:** a * b ∈ S for all a, b ∈ S.
- **Commutative:** a * b = b * a.
- **Associative:** (a * b) * c = a * (b * c).
- **Identity e:** a * e = e * a = a.
- **Inverse a⁻¹:** a * a⁻¹ = a⁻¹ * a = e.

**Always find the identity before the inverse.** Every source agrees on this order.

### 9.1 Algebraic method (most JAMB items)

**Identity:** "Let e be the identity element. Then a * e = a."

```
a * b = ab + a + b.  Find the identity element, then the inverse of 2.

Identity: a * e = a
ae + a + e = a
ae + e = 0
e(a + 1) = 0
∴ e = 0

Inverse of 2: let the inverse be x. Then 2 * x = e = 0
2x + 2 + x = 0
3x = −2
∴ 2⁻¹ = −2/3
```

**Commutativity:** work out both orders separately and compare.

```
a * b = ab + a + b
b * a = ba + b + a = ab + a + b
Since a * b = b * a, * is commutative.
```

**Counter-example to disprove (JAMB 2008):** x * y = 2x − 3y + 2 on the positive integers.

```
1 * 2 = 2 − 6 + 2 = −2, which is not a positive integer   ∴ not closed
2 * 1 = 4 − 3 + 2 = 3 ≠ 1 * 2                             ∴ not commutative
```

**Substitution items:** "evaluate −3 * 4". Write m = −3 and n = 4 first, then substitute with brackets. The myschool threads show the brackets being dropped and signs going wrong.

### 9.2 Table (Cayley table) method [Consensus]

**Construction:** list the elements along the top row and down the left column. Each cell is (row element) * (column element).

```
Construct the table for multiplication modulo 5 on {1, 2, 3, 4}.

⊗ | 1  2  3  4
──┼───────────
1 | 1  2  3  4
2 | 2  4  1  3
3 | 3  1  4  2
4 | 4  3  2  1

(e.g. 3 ⊗ 4 = 12 = 2 × 5 + 2 → 2)
```

**Reading the table:**
- **Closure:** every entry belongs to the set.
- **Commutative:** the table is **symmetrical about the leading (main) diagonal**.
- **Identity:** the element whose **row (and column) repeats the heading row** exactly. Here e = 1.
- **Inverse:** in each row, **find the identity, e = 1**. The column it is in gives the inverse: 1⁻¹ = 1, 2⁻¹ = 3, 3⁻¹ = 2, 4⁻¹ = 4.
- **Solving equations from the table:** WAEC 2014 Q8 used mod 11, with 10 ⊗ m = 2 giving m = 9. **Give the answer as a truth set {9}.**

**Common mistakes:**
- reading the table column-first, which matters when the operation is not commutative;
- finding an "inverse" without first finding e;
- giving a value that is outside the set;
- forgetting that an element may have no inverse.

### Sources: binary operations

- https://www.headteacher.ng/binary-operations-identity-inverse-for-sss-1/ : a * e = e * a = a; solve a * x = e for the inverse. Cites *New Further Mathematics* (Okeke and Chikezie).
- https://www.headteacher.ng/binary-operations-multiplication-tables-for-sss-1/ : steps to construct the operation table; mod-3 example.
- https://myschool.ng/classroom/mathematics/19 : JAMB 1999: "let the inverse of 2 be X… 2X + 2 + X = 0".
- https://myschool.ng/classroom/mathematics/719 : JAMB 2000 inverse of p: x(p − 1) = p.
- https://myschool.ng/classroom/mathematics/9276 : JAMB 2008 closure and commutativity of 2x − 3y + 2.
- https://myschool.ng/classroom/mathematics/17 : JAMB 1999 substitution item m * n.
- https://waeconline.org.ng/e-learning/Mathematics/maths223mq8.html : modulo-11 table and truth sets.

---

## 10. Matrices and determinants

The online evidence here is thinner. The layouts below are the standard SS3 General Maths and Further Maths presentation. JAMB covers matrices up to 3 × 3, 3 × 3 determinants and 2 × 2 inverses.

### 10.1 Notation [Common]

- Matrices go in round brackets ( ) and determinants between vertical bars | |.
- The order is "rows × columns" (a "2 by 3 matrix").
- The determinant is written |A| or det A.
- The transpose is Aᵀ or A'.
- I is the identity (unit) matrix.

### 10.2 Multiplication: "row by column" [Common]

**Method:**
1. Check that it is possible: (m × **n**)(**n** × p) gives an m × p matrix. The "inside numbers" must match.
2. Each entry is (**row of the first**) × (**column of the second**): multiply corresponding entries and add.

```
A = ( 2  3 )     B = ( 1  0 )
    ( 1  4 )         ( 2  5 )

AB = ( 2×1 + 3×2    2×0 + 3×5 )   =   ( 8  15 )
     ( 1×1 + 4×2    1×0 + 4×5 )       ( 9  20 )
```

Show the products inside the matrix before simplifying. Teachers say "first row times first column", running a finger along the row and down the column.

**Common mistake:** multiplying entry by entry (2 × 1, 3 × 0, …) instead of row by column; assuming AB = BA.

### 10.3 2 × 2 determinant [Consensus]

```
|A| = | a  b | = ad − bc        ("leading diagonal minus the other diagonal")
      | c  d |

| 2  3 | = (2 × 3) − (1 × 3) = 6 − 3 = 3
| 1  3 |
```

(schoolngr, JAMB 2022)

### 10.4 3 × 3 determinant: expand along the first row with the sign pattern [Common]

**Sign pattern**, written on the board:

```
+  −  +
−  +  −
+  −  +
```

**Method:** take each element of the first row in turn and **cover its row and column**. Multiply the element by the 2 × 2 determinant that is left (its **minor**), and give it the sign from the pattern (+, −, +).

```
Find |P| if P = (  1  3   2 )
                (  4  5  −1 )
                ( −3  2   0 )

|P| = +1 | 5  −1 |  − 3 |  4  −1 |  + 2 |  4  5 |
         | 2   0 |      | −3   0 |      | −3  2 |

    = 1[(5)(0) − (−1)(2)] − 3[(4)(0) − (−1)(−3)] + 2[(4)(2) − (5)(−3)]
    = 1(0 + 2) − 3(0 − 3) + 2(8 + 15)
    = 2 + 9 + 46
    = 57
```

(JAMB 2005; answer 57.)

**Common mistakes:**
- forgetting the **minus sign on the middle term**;
- sign slips inside the minors with negative entries. Put **every number in brackets**, as above;
- using Sarrus's diagonal rule wrongly. Some Nigerian teachers teach it as a shortcut, but expansion by the first row is the method in the textbooks.

**Unknown in a determinant** (JAMB, "find x if the determinant = 132"): expand in terms of x, set the result equal to the given value, and solve.

### 10.5 Inverse of a 2 × 2 matrix [Consensus]

**Method:**
1. Find |A|. If |A| = 0, A is **singular** and has no inverse.
2. **Swap the elements on the leading diagonal and change the signs of the other two** (the adjoint).
3. Multiply by 1/|A|.

```
A = ( 4  3 )         |A| = (4 × 2) − (3 × 2) = 8 − 6 = 2
    ( 2  2 )

A⁻¹ = 1/|A| (  d  −b )  =  ½ (  2  −3 )  =  (  1   −3/2 )
            ( −c   a )        ( −2   4 )     ( −1     2  )

Check: AA⁻¹ = ( 4(1) + 3(−1)    4(−3/2) + 3(2) )  =  ( 1  0 )  = I ✓
              ( 2(1) + 2(−1)    2(−3/2) + 2(2) )     ( 0  1 )
```

Teacher wording: "interchange the elements of the leading diagonal, change the signs of the other diagonal, and divide by the determinant."

**Common mistakes:**
- swapping the wrong diagonal;
- changing the signs of all four entries;
- forgetting the 1/|A| factor;
- not checking |A| ≠ 0.

### Sources: matrices and determinants

- https://www.headteacher.ng/matrices-determinants-inverse-surds-for-sss-3/ : SS3 First Term placement; transpose; |A| = ad − bc; inverse exercise.
- https://www.schoolngr.com/classroom/mathematics/110186 : JAMB 2022 2 × 2 determinant written as |A| = (2 × 3) − (1 × 3).
- https://www.schoolngr.com/classroom/jamb/mathematics?topics=determinants-of-a-matrix : JAMB topic page listing 3 × 3 determinant items (find x when the determinant = 132; find |N|).
- https://myschool.ng/index.php/classroom/mathematics/72276?page=952 : JAMB 2005 3 × 3 determinant item (P = (1 3 2; 4 5 −1; −3 2 0), answer 57), found through search. The answer was checked by hand above.
- JAMB syllabus (local PDF): "algebra of matrices not exceeding 3 × 3; determinants…; inverses of 2 × 2 matrices".

---

## Summary checklist for rewriting our lessons

1. **Number bases:** always write the indices (…3 2 1 0 . −1 −2) above the digits before expanding. Use the `base | number` division ladder with `R` beside each quotient, and say "read the remainders from bottom to top". For base-to-base, show two labelled steps through base ten. Do arithmetic **in the base**, with explicit "write …, carry …" or "borrow 1 five = 5".
2. Head the working with "Solution", one step per line, `∴` before the conclusion, and finish with the answer restated in full notation.
3. Number the equations "……(1)" and refer to them by number: "(2) − (1)", "Sub. (3) into (2)".
4. **For every formula topic** (simple interest, AP/GP, quadratic formula, variation): quote the formula, **list the given values** (a = …, d = …, n = … / P = …, R = …, T = …), substitute with brackets, simplify.
5. **Variation:** ∝ statement, then "= k", then find k, then "the equation connecting … is …", then answer.
6. **Indices:** same base, then "equate the powers". **Logs:** quote the law by name; use "Let … = a" to turn a log into an index statement.
7. **Venn diagrams:** draw the diagram and fill from the centre outward; a missing region is x.
8. **Factorisation:** product (ac) and sum (b), split the middle term, group, matching brackets.
9. **Remainder theorem:** "Let x − a = 0 ∴ x = a" before substituting.
10. **Determinants:** sign pattern + − +, cover the row and column, brackets around every entry.
11. End numerical answers with a **Check** line. Published solutions (even WAEC's and schoolngr's) contain errors; ours must not.
