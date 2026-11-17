# Stack Prep design standard (student app)

**The base is the Stackjunior Design System** the founder handed over:
[design-system/README.md](design-system/README.md) and its tokens in
[design-system/tokens/](design-system/tokens/). Its visual foundations hold here: the deep
purple canvases, purple actions with lilac and lavender, the playful accents, chunky display
headings, the hard un-blurred "sticker" shadow as the signature, glass only on the chrome.
The app's own implementation is `apps/web/src/prep/prep.css` (built on it).

What follows is **only what the app changes or adds**, agreed with the founder (17 Nov 2026).
An app a student lives in daily is smaller in scale than the marketing site the system came from.

## Scale (app, not marketing)
- **Corners:** cards 10–12px (`--r-lg` 10, `--r-xl` 12), small squares 5–8px. The system's 20px
  cards and 16px wells were too round for the app (founder, 17 Nov).
- **Sticker shadow:** 5px offset on cards (4px on a phone), not the system's 12–16px. Still
  solid, never blurred, and steady on hover.

## Cards
- **Every card carries the sticker:** 1.5px dark outline and the hard shadow. The shared
  `.sj-card` does this by default. A shadow on some cards and not others reads as a mistake.
- **Shadow colour may vary, as in the system:** any of its solid accents (purple, green,
  orange, pink, yellow). Purple is the default. **Only the shadow carries the colour:** the card
  itself stays white, so colour never ranks one card above another and no card is tinted
  (founder, 17 Nov 2026).
- **Nothing inside a card has a shadow:** rows, tiles, chips, options, a card within a card stay flat.
- **The one exception:** the path card (Journey, `.jr.continues`) on Home and Roadmap: an open,
  fading bottom and no shadow, because the road runs on past it.

## Colour
- No colour per subject (tried and turned down 17 Nov: a "colour riot" that lost the identity).
- The dark hero (as on Roadmap) is ours; never a second dark card straight under it.

## Layout
- One left edge; no lone centred buttons under left-aligned content.
- No boxes inside boxes; no two similar bars stacked.
- A badge and the text beside it share one height; buttons on a row share one centre line.
- The Roadmap page is the reference for an app page.
- Check every page at 1440 and 390 wide.

## Where the app stays different from the system (founder, 17 Nov 2026)
- Cards keep the 1.5px dark outline (the system's cards have none).
- Buttons keep rounded corners, not the system's full pills: pills do not fit every place a
  button sits in the app.
- Poppins for body text (the system: Switzer), the soft lavender page background (the system:
  #F0F0F0), the app's smaller type and corner scale. Not everything can match a marketing page.

## Behaviour
- A refused action is said in a popup on the same page, never by moving the student elsewhere.
- No native `<select>` or date input (lib/Select, lib/DatePicker).
