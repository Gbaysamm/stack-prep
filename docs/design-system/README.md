# Stackjunior Design System

Playful, game-based **AI learning platform for kids aged 7–16**. Stackjunior teaches
how AI actually works — data, model training, ML/RL/LLMs, prompting, AI agents, safety
— through games. Kids **Play → Train → Battle** their models in the *AI Arena*, then ship
real projects in the *IRL Lab*. The brand voice speaks to **parents** ("Enroll your child",
"Give your child superpowers") while the product itself is bright, energetic and kid-facing.

This system was reverse-engineered from a marketing-site Figma comp (**"Stackjunior.fig"**,
Page-1, 15 frames) plus two uploaded logo PNGs. The comp defines **no formal Figma
components, no text styles, and a single variable collection** (3 corner radii). Everything
here — the token scale, type ramp and component set — was therefore derived directly from
the exact inline values in the frames (never rounded). Sources are stored for anyone with
access: the `.fig` VFS frames (Hero, Differentiator, How-it-works, AI Arena, IRL Lab, Proof,
Footer) and `uploads/Logo Icon.png` / `uploads/Logo_1.png`.

---

## CONTENT FUNDAMENTALS

- **Audience split.** Headlines and body speak *to the parent* using **"your child"** ("Enroll
  Your Child Now", "Help Your Child Build AI", "Make your child an AI Creator", "AI will shape
  every career your child will have."). The product surfaces themselves are kid-energetic.
- **Voice.** Confident, optimistic, future-facing, plain-spoken. Short declarative fragments,
  often in **triplets**: *"Play games. Build AI. Compete & Create."* / *"Play. Train. Battle."*
- **Casing.** Section titles use **Title Case** ("The AI Arena", "A New Way to Learn AI").
  CTAs are Title Case. Body is sentence case.
- **Punctuation quirks.** Semicolons for emphasis (*"…AI creators; not just users"*), en-dashes
  for ranges (7–16), ampersands in headlines ("Compete & Create").
- **Proof is data-led** but attributed — every stat cites a body (World Economic Forum, IMF,
  UNESCO). Figures are big and blunt: **65%**, **80%**, **<20%**.
- **Emoji:** essentially none in the marketing copy (a single 🎉 appears only in the demo
  enroll-success state we authored). Keep emoji out of production copy.
- **Vibe words:** *safe*, *game-based*, *real models / real-world*, *superpowers*, *head start*,
  *future-proof*.

## VISUAL FOUNDATIONS

- **Colour.** Two worlds. **Dark canvases** are deep purples — hero `#1F0050`, arena `#2E0075`.
  **Light sections** are `#F0F0F0` / white. The closing footer flips to a bright **grass green
  `#85DE4C`**, and the IRL Lab to pale **`#F3EFAE`**. Primary action is **purple `#6B0BFF/#6500FF`**
  with **lilac `#D7BDFF`** and **lavender `#F3EBFF`** as its companions. A rotating cast of
  **playful accents** (hot pink `#FE7698`, green `#00AA0F`, orange `#E55C00`, yellow `#F4FE6E`,
  blue, mint, magenta) colours cards, chips and the VS emblem. Imagery is **saturated and warm**
  — 3D-render illustrations, no black & white, no grain.
- **The signature move: HARD OFFSET SHADOWS.** Solid, **un-blurred** drops in a bright accent
  colour — `0 8px 0 purple` on pills, `12px 12px 0 green` on cards, `16px 16px 0 lilac` on media.
  They read like stickers / game tokens. **Never blur them.** (For SVG shapes we replicate with
  a `drop-shadow(… 0blur …)`.)
- **Type.** Display is a **chunky geometric black** (source: *Nohemi Black*) at huge sizes
  (96px section titles) with **line-height 100% (tight)** and slight negative tracking. Body/UI
  is a neutral grotesque (source: *PP Neue Montreal*), 400 for copy and 700 for emphasis/labels.
  Support faces: Manrope (micro UI), Space Mono (mono/attribution), Danfo (display accent).
- **Shape & radius.** Everything is soft: buttons are **fully-rounded pills**, cards **20px**,
  image wells **16px**, the glass nav **40px**. Radii come from the Figma variables
  (`--corner-full/large/large-increased`).
- **Cards.** White, 20px radius, 16px padding, a rounded image well on top, a floating pink
  "Featured Project" badge, title + blurb, and a full-width lavender "Try It" pill — all sitting
  on a hard coloured shadow that changes per card.
- **Nav.** A floating **glassy capsule** — `rgba(239,239,239,.47)` + `blur(7.5px)`, 40px radius,
  logo left, single outline CTA right. Sits ~40px from the top over any section.
- **Backgrounds.** Full-bleed 3D-render illustrations and photographic hero media (dark overlay
  `rgba(31,0,80,.46)`), plus organic **blob shapes** (the green IRL-Lab hill, the footer hill).
- **Motion & states.** The comp is static; we add restrained interactivity: hover
  brightens/opacity, pressed can shrink, transitions ~120ms ease. Keep the hard shadow — it's a
  fixed sticker, not an animated float. No bouncy loops on content.
- **Transparency & blur** appear in exactly one place: the glass nav. Elsewhere fills are solid.

## ICONOGRAPHY

The source uses small glyphs from icon sets (`si:ai-monitor-fill`, `hugeicons:start-up-02`) as
tiny **circular chips** inside CTA pills — a coloured circle holding a rocket / monitor icon. The
comp ships them as flattened vectors, not a font. **Substitution (flag):** in components and the
UI kit these chips render **Lucide-style inline SVG glyphs** (rocket, monitor, play) — the closest
open equivalent to the streamline/hugeicons stroke weight. Swap in the exact set if you have it.
Icons are **decorative accents**, never load-bearing; there is **no icon font** and **no emoji**
in production. The colourful **character mark** (a junior hugging a stack of layers) is the only
brand illustration and lives in `assets/logo/`.

## Fonts — substitution notice ⚠️

The two primary faces are **commercial and not shipped**:

| Role | Source font | Shipped substitute (Fontshare) |
|------|-------------|-------------------------------|
| Display / headings | **Nohemi** (Black) | **Clash Display** (600/700) |
| Body / UI | **PP Neue Montreal** | **Switzer** (300–700) |

Manrope, Space Mono and Danfo are open (Google Fonts) and used as-authored. **If you own Nohemi /
PP Neue Montreal, drop the web-font files in `assets/fonts/` and update the `@font-face` / family
vars in `tokens/fonts.css`.**

---

## Index / manifest

- **`styles.css`** — root entry (import-only). Pulls the token files below.
- **`tokens/`** — `fonts.css`, `colors.css`, `typography.css`, `radii.css`, `shadows.css`, and the
  generated `fig-tokens.css` (Figma corner variables).
- **`components/`** — reusable primitives (see list). Each has `.jsx` + `.d.ts` + `.prompt.md` and
  a group card.
- **`guidelines/`** — foundation specimen cards (Colors, Type, Spacing, Brand).
- **`ui_kits/stackjunior/`** — the full interactive marketing site (`index.html` + section JSX).
- **`assets/`** — `logo/` (mark + wordmark PNG) and `images/` (section renders & illustrations).

### Components
- **Button** (`components/button`) — signature hard-shadow CTA pill; variants lavender / solid / outline / ghost.
- **Logo** (`components/brand`) — character mark + wordmark lockup.
- **NavBar** (`components/brand`) — floating glass navigation.
- **Badge** (`components/content`) — "Featured Project"-style tag pill.
- **ProjectCard** (`components/content`) — featured-project sticker card with coloured shadow.
- **StatBlock** (`components/content`) — big magenta proof figure + label + source.
- **SectionHeading** (`components/content`) — oversized display title + subhead.
- **FeatureChip** (`components/content`) — benefit line with a coloured dot.
- **PlayButton** (`components/media`) — chunky play triangle with hard shadow.
- **SocialLink** (`components/media`) — footer text link.

### Intentional additions
The Figma comp defines **no formal components**, so this component set is **derived from the
site's repeated visual primitives** (pills, cards, chips, stats, nav, logo, play/social). They are
faithful to the comp values but are our own factoring, added so the system is usable. No component,
token or brand asset was invented beyond what the comp shows.
