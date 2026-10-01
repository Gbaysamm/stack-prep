# Model lessons: what changed, and what to look at

These 16 lessons are rewritten to [the lesson style guide](lesson-style-guide.md), as models
before every lesson is redone this way. (There are 16 because two set-theory lessons were
named and a third was chosen.) Each one:
- opens with a hook, with its picture already up;
- runs in titled sections;
- names every rule in words before using it;
- gives each step its own moment;
- puts every given and result on the picture as it is reached;
- carries values from the picture into the working (`travel`);
- has things land on the word that names them (`on`).

Moments are given as before → after.

## Maths

| Lesson | Moments | What changed, and why |
|---|---|---|
| **1994 Q7**, 42 students, Physics only | 13 → 19 | The hook is a puzzle: 28 + 22 = 50, more than the class of 42. The overlap is found as "the students counted twice" (50 − 42 = 8) before the rule is named, so the rule only confirms it. The class of 42 is gathered (8 both), then split (Maths only, Physics only). The Venn is redrawn with labels like "Maths 28" and "Physics only", and the separate "three kinds of student" sticker is removed. |
| **2003 Q9**, class of 40, both | 12 → 19 | Same idea and the same scene as 1994 Q7, so the two read as a pair. The 4 who take neither step out of the class first (40 − 4 = 36). Then 56 − 36 = 20 are the students counted twice. The Venn is redrawn with "neither 4" outside both circles. |
| **1999 Q9**, market women, three sets (the hard one) | 12 → 21 | **Look at this one first.** The old lesson opened with the seven-term inclusion–exclusion formula. Now the Venn is filled region by region, from the middle out: 3; then 2, 2, 1; then 4, 7, 6. Each number is written on the picture, and the regions add up to 25. The formula comes last, as a check. Each item's count travels from the stall into the working, and 25 women appear and are counted. |
| **2003 Q43**, bag of balls | 13 → 21 | Each order (black then red, red then black) gets its own section. The ball that leaves the bag is shown, so "7 left" can be seen. The "and" rule (multiply) and the "or" rule (add) are named before they are used. Each branch's fraction travels from the tree into the working. A new check: all four paths add to 1. |
| **1983 Q50**, car and speed | 11 → 20 | The hook warns that there are two speeds. The car drives each part as its distance is found, and 4v km and 6v km are written on the road. Then a "Careful: v is the first speed" moment flags the trap (60) before the answer, 120. |
| **1989 Q8**, Oke's savings | 11 → 19 | The interest per year (₦100) comes first, worked in small steps (800 ÷ 100 = 8, then 12.5 × 8 = 100). Then the jar fills year by year: 900, 1,000, 1,100, 1,200. The I = PRT/100 formula is now the check. |
| **1997 Q28**, chord and arc | 12 → 17 | A new cake cut into 6 slices makes 60/360 = 1/6 something you can see: the arc is the crust of one slice. The sketches are redrawn so the radius (21 cm) goes on as a result, not as a given. Trap C (110) is now explained as the major arc. |
| **1989 Q44**, the pipe | 12 → 18 | New doodle: a solid rod with a hole drilled through it ("metal = rod − hole"). The squares (3.6² = 12.96, 1.4² = 1.96) get their own lines. Trap A (440π) is now explained: it comes from 7.2 − 2.8 with no squaring. |
| **1994 Q19**, arithmetic progression | 9 → 15 | The 5 rises are counted on the staircase, and T₆ = a + 5d is written, before the general rule. Then each step of solving gets its own moment. The climber walks up 1, 3, 5, 7, 9, 11 as the check. |
| **2002 Q11**, intercepts and midpoint | 15 → 20 | New doodle: two number lines showing "halfway" (1 is halfway between 0 and 2; −2 is halfway between 0 and −4). Adding 8 to both sides is now its own moment. A new check puts M back into the line. |
| **1998 Q4**, logarithms | 18 → 21 | The two log facts (what a log means, and adding logs) get their own section, before either equation. The brackets are opened (xy − x = 8, xy + x = 4) before subtracting, so the xy can be seen to cancel. "Respectively" is explained at the answer. |

## English

| Lesson | Moments | What changed, and why |
|---|---|---|
| **2014 Q7**, the snakes passage | 7 → 12 | The hook: all four options appear in the passage, so the test is "which idea takes up most of it?". The snake's calendar and belly build up as the passage is read. Every trap option gets its own moment, with its own mark in the passage. |
| **2014 Q16**, cloze, columnist | 5 → 11 | The clue sentence is read first. "Such a journalist" is shown pointing back to it. Then the word is built: column + ist = columnist, as piano + ist = pianist. Each wrong option is struck out on its own line. The last step puts the answer back into the gap. |
| **2014 Q38**, pigs would fly | 5 → 10 | "Idiom" is explained before it is used. Then the logic runs in two steps: she passes after pigs fly, and pigs never fly, so she never passes. Option A is ruled out as "leaves some hope". |
| **2014 Q96**, congratulation (word stress; my choice of stress question) | 5 → 11 | "Stress" and "syllable" are now explained. The old lesson's wrong example "naTION" is fixed to NAtion, and the -tion rule is tested on words students know. Trap D is explained: conGRAtulate is the verb's stress, and adding -tion moves it. |
| **2011 Q42**, corrugated | 6 → 10 | The hook asks the real question: is "corrugated" about the material or the shape? The flat sheet folds into ridges. Options B and C fail as materials, and D is a look-alike word. |

## Worth knowing

- **Quote the `on` key: write `'on':`, not `on:`.** YAML reads an unquoted `on` as the boolean
  `true`, so the loader would never see the cue. Every model lesson quotes it.
- **1998 Q4 is flawed in the paper itself.** x = −2 and y = −3 put negative numbers inside the
  logs, which a strict examiner would reject. C is still JAMB's intended answer, and the
  lesson teaches the method without raising this.
- **Three printed keys disagree with the answers we teach:** 2014 Q7 (key A, we teach C), 2014 Q96 (key C, we teach B) and
  2011 Q42 (key B, we teach A). The lessons follow our explanations files, as before.
