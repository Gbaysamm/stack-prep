# Nigerian classroom methods: Calculus (JAMB Section IV) and Statistics (JAMB Section V)

How Nigerian SS1–SS3 teachers, lesson notes and exam-solution sites set out each method: the order of steps, what is written first, the table columns, the notation and the wording. Use this to rewrite Stack Prep lessons so they look like what a Nigerian student sees on the board and writes in an exercise book.

**What the founder's binary example means for these topics.** Every method below has a "first line" that Nigerian students write before they calculate anything. Our lessons tend to skip it. Examples of that first line:

| Topic | The first thing written down |
|---|---|
| Limit | "Substituting x = 2 directly gives 0/0", then factorise |
| First principle | `y + δy = f(x + δx)` |
| Product / quotient rule | `Let u = …, v = …` then `du/dx = …, dv/dx = …` on the next line |
| Chain rule | `Let u = (inside)`, so `y = uⁿ`, then `dy/du`, `du/dx` |
| Maxima / minima | `dy/dx = …` then "At turning point, dy/dx = 0" |
| Definite integral | `[ F(x) ]` with the limits written on the bracket, then (upper) − (lower) |
| Any statistics question | **Draw the table first.** Every answer starts with a table |
| Median / mode of grouped data | `N/2 = …`, then name the median class, then list `L₁ = …, cf = …, f = …, c = …` |
| Pie chart | A table with a "Sectoral angle" column, each line written as `freq/total × 360°` |
| Permutation / combination | The formula `ⁿCᵣ = n!/(n − r)! r!`, then factorials expanded and cancelled |
| Probability | `n(S) = …`, `n(E) = …`, then `P(E) = n(E)/n(S)` |

**JAMB scope check** (from `docs/syllabus/utme-Mathematics.pdf`, Section IV): the UTME lists "limit of a function", "differentiation of explicit algebraic and simple trigonometrical functions – sine, cosine and tangent", "rate of change", "maxima and minima", "integration of explicit algebraic and simple trigonometrical functions" and "area under the curve (simple cases only)". **First principles is not named in the UTME syllabus**, but it is taught in SS2/SS3 (WAEC Further Maths sets it), so it appears in school notes. Section V covers frequency distribution; histogram, bar chart and pie chart; mean, mode and median of ungrouped and grouped data; cumulative frequency and "use Ogive to find the median, quartiles and percentiles"; range, mean deviation, variance and standard deviation; linear and circular arrangements and "arrangements involving repeated objects"; experimental probability (coins, dice) and "addition and multiplication of probabilities (mutual and independent cases)".

The syllabus lists these recommended texts: Adelodun, *Distinction in Mathematics*; Anyebe, *Basic Mathematics for SSS*; Channon & Smith, *New General Mathematics for West Africa SSS 1–3*; David-Osuagwu et al., *New School Mathematics*; Egbe et al., *Further Mathematics*; Ibude et al., *Algebra and Calculus for Schools and Colleges*; Tuttuh-Adegun et al., *Further Mathematics Project 1–3*; and *Wisdomline Pass at Once JAMB*.

**Where it is taught (NERDC scheme as used in school lesson notes):** SS1 covers statistics (data collection, tally and frequency tables, bar charts, pie charts, histograms, mean/median/mode, and mean deviation in SS1 third term). SS2 covers grouped data, cumulative frequency, the ogive, the range, variance and standard deviation, plus probability (third term, with tree diagrams in week 9) and permutation and combination (Further Maths). SS3 first term: week 2 is the meaning of differentiation, first principles and standard derivatives; week 3 is the rules and their applications (maxima, minima, velocity, acceleration); week 4 is integration, definite integrals, area under the curve and Simpson's rule.

**A note on the sources.** I read the lesson-note pages (headteacher.ng, passnownow, schoolings.org, the Federal Ministry's InSPIRE outlines), the WAEC e-Learning chief-examiner pages (waeconline.org.ng) and many JAMB/WAEC solution pages on schoolngr.com (the myschool.ng classroom). The textbooks themselves (New General Mathematics, MAN, Further Mathematics Project, Adelodun) are not online. I could not open classnotes.ng (it returned an empty page) or YouTube transcripts. stoplearn, nigerianschool and edudelight did not come up for these topics. The layouts below are the consensus of the sources that I could read. Where the sites disagree on a symbol, the variants are listed. Several Nigerian solution pages contain arithmetic slips (noted where relevant), so every worked example below has been recomputed.

---

## 1. Differentiation

### 1a. Limits

**The Nigerian method**
1. Substitute the value directly.
2. If you get a number, that is the limit.
3. If you get `0/0` ("indeterminate"), **factorise** the numerator and/or denominator, cancel the common factor, then substitute again.

```
Evaluate  lim   x² − 4
         x→2   ------
                x − 2

Direct substitution:  (2² − 4)/(2 − 2) = 0/0  (indeterminate)

   lim   (x − 2)(x + 2)
  x→2    --------------
             (x − 2)

 = lim (x + 2)
   x→2

 = 2 + 2
 = 4
```

The JAMB-style example on schoolngr is set out the same way: `lim x→2 (x − 2)(x² + 3x − 2)/(x² − 4)`. Factorise `x² − 4 = (x − 2)(x + 2)`, cancel `(x − 2)`, substitute: `(4 + 6 − 2)/(2 + 2) = 8/4 = 2`.

**Teacher wording:** "x tends to 2", "as x approaches 2", "substitute directly", "it is indeterminate, so factorise".

**Conventions:** `lim` is written with `x→a` underneath. "Tends to" is the spoken form. Factorisation (difference of two squares, quadratic factors) is the expected technique. L'Hôpital's rule is not taught at SS level.

**Common mistakes:** stopping at `0/0` and calling it 0 or "undefined"; cancelling terms instead of factors.

### 1b. First principles (SS3 / Further Maths; not in the UTME list)

**The Nigerian method.** Nigerian sources use **δx and δy** (or Δx, Δy) for the increment, more often than the `h` notation. headteacher.ng uses `h`. WAEC's solution uses Δx.

1. Write `y = f(x)`.
2. Give x a small increment δx: `y + δy = f(x + δx)`.
3. Expand.
4. Subtract the original: `δy = (y + δy) − y`.
5. Divide by δx: `δy/δx = …`.
6. Take the limit: `dy/dx = lim (δx→0) δy/δx`.

```
Differentiate y = x² + 3x from first principles.

      y = x² + 3x
 y + δy = (x + δx)² + 3(x + δx)
        = x² + 2xδx + (δx)² + 3x + 3δx
     δy = x² + 2xδx + (δx)² + 3x + 3δx − (x² + 3x)
        = 2xδx + (δx)² + 3δx
  δy/δx = 2x + δx + 3

  dy/dx = lim   δy/δx
          δx→0
        = 2x + 3
```

**Teacher wording:** "Let δx be a small increase in x and δy the corresponding increase in y", "as δx tends to zero".

**Common mistakes** (WAEC Further Maths chief examiner, Q3 May/June 2008, "Differentiate x³ + 2x from the first principle"): candidates "did not take the correct limit", and "could not differentiate between Δy/Δx and dy/dx", using them interchangeably. Δy/Δx is an average rate of change; dy/dx is the limit.

### 1c. The power rule and standard derivatives

**The Nigerian method:** "Multiply by the power and reduce the power by one." Differentiate term by term. A constant gives 0.

```
y = 4x³ − 5x² + 7x − 9

dy/dx = 3 × 4x³⁻¹ − 2 × 5x²⁻¹ + 7 − 0
      = 12x² − 10x + 7
```

Negative and fractional powers are first rewritten in index form: `y = 1/x² = x⁻²`, so `dy/dx = −2x⁻³ = −2/x³`.

**Standard derivatives table** (as in the schoolings.org SS3 note, and in New General Maths / Further Maths Project style):

```
  y (function)        dy/dx
  ------------        ---------
  a (constant)        0
  ax                  a
  xⁿ                  nxⁿ⁻¹
  sin x               cos x
  cos x               −sin x
  tan x               sec² x
  sin ax              a cos ax
  cos ax              −a sin ax
```

```
y = 3 sin x − 2 cos x + tan x
dy/dx = 3 cos x + 2 sin x + sec² x
```

**Conventions:** `dy/dx` is read "dee y dee x". `f'(x)` is also used ("f prime of x"). x is in **radians** whenever trig is differentiated.

**Common mistakes:** sign errors on `d/dx(cos x) = −sin x`; forgetting that a constant term gives 0; differentiating `1/x²` as `1/2x`.

### 1d. The product, quotient and chain rules

**The Nigerian method.** Always name the parts first: `Let u = …, v = …`, then on the next line `du/dx = …, dv/dx = …`, then quote the rule, then substitute. headteacher.ng, schoolings.org and schoolngr all write the rules in this form:

```
Product rule:   If y = uv,     dy/dx = u dv/dx + v du/dx
Quotient rule:  If y = u/v,    dy/dx = (v du/dx − u dv/dx) / v²
Chain rule:     If y = f(u), u = g(x),   dy/dx = dy/du × du/dx
                ("function of a function")
```

**Product rule example**

```
y = x² sin x

Let  u = x²        v = sin x
  du/dx = 2x    dv/dx = cos x

dy/dx = u dv/dx + v du/dx
      = x²(cos x) + sin x(2x)
      = x² cos x + 2x sin x
```

**Quotient rule example**

```
y = (2x + 1)/(x − 3)

Let  u = 2x + 1      v = x − 3
  du/dx = 2       dv/dx = 1

dy/dx = (v du/dx − u dv/dx) / v²
      = [(x − 3)(2) − (2x + 1)(1)] / (x − 3)²
      = (2x − 6 − 2x − 1) / (x − 3)²
      = −7 / (x − 3)²
```

**Chain rule example (function of a function)**

```
y = (3x² + 5)⁴

Let u = 3x² + 5   ∴ y = u⁴
du/dx = 6x          dy/du = 4u³

dy/dx = dy/du × du/dx
      = 4u³ × 6x
      = 24x(3x² + 5)³
```

```
y = sin(3x + 2)
Let u = 3x + 2   ∴ y = sin u
du/dx = 3          dy/du = cos u
dy/dx = cos u × 3 = 3 cos(3x + 2)
```

**Teacher wording:** "Let u be …, let v be …"; "function of a function"; "the derivative of the inside"; "substitute back for u"; "show all steps".

**Conventions:** the product rule is written `u dv/dx + v du/dx` (u first) by headteacher.ng, schoolings and schoolngr. The quotient rule always has `v du/dx` first, then the minus, then `v²` underneath. In the chain rule, u must be replaced by its x-expression in the final line.

**Common mistakes:** reversing the order in the quotient numerator, which gives the wrong sign; forgetting `v²`; not substituting u back; for the chain rule, multiplying by the inner derivative only once, or not at all.

**Sources (differentiation)**
- https://www.headteacher.ng/differentiation-meaning-limits-first-principles-for-sss-2/ : limits by substitution then factorisation; first principles with h; the power rule as "multiply coefficient by exponent, reduce exponent by one".
- https://www.headteacher.ng/differentiation-rules-product-quotient-chain-rule-for-sss-2 : the "Let u = …, v = …; du/dx, dv/dx" layout, and the rules in the forms above.
- https://schoolings.org/mathematics-lesson-note-for-ss3-first-term/ : SS3 weeks 2–4; the standard-derivatives table; the rule statements; the max/min procedure.
- https://waeconline.org.ng/e-Learning/Further/furth217mq3.html : WAEC chief examiner on first principles (the limit not taken; Δy/Δx confused with dy/dx).
- https://www.schoolngr.com/classroom/further-maths/49152 : the first-principles solution with y + Δy, expand, divide by Δx, take the limit.
- https://www.schoolngr.com/classroom/mathematics/5599 : a JAMB limit solved by factorise, cancel, substitute.
- https://www.schoolngr.com/classroom/mathematics/6761 : a JAMB trig/product-rule solution using `dy/dx = u dv/dx + v du/dx`.
- https://inspire.education.gov.ng/lessons/8592/preview : the Federal Ministry's SS3 outline (meaning, first principle, standard derivatives, sum/product/quotient rules, applications).

---

## 2. Application of differentiation

### 2a. The gradient at a point, and the equation of a tangent

**The Nigerian method:** differentiate, substitute the x-value to get `m`, then use `y − y₁ = m(x − x₁)`.

```
Find the gradient of y = x³ − 2x + 5 at x = 2.

dy/dx = 3x² − 2
At x = 2,  dy/dx = 3(2)² − 2 = 12 − 2 = 10
Gradient = 10
```

```
Find the equation of the tangent to y = x² + 3x − 1 at the point (1, 3).

dy/dx = 2x + 3
At x = 1, m = 2(1) + 3 = 5

Equation of tangent:  y − y₁ = m(x − x₁)
                      y − 3 = 5(x − 1)
                      y − 3 = 5x − 5
                          y = 5x − 2
```

Normal: its gradient is `−1/m`, so `−1/5` here (the "perpendicular gradient").

### 2b. Rates of change

**The Nigerian method:** write the formula linking the quantities, differentiate it, then chain the rates together with `dA/dt = dA/dr × dr/dt`. Kinematics: `v = ds/dt`, `a = dv/dt`.

```
The radius of a circle increases at 2 cm/s. Find the rate of increase
of the area when r = 5 cm.

A = πr²
dA/dr = 2πr
dr/dt = 2 cm/s

dA/dt = dA/dr × dr/dt
      = 2πr × 2
At r = 5,  dA/dt = 2π(5)(2) = 20π cm²/s
```

```
s = t³ − 6t² + 9t
v = ds/dt = 3t² − 12t + 9
a = dv/dt = 6t − 12
```

### 2c. Maxima and minima (turning points)

**The Nigerian method.** This is the same five steps across headteacher.ng, schoolings.org and the JAMB solutions on schoolngr:
1. Find `dy/dx`.
2. "At turning point, dy/dx = 0". Solve for x.
3. Find `d²y/dx²`.
4. Substitute each x. If `d²y/dx² < 0`, it is a **maximum**. If `d²y/dx² > 0`, it is a **minimum**.
5. Substitute x into the **original** equation to get the maximum or minimum **value** of y, and the turning point (x, y).

```
Find the maximum and minimum points of y = x³ − 3x² + 2.

dy/dx = 3x² − 6x
At turning point, dy/dx = 0
   3x² − 6x = 0
   3x(x − 2) = 0
   x = 0  or  x = 2

d²y/dx² = 6x − 6

When x = 0:  d²y/dx² = 6(0) − 6 = −6 < 0  ∴ maximum
             y = 0 − 0 + 2 = 2           maximum point (0, 2)

When x = 2:  d²y/dx² = 6(2) − 6 = 6 > 0   ∴ minimum
             y = 8 − 12 + 2 = −2         minimum point (2, −2)
```

The JAMB layout (schoolngr, "Determine the maximum value of y = 3x² − x³") runs: `dy/dx = 6x − 3x²`; `6x − 3x² = 0`; `3x(2 − x) = 0`; `x = 0 or 2`; `d²y/dx² = 6 − 6x`; at x = 2, it is −6 (maximum); `y = 3(2)² − 2³ = 12 − 8 = 4`.

**Teacher wording:** "turning point", "stationary point", "at turning point the gradient is zero", "second derivative test", "negative means maximum, positive means minimum". Some teachers also teach the sign-of-gradient check either side of the point (+ 0 − for a maximum, − 0 + for a minimum).

**Common mistakes:** giving the x-value when the question asks for the maximum **value** (y); substituting into dy/dx instead of y to get the value; mixing up the signs. One schoolngr answer key (mathematics/8990) marks x = −1 as the answer to "the minimum point" even though its own second-derivative test shows −1 is the maximum, so check which turning point a question asks for.

**Sources (applications)**
- https://www.headteacher.ng/differentiation-applications-rate-gradient-optimization-for-sss-2 : gradient at a point; the tangent with `(y − y₁) = m(x − x₁)` giving y = 5x − 2; dA/dt = dA/dr × dr/dt; the y = x³ − 3x² + 2 max/min.
- https://schoolings.org/mathematics-lesson-note-for-ss3-first-term/ : the three-step max/min procedure (dy/dx = 0; sign of d²y/dx²; substitute for y).
- https://www.schoolngr.com/classroom/mathematics/7670 : JAMB maximum value, set out line by line.
- https://www.schoolngr.com/classroom/mathematics/8990 : a JAMB minimum point with the second-derivative test (its answer key has an error).

---

## 3. Integration

### 3a. The power rule (+ c)

**The Nigerian method:** "Add one to the power and divide by the new power", and always "+ c" (the "constant of integration"). Integration is taught as "the reverse of differentiation".

```
∫xⁿ dx = xⁿ⁺¹/(n + 1) + c ,   n ≠ −1

∫(6x² − 4x + 3) dx = 6x³/3 − 4x²/2 + 3x + c
                   = 2x³ − 2x² + 3x + c
```

Finding c from a given condition (a common JAMB form):

```
dy/dx = 3x² − 2, and y = 5 when x = 1. Find y.

y = ∫(3x² − 2) dx = x³ − 2x + c
When x = 1, y = 5:   5 = 1 − 2 + c
                     c = 6
∴ y = x³ − 2x + 6
```

Trig (the UTME includes "simple trigonometrical functions"): `∫cos x dx = sin x + c`, `∫sin x dx = −cos x + c`, `∫sec² x dx = tan x + c`.

### 3b. Definite integrals (square-bracket notation)

**The Nigerian method:** integrate, write the result in square brackets with the limits on the bracket, then substitute **upper minus lower**, with each substitution in its own bracket.

```
Evaluate ∫₁² (6x² − 2x) dx

= [6x³/3 − 2x²/2]₁²
= [2x³ − x²]₁²
= [2(2)³ − (2)²] − [2(1)³ − (1)²]
= [16 − 4] − [2 − 1]
= 12 − 1
= 11
```

(This is the schoolngr JAMB solution, line for line.) No `+ c` is written for a definite integral.

### 3c. Area under a curve

**The Nigerian method:** `Area = ∫ₐᵇ y dx`. "The area bounded by the curve, the ordinates x = a and x = b, and the x-axis." The answer is given in "square units".

```
Find the area bounded by y = 3x² − 2x + 1, the ordinates x = 1 and x = 3,
and the x-axis.

Area = ∫₁³ (3x² − 2x + 1) dx
     = [x³ − x² + x]₁³
     = (27 − 9 + 3) − (1 − 1 + 1)
     = 21 − 1
     = 20 square units
```

If part of the region is below the x-axis, the integral there is negative. Teachers say "take the absolute value" or "find the areas separately and add them". If the limits are not given, find them first by solving `y = 0` (where the curve cuts the x-axis), e.g. `y = x(2 − x)` cuts at 0 and 2, so the area is `∫₀² (2x − x²) dx = [x² − x³/3]₀² = 4 − 8/3 = 4/3` square units.

**Teacher wording:** "reverse of differentiation", "constant of integration", "upper limit minus lower limit", "ordinates", "square units".

**Common mistakes:** dropping `+ c` on indefinite integrals; doing lower minus upper; dividing by the old power instead of the new one; forgetting `∫sin x dx = −cos x`; leaving out units.

**Sources (integration)**
- https://schoolings.org/mathematics-lesson-note-for-ss3-first-term/ : `∫f(x)dx = F(x) + c`; the power rule with n ≠ −1; the definite integral as "the area bounded by curve y = f(x), lines x = a, x = b and x-axis"; Simpson's rule.
- https://www.schoolngr.com/classroom/mathematics/8538 : the JAMB definite integral with the `[2x³ − x²]₁²`, (upper) − (lower) bracket layout.
- https://www.schoolngr.com/classroom/mathematics/6387 : the JAMB area bounded by a curve, ordinates and the x-axis, answer 20 square units.
- https://inspire.education.gov.ng/lessons/10057/preview : the Federal Ministry's SS3 Further Maths outline (integration as the reverse of differentiation; definite integrals; area under the curve; trapezoidal rule).

---

## 4. Representation of data

### 4a. Frequency table with tally

**The Nigerian method:** three columns, **Item/Score | Tally | Frequency**, then a total row `Σf`. Tally strokes go in bundles of five: four vertical strokes, and the fifth drawn across them ("gate"). Grouped tables add **class interval** and later **class boundaries** and **class mark** columns.

```
Marks scored by 20 students in a test:

 Marks (x) | Tally         | Frequency (f)
 ----------|---------------|--------------
    1      | ||            |   2
    2      | ||||          |   4
    3      | 卌 ||          |   7
    4      | 卌             |   5
    5      | ||            |   2
 ----------|---------------|--------------
           |        Total  |  Σf = 20
```

(`卌` stands for four strokes with a fifth stroke drawn across them.)

**Class boundaries** (whole-number data): "subtract 0.5 from the lower class limit and add 0.5 to the upper class limit", so class 10–19 has boundaries 9.5–19.5. **Class width (size)** = upper boundary − lower boundary = 10. **Class mark** = (lower limit + upper limit)/2 = 14.5.

### 4b. Bar chart and histogram

- **Bar chart:** for discrete or categorical data. The bars have **equal width and equal gaps**. Height = frequency.
- **Histogram:** for grouped (continuous) data. Plot **class boundaries on the x-axis**, and the **bars touch (no gaps)**.
- **Mode from a histogram:** on the tallest bar, draw two crossed diagonals, each from a top corner of the modal bar to the near top corner of the next bar (top-left to the left neighbour, top-right to the right neighbour). Drop a perpendicular from the point where they cross to the x-axis and read the mode.
- **Frequency polygon:** join the mid-points of the tops of the histogram bars (plotted at the class marks).

### 4c. Pie chart

**The Nigerian method:** a table with an extra **"Sectoral angle"** column (WAEC's word). Each angle is written out as `frequency/total × 360°`. Check that the angles add up to 360°, then draw the chart with compasses and a protractor.

```
A family's monthly expenses:

 Item       | Amount (₦) | Sectoral angle
 -----------|------------|----------------------------------
 Food       |   18 000   | 18 000/48 000 × 360° = 135°
 Rent       |    9 000   |  9 000/48 000 × 360° =  67.5°
 Transport  |    6 000   |  6 000/48 000 × 360° =  45°
 Education  |   12 000   | 12 000/48 000 × 360° =  90°
 Others     |    3 000   |  3 000/48 000 × 360° =  22.5°
 -----------|------------|----------------------------------
 Total      |   48 000   |                         360°
```

Reverse questions (common in JAMB): `frequency = (angle/360°) × total`. Or, if you are given one item's amount and angle: `total = amount × 360°/angle`.

**Teacher wording:** "sectoral angle", "the whole circle represents the total", "use your mathematical set (compasses and protractor)", "label each sector", "give it a title".

**Common mistakes:** (WAEC) a "majority … did not draw the correct diagram, with most diagrams drawn free hand without measuring the sectoral angles"; histograms drawn with class **limits** instead of class **boundaries**; gaps left between histogram bars; and, the opposite error, no gaps between the bars of a bar chart.

**Sources (representation)**
- https://www.headteacher.ng/lesson-note-on-statistics-data-collection-and-bar-charts-for-sss-1/ : the Item | Tally | Frequency table; bar chart rules; bar chart vs histogram.
- https://www.headteacher.ng/lesson-note-on-statistics-iii-grouped-data-histograms-and-mode-for-sss-1/ : class boundaries ±0.5; histogram on boundaries with no gaps; mode from the crossed diagonals.
- https://www.headteacher.ng/lesson-note-on-statistics-ii-pie-charts-and-interpretation-for-sss-1/ : "Angle of sector = (Value of item / Total value) × 360°"; the drawing steps with compasses and protractor.
- https://waeconline.org.ng/e-learning/Mathematics/maths220mq5.html : WAEC pie chart solution ("sectoral angles") and the examiner's comment about free-hand drawings.
- https://waeconline.org.ng/E-Learning/Mathematics/maths218nw.html : WAEC weakness, "drew histograms with class limits instead of class boundaries".

---

## 5. Measures of location

### 5a. Mean of ungrouped or discrete frequency data: the x | f | fx table

**The Nigerian method:** columns **x | f | fx**, totals `Σf` and `Σfx`, then `x̄ = Σfx/Σf`.

```
Hours of study per day of 50 students (WAEC 2021 data):

  x  |  f  |  fx
 ----|-----|-----
  4  |  5  |  20
  5  |  7  |  35
  6  |  5  |  30
  7  |  9  |  63
  8  | 12  |  96
  9  |  4  |  36
 10  |  3  |  30
 11  |  5  |  55
 ----|-----|-----
     | Σf = 50 | Σfx = 365

Mean, x̄ = Σfx/Σf = 365/50 = 7.30
Mode = 8 (highest frequency, 12)
Median: N = 50, so the median is the average of the 25th and 26th values.
  Cumulative f: 5, 12, 17, 26, …   The 25th and 26th values are both 7.
  Median = 7
```

Raw ungrouped data: arrange in ascending order first ("arrange in order of magnitude"). The median is the `(n + 1)/2`th value.

### 5b. Mean of grouped data: the class mark, and the assumed-mean method

**The Nigerian method (direct):** columns **Class interval | Class mark (x) | f | fx**. "Class mark" (or "mid-point", "mid-value") is the standard Nigerian term.

```
Marks of 40 students (WAEC May/June 2012, Q10):

 Class    | Class mark (x) |  f  |   fx
 ---------|----------------|-----|-------
 60 – 64  |      62        |  2  |   124
 65 – 69  |      67        |  3  |   201
 70 – 74  |      72        |  6  |   432
 75 – 79  |      77        | 11  |   847
 80 – 84  |      82        |  8  |   656
 85 – 89  |      87        |  7  |   609
 90 – 94  |      92        |  2  |   184
 95 – 99  |      97        |  1  |    97
 ---------|----------------|-----|-------
          |                | Σf = 40 | Σfx = 3150

x̄ = Σfx/Σf = 3150/40 = 78.75
```

**Assumed-mean ("working mean") method.** This is used heavily, and WAEC sometimes **requires** it. In Further Maths 2010 Q13, candidates who "failed to use the assumed mean method as required" lost marks. Columns: **x | f | d = x − A | fd**. Choose A to be a class mark near the middle or with the highest frequency.

```
A = 77

 Class    |  x  |  f  | d = x − A |  fd
 ---------|-----|-----|-----------|------
 60 – 64  | 62  |  2  |   −15     |  −30
 65 – 69  | 67  |  3  |   −10     |  −30
 70 – 74  | 72  |  6  |    −5     |  −30
 75 – 79  | 77  | 11  |     0     |    0
 80 – 84  | 82  |  8  |     5     |   40
 85 – 89  | 87  |  7  |    10     |   70
 90 – 94  | 92  |  2  |    15     |   30
 95 – 99  | 97  |  1  |    20     |   20
 ---------|-----|-----|-----------|------
          |     | Σf = 40 |       | Σfd = 70

x̄ = A + Σfd/Σf = 77 + 70/40 = 77 + 1.75 = 78.75
```

Coded variant (passnownow SS1/SS3): `d = (x − A)/c` with c = class width, and `x̄ = A + (Σfd/Σf) × c`. Here d = −3, −2, −1, 0, 1, 2, 3, 4, Σfd = 14, and x̄ = 77 + (14/40) × 5 = 78.75.

### 5c. Median and mode of grouped data (formula method)

**The Nigerian method.** Add a **cumulative frequency (cf)** column, and usually a **class boundaries** column. Write `N/2 = …`, name the **median class** (the first class whose cf is ≥ N/2), list each symbol's value on its own line, then substitute.

```
 Class   | Class boundaries |  f  |  cf
 --------|------------------|-----|-----
 10 – 19 |   9.5 – 19.5     |  5  |   5
 20 – 29 |  19.5 – 29.5     |  8  |  13
 30 – 39 |  29.5 – 39.5     | 12  |  25   ← median class, modal class
 40 – 49 |  39.5 – 49.5     |  9  |  34
 50 – 59 |  49.5 – 59.5     |  8  |  42
 --------|------------------|-----|-----
         |                  | Σf = 42

N/2 = 42/2 = 21  →  median class is 30 – 39

Median = L₁ + ( (N/2 − cf) / f_m ) × c

  L₁  = 29.5   (lower class boundary of median class)
  cf  = 13     (cumulative frequency of the class before)
  f_m = 12     (frequency of median class)
  c   = 10     (class width)

Median = 29.5 + ((21 − 13)/12) × 10
       = 29.5 + (8/12) × 10
       = 29.5 + 6.67
       = 36.17
```

```
Mode = L₁ + ( D₁ / (D₁ + D₂) ) × c

  Modal class: 30 – 39 (highest frequency, 12)
  L₁ = 29.5
  D₁ = 12 − 8 = 4   (modal f − f of class before)
  D₂ = 12 − 9 = 3   (modal f − f of class after)
  c  = 10

Mode = 29.5 + (4/(4 + 3)) × 10
     = 29.5 + 5.71
     = 35.21
```

**Symbol variants seen** (all mean the same thing). For L₁: `L₁`, `L`. For cf: `cf`, `cfb`, `F`, `fo`, `Σf₁`, "cf before". For the median class frequency: `f_m`, `fm`, `f_med`. For the class width: `c`, `h`, `C`, "class size". For N/2: `N/2`, `Σf/2`. The mode formula is also written `L + (f_m − f_b)/(2f_m − f_b − f_a) × c` (headteacher.ng). The `D₁/(D₁ + D₂)` form is what the schoolngr JAMB solutions use. **Recommendation:** use `L₁`, `N/2`, `cf`, `f`, `c` and `D₁, D₂`.

### 5d. Cumulative frequency and the ogive

**The Nigerian method:** table columns **Class | f | Upper class boundary | cf**. Plot cf (y-axis) against the **upper class boundaries** (x-axis). Start the curve at the first lower class boundary with cf = 0. Join with a smooth "S"-shaped curve, the ogive. Then read off the median, quartiles and percentiles.

```
 Class   |  f  | Upper class boundary |  cf
 --------|-----|----------------------|-----
 10 – 19 |  5  |        19.5          |   5
 20 – 29 |  8  |        29.5          |  13
 30 – 39 | 12  |        39.5          |  25
 40 – 49 |  9  |        49.5          |  34
 50 – 59 |  8  |        59.5          |  42

Points to plot: (9.5, 0), (19.5, 5), (29.5, 13), (39.5, 25), (49.5, 34), (59.5, 42)

Median   at N/2  = 21     → read across to the curve and down: ≈ 36.2
Lower quartile Q₁ at N/4  = 10.5  → ≈ 26.4
Upper quartile Q₃ at 3N/4 = 31.5  → ≈ 46.7
Interquartile range       = Q₃ − Q₁ ≈ 20.3
Semi-interquartile range  = (Q₃ − Q₁)/2 ≈ 10.2
80th percentile at (80/100) × 42 = 33.6 → ≈ 49.1
```

(The readings are what a careful graph gives; a student's answers within about ±0.5 of these are accepted.)

**Teacher wording:** "draw a horizontal line from N/2 to meet the curve, then drop a vertical line to the x-axis"; "show your lines on the graph" (broken lines). WAEC says the ogive must use **upper class boundaries**.

**Common mistakes** (WAEC chief examiners): "Difficulties in using upper class boundaries in plotting Ogive" (Further Maths 2019); not drawing the cumulative frequency curve with the upper class boundaries; using class limits or class marks; reading N/2 as a class instead of a value; using the wrong cf (the median class's own cf instead of the one before it); using class **limits** (30) instead of **boundaries** (29.5) for L₁.

**Sources (location)**
- https://www.headteacher.ng/statistics-grouped-data-central-tendency-for-sss-2 : the Class Interval | f | Class Mark | fx table; the median `L + [(N/2 – cfb)/fm] × c`; the mode with f_b, f_a; "the difference between class limits and class boundaries … is crucial".
- https://www.headteacher.ng/cumulative-frequency-ogive-median-quartiles-for-sss-2 : the Marks | Frequency | UCB | CF table; plotting UCB vs cf from the first lower boundary; N/2, N/4, 3N/4; IQR and SIQR.
- https://www.headteacher.ng/cumulative-frequency-tables-histogram-polygon-for-sss-2 : the Class Interval | f | Class Boundaries | cf table, with the 10–19 … data used above.
- https://www.schoolngr.com/classroom/mathematics/5761 : JAMB median with "L1 + (Σf/2 − fo)/fm × class width".
- https://www.schoolngr.com/classroom/mathematics/5918 : JAMB median with "L + [((N/2) − f)/fm]h".
- https://www.schoolngr.com/classroom/mathematics/8987 : JAMB mode with `L₁ + (D₁/(D₁ + D₂)) × C`.
- https://waeconline.org.ng/E-Learning/Mathematics/maths221mq10.html : the WAEC table Class Interval | f | Class Mid-point x | fx | fx² (the data used above).
- https://waeconline.org.ng/E-Learning/Mathematics/maths233mq11.html : WAEC 2021 hours-of-study data; "error in the frequency distribution table".
- https://waeconline.org.ng/e-Learning/Further/furth219nq13.html : WAEC requires the assumed mean: `Mean = A + Σfd/n`.
- https://waeconline.org.ng/E-Learning/Further/furth2019WR.html : WAEC weaknesses (ogive with upper class boundaries; "use of assumed mean").
- https://passnownow.com/ss1-mathematics-third-term-mean-deviation-grouped-data/ : the coded assumed mean `d = (x − A)/c`, `x̄ = A + (Σfd/N) × c`. Its own worked arithmetic is inconsistent, so do not copy its numbers.

---

## 6. Measures of dispersion

### 6a. Range

Ungrouped: highest − lowest. Grouped (WAEC marking): **highest upper class boundary − lowest lower class boundary**, e.g. masses 51–55 … 76–80 give `80.5 − 50.5 = 30 kg`. WAEC flagged candidates who used the class mid-points instead. (Some JAMB keys accept the difference of the extreme class marks, so state which one you used.)

### 6b. Mean deviation, variance and standard deviation: the long table

**The Nigerian method:** one table that grows column by column: **x | f | fx | x − x̄ | |x − x̄| | f|x − x̄| | (x − x̄)² | f(x − x̄)²**. First find x̄ from the `fx` column, then fill in the deviation columns.

Ungrouped (schoolngr JAMB layout: **x | x − x̄ | (x − x̄)²**, then `S.D = √[Σ(x − x̄)²/N]`):

```
Find the mean deviation and the standard deviation of 2, 4, 6, 8, 10.

x̄ = (2 + 4 + 6 + 8 + 10)/5 = 30/5 = 6

  x  | x − x̄ | |x − x̄| | (x − x̄)²
 ----|-------|---------|---------
  2  |  −4   |    4    |   16
  4  |  −2   |    2    |    4
  6  |   0   |    0    |    0
  8  |   2   |    2    |    4
 10  |   4   |    4    |   16
 ----|-------|---------|---------
     |       | Σ = 12  | Σ = 40

Mean deviation = Σ|x − x̄|/n = 12/5 = 2.4
Variance       = Σ(x − x̄)²/n = 40/5 = 8
S.D            = √8 = 2.83
```

Frequency data:

```
  x  |  f  |  fx  | x − x̄ | |x − x̄| | f|x − x̄| | (x − x̄)² | f(x − x̄)²
 ----|-----|------|-------|---------|----------|----------|-----------
  2  |  2  |   4  |  −2   |    2    |     4    |    4     |     8
  3  |  5  |  15  |  −1   |    1    |     5    |    1     |     5
  4  |  7  |  28  |   0   |    0    |     0    |    0     |     0
  5  |  3  |  15  |   1   |    1    |     3    |    1     |     3
  6  |  3  |  18  |   2   |    2    |     6    |    4     |    12
 ----|-----|------|-------|---------|----------|----------|-----------
     | 20  |  80  |       |         |    18    |          |    28

x̄ = Σfx/Σf = 80/20 = 4

Mean deviation = Σf|x − x̄| / Σf = 18/20 = 0.9
Variance, σ²   = Σf(x − x̄)² / Σf = 28/20 = 1.4
Standard deviation, σ = √(Σf(x − x̄)²/Σf) = √1.4 = 1.18
```

For grouped data, `x` is the **class mark**, and a "Class" column comes first.

**Shortcut forms** (when x̄ is not a whole number):
- **fx² method** (WAEC 2012 table: Class | f | x | fx | fx²): `σ² = Σfx²/Σf − (Σfx/Σf)²`. With the 60–99 data above: `250 590/40 − 78.75² = 6264.75 − 6201.5625 = 63.19`, so `σ = 7.95`.
- **Assumed-mean method** (columns x | f | d = x − A | fd | fd²): `σ² = Σfd²/Σf − (Σfd/Σf)²`. With A = 77: Σfd = 70 and Σfd² = 2650, so `σ² = 2650/40 − (1.75)² = 66.25 − 3.0625 = 63.19` and `σ = 7.95`. Same answer.

**Teacher wording:** "deviation from the mean", "absolute deviation" (the modulus, "ignore the negative sign"), "square the deviations", "standard deviation is the square root of the variance", "S.D". Some notes also give the coefficient of variation, `(σ/x̄) × 100%`.

**Conventions:** Nigerian school and JAMB work divides by **n (Σf)**, not n − 1. headteacher.ng mentions n − 1 for samples, but the WAEC and JAMB solutions use Σf. Notation: `x̄` ("x bar"), `σ` or `S.D`, and `Σ` ("sigma, the sum of"). On some websites Σ shows up as "E" (e.g. "E(x − x̄)²"), which is a rendering glitch.

**Common mistakes** (WAEC): "most … were able to get the mean but were not able to get the standard deviation because of error in the frequency distribution table" (2021); "only a few … could calculate the mean deviation" (2010); candidates "not adding the mean of the deviations to the assumed mean"; preferring the long raw-score method "due to lack of understanding of the deviation method". Also: forgetting to multiply by f before summing; forgetting the square root (giving the variance as the S.D); taking deviations with signs in the mean deviation (they would sum to 0).

**Sources (dispersion)**
- https://www.schoolngr.com/classroom/mathematics/5767 : the JAMB S.D table x | x − x̄ | (x − x̄)²; `S.D = √[Σ(x − x̄)²/N]`.
- https://www.schoolngr.com/classroom/mathematics/31331 : the same layout for another JAMB S.D question.
- https://www.headteacher.ng/measure-of-dispersion-mean-standard-deviation-for-sss-1/ : `MD = Σ|x − x̄|/n` and `Σf|x − x̄|/Σf`; standard deviation; the coefficient of variation.
- https://waeconline.org.ng/E-Learning/Mathematics/maths220Nq12.html : WAEC range from boundaries (80.5 − 50.5); the f|x − x̄| method for mean deviation; examiner comments.
- https://waeconline.org.ng/E-Learning/Mathematics/maths221mq10.html : the WAEC fx² table layout.
- https://passnownow.com/classwork-series-and-exercises-mathematics-ss3-calculation-of-mean-deviation-and-standard-deviations-of-grouped-data-using-assumed-mean/ : SS3 assumed-mean S.D with `S.D = √(Σfd²/Σf)` and the Score | f | (X − X̄) | f·d | f·d² columns.
- https://waeconline.org.ng/E-Learning/Further/furth222nq14.html : WAEC "principle of mean and standard deviation" applied wrongly.

---

## 7. Permutation and combination

**The Nigerian method:** quote the formula with the factorials, expand only down to the factorial that cancels, then cancel.

```
ⁿPᵣ = n!/(n − r)!          ("n P r", arrangement – order matters)
ⁿCᵣ = n!/(n − r)! r!       ("n C r", selection – order does not matter)
```

Nigerian sources write `ⁿCᵣ = n!/(n − r)!r!`, with `(n − r)!` before `r!` in the denominator; schoolngr writes it exactly this way.

```
⁵P₃ = 5!/(5 − 3)!
    = 5!/2!
    = (5 × 4 × 3 × 2!)/2!
    = 60
```

```
⁸C₃ = 8!/(8 − 3)!3!
    = 8!/5!3!
    = (8 × 7 × 6 × 5!)/(5! × 3 × 2 × 1)
    = 56
```

Committee questions: multiply the separate selections ("and" means ×, "or" means +):

```
Committees of 3 with 2 men and 1 woman from 4 men and 3 women:

⁴C₂ × ³C₁ = 4!/(4 − 2)!2! × 3!/(3 − 1)!1!
          = (4 × 3 × 2!)/(2! × 2 × 1) × (3 × 2!)/2!
          = 6 × 3
          = 18
```

**Arrangements with repeated objects:** `n!/(p! q! r! …)`. Count the letters and list the repeats first.

```
In how many ways can the letters of UNILORIN be arranged?

Letters: U, N, I, L, O, R, I, N   → n = 8
Repeated: I (2 times), N (2 times)

Number of ways = 8!/(2! × 2!)
               = 40 320/4
               = 10 080
```

(Other JAMB examples: EXCELLENCE gives `10!/(4!2!2!)`; MATHEMATICS gives `11!/(2!2!2!)` for M, A and T. One search summary wrongly listed E as a repeat in MATHEMATICS, so check the letter counts.)

**Circular arrangements:** `(n − 1)!`. "Fix one person and arrange the rest."

```
6 people sit round a table:  (6 − 1)! = 5! = 120 ways
```

(For a necklace or bracelet that can be turned over, `(n − 1)!/2`; this is rarely tested.)

**Teacher wording:** "arrangement" = permutation, "selection/choice/committee" = combination, "order matters", "n factorial", "fix one and arrange the remaining (n − 1)".

**Common mistakes:** using P when the question is a selection; adding instead of multiplying for "and"; miscounting the repeated letters; using n! for round-table problems. The WAEC Further Maths 2019 report lists "inadequate understanding of permutation" as a weakness.

**Sources (P&C)**
- https://www.headteacher.ng/permutations-combinations-meaning-permutations-types-for-sss-2 : `nPr = n!/(n – r)!`; cyclic `(n – 1)!`; identical objects `n!/(p! × q! × r! …)`; MATHEMATICS = 11!/(2!2!2!).
- https://www.schoolngr.com/classroom/mathematics/7692 : the JAMB committee `⁴C₂ × ³C₁ = 4!/(4 − 2)!2! × 3!/(3 − 1)!1!` with cancellation, giving 18.
- https://www.schoolngr.com/classroom/mathematics/631 : JAMB EXCELLENCE, `10!/(4!2!2!)`.
- https://www.schoolngr.com/classroom/mathematics/87920 : JAMB, the arrangements of UNILORIN.
- https://waeconline.org.ng/E-Learning/Further/furth2019WR.html : WAEC weakness, "inadequate understanding of permutation".

---

## 8. Probability

### 8a. P(E) = n(E)/n(S) and the sample space

**The Nigerian method:** write the sample space (list it, or use an outcome table), then `n(S) = …`, `n(E) = …`, then `P(E) = n(E)/n(S)`. Probability lies between 0 and 1, and `P(E') = 1 − P(E)` ("probability of not E").

Coins: `S = {HH, HT, TH, TT}`, n(S) = 4.

**The outcome table for two dice.** This is the standard Nigerian layout: the first die down the side, the second die across the top, and each cell is the pair (or the sum, for a "sum" question, with a `+` in the corner).

```
A fair die is thrown two times. Find the probability that the sum is at least 10.

  +  |  1   2   3   4   5   6
 ----|------------------------
  1  |  2   3   4   5   6   7
  2  |  3   4   5   6   7   8
  3  |  4   5   6   7   8   9
  4  |  5   6   7   8   9  10
  5  |  6   7   8   9  10  11
  6  |  7   8   9  10  11  12

n(S) = 36
Sum ≥ 10: (4,6), (5,5), (6,4), (5,6), (6,5), (6,6)  → n(E) = 6
P(sum ≥ 10) = n(E)/n(S) = 6/36 = 1/6
```

(The schoolngr solution draws the pair version, with cells 1,1 … 6,6, and then counts.)

Cards: 52 cards, 4 suits of 13, 4 of each rank, 12 picture cards, 26 red.

### 8b. The addition and multiplication rules

```
Mutually exclusive ("or"):   P(A or B) = P(A) + P(B)
Not mutually exclusive:      P(A or B) = P(A) + P(B) − P(A and B)
Independent ("and"):         P(A and B) = P(A) × P(B)
```

```
P(king or queen) = 4/52 + 4/52 = 8/52 = 2/13
P(king or heart) = 4/52 + 13/52 − 1/52 = 16/52 = 4/13
P(head on a coin and 6 on a die) = 1/2 × 1/6 = 1/12
```

The typical JAMB "pass/fail" layout:

```
P(A passes) = 2/3,  P(B passes) = 3/5.  Find P(only one passes).

P(A fails) = 1 − 2/3 = 1/3       P(B fails) = 1 − 3/5 = 2/5

P(only one) = P(A passes and B fails) + P(A fails and B passes)
            = (2/3 × 2/5) + (1/3 × 3/5)
            = 4/15 + 3/15
            = 7/15
```

### 8c. Tree diagrams

**The Nigerian method:** start from one point. Draw one branch for each outcome of the first event and write its **probability on the branch** (fraction form). From the end of each branch, draw the second event's branches. Without replacement, the second-stage denominators drop by one. At the end of each path, write the outcome and **multiply along the path**. Then **add** the paths you need. Check that all the end probabilities add up to 1.

```
A bag has 5 red and 3 blue balls. Two are drawn one after the other
without replacement.

          1st draw        2nd draw         Outcome   Probability

                          4/7 ── R          RR      5/8 × 4/7 = 20/56
             5/8 ── R ──<
           /              3/7 ── B          RB      5/8 × 3/7 = 15/56
   start <
           \              5/7 ── R          BR      3/8 × 5/7 = 15/56
             3/8 ── B ──<
                          2/7 ── B          BB      3/8 × 2/7 =  6/56
                                                               -------
                                                         Total  56/56 = 1

P(one of each colour) = P(RB) + P(BR) = 15/56 + 15/56 = 30/56 = 15/28
P(at least one red)   = 1 − P(BB) = 1 − 6/56 = 50/56 = 25/28
```

**Teacher wording:** "along the branch multiply, across the branches add"; "with replacement → the same probabilities on the second branches (independent)"; "without replacement → reduce the total by one"; "at least one = 1 − none".

**Common mistakes** (WAEC 2009 report: weakness in "problems on probability especially where it involved addition and multiplication of probabilities"): adding where you should multiply; forgetting both orders (RB **and** BR), e.g. the schoolngr "red and blue" answer 32/91 = 2 × (8/14 × 4/13) needs both orders; keeping the same denominator without replacement; outcome tables with fewer than 36 cells.

**Sources (probability)**
- https://www.schoolngr.com/classroom/mathematics/32363 : the JAMB two-dice outcome table (1,1 … 6,6); `n(E)/n(S) = 6/36 = 1/6`.
- https://www.schoolngr.com/classroom/mathematics/54151 : JAMB two dice, sum greater than 10, n(S) = 36.
- https://www.headteacher.ng/probability-chance-experiments-mutually-exclusive-for-sss-2/ : the P(E) formula; coins, dice and the 52-card pack; `P(A or B) = P(A) + P(B)` for king or queen.
- https://www.headteacher.ng/probability-independent-complementary-events-for-sss-2/ : `P(A and B) = P(A) × P(B)`; `P(A') = 1 – P(A)`; outcome tables and tree diagrams.
- https://www.headteacher.ng/probability-conditional-probability-trees-for-sss-2 : drawing a tree (a node, labelled branches, multiply along, add paths); the 4G/6Y marbles without replacement give 8/15.
- https://www.schoolngr.com/classroom/mathematics/98708 : JAMB bag of balls without replacement (7/10 × 6/9).
- https://waeconline.org.ng/E-Learning/Mathematics/maths218nw.html : WAEC weakness in addition and multiplication of probabilities.

---

## Summary of the changes Stack Prep lessons need

1. **Start every statistics solution by drawing the table**, with Nigerian column headings: `x | f | fx`, `Class | Class mark (x) | f | fx`, `… | cf`, `x | f | d = x − A | fd | fd²`, `x | f | fx | x − x̄ | (x − x̄)² | f(x − x̄)²`, and `Item | Amount | Sectoral angle`. Show the Σ totals row.
2. **List the formula symbols with their values before substituting** (median, mode, nCr, tangent equation).
3. **Calculus: name the parts first.** Write `Let u = …, v = …` and `du/dx, dv/dx` before using the rule. Write "At turning point dy/dx = 0", then do the second-derivative test with a sign statement, then substitute into y. Show definite integrals with `[ ]` limits and `(upper) − (lower)`.
4. **Use the Nigerian vocabulary:** class mark, class boundaries, sectoral angle, assumed mean, turning point, function of a function, δx, "tends to", ordinates, square units.
5. **Ogive:** plot against upper class boundaries, and read at N/2, N/4, 3N/4.
6. **Divide by Σf (n)** for variance, not n − 1.
