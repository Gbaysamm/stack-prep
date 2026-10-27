# UTME Commerce: how the papers are written up

Sources:
- `source/past-questions.pdf`: toppers.com.ng, 77 pages, papers 2010 to 2018 with printed answer
  keys.
- `source/syllabus.pdf`: the JAMB UTME Commerce syllabus, 8 pages (page 8 is the recommended
  texts).

Subtopic codes are in `subtopics.yaml`. The syllabus numbers its 16 topics straight through, so
codes read like Chemistry's: COM.6.d is topic 6, content (d), insurance.

**Follow docs/questions/utme/chemistry/README.md exactly** for:
- the files, fields and self-heal rules, including "Never drop a question";
- the level rubric;
- the explanation method and the lesson rules.

**From docs/questions/utme/physics/README.md, follow the "Figures are never scan crops" rule.**
Every chart and diagram is drawn as `figure_svg` and rendered to check it.

When you read the Chemistry README, read "chemistry" as "commerce", `CHEM` as `COM` and
`UTME-YYYY-CHEM` as `UTME-YYYY-COM`. Where Commerce differs, this page wins.

| Year | PDF pages | Questions printed |
|---|---|---|
| 2010 | 2–10 | 50 (Q1 is the paper type) |
| 2011 | 11–19 | 50 (Q1 is the paper type) |
| 2012 | 20–28 | 50 (Q1 is the paper type) |
| 2013 | 29–37 | 50 (Q1 is the paper type) |
| 2014 | 38–46 | 50 (Q1 is the paper type) |
| 2015 | 47–54 | 40 |
| 2016 | 55–61 | 40 |
| 2017 | 62–68 | 40 |
| 2018 | 69–76 | 40 |

From 2015 on, Q1 is a real question and is kept.

The checker:

    uv run --frozen python database/check_commerce.py 2010            # questions + explanations
    uv run --frozen python database/check_commerce.py --lessons 2010  # and the lessons

## Where Commerce differs

1. **The printed keys are unreliable.** Many keys do not match their questions. Work out every
   answer from what the recommended texts teach, record the printed letter in `printed_key`, and
   write a `key_note` whenever the two differ.
2. **Never drop a question.** A question with a missing diagram, a missing or cut-off option, a
   stray option from another question, no right answer, several right answers or numbers that
   do not work is rebuilt the smallest way into a sound question on the same concept, and the
   rebuild is recorded in `corrected`.
3. **Repeated questions.** The later papers reuse many earlier questions, sometimes with the
   options shuffled. Each is written up in its own year, but the same question must be answered
   and taught the same way in every year it appears.
4. **Tables go in the stem** as a KaTeX array, as Mathematics does:
   `$$\begin{array}{|c|c|}\hline \text{Item} & \text{₦} \\ \hline \text{Sales} & 15{,}000 \\ \hline\end{array}$$`.
   That covers the insurance table (2013 Q15 and Q16, 2017 Q35 and Q36), the trading figures
   and the 2016 balance sheet. Diagrams (the 2011 Q9 and 2015 Q31 tree of commerce, the 2018 Q32
   marketing mix) are `figure_svg`.
5. **Notation.** Plain text for words. KaTeX between single dollar signs for formulae and
   working: `$\text{Rate of turnover} = \dfrac{\text{Cost of goods sold}}{\text{Average stock}}$`,
   `$\text{Current ratio} = \dfrac{\text{Current assets}}{\text{Current liabilities}}$`. Money as
   "₦49,600" in plain text.
6. **Facts that have changed since the exam.** Teach the answer that was right when the paper
   was set, and add one step on how it stands now if it has changed. For example, the Nigerian
   Stock Exchange became Nigerian Exchange Limited (part of Nigerian Exchange Group) in 2021;
   the Second-Tier Securities Market was replaced by the Alternative Securities Market in 2013;
   the Consumer Protection Council became the Federal Competition and Consumer Protection
   Commission under the Federal Competition and Consumer Protection Act 2018; telex, telegrams and floppy disks are no longer in everyday use. Never
   invent a figure or a date. When textbooks disagree, teach what the syllabus's recommended
   texts teach.
7. **Judgement questions** ("a major problem of", "the most effective", "the main aim of") have
   one textbook answer. Teach it with its reason, and say in the `why` lines why each other
   option is weaker or wrong.
8. **Explanations and lessons for Commerce.** Build each one in this order:
   1. Name the term, document, principle or institution.
   2. Define it, or state the rule, in plain words.
   3. Explain how it works in a real transaction, or work the calculation (data, formula,
      working, check, as in Physics).
   4. Give a Nigerian example: a trader in Balogun or Onitsha market, an importer clearing goods
      at Apapa, a GTBank or First Bank account, a NAFDAC number on a pack of noodles, Dangote
      Cement on the stock exchange, a cooperative of cocoa farmers.
   5. Give a way to remember it.
   6. Name the trap: the option that tempts, and why it is wrong.
9. **Spoken lines.**
   - Read abbreviations as letters: "N A F D A C", "C I F", "S E C".
   - Say money in words: "forty-nine thousand, six hundred naira", and percentages as "three
     per cent".
   - As in Chemistry, a `say` line has no `$`, no backslash, and none of `:` `;` `—` `–`
     ` - `. The checker refuses the word "correction" in spoken lines.
