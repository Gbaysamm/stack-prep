# UTME Government: how the papers are written up

Sources:
- `source/past-questions.pdf`: toppers.com.ng, 79 pages, papers 2010 to 2018 with printed answer
  keys.
- `source/syllabus.pdf`: the JAMB UTME Government syllabus, 8 pages (page 8 is the recommended
  texts).

Subtopic codes are in `subtopics.yaml`. Topics are numbered within the syllabus's four parts,
written in Roman numerals as the syllabus prints them: GOV.II3 is part II, topic 3.

**Follow docs/questions/utme/chemistry/README.md exactly** for:
- the files, fields and self-heal rules;
- the level rubric;
- the explanation method and the lesson rules.

When you read the Chemistry README, read "chemistry" as "government", `CHEM` as `GOV` and
`UTME-YYYY-CHEM` as `UTME-YYYY-GOV`. Where Government differs, this page wins.

| Year | PDF pages | Questions printed |
|---|---|---|
| 2010 | 2–10 | 50 (Q1 is the paper type) |
| 2011 | 11–19 | 50 (Q1 is the paper type) |
| 2012 | 20–28 | 50 (Q1 is the paper type) |
| 2013 | 29–37 | 50 (Q1 is the paper type) |
| 2014 | 38–46 | 50 (Q1 is the paper type) |
| 2015 | 47–55 | 50 |
| 2016 | 56–64 | 50 |
| 2017 | 65–71 | 40 |
| 2018 | 72–78 | 40 |

From 2015 on, Q1 is a real question and is kept.

The checker:

    uv run --frozen python database/check_government.py 2010            # questions + explanations
    uv run --frozen python database/check_government.py --lessons 2010  # and the lessons

## Where Government differs

1. **No figures.** Government is text only. No question has `figure` or `figure_svg`.
2. **The printed keys are unreliable.** Many keys in this compilation do not match their
   questions, and some years' keys look shifted. Work out every answer from what the
   recommended texts teach, record the printed letter in `printed_key`, and write a `key_note`
   whenever the two differ.
3. **Broken options are repaired at the source**, the smallest way, and recorded in
   `corrected`:
   - an option cut short or with a word lost to the line break ("the formation of African
     on" is "the formation of the Organization of African Unity");
   - a fifth option such as "E. none of the above": remove it, so there are four;
   - a missing fourth option: restore the one the paper clearly meant, if it can be known;
     otherwise drop the question;
   - plain typos ("Herbert Marcaulay", "Rilwan Lukwan", "Indignant system").
4. **A question printed twice in one paper** keeps its first number; the repeat is
   `drop: true` with `drop_reason: repeats Qnn`.
5. **Facts that have changed since the exam.** Teach the answer that was right when the paper was
   set, and add one step saying how it stands now if it has changed. For example, the ECOWAS
   Executive Secretary became the President of the ECOWAS Commission in 2007, and the OAU became
   the AU in 2002. Never invent a date or a name. When textbooks disagree, teach what the
   syllabus's recommended texts teach, and do not add contested details.
6. **Judgement questions** ("a major problem of", "the main reason for") have one textbook
   answer. Teach it with its reason, and say in the `why` lines why each other option is weaker
   or wrong, not just that it is not the answer.
7. **Stay neutral.** Give facts about regimes, parties and leaders, never opinions. Describe a
   military regime by what it did (its head, its ruling council, its decrees), and do not praise
   or blame anyone.
8. **`subtopic`.** Use part III, topic 4 for what Nigeria did in or through an international body,
   and part IV, topic 1 for the body's own origin, structure, organs or work.
9. **Explanations and lessons for Government.** Build each one in this order:
   1. Name the concept, institution or event.
   2. Define it, or state the fact: who, what, when and where.
   3. Explain why or how, as cause and effect.
   4. Give a Nigerian link: INEC, the National Assembly, a state House of Assembly, a local
      government chairman, NYSC, the 1999 Constitution, a precise date in Nigeria's history.
   5. Give a way to remember it.
   6. Name the trap: the option that tempts, and why it is wrong.
10. **Spoken lines.**
   - Say a date as a year ("nineteen seventy-nine") or a full date ("the first of October,
     nineteen sixty"), never as digits with slashes.
   - Abbreviations that are words when spoken stay as words (ECOWAS, NEPAD, OPEC); others are
     said letter by letter the first time with the full name ("I N E C, the Independent
     National Electoral Commission").
   - Traditional titles are written and said plainly (Alaafin, Oyomesi, Waziri, Madawaki).
   - As in Chemistry, a `say` line has no `$`, no backslash, and none of `:` `;` `—` `–`
     ` - `. The checker refuses the word "correction" in spoken lines.
