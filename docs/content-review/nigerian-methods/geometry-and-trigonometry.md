# Nigerian classroom methods: Geometry and Trigonometry (JAMB Section III)

Research into how Nigerian SS1–SS3 teachers, lesson notes, textbooks and WAEC marking schemes set out each method. The aim is to change Stack Prep's explanations so they follow the order, wording and layout a Nigerian student already knows.

**JAMB scope** (from `docs/syllabus/utme-Mathematics.pdf`, Section III):
- **Euclidean geometry:** angles and lines, polygons, circles (angle properties, cyclic quadrilaterals, intersecting chords), and constructions. The construction objective names "special angles, e.g. 30°, 45°, 60°, 75°, 90°".
- **Mensuration:** arcs and chords, sectors and segments, the surface areas and volumes of solids, and the earth as a sphere.
- **Loci:** parallel lines, perpendicular bisectors, angle bisectors and circles.
- **Coordinate geometry:** the midpoint, gradient and distance, parallel and perpendicular lines, and the equation of a line "in the two-point form, point-slope form, slope intercept form and the general form".
- **Trigonometry:** angles in the range −360° ≤ θ ≤ 360°, special angles including 75°, 105° and 135°, elevation and depression, bearings, the area of a triangle, the sin and cos graphs, and the sine and cosine rules.

The syllabus lists these recommended texts: Channon & Smith *New General Mathematics for West Africa* (Longman), Adelodun *Distinction in Mathematics*, David-Osuagwu *New School Mathematics*, and Anyebe *Basic Mathematics*.

## How the sources were checked

For every topic I read at least three sources, drawn from these:
- **Lesson notes:** headteacher.ng (NERDC-aligned notes), classnotes.ng, passnownow.com, stoplearn.com and the Siyavula Nigeria JSS books.
- **A Nigerian school's own note:** Tansi College's SS1 note "Angles on parallel lines", which I read in full.
- **WAEC solutions:** WAEC's own e-learning pages, which give the marking scheme and the Chief Examiner's report.
- **Past-question solutions:** myschool.ng and schoolngr.com.

Where the sources agree, the agreed version is written below as **the Nigerian method**.

### Gaps
- I couldn't read the textbooks (NGM, MAN, Essential Mathematics, Adelodun) directly. The reason abbreviations below ("alt. ∠s", "corr. ∠s" and so on) are the form used by NGM-style books and by WAEC marking schemes. Lesson notes often write them out in full, e.g. "(alternate angles are equal)".
- YouTube transcripts were not available through the tools I had.

---

## 0. Habits that run through every topic

These conventions came up in nearly every source. They matter as much as the formulas.

1. **"Solution" and a sketch come first.** Every worked answer opens with the word *Solution*, then a sketch with the given values written on it. WAEC Chief Examiners repeat, almost every year, that candidates "did not draw the correct diagram. Others did not draw the diagram at all", and they ask teachers to make students "draw sketches before they began to construct".
2. **Write the formula, then substitute, then work it out.** Each of these goes on its own line. The general formula is written before any number appears, for example `L = θ/360 × 2πr`, then `L = 90/360 × 2 × 22/7 × 7`.
3. **π = 22/7 unless told otherwise.** The question usually says "[Take π = 22/7]". Students cancel the 7 in 22/7 against a radius that is a multiple of 7 before multiplying. passnownow sometimes uses 3.142, but only when the question says so.
4. **The reason goes in brackets on the right of each step.** For example, `x = 40° (alternate angles are equal)`. When the same reason repeats, students write "(same reason)" or "(similarly)".
5. **Notation.**
   - **Angles:** ∠ABC or <ABC, or the "hat" form AB̂C or PÔQ. WAEC prints both.
   - **Lengths:** |AB|, written by hand as /AB/.
   - **Parallel lines:** AB//CD on paper, and arrow marks on the lines in the diagram.
6. **Answers carry units and the accuracy the question asks for.** That means "correct to 3 significant figures" or "to the nearest degree". Bearings are always given as three figures.
7. **Re-draw the diagram.** When a figure is busy, the teacher says "we re-draw the diagram" and pulls out the triangle or parallel lines being used (Tansi College note).

---

## 1. Euclidean geometry

### 1a. Angles on parallel lines

**The Nigerian method**
1. Find the parallel lines (marked with arrows) and the transversal.
2. Name the angle pair: *alternate* (the "Z" shape), *corresponding* (the "F" shape), or *co-interior* (the "C" or "U" shape, also called *allied* or *interior* angles).
3. Write the equation with the reason in brackets.
4. If a "bent" line sits between two parallels, draw a third line through the bend, parallel to both. Then use alternate angles twice.

**Worked example 1** (in the style of Tansi College SS1 Example 1):

```
           Q
 A --------*------------> B
          / 40°
         /
 C ----*----------------> D
      x  P

Solution
  AB // CD, PQ is a transversal.
  <QPC = <PQB          (alternate angles are equal)
     x = 40°
```

**Worked example 2** (a bent line between two parallels):

```
 A ------------B
                \ 40°
                 \
                  E ........ X      (construction: draw EX // AB // CD)
                 /
                / 30°
 C ------------D

Solution
  Draw EX through E parallel to AB and CD.
  <BEX = <ABE = 40°      (alt. ∠s, AB // EX)
  <XED = <EDC = 30°      (alt. ∠s, EX // CD)
  <BED = 40° + 30° = 70°
```

**Teacher wording**
- "Arrows are usually used to indicate parallel lines."
- "Alternate angles are equal."
- "Corresponding angles are equal."
- "Co-interior (allied) angles add up to 180°."
- "Sum of angles on a straight line is equal to 180°."
- "Sum of the angles at a point equals 360°."
- "Vertically opposite angles are equal."
- "NB: Always remember that alternate angles are equal and apply it where appropriate."

**Conventions**

| Reason as written | Meaning |
|---|---|
| (alt. ∠s) or (alternate angles are equal) | Alternate angles |
| (corr. ∠s) | Corresponding angles |
| (co-int. ∠s) or (allied ∠s), sum to 180° | Co-interior angles |
| (vert. opp. ∠s) | Vertically opposite angles |
| (∠s on a str. line) | Angles on a straight line |
| (∠s at a point) | Angles at a point |
| (sum of ∠s in a △) | Angle sum of a triangle |
| (ext. ∠ of △ = sum of int. opp. ∠s) | Exterior angle of a triangle |

When you use a parallel-line reason, also name the lines, for example "(alt. ∠s, AB//CD)".

**Common mistakes** (from the WAEC 2011 Q4 and 2007 Q2 reports)
- Candidates "failed to recall properties of parallel lines and triangles".
- They did not recognise "adjacent angles on a straight line".
- They mixed up alternate and co-interior angles.
- They wrote no reasons at all. When a question says "with reasons", reasons carry marks.

### 1b. Polygons

**The Nigerian method**
- The sum of the interior angles is **(n − 2) × 180°**. Some books write it as (2n − 4) right angles.
- The exterior angles always add up to **360°**.
- For a regular polygon:
  - each exterior angle is 360°/n;
  - each interior angle is 180° − exterior angle, or (n − 2) × 180°/n.
- **Interior angle + exterior angle = 180°** (∠s on a str. line). This is the step Nigerian teachers stress: work through the exterior angle, because it is simpler.

**Worked example** (WAEC 2015 Q3a: the interior and exterior angles of a regular polygon are in the ratio 5 : 2; find the number of sides):

```
Solution
  Int. ∠ + Ext. ∠ = 180°          (∠s on a str. line)
  Ext. ∠ = 2/7 × 180°
         = 360°/7
  But Ext. ∠ = 360°/n
  ∴ 360/n = 360/7
        n = 7
  The polygon has 7 sides.
```

**Worked example** (the interior angle is 140°):

```
  Ext. ∠ = 180° − 140° = 40°
       n = 360°/40° = 9 sides
  Sum of int. ∠s = (n − 2) × 180° = 7 × 180° = 1260°
```

**Common mistakes**
- Using (n − 2) × 180° as if it gave one angle instead of the sum.
- Forgetting that the "each angle" formulas only work for a *regular* polygon.
- WAEC 2015: candidates "failed to show that each interior angle…" was (n − 2)180/n.

### 1c. Circle theorems, cyclic quadrilaterals, tangents and intersecting chords

**The Nigerian method**
1. Mark the centre O, the radii and every given angle on the diagram.
2. Before computing anything, look for equal radii, because they make isosceles triangles.
3. Each line gives one angle, with the theorem cited in brackets.
4. Theorems are numbered and proved in SS2 in the format **Given / Required to prove (To prove) / Construction / Proof**, with a reason on every line. In the JAMB and WAEC working, though, the student only *cites* the theorem in short form.

**Theorems and how they are cited** (as written in WAEC marking schemes, headteacher.ng and stoplearn)

| Theorem | Reason as written in the working |
|---|---|
| The angle an arc subtends at the centre is twice the angle it subtends at the circumference. | (∠ at centre = 2 × ∠ at circumference) |
| Angles in the same segment are equal. | (∠s in the same segment) |
| The angle in a semicircle is a right angle. | (∠ in a semicircle) |
| Opposite angles of a cyclic quadrilateral are supplementary. | (opp. ∠s of a cyclic quad.) |
| The exterior angle of a cyclic quadrilateral equals the interior opposite angle. | (ext. ∠ of a cyclic quad.) |
| A tangent is perpendicular to the radius at the point of contact. | (tangent ⊥ radius) |
| Tangents from an external point are equal. | (tangents from an external point) |
| The angle between a tangent and a chord equals the angle in the alternate segment. | (alternate segment theorem) or (∠s in alt. segment) |
| Two radii make an isosceles triangle. | (radii) then (base ∠s of isos. △) |
| Intersecting chords: AX × XB = CX × XD. | (intersecting chords) |

**Worked example** (based on headteacher.ng and WAEC 2011 Q4b):

```
        C
       / \
      /   \          O is the centre. ∠AOB = 110°.
     /  O  \         Find (i) ∠ACB  (ii) ∠OAB.
    A-------B

Solution
 (i)  ∠AOB = 2 × ∠ACB     (∠ at centre = 2 × ∠ at circumference)
      110° = 2 × ∠ACB
      ∠ACB = 55°

 (ii) OA = OB             (radii)
      ∴ ∠OAB = ∠OBA       (base ∠s of isos. △)
      ∠OAB = (180° − 110°)/2
           = 35°
```

**Worked example** (cyclic quadrilateral PQRS with ∠P = 3x and ∠R = 2x + 30°):

```
  ∠P + ∠R = 180°          (opp. ∠s of a cyclic quad.)
  3x + 2x + 30 = 180
            5x = 150
             x = 30°
```

**Worked example** (intersecting chords AB and CD meet at X, with AX = 4 cm, XB = 6 cm, CX = 3 cm; find XD):

```
  AX × XB = CX × XD       (intersecting chords)
    4 × 6 = 3 × XD
       XD = 24/3 = 8 cm
```

**Marking-scheme example** (WAEC Nov 2014 Q12, a tangent TS at S with ∠TSP = 21°):

```
  ∠PRS = 21°   (alternate segment theorem)
  ∠RSP = 80°   (opp. ∠s of cyclic quad.)
  ∴ ∠SPR = 180 − (21 + 80) = 79°   (sum of ∠s in a △)
```

**Teacher wording**
- "The angle which an arc of a circle subtends at the centre is twice that which it subtends at any point on the remaining part of the circumference" (stoplearn, Circle Theorem 1).
- "Angles in the same segment are equal."
- "Opposite angles of a cyclic quadrilateral add up to 180° (supplementary)."

**Common mistakes** (WAEC reports 2011, 2014, 2015 and 2021)
- "Majority of the candidates were reported not to apply the circle theorems correctly."
- "Poor knowledge of circle theorems", especially the alternate segment theorem and the cyclic quadrilateral properties.
- Using the reflex angle at the centre when the minor angle is needed, or the other way round.
- Not spotting the isosceles triangle that two radii make.
- Doubling instead of halving, by mixing up which angle is at the centre.

### 1d. Constructions

**The Nigerian method** (Siyavula Nigeria JSS, headteacher.ng SS1, and the WAEC construction questions): use a **"ruler and a pair of compasses only"**. Leave every arc showing, because the arcs are the evidence that earns the marks.

```
To construct 60° at A on line AB:
  1. With centre A and any convenient radius, draw an arc to cut AB at P.
  2. With centre P and the same radius, draw an arc to cut the first arc at Q.
  3. Join AQ. ∠QAB = 60°.

90°:  construct the perpendicular at A. That is, bisect the straight angle at A
      (arcs from A cut the line at two points; from each point draw arcs that
      cross above A; join).
30°:  construct 60°, then bisect it.
45°:  construct 90°, then bisect it.
120°: step the same radius round twice from P (60° + 60°).
75°:  construct 60° and 90° at A, then bisect the 30° between them (60° + 15°).
105°: 90° + 15°.
135°: 90° + 45°.

To bisect ∠ABC:
  1. With centre B, draw an arc to cut BA at P and BC at Q.
  2. With centres P and Q and the same radius, draw arcs to meet at R.
  3. Join BR. BR bisects ∠ABC.
```

**Common mistakes**
- Rubbing out the construction arcs.
- Using a protractor where the question says compasses only.
- Changing the radius between arcs that must use the same radius.
- WAEC: "Candidates are also encouraged to draw sketches before they began to construct as this will serve as a guide."

---

## 2. Mensuration

### 2a. Arc length, sector, segment and chord

**The Nigerian method:** write the formula, put the fraction θ/360 first, then substitute with 22/7, cancel, and give the units.

```
Length of arc,  L = θ/360 × 2πr
Area of sector, A = θ/360 × πr²
Perimeter of sector = 2r + L
Area of segment = Area of sector − Area of triangle
                = θ/360 × πr² − ½r² sin θ
Length of chord = 2r sin(θ/2)
```

**Worked example** (headteacher.ng SS1: r = 7 cm, θ = 90°, π = 22/7):

```
Solution
  L = θ/360 × 2πr
    = 90/360 × 2 × 22/7 × 7
    = 1/4 × 2 × 22
    = 11 cm

  Area of sector = θ/360 × πr²
                 = 90/360 × 22/7 × 7 × 7
                 = 1/4 × 154
                 = 38.5 cm²

  Area of △ = ½ × 7 × 7 = 24.5 cm²
  Area of segment = 38.5 − 24.5 = 14 cm²
```

**Worked example** (segment with θ = 60° and r = 7 cm):

```
  Area of sector = 60/360 × 22/7 × 7²  = 1/6 × 154  = 25.67 cm²
  Area of △OAB  = ½ r² sin θ = ½ × 49 × sin 60° = ½ × 49 × 0.8660 = 21.22 cm²
  Area of minor segment = 25.67 − 21.22 = 4.45 cm²
```

### 2b. Surface area and volume of solids

**The formulas as Nigerian notes write them** (headteacher.ng Mensuration I–III and myschool/schoolngr solutions)

| Solid | Surface area | Volume |
|---|---|---|
| Cylinder | Curved = 2πrh; Total = 2πr² + 2πrh = 2πr(r + h) | πr²h |
| Cone | Curved = πrl; Total = πr² + πrl = πr(r + l); l² = r² + h² | ⅓πr²h |
| Pyramid | Base + sum of the triangular faces | ⅓ × base area × h |
| Sphere | 4πr² | 4/3 πr³ |
| Hemisphere | Curved 2πr²; Total (solid) 3πr² | 2/3 πr³ |
| Frustum (cone) | πl(R + r) + πR² + πr² | Volume of big cone − volume of small cone, or ⅓πh(R² + Rr + r²) |

**Worked example** (cone with r = 7 cm and h = 24 cm, π = 22/7):

```
Solution
  l² = r² + h²         (Pythagoras)
     = 7² + 24² = 49 + 576 = 625
   l = 25 cm

  Curved surface area = πrl
                      = 22/7 × 7 × 25
                      = 550 cm²
  Total surface area  = πr(r + l)
                      = 22/7 × 7 × (7 + 25)
                      = 22 × 32 = 704 cm²
  Volume = ⅓πr²h
         = ⅓ × 22/7 × 7 × 7 × 24
         = 1232 cm³
```

**Sector folded into a cone.** This is a JAMB favourite (schoolngr/myschool). The teacher's rule is: "the radius of the sector becomes the slant height; the arc length becomes the circumference of the base; the area of the sector becomes the curved surface area of the cone."

```
  A sector of area 66 cm², radius 6 cm, is folded into a cone. Find r.
  Area of sector = curved surface area of cone = πrl
            66 = 22/7 × r × 6
             r = 66 × 7 / (22 × 6) = 3.5 cm
```

**Frustum, the Nigerian "big cone minus small cone" method.** This is the first method most textbooks teach. The formula ⅓πh(R² + Rr + r²) comes later, as a shortcut.

```
  A cone of height 24 cm and base radius 14 cm has its top 12 cm cut off
  parallel to the base. Find the volume of the frustum.

  By similar triangles:  r/14 = 12/24  →  r = 7 cm
  Vol. of big cone   = ⅓ × 22/7 × 14² × 24 = 4928 cm³
  Vol. of small cone = ⅓ × 22/7 × 7² × 12  =  616 cm³
  Vol. of frustum    = 4928 − 616 = 4312 cm³
  (check: ⅓ × 22/7 × 12 × (14² + 14×7 + 7²) = 4312 cm³)
```

**Common mistakes**
- Using the height h instead of the slant height l in πrl.
- Using the diameter as the radius.
- Including the base in a "curved" surface area, or leaving out the bottom of a *closed* cylinder.
- For a frustum, subtracting radii instead of volumes.
- For composite solids, counting the joined (hidden) faces. Notes say to exclude "internal joined areas".

### 2c. The earth as a sphere (latitude and longitude)

**The Nigerian method** (headteacher.ng SS3, passnownow SS3, and the WAEC 2010 Q12 marking scheme)

1. Draw the sphere with N and S poles, the equator, and the parallel of latitude through the points. Mark the centre O of the earth and the centre of the small circle.
2. **Find the angular difference θ:**
   - If both points are on the same side (both N, or both E), **subtract**.
   - If they are on opposite sides (N and S, or E and W), **add**.
3. **Decide which kind of circle the path runs along:**
   - **A great circle** (a meridian, or the equator): use R.
   - **A small circle** (a parallel of latitude α): use r = R cos α.
4. Write the formula, substitute R = 6400 km and π = 22/7, and give the units.

```
Radius of parallel of latitude α:   r = R cos α
Distance along a great circle:      d = θ/360 × 2πR
Distance along a parallel (lat α):  d = θ/360 × 2πR cos α
Height of small-circle centre above O:  R sin α
In nautical miles:  great circle = 60θ n.m.;  parallel = 60θ cos α n.m.
(1° of arc on a great circle ≈ 60 nautical miles; 1 knot = 1 n.m. per hour)
```

**Worked example** (WAEC Nov 2010 Q12: P(40°N, 18°W) and Q(40°N, 78°W); R = 6400 km, π = 22/7):

```
Solution
  Difference in longitude: θ = 78° − 18° = 60°   (both W, subtract)
  (a) r = R cos α = 6400 × cos 40° = 6400 × 0.7660 = 4902.4 km
  (b) PQ = θ/360 × 2πr
         = 60/360 × 2 × 22/7 × 4902.4
         = 5136 km  (≈ 5140 km, 3 s.f.)
  (c) Distance from centre of earth to centre of small circle
         = R sin 40° = 6400 × 0.6428 = 4114 km
```

**Worked example** (along a meridian: A(20°N, 30°E) and B(40°S, 30°E)):

```
  θ = 20° + 40° = 60°   (N and S, add)
  AB = θ/360 × 2πR = 60/360 × 2 × 22/7 × 6400 = 6704.76 ≈ 6705 km
```

**Worked example** (finding the new longitude, schoolngr: a plane flies due west 1800 km from P(50°N, 60°W)):

```
  1800 = θ/360 × 2 × 22/7 × 6400 cos 50°
     θ = 1800 × 360 × 7 / (44 × 4113.84) = 25.1°
  Longitude of Q = 60° + 25.1° = 85.1°W       (moving west from W, add)
```

**Common mistakes** (WAEC reports)
- "Majority of the candidates did not draw the correct diagram. Others did not draw the diagram at all."
- Using R instead of R cos α along a parallel.
- Adding when they should subtract, or the other way round.
- Using the difference in latitude when the points share a latitude.
- Not being able to find the vertical distance R sin α.

---

## 3. Loci

**The Nigerian method:** a definition first, then the four standard loci, each with a one-line description and numbered compass steps.

> "Locus is the path traced by a moving point or points under a given condition or set of conditions." (headteacher.ng SS1)

| Condition | Locus (as described) |
|---|---|
| A fixed distance r from a fixed point O | A circle, centre O and radius r |
| A fixed distance d from a straight line | A pair of parallel lines, one on each side of the line and d from it |
| Equidistant from two fixed points A and B | The perpendicular bisector of AB |
| Equidistant from two intersecting lines | The bisector of the angle between the lines (both bisectors, if the lines are full lines) |
| (Extension) ∠APB = 90° | A circle with AB as diameter (∠ in a semicircle) |

**Construction steps** (perpendicular bisector of AB)

```
  1. Join A and B.
  2. With centre A and radius more than half of AB, draw arcs above and below AB.
  3. With centre B and the same radius, draw arcs to cut the first two arcs at P and Q.
  4. Join PQ. PQ is the locus of points equidistant from A and B.
```

**Typical WAEC question:** construct △PQR, then "construct l, the locus of all points equidistant from PR and QR". The answer is the bisector of ∠PRQ. "Hence" find a point where two loci meet, then measure.

**Teacher wording**
- "Equidistant means at equal distances."
- "The locus of points equidistant from two given points is the perpendicular bisector of the line joining them."

**Common mistakes**
- WAEC: "majority of them were unable to obtain the required locus".
- Drawing only one of the two parallel lines.
- Bisecting the wrong angle.
- Rubbing out arcs.
- Not labelling the locus.

---

## 4. Coordinate geometry

**The Nigerian method:** **label the points first.** The student writes "Let (x₁, y₁) = (…) and (x₂, y₂) = (…)" before using any formula. Then they write the formula, substitute with brackets around negative numbers, and simplify.

```
Midpoint      M = ((x₁ + x₂)/2 , (y₁ + y₂)/2)
Gradient      m = (y₂ − y₁)/(x₂ − x₁)        ("change in y over change in x")
Distance    |AB| = √[(x₂ − x₁)² + (y₂ − y₁)²]
Two-point form:    (y − y₁)/(x − x₁) = (y₂ − y₁)/(x₂ − x₁)
Point-slope form:  y − y₁ = m(x − x₁)
Slope-intercept:   y = mx + c      (m = gradient, c = y-intercept)
Intercept form:    x/a + y/b = 1
General form:      ax + by + c = 0   (gradient = −a/b)
Parallel:          m₁ = m₂
Perpendicular:     m₁m₂ = −1   i.e.  m₂ = −1/m₁
```

**Worked example** (A(2, 3) and B(6, 11)):

```
Solution
  Let (x₁, y₁) = (2, 3) and (x₂, y₂) = (6, 11)

  Midpoint = ((2 + 6)/2 , (3 + 11)/2) = (4, 7)

  Gradient, m = (11 − 3)/(6 − 2) = 8/4 = 2

  |AB| = √[(6 − 2)² + (11 − 3)²] = √(16 + 64) = √80 = 4√5 units

  Equation of AB (two-point form):
     (y − 3)/(x − 2) = (11 − 3)/(6 − 2)
     (y − 3)/(x − 2) = 2
           y − 3 = 2(x − 2)
           y − 3 = 2x − 4
               y = 2x − 1      or   2x − y − 1 = 0

  Line through A perpendicular to AB:
     m₁m₂ = −1  →  2 × m₂ = −1  →  m₂ = −½
     y − 3 = −½(x − 2)
     2y − 6 = −x + 2
     x + 2y − 8 = 0

  Intercepts of 2x − y − 1 = 0:
     x-intercept: put y = 0 → x = ½
     y-intercept: put x = 0 → y = −1
```

**Finding the gradient from a general-form equation** (e.g. 3x + 4y − 12 = 0): rearrange to y = mx + c, giving 4y = −3x + 12, so y = −¾x + 3 and m = −¾. Many notes also teach the shortcut m = −(coefficient of x)/(coefficient of y).

**Common mistakes**
- Mixing the order of subtraction, e.g. y₂ − y₁ over x₁ − x₂.
- Sign errors with negative coordinates. Teachers insist on brackets, e.g. (−3 − 2).
- Reading the gradient from ax + by + c = 0 as a, instead of −a/b.
- Using m₂ = 1/m₁ (forgetting the minus sign) for a perpendicular.
- Leaving fractions in the final equation. Teachers clear them to the form ax + by + c = 0.

---

## 5. Trigonometry

### 5a. SOH CAH TOA

**The Nigerian method:**
1. Draw the right-angled triangle and mark θ.
2. Label the sides **opp, adj and hyp** *relative to θ*.
3. Say which two sides are involved, and choose the ratio: "Since opposite and adjacent are known, use tangent."
4. Write the ratio, then cross-multiply.

```
  SOH: sin θ = opp/hyp     CAH: cos θ = adj/hyp     TOA: tan θ = opp/adj

  Example: hyp = 10 cm, θ = 30°, find the opposite side x.
     sin 30° = x/10
           x = 10 sin 30°
             = 10 × 0.5 = 5 cm
  Finding an angle:  tan θ = 12/5 = 2.4 → θ = tan⁻¹ 2.4 = 67.4°
```

Teachers say "SOH CAH TOA" aloud. Some add the phrase "when taking sin to the other side it becomes inverse (sin⁻¹)" (passnownow).

### 5b. Special angles (30°, 45°, 60°)

**Derivation, as on the board:**
- **For 30° and 60°:** take an equilateral triangle of side 2 units and drop the perpendicular. It halves the base into 1 and 1, and its height is √(2² − 1²) = √3.
- **For 45°:** take an isosceles right-angled triangle with legs 1 and 1. The hypotenuse is √2.

```
        /|                      /|
     2 / |  √3              √2 / |  1
      /60|                    /45|
     /___|                   /___|
       1                       1
     (30° at the top)

  θ      0°    30°     45°     60°     90°
  sin θ  0     1/2     √2/2    √3/2    1
  cos θ  1     √3/2    √2/2    1/2     0
  tan θ  0     √3/3    1       √3      undefined
```

Nigerian notes give the answers in *surd form*, rationalised: 1/√2 = √2/2 and 1/√3 = √3/3. JAMB options are usually in this form. For 75° and 105°, JAMB lists them as "special angles". Teachers build them from 45° + 30° and 60° + 45°, e.g. sin 75° = (√6 + √2)/4.

### 5c. Angles of elevation and depression

**The Nigerian method** (headteacher.ng SS2, schoolngr JAMB solutions):
1. Draw a **horizontal line** from the observer's eye.
2. The angle of elevation is measured *up* from the horizontal. The angle of depression is measured *down* from the horizontal at the top.
3. Teachers stress: **"the angle of depression = the angle of elevation"** (alternate angles, because the two horizontals are parallel). So the angle is moved into the triangle at the ground.
4. Then use SOH CAH TOA, nearly always tan.

```
  Depression:                                     Elevation:
  T ________ horizontal                              T
  |  \  40°                                         /|
  |    \                                          /  |
 80m     \                                      /    | h
  |        \                                  / 30°  |
  |____40°___\ B                             A-------F
  F     x                                       50 m

  tan 40° = 80/x                                tan 30° = h/50
        x = 80/tan 40°                                h = 50 tan 30°
          = 80/0.8391                                   = 50 × √3/3
          = 95.3 m                                      = 28.9 m (3 s.f.)
```

**Common mistakes**
- Measuring the depression angle from the vertical wall instead of the horizontal.
- Forgetting to add the observer's eye height when the question gives one.
- Choosing sin when the two sides involved are opp and adj.

### 5d. Bearings, and the sine and cosine rules

**The Nigerian method** (classnotes.ng, passnownow SS2, headteacher.ng, WAEC 2010 Q9 and 2021 Q3, schoolngr):
1. **Draw a North line at every point.** All the North lines are parallel.
2. **"Bearing of B from A":** stand at A, the point after the word *from*. Put the North line at A and measure **clockwise** to AB.
3. Write bearings with **three figures**: 050°, not 50°. The older "compass" form, N50°E, is taught alongside.
   - Back bearing = bearing ± 180°.
4. Find the angle *inside* the triangle using the parallel North lines (alternate and co-interior angles) and angles on a straight line or at a point.
5. Then apply:
   - **The cosine rule** for two sides and the included angle, or for three sides.
   - **The sine rule** for an angle and its opposite side.
   - **Pythagoras** when the triangle has a right angle (e.g. due east then due north).
6. Turn the angle found back into a three-figure bearing.

```
Cosine rule:  a² = b² + c² − 2bc cos A      cos A = (b² + c² − a²)/2bc
Sine rule:    a/sin A = b/sin B = c/sin C
Area:         Area of △ = ½ab sin C
```

**Worked example** (schoolngr/WAEC style: |PQ| = 8 m, |QR| = 13 m, bearing of Q from P = 050°, bearing of R from Q = 130°):

```
        N                N
        |                |
        |               /Q\           (North lines drawn at P and at Q)
        |    8 m      /  |  \ 13 m
        |50°       /     |   \
        |       /        |130°\
        P  /             |     R
           (P to R joined)

Solution
  ∠PQR = (180° − 130°) + 50°       (co-int. ∠s; alt. ∠s on the N lines)
       = 100°

  (i)  |PR|² = |PQ|² + |QR|² − 2|PQ||QR| cos ∠PQR      (cosine rule)
             = 8² + 13² − 2(8)(13) cos 100°
             = 64 + 169 − 208(−0.1736)
             = 233 + 36.11 = 269.11
        |PR| = 16.4 m (3 s.f.)

  (ii) sin ∠QPR / 13 = sin 100° / 16.4                   (sine rule)
       sin ∠QPR = 13 × 0.9848 / 16.4 = 0.7806
          ∠QPR = 51.3°
       Bearing of R from P = 050° + 51.3° = 101.3° ≈ 101°

  (iii) Area of △PQR = ½ × 8 × 13 × sin 100°
                     = 52 × 0.9848 = 51.2 m²
```

**Teacher wording**
- "Bearing is the clockwise angular movement between two distant places."
- "Taking reading in bearing starts from the North Pole in clockwise direction."
- "Bearings are always measured clockwise and must have three figures."
- "All questions in bearing lead into the formation of a triangle." (passnownow)
- "Draw a North line at the starting point of the bearing." (headteacher.ng)

**Common mistakes** (WAEC 2010 and 2021 reports)
- "Failure to calculate ∠ABC correctly". The formula was right but the inside angle was wrong.
- "Inability to determine the required bearing correctly."
- Not using Pythagoras "where necessary".
- Not being able to "get the trigonometry ratio correctly".
- Measuring anticlockwise.
- Writing 50° instead of 050°.
- Putting the North line at the wrong point (at B instead of A for "B from A").
- Forgetting that cos of an obtuse angle is negative, so −2bc cos A becomes "+".

### 5e. Angles beyond 90°: the quadrant rule

**The Nigerian method:** draw the four quadrants and write in the letters to show which ratios are positive. Starting from the first quadrant and going anticlockwise, they are **A**ll, **S**ine, **T**angent, **C**osine. Then reduce any angle to its acute "basic" angle.

```
            90°
     S      |      A          2nd quad (90°–180°):  basic ∠ = 180° − θ
  (sin +)   |   (all +)       3rd quad (180°–270°): basic ∠ = θ − 180°
180° -------+------- 0°/360°  4th quad (270°–360°): basic ∠ = 360° − θ
     T      |      C
  (tan +)   |   (cos +)
            270°

  sin 150° = +sin 30° = ½
  cos 120° = −cos 60° = −½
  tan 225° = +tan 45° = 1
  cos 300° = +cos 60° = ½
  sin 135° = +sin 45° = √2/2
  Negative angles (measured clockwise): sin(−θ) = −sin θ, cos(−θ) = cos θ
     e.g. sin(−30°) = −½,  cos(−60°) = ½

  Solve sin θ = ½ for 0° ≤ θ ≤ 360°:
     basic ∠ = 30°; sin is + in quads 1 and 2
     θ = 30° or 180° − 30° = 150°
```

**Mnemonics.** Sources use "ASTC", "All Students Take Calculus/Coffee", "Add Sugar To Coffee" and "All Silver Tea Cups". I found **no single Nigerian-specific mnemonic**. What is consistent is the quadrant diagram with the letters, read anticlockwise from the first quadrant. Recommendation: show the diagram, and give "All Students Take Coffee" as one possible way to remember it.

The headteacher.ng SS2 note also warns: "Consider the possibility of an obtuse angle for SSA cases, as sine is positive in both the first and second quadrants."

### 5f. Graphs of sine and cosine

**The Nigerian method** (headteacher.ng SS1 and SS3, WAEC graph questions):
1. **Copy and complete the table of values.** Use x from 0° to 360°, usually in steps of 30° (sometimes 15° or 45°). Values are to 1 or 2 d.p.
2. Use the **scale given** in the question, e.g. "2 cm to 30° on the x-axis and 2 cm to 0.5 units on the y-axis".
3. Plot the points and join them with a **smooth curve**, never with ruled straight lines.
4. **"Use your graph to find…"** To solve sin x = k, draw the horizontal line y = k, then drop lines to the x-axis and read off the angle(s).

```
  x°      0    30    60    90   120   150   180   210   240   270   300   330   360
  sin x  0.00 0.50  0.87  1.00  0.87  0.50  0.00 −0.50 −0.87 −1.00 −0.87 −0.50  0.00
  cos x  1.00 0.87  0.50  0.00 −0.50 −0.87 −1.00 −0.87 −0.50  0.00  0.50  0.87  1.00
```

**Key facts teachers state:**
- Both curves lie between −1 and 1.
- sin is greatest at 90°, cos is greatest at 0° and 360°.
- The period is 360°.
- y = 2 sin x stretches the graph to between −2 and 2.

**Common mistakes**
- Joining the points with a ruler.
- Using a scale different from the one given.
- Reading only one solution when the line cuts the curve twice.
- Wrong signs in the 2nd to 4th quadrants of the table.

---

## What this means for Stack Prep lessons (summary)

Each lesson should follow the order a Nigerian student writes:

1. **"Solution"**, then **sketch the diagram** with the given values on it (and for bearings, a North line at every point).
2. **Label first.** Write (x₁, y₁), (x₂, y₂), mark opp, adj and hyp, state θ and say whether to add or subtract for latitude and longitude, and mark the radii as equal.
3. **Write the formula, then substitute, then simplify,** with π = 22/7 cancelled visibly.
4. **Cite a reason in brackets on every geometry line,** in the short form (alt. ∠s, ∠ at centre = 2 × ∠ at circumference, opp. ∠s of a cyclic quad.).
5. **Give the answer with units and the accuracy asked for,** and bearings as three figures.

The biggest gaps WAEC flags are the same ones our lessons should model clearly: drawing the diagram, finding the angle inside a bearing triangle, choosing the right circle theorem, and using R cos α along a parallel of latitude.

---

## Sources

**Syllabus and curriculum**
- `C:\Users\yakub\stack-prep\docs\syllabus\utme-Mathematics.pdf`: the JAMB Section III topics, objectives and recommended texts (NGM, Adelodun and others).
- https://www.headteacher.ng/circle-theorems-proofs-major-theorems-for-sss-2/: the SS2 placement of the circle theorems in the NERDC-aligned scheme.

**Euclidean geometry**
- https://tansicollege.edu.ng/sites/default/files/homeschool/maths_ss1_3rd-converted.pdf: Tansi College (Nigeria) SS1 note "Angles on parallel lines". It shows the exact layout "<QPC = <PQB (alternate angles are equal)", "(same reason)" and "re-draw the diagram".
- https://www.headteacher.ng/properties-of-angles-angles-on-a-straight-line-for-jss-1/: JSS angles on a straight line, and alternate and corresponding angles.
- https://inspire.education.gov.ng/lessons/477/preview: the Federal Ministry of Education "Angles in parallel lines" lesson (allied/co-interior angles sum to 180°).
- https://www.siyavula.com/read/za/mathematics/grade-8/geometry-of-straight-lines/12-geometry-of-straight-lines-07: the reason abbreviations (alt ∠s, corresp ∠s, co-int ∠s, vert opp ∠s) and naming the parallel lines.
- https://waeconline.org.ng/E-Learning/Mathematics/maths217nq2.html: the WAEC 2007 parallel-lines and polygon marking scheme, and the examiner's note on candidates missing "adjacent angles on a straight line".
- https://www.headteacher.ng/lesson-note-on-deductive-proofs-iii-parallelogram-intercept-theorem-and-polygon-types-for-sss-1/: SS1 polygons, the (n − 2) × 180° and 360°/n formulas.
- https://www.waeconline.org.ng/e-learning/Mathematics/maths224mq3.html: WAEC 2015 Q3. The polygon ratio 5 : 2 and the circle-theorem marking scheme with reasons, plus the examiner's weaknesses.
- https://www.waeconline.org.ng/e-learning/Mathematics/maths220mq4.html: WAEC 2011 Q4. Parallel lines and a cyclic quadrilateral, with reasons in brackets.
- https://waeconline.org.ng/e-learning/Mathematics/maths223Nq12.html: WAEC 2014 Q12. The alternate segment theorem and the angle in a semicircle, and "poor knowledge of circle theorems".
- https://stoplearn.com/circle-theorem-1-angles-at-the-centre-of-a-circle/: stoplearn's Given / To prove / Construction / Proof format, with reasons "(radii)" and "(base angles of isosceles triangle)".
- https://www.savemyexams.com/igcse/maths/edexcel/22/revision-notes/4-geometry-and-trigonometry/circle-theorems/intersecting-chord-theorem: the statement AX × XB = CX × XD.
- https://myschool.ng/classroom/mathematics/26354: a JAMB intersecting-chords angle question.
- https://www.headteacher.ng/lesson-note-on-construction-i-lines-angles-and-triangles-for-sss-1/: SS1 construction of 90°, 60°, 45°, 30° and 75°.
- https://ng.siyavula.com/read/maths/jss2/constructions/11-constructions?id=112-angles: the Siyavula Nigeria JSS2 constructions chapter on angles.

**Mensuration**
- https://www.headteacher.ng/lesson-note-on-mensuration-of-solid-shapes-i-arc-sector-and-segment-for-sss-1/: arc, sector and segment, each set out as formula, then substitution with 22/7, then answer.
- https://www.headteacher.ng/lesson-note-on-mensuration-of-solid-shapes-ii-surface-areas-and-cone-sector-relation-for-sss-1/: surface areas and the sector-to-cone relation.
- https://www.headteacher.ng/lesson-note-on-mensuration-of-solid-shapes-iii-volumes-and-compound-shapes-for-sss-1/: the volume formulas, the frustum and compound shapes.
- https://www.schoolngr.com/classroom/mathematics/31805: JAMB sector-to-cone solutions using πrl with 22/7.
- https://myschool.ng/classroom/mathematics/55369: a JAMB frustum volume formula question.

**The earth as a sphere**
- https://www.headteacher.ng/earth-as-sphere-longitude-latitude-for-sss-3/: SS3 earth as a sphere, with r = R cos α, θ/360 × 2πR, R = 6400 km and 60 nautical miles.
- https://passnownow.com/classwork-exercise-and-series-mathematics-ss3-spherical-geometry/: the add/subtract rule for θ, the knot and nautical mile, and π = 3.142 variants.
- https://waeconline.org.ng/E-Learning/Mathematics/maths219Nq12.html: WAEC Nov 2010 Q12 latitude marking scheme, and "did not draw the correct diagram".
- https://schoolngr.com/classroom/mathematics/29291: an aeroplane latitude/longitude solution (new longitude and latitude).

**Loci**
- https://www.headteacher.ng/lesson-note-on-locus-of-moving-points-constructions-and-steps-for-sss-1/: the locus definition, the four standard loci and the numbered construction steps.
- https://waeconline.org.ng/E-Learning/Mathematics/maths219Nq8.html: WAEC construction and locus question ("ruler and a pair of compasses only"), with the examiner's advice.

**Coordinate geometry**
- https://www.headteacher.ng/coordinate-geometry-straight-line-i-for-sss-1: the midpoint, gradient and distance formulas, with labelled (x₁, y₁).
- https://www.headteacher.ng/coordinate-geometry-straight-line-ii-for-sss-1: the two-point, point-slope, y = mx + c and intercept forms, and m₁m₂ = −1.
- https://inspire.education.gov.ng/lessons/355/preview: the Federal Ministry of Education coordinate geometry lesson.

**Trigonometry**
- https://www.headteacher.ng/trigonometric-ratios-special-angles-for-sss-1/: special angles from the side-2 equilateral and unit isosceles triangles, in surd form.
- https://www.headteacher.ng/right-angled-triangle-elevation-depression-for-sss-2: elevation and depression, "use tangent", and depression = elevation (alternate angles).
- https://www.schoolngr.com/classroom/mathematics/32433: JAMB angle-of-depression solutions (tan 50° = h/6 and so on).
- https://classnotes.ng/lesson/bearing-and-distances-elevation-and-depression-mathematics-ss2/: classnotes.ng SS2 bearings, elevation and depression (cardinal N45°E form, and three-figure bearings).
- https://passnownow.com/classwork-series-exercises-mathematics-ss2-bearing-distances/: passnownow SS2 bearings ("three figures", "all questions in bearing lead into a triangle", cosine and sine rules).
- https://www.headteacher.ng/bearing-cardinal-points-problems-for-sss-2/: "Draw a North line at the starting point", and alternate angles between North lines.
- https://www.schoolngr.com/classroom/mathematics/29129: the PQ = 8, QR = 13 bearing solution, with ∠PQR = (180 − 130) + 50, the cosine rule, the sine rule and the area.
- https://waeconline.org.ng/e-Learning/Mathematics/maths219mq9.html: WAEC 2010 Q9 bearings, and "failure to calculate ∠ABC correctly".
- https://www.waeconline.org.ng/e-Learning/Mathematics/maths233mq3.html: WAEC 2021 Q3 bearings with Pythagoras, and the examiner's weaknesses.
- https://myschool.ng/classroom/mathematics/54520: WAEC 1996 two-men bearing problem, worked with the cosine rule. The site's final bearing looks wrong, so I did not use it here.
- https://www.headteacher.ng/trigonometry-sine-cosine-rule-for-sss-2/: the sine and cosine rules as written, when to use each, and the SSA obtuse-angle warning.
- https://www.headteacher.ng/lesson-note-on-trigonometry-iii-unit-circle-and-sine-cosine-graphs-for-sss-1/: the table of values from 0° to 360°, plotting and reading solutions from the graph.
- https://www.headteacher.ng/trigonometry-sine-cosine-graphs-for-sss-3: SS3 sine and cosine graphs.
- https://en.wikipedia.org/wiki/Mnemonics_in_trigonometry: the ASTC variants (All Students Take Calculus, Add Sugar To Coffee, All Silver Tea Cups). No Nigeria-specific variant was found.
