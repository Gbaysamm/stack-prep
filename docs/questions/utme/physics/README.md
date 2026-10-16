# UTME Physics: how the papers are written up

Source: `source/past-questions.pdf` (toppers.com.ng, 89 pages, papers 2010 to 2018 with
printed answer keys) and `source/syllabus.pdf` (the JAMB UTME Physics syllabus). Subtopic
codes are in `subtopics.yaml`.

**Follow docs/questions/utme/chemistry/README.md exactly**: the files, the fields, the
self-heal rules, the level rubric, the explanation method and the lesson rules. Read
"chemistry" as "physics", `CHEM` as `PHY` and `UTME-YYYY-CHEM` as `UTME-YYYY-PHY`. Where
Physics differs, this page wins.

| Year | PDF pages |
|---|---|
| 2010 | 2–11 |
| 2011 | 12–21 |
| 2012 | 22–32 |
| 2013 | 33–42 |
| 2014 | 43–52 |
| 2015 | 53–61 |
| 2016 | 62–70 |
| 2017 | 71–79 |
| 2018 | 80–89 |

These page ranges are approximate at the edges, because a paper's answer key can run onto the
next page.

The checker:

    uv run --frozen python database/check_physics.py 2010            # questions + explanations
    uv run --frozen python database/check_physics.py --lessons 2010  # and the lessons

## Where Physics differs

1. **Notation is LaTeX** between single dollar signs:
   - quantities in italics: `$v = u + at$`, `$F = ma$`, `$\lambda$`, `$\theta$`
   - fractions: `$\dfrac{1}{f} = \dfrac{1}{u} + \dfrac{1}{v}$`
   - powers of ten: `$3.0 \times 10^{8}$`
   - units: `$\text{m s}^{-1}$` inside formulae; in plain text, Unicode such as "20 m s⁻¹",
     "9.8 m s⁻²", "4 Ω", "2 μF", "30°", "273 K"
   - nuclides: `$^{238}_{92}\text{U}$`

   Write the units as JAMB does (km h⁻¹, m s⁻¹). Repair lost signs and powers ("100kmh1"
   becomes "100 km h⁻¹") and record each repair in `corrected`.
2. **Figures are never scan crops.** Draw every real diagram as `figure_svg`: circuits, ray
   diagrams, graphs, pulleys, levers, inclined planes and waveforms.
   - Follow the Mathematics style, as in `figure_svg` in
     docs/questions/utme/mathematics/retranscribed_1990.yaml. Use `role="img"`, a descriptive
     `aria-label`, `viewBox`, width and height, stroke #1a1a1f, accent #3f2fa8 when one line
     must stand out, and `system-ui, sans-serif` text. No external fonts or images.
   - Every value, label, arrow and resistor the question depends on must be exact. Use
     standard circuit symbols.
   - Render each SVG to check it before you finish. resvg-py is available:
     `uv run --frozen --with resvg-py python -c "import resvg_py; ..."`. Or open it in
     headless Edge and look at the PNG.
   - If the image is only the options, or text, type it in.
   - If a question's figure is missing from the PDF and cannot be rebuilt from the stem,
     set `drop: true` with a `drop_reason`.
3. **The Nigerian classroom method for Physics:**
   1. List the data with symbols and units: "u = 0, a = 2 m s⁻², t = 5 s, v = ?".
   2. Name the law or formula in words, then write it.
   3. Convert every unit to SI in its own step (km h⁻¹ to m s⁻¹, cm to m, μF to F, °C to K).
   4. Substitute, then work it out step by step.
   5. Give the answer with its unit, then check that the size and the unit make sense.
   6. Name the trap.

   A theory question gets the fact, the reason behind it and an everyday Nigerian example: a
   NEPA transformer, a danfo braking, a borehole pump, a generator, a mirror at a barber's
   shop.
4. **Spoken lines in lessons.** Say formulas as a Nigerian teacher reads them: "v equals u
   plus a t", "one over f equals one over u plus one over v", "three times ten to the power
   eight metres per second", "four ohms", "two microfarads", "thirty degrees". As in
   Chemistry, a `say` line has no `$`, no backslash, and none of `:` `;` `—` `–` ` - `.

## Options that are pictures

When the printed options are drawings (four transistor symbols, four graphs, four circuits),
each option gets its own SVG:

```yaml
    options:
      A: 'Symbol A'
      B: 'Symbol B'
      C: 'Symbol C'
      D: 'Symbol D'
    option_figures:
      A: |
        <svg viewBox="0 0 160 120" width="160" height="120" role="img" aria-label="Transistor symbol, emitter arrow pointing in towards the base">...</svg>
      B: |
        ...
```

- The option text is a short neutral label ("Symbol A", "Graph B", "Circuit C") that never
  gives the answer away. The picture is what the student chooses.
- Each SVG is small, around 160×120, and drawn in the same style as `figure_svg`. Each
  `aria-label` describes what is drawn.
- Draw all four in the same size and style, so that only the point being tested differs.
- In explanations, `why` and lessons, refer to the drawings by letter and describe them in
  words ("in B the arrow points out of the emitter").
