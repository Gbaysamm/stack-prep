# UTME Literature in English: how the papers are written up

Sources:
- `source/past-questions.pdf`: toppers.com.ng, 93 pages, papers 2010 to 2018 with printed answer
  keys.
- `source/syllabus.pdf`: the current JAMB UTME Literature in English syllabus, 6 pages (page 5 is
  the current set texts, page 6 the recommended anthologies and critical texts).

Subtopic codes are in `subtopics.yaml`: five topics, numbered straight through (LIT.3.b is
topic 3, content (b)).

**Follow docs/questions/utme/chemistry/README.md exactly** for:
- the files, fields and self-heal rules, including "Never drop a question";
- the level rubric;
- the explanation method and the lesson rules.

When you read the Chemistry README, read "chemistry" as "literature", `CHEM` as `LIT` and
`UTME-YYYY-CHEM` as `UTME-YYYY-LIT`. Where Literature differs, this page wins.

| Year | PDF pages | Questions printed |
|---|---|---|
| 2010 | 2–11 | 50 (Q1 is the paper type) |
| 2011 | 12–22 | 50 (Q1 is the paper type) |
| 2012 | 23–33 | 50 (Q1 is the paper type) |
| 2013 | 34–44 | 50 (Q1 is the paper type) |
| 2014 | 45–54 | 50 (Q1 is the paper type) |
| 2015 | 55–64 | 50 |
| 2016 | 65–75 | 50 |
| 2017 | 76–83 | 40 |
| 2018 | 84–92 | 40 |

From 2015 on, Q1 is a real question and is kept.

The checker:

    uv run --frozen python database/check_literature.py 2010            # questions + explanations
    uv run --frozen python database/check_literature.py --lessons 2010  # and the lessons

## Where Literature differs

1. **No figures.** Every question is text. Quoted extracts go in the stem exactly as the poet or
   author wrote them, with their line breaks kept as `\n` (a YAML block string), and the source
   line ("Wole Soyinka: Night") after the extract.
   - **Quote only the short extract the paper prints** (a few lines). Never reproduce a whole
     poem, a run of stanzas or a page of a novel or play, in the stem, the explanation or the
     lesson; describe the rest in your own words. Long quotations from copyrighted works are
     refused when written out.
2. **The printed keys are unreliable.** Work out every answer yourself from the text, the
   extract or the definition, record the printed letter in `printed_key`, and write a
   `key_note` whenever the two differ.
3. **Set texts of the time.** Most questions 2 to 30 ask about the set plays, novels and poems
   of that year (Sons and Daughters, Romeo and Juliet, The Joys of Motherhood, The Old Man and
   the Medal, Nineteen Eighty-Four, Women of Owu, The Tempest, Purple Hibiscus, A Woman in Her
   Prime, The Old Man and the Sea, Harvest of Corruption, Othello, Faceless, Lonely Days,
   Native Son, The Wives' Revolt and the prescribed poems).
   - Keep them: they teach how to read a play, a novel and a poem.
   - Name the text in every stem. Where the paper says only "the novel" or "the play" (2015
     Q31 to Q50 and others), put the text's title and author into the stem.
   - **Only teach a detail of a set text that you are sure of.** Plot events, names, places,
     numbers and who said a line must be right. Famous works (Shakespeare, Orwell, Hemingway,
     Wright, Achebe, Emecheta, Adichie, Soyinka, Clark, Tennyson, Donne, Blake, Wordsworth,
     Eliot, Marvell) are well documented. If you cannot be sure of a detail in a less documented
     text (for example a minor character's line or a number in Lonely Days, Faceless or Harvest
     of Corruption), rebuild the question on what you can be sure of: the extract printed in
     the stem, the work's widely taught theme, or the literary device it shows. Never guess a
     plot fact.
4. **Never drop a question.** A cut-off option, a missing option, a garbled extract, two right
   answers or no right answer is repaired or rebuilt into a sound question on the same text,
   extract or term, and recorded in `corrected`. Restore garbled quotations to the author's
   real words when you know them ("Busy old fool, unruly Sun, / Why dost thou thus, / Through
   windows, and through curtains call on us?").
5. **Literary terms** follow the syllabus's critical texts (Abrams, A Glossary of Literary
   Terms). Teach the precise definition, then show it in the extract or a short example.
6. **Explanations and lessons for Literature.** Build each one in this order:
   1. Name the term, device, character or event.
   2. Define it, or state the fact in the text.
   3. Show it: point to the words in the extract, or the moment in the play or novel.
   4. Say why it matters: the effect on the reader, the theme it serves.
   5. Give a way to remember it, with a Nigerian or everyday example where it helps (a praise
      singer's oriki for a panegyric, a Nollywood twist for dramatic irony).
   6. Name the trap: the option that tempts, and why it is wrong.
7. **Spoken lines.**
   - Read quoted lines naturally; say a rhyme scheme letter by letter ("A A B B").
   - Say a character's name as written (Maanan, Nnu Ego, Orisaye, Prospero).
   - As in Chemistry, a `say` line has no `$`, no backslash, and none of `:` `;` `—` `–`
     ` - `. The checker refuses the word "correction" in spoken lines.
