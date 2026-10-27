# UTME Biology: how the papers are written up

Sources:
- `source/past-questions.pdf`: toppers.com.ng, 82 pages, papers 2010 to 2018 with printed answer
  keys.
- `source/syllabus.pdf`: the JAMB UTME Biology syllabus.

Subtopic codes are in `subtopics.yaml`.

**Follow docs/questions/utme/chemistry/README.md exactly** for:
- the files, fields and self-heal rules;
- the level rubric;
- the explanation method and the lesson rules.

**From docs/questions/utme/physics/README.md, follow the "Figures are never scan crops" and
"Options that are pictures" rules.** These cover:
- `figure_svg` for every diagram;
- `option_figures` when the options are drawings;
- rendering each SVG to check it.

When you read the Chemistry README, read "chemistry" as "biology", `CHEM` as `BIO` and
`UTME-YYYY-CHEM` as `UTME-YYYY-BIO`. Where Biology differs, this page wins.

| Year | PDF pages |
|---|---|
| 2010 | 2–11 |
| 2011 | 12–21 |
| 2012 | 22–31 |
| 2013 | 32–39 |
| 2014 | 40–48 |
| 2015 | 49–57 |
| 2016 | 58–66 |
| 2017 | 67–73 (its key may be on page 73 or missing; then `printed_key: null`) |
| 2018 | 74–82 |

The page ranges are approximate at the edges, since an answer key can run onto the next page.

The checker:

    uv run --frozen python database/check_biology.py 2010            # questions + explanations
    uv run --frozen python database/check_biology.py --lessons 2010  # and the lessons

## Where Biology differs

1. **Notation.** Mostly plain text. Use Latin names in plain text with the genus capitalised
   (Plasmodium, Rhizopus, Amoeba). Formulae and equations use mhchem:
   `$\ce{6CO2 + 6H2O ->[light][chlorophyll] C6H12O6 + 6O2}$`.

   Genetic crosses use plain letters: "Tt × tt", "XᴴXʰ". In a lesson's `write` lines, a cross
   can be laid out over several lines (parents, gametes, offspring, ratio).
2. **Drawings.** Redraw biological diagrams as clean, labelled schematic SVGs, the way a good
   textbook line drawing looks. This covers cells, flowers, the heart, the kidney, the eye,
   insects, food webs, the nitrogen cycle and graphs.
   - Keep every part and label the question depends on: the letters I, II, III or P, Q, R and
     the arrows.
   - The drawing must let a student answer the question just as the printed one did.
   - If the original drawing is missing or cannot be read well enough to redraw it honestly,
     rebuild the question in words on the same concept (never drop it).
3. **Explanations and lessons for Biology.** Build each one in this order:
   1. Name the structure or process.
   2. Give its function, or how it works, in simple steps.
   3. Give a Nigerian example: cassava and yam, the mango tree, the tsetse fly in the savanna,
      the Anopheles mosquito and malaria, the Lagos lagoon, a goat or a cow, the harmattan.
   4. Give a way to remember it.
   5. Name the trap.

   Calculations (genetic ratios, magnification, population estimates) follow the Physics
   method: data, rule, working and check.
4. **Spoken lines.**
   - Say genetic symbols as letters: "big T small t". Say ratios in words: "three to one".
   - As in Chemistry, a `say` line has no `$`, no backslash, and none of `:` `;` `—` `–`
     ` - `.
   - The checker refuses the word "correction" in spoken lines, so say "put right" for
     defects of the eye.

## The drawing standard

A rough sketch is not acceptable. Each drawing must look like the line drawing in a good Nigerian
biology textbook (Ramalingam, Stone & Cozens). A student who knows the topic should recognise the
structure at a glance, without its label.

1. **Draw the features that identify it, in the right proportions.** Some examples:
   - **Flame cell:** a cup-shaped cell body with its nucleus, a tuft of cilia (the "flame")
     inside a hollow, and the tubule leading away.
   - **Nephridium:** a ciliated funnel (nephrostome) opening into a long coiled tubule, with a
     blood capillary network and a bladder ending at a pore.
   - **Kidney (vertebrate):** bean shape with cortex and medulla shaded differently, pyramids,
     pelvis, and the ureter, renal artery and renal vein at the hilum.
   - **Malpighian tubules:** many fine blind-ending tubules joined to the gut at the junction of
     the midgut and hindgut.
   - **Flower:** sepals, petals, stamens (filament and anther), carpel (stigma, style, ovary
     with ovules) and receptacle.
   - **Heart:** four chambers with thicker left-ventricle walls, valves and the great vessels.
   - **Cells:** the right organelles at sensible sizes.
   - **Insects and other animals:** the right body divisions, legs, wings and antennae.
2. **Use real line work.**
   - Smooth curves (cubic Béziers), not polygons.
   - Strokes of 1.2–2 px.
   - Light stippling or hatching where a textbook shades tissue.
   - Size: 320–480 px wide for a question figure, 200–260 px for each picture option.
3. **Keep the original's labels, letters and leader lines** where the question uses them, at
   the same places.
4. **Compare before you finish.**
   - Render your SVG to PNG.
   - Look at it next to the original page (Read the PDF page), at a similar size.
   - If a biology teacher would not accept yours as the same drawing, redraw it.
   - Repeat until it passes.
5. **If you cannot reach that standard for a structure, do not ship a crude drawing.** Instead:
   - rewrite the question in words, if it can be answered without the picture (for example,
     "Which of these is the excretory organ of an earthworm?" with text options), and record
     the change in `corrected`; or
   - rebuild it as a new question in words on the same concept. Never drop it.

## Organisms and organs: drawn over the original (founder's decision, 16 Oct 2026)

**This replaces the earlier "not drawn by hand" rule.** Drawings of animals, plants, organs and
cells are drawn again, but always over the printed drawing and never from memory. They must
match it 90 to 99 percent: the same pose, the same proportions, every leg, fin, wing,
antenna, scale pattern, label and leader line in the same place. A wrong leg or fin can make a
different species, so the match is the standard.

How, with `database/figure_trace.py` (its docstring has the exact commands):

1. **Get the original.** The embedded images are in `figures/raw/img-PPP-NNN.png` (PPP = PDF
   page). If a figure is not there, render the page with `pdftoppm -r 300 -png -f P -l P`.
2. **Make the guide.** Run `figure_trace.py ref SOURCE OUT --box x0 y0 x1 y1 --scale 3`, which
   gives `ref.png` (with its viewBox size) and `ref-grid.png` (a 50 px grid for reading
   coordinates). One guide per drawing: crop each organism of a 4-panel figure separately when
   they become `option_figures`.
3. **Optionally make a starting outline** with `figure_trace.py contours`, for the silhouette
   and its proportions. It is rough on a blurred scan, so redraw it cleanly; never ship it as is.
4. **Draw the SVG in the guide's own coordinates** (viewBox = the guide's size).
   - Use smooth cubic Bézier outlines, strokes of 1.5 to 2.5, and hatching or stippling where
     the original shades.
   - Draw the details the original shows: eye, mouth, nostrils, limb joints and toes, scales,
     fin rays, feather tracts, veins, segments.
   - Copy the labels and leader lines exactly.
5. **Check with `figure_trace.py overlay DRAWING.svg ref.png OUT`.** Look at `overlay.png`,
   where your lines are red over the faded original. Every outline must sit on the original's
   outline.
   - Fix and repeat until it does. Expect several rounds.
   - Then look at `side-by-side.png`: a biology teacher must see the same drawing twice.
6. **Ship the SVG** with width and height scaled down (about 320–480 px for a figure, 200–260
   px for each option), `role="img"` and an `aria-label` that names what is drawn.

**Faithful is not enough: the drawing must make sense (founder, 16 Oct 2026).** Matching a
blurred scan is only the starting point. Each organism must also be a correct, convincing
drawing, the way a good textbook illustrator draws that animal or plant in that pose.

- Draw one continuous body, not separate blobs.
- Give limbs width, joints, and digits or claws.
- Show the real anatomy of the species: snout and teeth, scutes, warts and parotoid glands,
  fin rays, operculum, lateral line, fur direction.
- Vary the line weight: a heavier outline, finer detail lines.
- Keep the proportions natural.

Render each drawing at its shipped size and judge it as a strict biology teacher would. Every
student must name the organism at once, and nothing may look wrong. Keep the original's pose,
orientation, layout and labels.

**Lessons from the 2010 pilot.** Each of these was a fault the founder caught, so check every
drawing for them:

- **Wrong orientation.** Read the pose from the original at high zoom first: where the head is,
  which way it points, and where the tail goes. The 2010 "lizard" was really a crocodile with
  its head up at the left. Name the animal by what the drawing shows, and check whether the
  answer depends on it.
- **Proportions.** No part may be too big for the rest. For example, a crocodile's head is
  about one-seventh of its length and its tail about half. Compare every part with the others
  at the shipped size.
- **Parts stuck on.** A tail, ear, fin or leg must grow out of the body outline, not sit on it
  as a separate closed shape. A rabbit's tail is a short upturned tuft that is part of the
  rump's outline, edged with fur flicks, with no closed circle and no line where it joins.
- **Mechanical texture.** Scales, scutes and warts should be natural, slightly irregular rows
  and bumps, not a square grid or a brick wall.
- **Stick limbs.** Every limb has thickness, joints, and digits or claws.
- **Check twice.** Look at a 4x close-up of every small part and at the 1x shipped size. At 1x,
  a student must name the organism and every labelled part without being told.

Reference: the finished 2010 Q6–7, Q9–10 and Q12–13 `figure_svg`s in retranscribed_2010.yaml.

**Realistic beats replica (founder, 18 Oct 2026).** You do not have to copy the scan's exact
pose. When the printed pose is awkward or the scan is too poor, draw a better, realistic,
textbook-standard version of the same subject in a clear classic composition. For example,
draw toads in amplexus in side view, with the male along the female's back. Two conditions:

- The labels must still point at the parts the question and its explanation need.
- Every answer must stay correct.

Anatomy and clarity come first; matching the scan comes second.

**Restore the exam's own question.**
- If a question was rewritten in words only because its drawing could not be made, put the
  original stem and options back with the traced drawing (`figure_svg`, or `option_figures`
  when the options are drawings), and update `corrected`, the explanation and any lesson to
  refer to the picture.
- If a question was held back with "awaiting a real drawing", trace it and bring it back.
- When the drawing is missing from the PDF itself, the question stays held back (or in words).

**Schematic diagrams** (food webs, cycles, graphs, crosses, simple apparatus) are drawn as
before, and are also checked with `overlay` against the original.
