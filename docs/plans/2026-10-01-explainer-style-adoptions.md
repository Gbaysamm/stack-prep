# Plan: give the lesson board the life of the SternHost explainer videos

Written 1 October 2026. The founder finds the SternHost "Hosting in 60 Seconds" videos
(C:\Users\yakub\SternHost, see its STYLE_GUIDE.md) more interesting and better animated than
the lesson board. This plan comes from a read of both codebases.

**Finding.** The board's foundations are already stronger than the videos':
- the pen writes maths atom by atom;
- the coach's mouth moves with the voice's actual loudness;
- numbers are carried from line to line;
- doodles change and gather as the lesson goes.

What the board lacks is the "juice" that makes the videos feel alive:
- sound effects;
- the constant hand-drawn wobble ("line boil");
- things landing on the exact word that names them;
- word-by-word captions;
- a hook;
- warm paper.

Most of that is cheap.

The board is live and pausable, not a rendered video. So each item below is adapted for that,
and none of it wipes the board between scenes: the board is one continuous sheet by design.

---

## In order of impact per effort

### 1. Sound effects (about 1 day)
Generate SternHost's seven sounds in code with Web Audio, on the board's existing
AudioContext. They are made from code, so there's nothing to license and nothing to download.

| Sound | When it plays |
|---|---|
| pop | a doodle, chip or pair dot arrives |
| scribble | the pen starts a line (short, not continuous) |
| tick | each count, or each option checked |
| error | a strike, or a trap moment |
| ding | the answer sticker |
| whoosh | a flight, a move, or the picture panel opening |
| click | a tap |

- Mixed at 15–35% under the voice, about 2–4 per moment at most.
- They follow pause, and come with a mute toggle in the board controls.
- Source: SternHost `scripts/sfx.mjs` (the synth recipes) and `src/doodle/Stage.tsx` (Sfx).

### 2. Things land on the word that names them (2–3 days)
SternHost schedules every visual with `cue('word')`. The board starts each moment's items at
the start of the moment, or at an estimated fraction.

- **YAML:** add an optional `on: 'word'` (with `nth`) to `write`, `point[]`, `doodle`,
  `doodle_do[]` and `show_sketch`. Example: a circle lands as "the middle one" is said.
- **Timing source:** a word's time is estimated from character counts across the clip, so
  no backend change is needed. When a timings file exists (item 6), the real time is used.
- **Firing:** from `clip.currentTime` on each animation frame, so pausing is exact.
- **Validation:** the loader checks every `on:` word appears in that moment's `say`, as
  SternHost's `cue()` throws when a word is missing.
- **Content:** a pass adds `on:` to the most important reveals in each lesson.

### 3. Line boil (1–2 days)
Finished marks and doodles keep a slight hand-drawn shimmer, as in the videos. SternHost
cycles three random variants every 4 frames (`src/doodle/Sketch.tsx`). For the board:
- **Marks:** three seeded variants, cycled about every 130 ms.
- **Doodles:** one shared SVG turbulence filter whose seed steps on the same beat.

It freezes on pause and with reduced motion, and only runs on what's on screen, which
matters on low-end phones.

### 4. Bigger spring pops and an answer moment (half a day)
- Doodles, chips and key numbers spring in from nothing with a real overshoot. SternHost
  uses stiffness 180 and damping 11, about 8 frames.
- The answer sticker pops with a sparkle and the ding.
- A number pops as the voice names it.

### 5. A hook to open every lesson (content only)
Moment 0 opens a curiosity gap instead of listing the givens. For example: "Most students
pick 6 here, and it's a trap. Here's why." The lesson's doodle or picture is already on the
board as the voice starts, because SternHost's rule is that frame 0 is never blank.
- A lint rule checks that moment 0 isn't just a restatement of the question.
- An authoring pass covers every lesson.

### 6. Real word timings, computed once per voice line (about 2 days)
The voice (OpenAI gpt-4o-mini-tts) gives no timings. But every line is made once and kept,
so the timings can be worked out once when the line is first made and stored beside it as
`<hash>.words.json`.

Two ways:
- **(a) Free:** run whisper locally (whisper.cpp or faster-whisper) in a batch job over the
  stored voice files.
- **(b) Paid:** OpenAI whisper-1 word timestamps, a small one-off cost per line. **Needs the
  founder's yes and a cost estimate first.**

Either way, the transcript is aligned to the known script with SternHost's alignment
(`scripts/whisper.mjs`). It turns numbers into words and matches by character, which matters
because maths is spoken as words. This turns item 2's estimates into exact timings.

### 7. Word-by-word captions (1–2 days, after item 2)
- The coach card shows the line in pages of up to 4 words, broken at punctuation.
- The current word gets a yellow highlighter swipe, and `*key*` words are blue (the English
  lessons already use `*word*`).
- Maths renders as one token.
- On by default when the phone is muted; otherwise a choice. This helps students on silent
  phones and those learning in a second language.
- Source: SternHost `src/engine/Captions.tsx`.

### 8. Values that travel along arrows (1–2 days)
A new `travel` mark: a value chip rides a curved arrow from a doodle or figure part into the
equation, or from one line to another, on its word. This answers "where did this number come
from?". The board's route helpers (`ink.ts`) already support the path.

### 9. Warm paper and a colour grammar (half a day)
- **Paper:** a warm off-white sheet (`#fbfaf6`), faint paper grain (one static SVG noise
  layer at about 4% opacity) and a soft vignette.
- **Colour grammar,** kept consistent in every lesson:

  | Colour | Meaning |
  |---|---|
  | green | right |
  | red | trap or wrong |
  | purple | the key idea |
  | blue | the given data |
  | orange | a question or a warning |

  Write it into the lesson guide, and check contrast.

### 10. The buddy as a small host, plus before/after and checklist moments (2–4 days)
- **Buddy poses,** after SternHost's "Stern": points at the working, shrugs at a trap,
  thinks, cheers. It also shakes on a strike and floats when idle.
- **Optional mood per moment:** `buddy: worried`.
- **Before/after template:** the trap answer struck in red beside the right answer ticked
  in green, with the error and ding sounds.
- **Checklist template:** "check each option" ticks off option by option, with a tick sound.

## Deferred
- A music bed: it's distracting under study narration. Optional at most.
- Camera zooms: they interfere with the layout.
- Wiping the board between scenes: the board stays one sheet. Use a "chapter chip" with a
  whoosh instead, if needed.

## Reference
In SternHost (C:\Users\yakub\SternHost):
- `src/doodle/Sketch.tsx`: drawing on, and boil.
- `src/doodle/motion.tsx`: Pop, Shake, Float, Move, Travel, FadeOut.
- `src/engine/SceneContext.tsx`: `cue()`.
- `scripts/whisper.mjs`: alignment.
- `scripts/sfx.mjs`: the sound synth.
- `src/engine/Captions.tsx`: captions.
- `src/props/character.tsx`: Stern.
- `src/templates/index.tsx`: Flow, BeforeAfter, Checklist.
- `src/episodes/dns/scenes/lookup.tsx`: a complete scene to learn the pattern from.
