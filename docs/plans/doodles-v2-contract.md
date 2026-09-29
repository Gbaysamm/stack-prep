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
