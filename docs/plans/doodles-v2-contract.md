# Doodles v2: the lesson contract

This is fixed on 29 September 2026 for the engine helper and the content helpers, who are
working in parallel. The engine may add to it, but must not change or remove anything here.
v1 lessons (`doodle: {name, caption?, near?}`) keep working unchanged.

## 1. Bringing a doodle in: `doodle` on a moment

```yaml
doodle: {name: 'custom:2001_q15_a', id: jar, caption: 'savings jar', near: 2, size: medium}
```

- **`name`**: `custom:YYYY_qNN_<tag>` (the lesson's own file) or a library name.
- **`id`** (new, optional): a lesson-unique handle, `[a-z][a-z0-9_]*`, which later moments use
  to act on the doodle.
- **`size`** (new, optional): `small` (≈70px), `medium` (≈120px, the default) or `scene`
  (≈320×200 on laptop; use a `viewBox="0 0 320 200"` file).
- **`repeat`** (new, optional): draws a community of small figures, one by one.
  - Either an integer (`repeat: 12` of `name`),
  - or a list: `repeat: [{name: ball-red, n: 3}, {name: ball-blue, n: 5}]`, with `name` then
    ignored or omitted.
  - At most 50 in total.
  - `layout: row | grid | cluster`, default grid.
- A moment may bring in **one or two** doodles: `doodle:` or `doodles: [ {...}, {...} ]`.

## 2. Acting on a doodle later: `doodle_do` on a moment

```yaml
doodle_do:
  - {id: jar, op: fill, to: 0.8}
  - {id: jar, op: circle, part: label, text: '₦1,240'}
```

At most 3 ops per moment. An `id` must have been brought in by this moment or an earlier one.

| op | Needs | What the pen does |
|---|---|---|
| `pulse` | — | Draws the eye back to the doodle (or to `part`) when the voice refers to it again |
| `circle`, `highlight`, `underline`, `cross` | `part` optional | Marks the part (or the whole doodle) in ink, like a board mark |
| `label` | `text`; `part` optional | Writes a short note (≤ 40 characters) beside the part, with a pointer |
| `arrow` | `part`, and `to_part` or `to_id` | Draws an arrow from one part or doodle to another |
| `stage` | `stage: 'custom:YYYY_qNN_a2'` | Changes the drawing into its next version. If the new file keeps every shape of the old one, only the new strokes are drawn; otherwise the pen crosses out and redraws |
| `move` | `part` (the mover); the art has `<path data-path="NAME">` and the op gives `path: NAME` | The part travels along the path |
| `fill` | `to: 0..1`; the art has `<g data-fill="NAME">` over a closed shape | A liquid or level rises or falls to that fraction, scribbled in |
| `grow`, `shrink` | `part` optional; `by: 1.1..2` / `0.5..0.9` | Swells or shrinks, e.g. an interest pile growing |
| `count` | on a `repeat` group; `n` optional | Writes 1, 2, 3… on the members, one by one (the first n, or all) |
| `group` | on a `repeat` group; `n`, `text` | Loops the first n members and labels them, e.g. "18 both" |
| `split` | on a `repeat` group; `n`, `text: 'left \| right'` | Moves the first n to one side and the rest to the other, with the two labels |

## 3. Linking working, passage and doodle

- **Board line → doodle**, in `point`:
  `{line: N, kind: highlight, at: '₦1,240', to: {doodle: jar, part: label}}`
- Links use the same pair dots and connectors as working↔figure, and light together on hover
  or tap.
- The voice (`say`) must refer to the doodle when a `doodle_do` happens ("Look at the jar
  again…"), so the flow is spoken, not just drawn.

## 4. Art rules (v1 rules still apply)

- **Base rules as in v1:**
  - viewBox `0 0 120 120` (or `0 0 320 200` for a scene).
  - Ink `#1d1b3a`, stroke 2.5–3.5, round caps and joins.
  - Palette fills #7c3aed #ec4899 #fde047 #22c55e #3b82f6 #f97316 at 0.35–0.6.
  - Allowed elements: path, circle, ellipse, line, polyline, polygon, rect, g, text.
  - Caveat text, 14–18 px (scene: up to 22).
  - Under ~4 KB (scene: under ~8 KB).
  - `data-anim` / `data-react` as before.
- **New attributes:**
  - `data-part="name"` on a `<g>`: something ops can target (lower-case, `[a-z][a-z0-9-]*`).
  - `data-path="name"` on a `<path>` that is NOT drawn: a route for `move`. It must have
    `stroke="none" fill="none"`.
  - `data-fill="name"` on a `<g>` holding the closed shape to fill.
- **Stages:** `YYYY_qNN_a.svg`, then `…_a2.svg`, `…_a3.svg`. For a build-up, keep the earlier
  file's elements byte-identical and in the same order, and append the new ones.
- **Library figures for repeat:** `person-small`, `student-small`, `coin-small`,
  `ball-red`, `ball-blue`, `ball-green`, `ball-yellow`, `ball-white`, `ball-black`,
  `seed-small`, `house-small`, `book-small`. All are 40×40 viewBox icons (`viewBox="0 0 40
  40"`). The engine helper draws these.

## 5. Where doodles belong

- A doodle shows the situation or the idea. It never duplicates a sketch or figure that the
  lesson already draws.
- Numbers in art match the question exactly. What is being found is drawn as "?".
- Every word problem should use its doodle across the lesson: bring it in, then act on it as
  the working moves (2–4 actions is typical).
- Symbol-only Maths topics get concept pictures:
  - indices as repeated-multiplication stacks, and logs as "how many 2s make 8?";
  - surds as square tiles;
  - matrices as seats in rows and columns;
  - sets as bags, and number bases as bundles;
  - gradient as a hill, and rates as a speedometer;
  - probability as bags, dice or coins.

## 6. Added by the engine (29 September; additions only, nothing above changed)

- **`fill: NAME`** (optional) on a `fill` op names the `<g data-fill>` to raise, where the art
  has more than one. With one, it is used without naming it.
- **`data-level="0.4"`** (optional) on a `<g data-fill>` is where its level starts (0 to 1;
  default 0, empty). The shape's own fill colour is the liquid's colour.
- **`n`** also works on `pulse`, `circle`, `highlight`, `underline`, `cross` and `label` for a
  repeat group: the first n figures (without it, the whole group). A repeat group has no parts.
- **`text`** (optional, 40 characters or fewer) on `circle`, `highlight`, `underline`, `cross`
  and `arrow` writes a note with the mark, as `label` does.
- **A split after a group** still takes the first n of all the figures. Where the gathered
  block falls wholly on the left, it keeps together at the left side's inner edge, next to the
  right, and the left name goes under the other left figures. So a Venn of 42 students, 18 in
  both, 32 taking Maths, is `group n: 18, text: '18 both'`, then
  `split n: 32, text: 'Maths only | Physics only'`: Maths only (14), 18 both, Physics only (10).
  A split that cuts through the gathered block breaks it up, and its loop is wiped away.
- **`by`** is optional on `grow` (default 1.3) and `shrink` (default 0.7).
- **`arrow` with `to_id` and no `to_part`** points at the other doodle as a whole.
- **`to: {doodle}`** in a mark may leave out `part` (the doodle as a whole). The part may be one
  that a `stage` in the same moment draws: the moment's actions go first, then its links.
- **`data-part`** may go on any shape or group but the root. Part names are unique in a file.
- **Notes' room:** a doodle whose actions write notes is given room on its right for them;
  where there is none (a phone, the scene panel), they are written inside the picture, by the
  part. A repeat group writes its notes above the figures, and its block names below.
- **`ball-red`** uses a red (#ef4444) outside the palette, since a red ball has to be red.
- **`stage`** is for a single picture, not a repeat group.

## 7. The talking mouth (oral English: vowels, consonants, rhymes, stress)

Added 1 October 2026. On a moment:

```yaml
mouth: {id: m1, word: 'sheep', sound: 'iː', syllables: ['sheep'], stress: 1, on: 'sheep', caption: 'long ee: lips spread'}
```

- **`word`** (required): the word or short phrase the mouth says. It must occur in this
  moment's `say` unless `on` names another word.
- **`sound`** (optional): the IPA symbol of the sound being taught (iː, ɪ, æ, ʃ, θ, ð, v, ʒ…).
  The mouth holds on that sound's shape for a beat, with the symbol written beside it.
- **`syllables`** and **`stress`** (optional, for stress questions): the word split into
  syllables, and the stressed one, counting from 1. The syllables are written under the mouth,
  and the stressed one grows big and pulses while it's said.
- **`view`** (optional): `front` (lips and teeth, the default) or `side` (tongue position, for
  consonants such as θ, ð, l, r).
- **`on`** (optional): the word in `say` that starts it. Defaults to `word`.
- **`caption`** (optional): a short note, 40 characters or fewer.
- **Later moments** use `doodle_do: [{id: m1, op: say, word?: 'ship'}]` to make the same mouth
  say a word again, e.g. to compare "sheep" and "ship" in one mouth.

Behaviour:
- **Speech:** the mouth moves through the visemes of the word, in time with the voice. With
  the Kokoro voice it uses the real phoneme timings; with the studio voice, an estimate.
- **Tap:** tapping the mouth replays the word slowly in the free voice, holding the target
  sound, as often as the student likes.

Additions made while building the mouth (1 October 2026):
- **`on_nth`:** allowed on `mouth`.
- **`sound` on a say op:** `doodle_do {op: say}` may carry `sound`, so a compared word holds its
  own sound (/ɪ/ for "ship").
- **`pulse`:** allowed on a mouth id.

## 8. Live diagrams: graphs, Venn diagrams, charts, number lines, trees, tables, ogives

Added 1 October 2026. A diagram is described as **data**, and the board draws it with the pen, in
teaching order, changes it as the lesson goes, and lets the student explore it. It replaces a
static sketch (`sketches/YYYY_qNN.svg` + `show_sketch`) wherever the picture is one of these
kinds. Checked by `database/lesson_diagrams.py`; drawn by `apps/web/src/student/LiveDiagram.tsx`
and `diagram/kinds/*.ts`.

```yaml
diagram: {id: v, kind: venn, on?: 'word', caption?, size?: medium|scene, near?, ...kind fields}
diagram_do: [{id: v, op: ..., on?: 'word', ...}]   # at most 3 per moment
```

### 8.1 The rules every diagram follows

- **One diagram a moment** (`diagram:`); at most **4 in a lesson**. `id` is `[a-z][a-z0-9_]*`,
  unique among the lesson's diagrams.
- **What the description holds is what the pen draws when the diagram arrives**, in teaching
  order: the frame (axes, box, outline, grid), then each item in the order listed, then the
  words. An item with **`later: true`** is defined (its part exists) but not drawn until the
  action that draws it: `plot`, `draw-set`, `draw-sector`, `grow`, `branch` (ogive: the whole
  curve, `later: true` on the diagram). Nothing may act on, or link to, a later item before then.
- **Arrival:** with its moment, once the line it sits by (`near`, default this moment's line,
  else the latest written) is up; in the whiteboard style on its `on:` word. A diagram needs a
  line written at or before its moment.
- **Actions** (`diagram_do`) run in order after the moment's line is written (whiteboard: after
  its marks), each on its own `on:` word if it has one (`on_nth` as everywhere). An action takes
  the pen about 1.5–2 s; a backlog catches up at double speed. A past moment's actions show done
  at once; reduced motion shows the end state; pause holds the pen; the lesson speed speeds it.
- **`id`** in an action names a diagram brought in by this moment or an earlier one.
- **`part`** names one of the diagram's parts (8.3). Parts are case-sensitive except labels
  (`sector:bus` = `sector:Bus`).
- **Words** on a diagram are written in the handwriting, never `$…$`: use `x²`, `√`, `−`, `½`,
  `×`, `≈`, `°` as text. Notes and labels ≤ 40 characters; a count or a cell ≤ 16; a caption ≤ 40;
  names (sets, axes) ≤ 24. **Label with meaning** (style guide 4): "Maths (30)", "mean = 10 mm",
  "median ≈ 33", not just letters.
- **`colour`** (optional, on items and actions) is one of `blue green purple orange red pink
  yellow grey`, with the style guide's meanings: blue given, green answer, purple key idea,
  orange the unknown, red trap. **`answer: true`** on any action draws it green and rings the ding.
- **Size and place:** `size: medium` (default; about 400px wide) or `scene` (up to 560px). On a
  wide screen with no figure or passage beside the working, every diagram goes in that right-hand
  column, one under another; otherwise (and always on a phone) it goes under its line, room made.
- **The voice says what the pen does** ("I'll shade the part where the circles overlap"), and
  the `on:` word is the word that names it.

### 8.2 The kinds

**`graph`**: axes crossing at the origin, equal scales where they fit.

```yaml
diagram:
  id: g
  kind: graph
  x: [-3, 5]                 # required, [from, to]
  y: [-5, 6]                 # required
  step: 1                    # optional tick step for both (or x_step, y_step); ≤ 40 ticks
  x_label: x                 # optional axis names (default x and y)
  y_label: y
  grid: true                 # optional faint squares
  plots:                     # ≤ 4; each a fn or points
    - {fn: 'x^2 - 2x - 3', label: 'y = x² − 2x − 3', colour: blue, later: true}
    - {points: [[0, 1], [2, 5]], join: straight, label: 'line A'}   # join: smooth|straight|none
    - {fn: 'sqrt(x)', domain: [0, 4]}                               # domain: optional stretch
  points:                    # optional dots drawn on arrival: {x, y, text?, colour?}
    - {x: 2, y: 5, text: 'A (2, 5)'}
```

`fn` grammar (never eval): numbers, `x`, `pi`, `e`, `+ - * / ^`, brackets, implicit times
(`2x`, `3(x+1)`, `(x+1)(x-2)`), `sqrt abs sin cos tan ln log exp` (trig in **degrees**), and the
typeset `− × ÷ ² ³ √`. The curve must be on the y range for a fair part of x.

| op | needs | may take | what the pen does |
|---|---|---|---|
| `plot` | — | `part`, `colour` | draws a later plot left to right (the next one without `part`), its label by its end |
| `point` | `x` | `y`, `part` (the plot it is on: y from its fn), `text`, `colour`, `answer` | a dot, its coordinates written (or `text`) |
| `intercepts` | `part` (a fn plot) | `axis: x\|y\|both` | a dot at each crossing, x crossings left to right then y, each with its coordinates |
| `vertex` | `part` (a fn plot) | `text`, `colour`, `answer` | the turning point: a dot, "(1, −4)" and `text` ("lowest point") |
| `line` | `m` (and `c`) or `through: [[x1,y1],[x2,y2]]` | `label`, `colour`, `answer` | a straight line edge to edge, a new plot |
| `shade` | `part` | `to_part` (shade between), `x: [a, b]`, `colour`, `text` | hatches under the curve (to y = 0) or between two |
| `gradient` | `part`, `x: [a, b]` | `text`, `colour` | the rise/run triangle, "run 2", "rise 4", "gradient = 4 ÷ 2 = 2" |

Parts: `plot:N` (from 1, in the order listed, then lines added), `point:N` (the description's
points, then every dot an action adds, in order: `point`, each intercept, a vertex), `shade:N`,
`gradient:N`, `axis:x`, `axis:y`. Hovering near a curve reads off the nearest point "(1.5, −3.75)".

**`venn`**: two or three sets in a universal box.

```yaml
diagram:
  id: v
  kind: venn
  universal: {name: Class, total: 42}       # optional: the box, and the region 'outside'
  sets:                                     # 2 or 3
    - {key: M, name: Maths, total: 30}      # key: a capital letter or two (not U)
    - {key: P, name: Physics, total: 24, colour: pink, later: true}
  counts: {'M∩P': 18}                        # optional: written on arrival, one region each
```

Regions (named by the keys, in the sets' order): two sets `'M only'`, `'P only'`, `'M∩P'`,
`'outside'`; three sets `'A only'`, `'B only'`, `'C only'`, `'A∩B only'`, `'A∩C only'`,
`'B∩C only'`, `'A∩B∩C'`, `'outside'`. Also `neither`/`none` (= outside) and `both` (two sets).
Any **set expression** names the regions it covers: keys and `U`, `∩` (or `&`), `∪` (or `|`),
`'` (complement, after), `−` (or `-`, `\`: difference), brackets: `'A∪B'`, `"(A∪B)'"`,
`"A∩B'"`, `'A−B'`. Other parts: each set's `key` (the whole circle) and `U`.

| op | needs | may take | what the pen does |
|---|---|---|---|
| `draw-set` | — | `part` (a key) | draws a later set's circle and name (the next one without `part`) |
| `fill` | `part` (ONE region), `text` | `colour`, `answer` | writes the count in the region (replacing what was there), with a tick |
| `shade` | `part` (any expression) | `colour` (default purple), `text`, `answer` | hatches the region(s); `text` is written as a key under the box |

**`pie`**: sectors from the top, clockwise.

```yaml
diagram:
  id: p
  kind: pie
  sectors:                                  # 2 to 8; all by value, or all by angle (making 360)
    - {label: Walk, value: 40}
    - {label: Bus, value: 30, text: '?', colour: orange}   # text: what is written after the label
  show: value                               # value | angle | percent | none (default: value, or angle when given by angle)
```

Parts: `sector:N` (from 1, from the top, clockwise) or `sector:<label>`.

| op | needs | may take | what the pen does |
|---|---|---|---|
| `draw-sector` | — | `part` | draws a later sector: its edges, its colour, its words |
| `pull-out` | `part` | — | the sector slides out from the centre (whoosh), its place left dashed |
| `angle` | `part` | `text` (≤ 12), `colour`, `answer` | an arc at the centre, and the angle (computed, or `text`) written where its value or "?" was |

**`bar`** and **`histogram`**: bars on a y axis from 0.

```yaml
diagram:
  id: b
  kind: bar
  bars: [{label: Mon, value: 12, later: true}, {label: Tue, value: 8, later: true}]   # ≤ 12
  y: [0, 16]            # optional; from 0, at least the tallest bar
  y_step: 4             # optional
  y_label: 'rain (mm)'  # optional; x_label too
diagram:
  id: h
  kind: histogram
  bins: [{from: 0, to: 10, value: 4}, {from: 10, to: 20, value: 7}]   # classes touch
```

Parts: `bar:N` (from 1) or `bar:<label>` (a histogram's label is `<from>-<to>`, e.g.
`bar:0-10`), and `line:N` for lines drawn across.

| op | needs | may take | what the pen does |
|---|---|---|---|
| `grow` | — | `part` | the bar rises from the axis, its value on top; without `part` every later bar, one by one |
| `line` | `y` | `text`, `colour`, `answer` | a dashed level across, e.g. `text: 'mean = 10 mm'` |

**`numberline`**:

```yaml
diagram:
  id: n
  kind: numberline
  range: [-1, 9]        # required
  step: 1               # optional (default 1; ≤ 30 ticks)
  points: [{x: 2, text: 'start', open: false}]   # optional dots on arrival
```

| op | needs | may take | what the pen does |
|---|---|---|---|
| `point` | `x` | `open`, `text`, `colour`, `answer` | a dot (filled, or open), its words above |
| `hop` | `from`, `to` | `text` (≤ 12), `colour` | an arc from one number to the other, the step written ("+3", "−2") |
| `interval` | `from` and/or `to` | `from_open`, `to_open`, `text`, `colour`, `answer` | a band along the line, a filled circle at an included end, an open one at an excluded end, an arrow on where an end is left out; its inequality written ("x > 4") |
| `label` | `text`, and `x` or `part` | `colour` | a note at the number, or by the part |

Parts: `point:N`, `hop:N`, `interval:N`.

**`tree`**: a probability tree, left to right, up to 3 levels.

```yaml
diagram:
  id: t
  kind: tree
  levels: ['1st ball', '2nd ball']   # optional titles over the levels
  root: Start                         # optional
  branches:                           # 2 to 4 from each point; ≤ 12 ends
    - {label: Red, p: '3/5', then: [{label: Red, p: '2/4', later: true}, {label: Blue, p: '2/4', later: true}]}
    - {label: Blue, p: '2/5', then: [...]}
```

`p` is a fraction `'3/5'`, a decimal or 0/1; the branches from one point must add up to 1.
`later` on a branch keeps its own branches back too. Labels have no `/` and differ among
siblings. Parts: `branch:Red`, `branch:Red/Blue` (the route by its outcomes), and `path:Red/Blue`
once a path is drawn.

| op | needs | may take | what the pen does |
|---|---|---|---|
| `branch` | — | `part` | draws a later branch and writes its probability (its parent must be drawn) |
| `path` | `part` (`Red/Blue`, or `branch:`/`path:` form) | `text`, `colour`, `answer` | lights the route from the start, rings its end, and writes under the tree "Red, then Blue: 3/5 × 2/4 = 3/10" (worked out from the p's, or `text`) |

**`table`**: a frequency table or any small table.

```yaml
diagram:
  id: f
  kind: table
  columns: [Score, Frequency, cf]       # 1 to 6
  rows: [[1, 3, ''], [2, 5, ''], [3, 2, '']]   # 1 to 12; '' or null: empty, to be filled
```

Parts: `row:N`, `col:N` or `col:<header>`, `cell:R,C` or `cell:R,<header>` (from 1), and
`total:<column>` once a total row is written.

| op | needs | may take | what the pen does |
|---|---|---|---|
| `fill` | `part` (a cell), `text` | `colour`, `answer` | the cell writes itself, with a tick |
| `total` | `part` (a column of numbers) | `into` (another column), `text`, `colour`, `answer` | with `into`: running totals written down that column one by one (cumulative frequency); without: a Total row under the table with the column's sum |

**`ogive`**: a cumulative frequency curve.

```yaml
diagram:
  id: o
  kind: ogive
  points: [[10, 2], [20, 7], [30, 16], [40, 28], [50, 36], [60, 40]]  # (upper boundary, cf): x rising, cf never falling
  start: [0, 0]         # optional: where the curve begins at nothing
  x_label: marks
  y_label: cumulative frequency   # the default
  y: [0, 40]            # optional ranges (x too); steps optional
  later: true           # optional: the curve waits for `plot`
```

| op | needs | may take | what the pen does |
|---|---|---|---|
| `plot` | — | — | each point a cross, one by one, then the smooth curve through them |
| `read` | `y` or `x` (one) | `text`, `colour` (default orange), `answer` | from the value on its axis a dashed line across to the curve, then on to the other axis; the value given written by its axis, the value read at the foot ("≈ 33.3", or `text: 'median ≈ 33'`) |

Parts: `curve`, `point:N` (the plotted points, `start` first), `read:N`.

**Every kind** also takes:

| op | needs | may take | what the pen does |
|---|---|---|---|
| `highlight` | `part` | `text`, `colour` (default yellow), `answer` | the highlighter over the part, and the note |
| `label` | `part`, `text` | `colour`, `answer` | a note by the part, with a pointer (pop) |
| `arrow` | `part`, `to_part` | `text`, `colour`, `answer` | a curved arrow from one part to the other, its words by its middle |

### 8.3 Links from the working

```yaml
point:
  - {line: 1, kind: highlight, at: '18', to: {diagram: v, part: 'M∩P'}}
```

- `part` is optional (the diagram as a whole). It must be drawn by the end of this moment's
  actions: the moment's actions go first, then its links.
- The part gets a highlighter blob over its spot (a curve, a branch or a band is lit along its
  length; a strike crosses it out) and the pair's numbered dot. Hovering or tapping either end
  lights both, and lights the part on the diagram.
- A diagram in the right-hand column is paired by its dots alone; one under its line also gets
  the line across while the mark goes up (as for a doodle).
- Any mark on the working but a move may link; not together with a `from`.

### 8.4 What the student can do with it (both styles)

- **Hover or tap** a region, sector, bar, point, branch, cell or line: it lights and a note says
  what it is and its value ("Maths only: 12", "Bus: 30, 90°, 25%", "P(Red) = 3/5"). On a graph or
  an ogive, near the curve, the nearest point is read off with its coordinates.
- **Keyboard:** the diagram takes focus; the arrow keys go part to part (Home, End), Escape lets
  go; what is lit is read out (aria-live).
- **Replay** (the ↺ on the card's corner) draws it all again in teaching order.
- **Whiteboard style:** the shimmer (line boil), and the sounds: pop on arrival and on a note,
  tick on a count, a fill or a total, whoosh on a pull-out, a hop or an arrow, ding on an
  `answer`. The classic style draws the same diagram in plain ink, without sound.

### 8.5 Converting a static sketch

- Use a live diagram wherever the sketch is a graph, Venn diagram, pie or bar chart, histogram,
  number line, tree, table or ogive; keep SVG sketches for geometry.
- Put what the question gives in the description (drawn on arrival), and what the working finds
  in `later` items and actions on the moment that finds it, each with its `on:` word.
- Replace `show_sketch` with the `diagram` on that moment, and `figure: sketch` marks with links
  (`to: {diagram, part}`) or actions (`highlight`, `label`).
- Don't add a doodle that duplicates the diagram (section 5).
