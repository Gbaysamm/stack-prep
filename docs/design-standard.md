# Stack Prep design standard (student app)

Agreed with the founder on 17 Nov 2026. Every page is checked against this before it is shown.

## Colour
- Our colours only: purple (actions, active), dark ink (text, outlines), lime (done, right,
  today), yellow (one highlight, such as a countdown or a goal stub).
- No colour per subject, and no new hues (blue, pink, teal) brought in for decoration.
- The dark hero (as on Roadmap) is ours; never a second dark card straight under it.

## Cards
- Every card: white, 1.5px dark outline, 5px pale purple shadow (4px on a phone), steady on
  hover. The shared `.sj-card` does this by default.
- A card that is itself coloured keeps a shadow in its own colour (lime, yellow).
- Nothing inside a card has a shadow: rows, tiles, chips, options, a card within a card stay flat.
- **The one exception:** the path card (Journey, `.jr.continues`) on Home and Roadmap has an
  open, fading bottom and no shadow, because the road runs on past it.

## Corners
- Cards: 10–12px (`--r-lg` 10, `--r-xl` 12). Small squares (badges, marks): 5–8px.

## Layout
- Things start from one left edge; no lone centred buttons under left-aligned lists.
- No boxes inside boxes; no two similar bars stacked.
- Badge and text beside it share one height; buttons on a row share one centre line.
- Check every page at 1440 and 390 wide.

## Behaviour
- A refused action is said in a popup on the same page, never by moving the student elsewhere.
- No native `<select>` or date input (lib/Select, lib/DatePicker).
