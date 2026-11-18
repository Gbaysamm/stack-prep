# Subtopic lessons: how each one is built

A subtopic lesson teaches one JAMB topic from scratch on the board (voice, handwritten lines,
an annotated diagram). It is played at the roadmap's lesson stop, when a run left the student
below the 80% bar. It stands on its own: the same lesson for every student.

The board rules in [the lesson style guide](../lesson-style-guide.md) and the doodle format in
[doodles v2](../plans/doodles-v2-contract.md) apply. This page adds what a whole-topic lesson
needs. The founder's rules (11 Nov 2026):

## Short lessons: a subtopic may have several (founder, 12 Nov 2026)

**Length limits (founder, 18 Nov 2026).** A lesson is at most about **four minutes**: about 550
spoken words, usually 16 to 24 moments. A subtopic has **one to three lessons**, so it is taught
in about 12 minutes; a fourth only when the subtopic truly holds four separate ideas (a broad
Mathematics subtopic, for example). The student meets these lessons after a weak run and goes
back to questions straight after, so teach the core JAMB tests, in full and without gaps, and
leave the rare corners to the past-question lessons. Where this and the older text below
disagree (18 to 30 moments, two to four lessons), these limits win.

A lesson is **short: about three or four minutes, one main idea** (founder, 12 Nov 2026: the
length a student watches without losing attention). That is a guide, not a limit: a lesson
runs a little longer when its idea needs it, and roughly 18 to 30 moments is usual. Never cut
an explanation short to fit (founder: "It is better to explain it from scratch than to rush it
and leave gaps"); when a lesson carries a second main idea, that idea is its own lesson. Many
short lessons beat a few long ones. A subtopic is not a lesson: a
broad subtopic is split into two to four lessons, each its own stop on the roadmap, played in
order, with the run again after the last. Split at natural seams (e.g. "Laws of chemical
combination" / "Formulae and equations" / "The mole" / "Reacting masses and concentration").
Each lesson is its own file, `<slug>_1.yaml`, `<slug>_2.yaml`, …, with `part: 1`, `part: 2`, …
and `title:` (what it covers). A one-lesson subtopic needs neither.

Each lesson has the whole shape below, short: its own welcome ("Welcome. This is lesson two
of four on the mole: the mole itself."), one or two objectives, its terms with worked
examples, its traps, a one-line check, a short recap, and **one** problem. A later lesson does
not repeat an earlier one: it may say "In the last lesson you met …" in one line.

## The shape, in this order

1. **Welcome.** Greet the student and name the lesson. The title is written as it is said.
   - say: "Welcome. Today's lesson is elements, compounds and mixtures."
   - write: "Elements, compounds and mixtures"
2. **Introduction.** What the topic is about, in one or two plain sentences, and why it matters
   (where it shows up, how often JAMB asks it).
3. **Objectives.** "By the end of this lesson you will be able to…", written as a short numbered
   list (one moment per objective, or one moment for all of them).
4. **The terms, one at a time.** For each term, rule or law, in the syllabus's order:
   - its definition or statement, written on the board;
   - a plain explanation;
   - **worked examples, straight after it** (founder, 12 Nov 2026): one or two problems of
     the kind a textbook sets, solved step by step on the board ("Let us solve this…"), every
     step written as it is said. These are the theory applied, not real-world stories: after
     the laws of indices, simplify 2³ × 2⁴; after balancing equations, balance one. An
     everyday Nigerian example may follow where it helps, but never instead of the worked one;
   - the diagram labelled or acted on as it is taught.
5. **Comparison or summary table,** where the topic has one (element vs compound vs mixture,
   plant vs animal cell, the laws of indices side by side).
6. **JAMB examples and traps.** A real past question worked through, and the wrong options
   students choose and why.
7. **Check yourself.** One question asked, a pause, then worked to its answer.
8. **Recap.** Go back over the objectives in a line each.
9. **After the lesson** (founder, 12 Nov 2026), on the board, not in the voice script:
   - **How well did you understand?** The student rates it (e.g. "Got it", "Mostly", "Not
     yet"). Kept per student and per lesson, so we learn which lessons work.
   - **Ask your own question.** The coach answers on a fresh page over the lesson.
   - **Try it: one or two short problems,** simple ones on what was just taught. A short
     answer is typed into the box; a problem that needs working is answered with a photo of
     it. The coach marks it and says what went wrong. Each lesson file carries these problems
     with their answers and the working expected.
   Then the roadmap's next stop: a run on new questions, which is its own item.

## Rules

- **Teach the theory literally.** Definitions, rules and facts said plainly. A story or comparison
  is at most a one-line aside inside an example, never the frame of the lesson.
- **Never speak over an empty board.** Every moment writes a line or acts on the diagram while
  it is said. The first moment writes the title.
- **No cold open.** Do not open with examples or a list of items the student has no context for.
- **Annotate, don't decorate.** One diagram that grows through the lesson: each part labelled in
  its own colour, an arrow from label to part, a short note under the label. No connector lines
  from the written lines across the text to the diagram; act on the diagram with circles and
  pulses on the spoken word.
- **Correct at JAMB level.** Every fact checked; simplifications flagged for a teacher.
- **Nigerian classroom first.** Follow how Nigerian secondary schools teach the topic: the
  order, the terms and the methods of the JAMB, WAEC and NECO syllabuses and the textbooks
  schools use, and the mistakes WAEC's Chief Examiner's reports name. Simple words,
  explanatory, never complex. In our own words, never copied.
- **Sources and conventions:** [sources.md](sources.md), the Nigerian source map, and its
  rules for writers (Roman-numeral names, signed oxidation numbers, units kept, working by
  hand, JAMB's order, the Chief Examiner's mistakes in the traps).
- **Write for the voice.** Formulas and expressions as they are written ("H₂O", "CO₂",
  "2³ × 2⁴"), never spelled out as separate words ("H two O"): the voice reads a formula as one
  thing when it is written as one. Nigerian place and food names go in the pronunciation list,
  not respelled in the script.
- **Whole sentences when spoken** (founder, 12 Nov 2026): every spoken sentence is complete,
  correct English; a list joins its last item with "and" and sits in a sentence with a verb
  ("The air, the water you drink and the salt in your food are all matter."). Short signposts
  ("Now a plant cell.") are fine. No colons, semicolons, "e.g." or "i.e." in what is said.
- **Names before symbols:** the first time an element or compound is written, its name comes
  first with the symbol or formula in brackets: "sodium (Na)", "water (H₂O)". The voice reads
  a symbol or formula letter by letter ("N A", "H 2 O").
- **Write a line on its words:** when a moment says something before its summary line, the
  line is written as its own words are said (the board does this from the line's first two
  words), and the board is busy meanwhile: pictures of what is named, pulsed as named.
- **Board lines are sentences:** each starts with a capital, as a teacher writes on the board
  (maths, units and abbreviations such as "x = 4", "pH", "e.g." as they are).
- **Open like a teacher** (founder, 12 Nov 2026): the welcome names the lesson once ("Today's
  lesson is…"), never "lesson one of two" (the app shows that). The introduction explains
  the big picture in plain words with the diagram coming in as it is said, built a piece at a
  time with the talk; the objectives are one or two short lines. Never say the same thing
  three times before teaching starts.
- **Name the list, then teach each item in its own moment** (founder, 12 Nov 2026): a moment
  that names several things ("three kinds: element, compound, mixture") says the names and
  writes them, and stops. Each item is then explained in a moment of its own, and its picture
  (or the stage that adds it) comes in on that moment, as it is explained, never before. A
  board line says what its own moment says, never a summary of what later moments will say.
- **One thing said, then written; then the next** (founder, 12 Nov 2026): when a worked example
  goes through items one by one ("O₂ has only oxygen atoms… N₂… Fe…"), each item is its own
  moment with its own line ("O₂: only O atoms, so an element ✓"). Never one line holding every
  verdict, written while the voice is still on the first. A summary line goes on the moment
  that says the summary, and that moment says it first.
- **Not while the last line is still being talked about** (founder, 12 Nov 2026): the next
  line waits until the voice has moved on to it, even when the two sit side by side. The
  board writes a line on its own first words, or else on the first weighty word of the speech
  that is also on the line; so a line opens with the words the voice says when its point
  begins, and a moment that first finishes the last point says that before its own words.
- **Pictures pop in on their word:** where a picture's pieces are named one by one ("the air,
  the water you drink and the salt"), each piece is a `data-later` part of the art, label
  inside its group, brought in with `{op: show, part: …, 'on': <word>}`. A scene's pieces pop
  into place rather than being drawn stroke by stroke; a caption names the whole picture
  ("three kinds of substance"), not a list of pieces still to come.
- **The one test for every sentence** (13 Nov 2026): if a student hears this for the first
  time, will they understand it using only what has been explained so far? If not, simplify
  it or teach the missing piece first. A sentence can be correct and still be poor teaching
  when it does not follow from the one before. Each line has its own job: do not explain the
  same thing twice in a row (introduce, then explain the notation, then draw the conclusion);
  a trap gives the general rule behind the mistake, not the worked example again; a recap
  says exactly what was taught ("the small number counts the atoms of that element; no
  number means one").
- **No gaps, no rushing** (founder, 12 Nov 2026). The student is not new to school, but the
  lesson never leaves a step for them to fill in:
  - *Teach before you use.* No symbol, subscript, term, method or piece of notation is used
    until it has been taught: what the small 2 in O₂ means comes before O₂ is classified.
  - *Introduce an example as an example:* "For example, sodium is a soft metal…", never a
    bare list of facts that sounds like a new topic.
  - *Stay at the topic's level.* A harder idea from a later topic (electrolysis in a lesson on
    compounds) is named in passing as an example ("a chemical method, such as electrolysis"),
    never taught or made the subject of a sentence.
  - *Guide every worked example:* what we are given, what we must find, why each step is
    taken, and what the answer tells us ("What does this tell us?"). Numbers never appear
    from nowhere.
  - *Join the ideas:* each new idea is linked to the last ("We have seen that… Now let us look
    at…"); a section ends by saying where it leads.
  - *Sentences a teacher says:* whole, plain sentences that run on from each other, with the
    linking words ("so", "because", "for example", "yet") that make the reasoning heard.
- **A JAMB question on the board looks like one:** the question on one line, written as JAMB
  prints it ("Which option has the same vowel sound as the underlined letters in key?", the
  letters underlined), then the options on their own line; never squeezed into "key: A. sit…".
- **Plain section titles:** "Welcome", "Objectives", "Element", "Compound", "Comparison",
  "JAMB traps", "Check yourself", "Recap".

## English sound lessons (founder, 18 Nov 2026, on the Vowels pilot)

Vowels, consonants, rhymes and stress. These lessons teach the student to **recognise** sounds
in written words, which is what JAMB tests on paper, not to pronounce them.

- **The model is British English**, the one Nigerian schools teach (12 pure vowels and 8
  diphthongs, 20 vowel sounds in all). The first lesson of a sound subtopic says so once.
- **No pronunciation demonstrations.** The voice never performs a sound for the student to
  copy ("Sit. Seat."), there is no talking mouth and no audio map: our voices are not British
  and a demonstration teaches the wrong sound. The voice names a sound by its symbol and its
  key word ("the vowel sound in seat, written /iː/").
- **One key word per sound, the same in every lesson**, from the table below. Every later
  mention of a sound uses its key word; a new example word is always tied back to it ("Key has
  the vowel sound of seat").
- **Teach how to tell the sounds apart in a word the student has never heard**: spelling misleads
  (same letters, different sounds; different letters, same sound); then the spelling clues as
  clues, never rules, each with an exception said (a final silent e, common vowel pairs, a vowel
  before r); then the method for the question.
- **Spelling families, so a student can work out a word the lesson never showed** (founder,
  18 Nov 2026: "how do I know cook or crook is short?"). Teach the families JAMB actually tests,
  found from the bank's questions: each family's usual sound, the rule that decides it (e.g. an
  open or closed syllable for a single a or o; oo is long unless before k or in a short list),
  and the short list of exceptions to learn by heart, with a JAMB question on it. Say plainly
  that a few words are true exceptions (indict, coup, colonel) and are learned as words.
- **The method for "same vowel sound" questions:** find the sound in the given word; name it by
  its key word and symbol; give each option its sound, one option per moment, with its symbol
  written; choose the option whose sound matches. Compare sounds, never letters.
- **Short and long differ in quality as well as length.** Say so when the length mark is taught.
  Never pair sounds that are not partners (schwa is not "the short /ɜː/").
- **Weak endings:** a final unstressed -y or -ey (money, happy, valley) is the weak /i/, "a
  weak, short form of the vowel sound in seat", never the vowel sound of sit. A clue is "usually"
  or "often", never "always". Accent-dependent words (aunt, laugh, glass) are taught "in the
  British model we use".
- **Exact terms:** "vowel sound" (not "vowel") when a sound is meant; the length mark is "the
  length mark, two small dots", never "a colon".
- **The tested letter is underlined in the word,** never spelt out: write `patch` and mark it
  `{kind: underline, at: 'p[[a]]tch'}`; never "p-a-tch".
- **One table that stays:** the sounds go into one table, filled as each is taught and
  highlighted when a later moment refers to it. Its rows organise the sounds; they do not claim
  that each short sound has a long partner.
- **Never generalise about Nigerian speakers.** "Some learners say sit and seat alike", not
  "Nigerian speakers do".

Key words (use these, always):

| Sound | Key word | Sound | Key word |
|---|---|---|---|
| /ɪ/ | sit | /iː/ | seat |
| /e/ | bed | /æ/ | cat |
| /ʌ/ | cup | /ɑː/ | car |
| /ɒ/ | hot | /ɔː/ | saw |
| /ʊ/ | book | /uː/ | food |
| /ə/ | about (first sound) | /ɜː/ | bird |
| /eɪ/ | day | /aɪ/ | my |
| /ɔɪ/ | boy | /əʊ/ | go |
| /aʊ/ | cow | /ɪə/ | here |
| /eə/ | hair | /ʊə/ | tour |

Triphthongs: /eɪə/ player, /aɪə/ fire, /ɔɪə/ employer, /əʊə/ lower, /aʊə/ power. The voice
does not read IPA symbols: it says "the vowel sound in seat" while the board writes /iː/.
