# UTME Economics: how the papers are written up

Sources:
- `source/past-questions.pdf`: toppers.com.ng, 84 pages, papers 2010 to 2018 with printed answer
  keys.
- `source/syllabus.pdf`: the JAMB UTME Economics syllabus, 9 pages (page 9 is the recommended
  texts).

Subtopic codes are in `subtopics.yaml`. The syllabus numbers its 23 topics straight through, so
codes read like Chemistry's: ECO.4.c is topic 4, content (c).

**Follow docs/questions/utme/chemistry/README.md exactly** for:
- the files, fields and self-heal rules, including "Never drop a question";
- the level rubric;
- the explanation method and the lesson rules.

**From docs/questions/utme/physics/README.md, follow the "Figures are never scan crops" rule.**
Every graph, curve diagram, pie chart, histogram and flow diagram is drawn as `figure_svg` and
rendered to check it.

When you read the Chemistry README, read "chemistry" as "economics", `CHEM` as `ECO` and
`UTME-YYYY-CHEM` as `UTME-YYYY-ECO`. Where Economics differs, this page wins.

| Year | PDF pages | Questions printed |
|---|---|---|
| 2010 | 2–10 | 50 (Q1 is the paper type) |
| 2011 | 11–19 | 50 (Q1 is the paper type) |
| 2012 | 20–29 | 50 (Q1 is the paper type) |
| 2013 | 30–39 | 50 (Q1 is the paper type) |
| 2014 | 40–49 | 50 (Q1 is the paper type) |
| 2015 | 50–58 | 50 |
| 2016 | 59–67 | 50 |
| 2017 | 68–75 | 40 (no Q24 is printed: rebuild one) |
| 2018 | 76–83 | 40 |

From 2015 on, Q1 is a real question and is kept.

The checker:

    uv run --frozen python database/check_economics.py 2010            # questions + explanations
    uv run --frozen python database/check_economics.py --lessons 2010  # and the lessons

## Where Economics differs

1. **The printed keys are unreliable.** Many keys do not match their questions; the 2012 key is a
   copy of 2011's. Work out every answer from what the recommended texts teach, record the
   printed letter in `printed_key`, and write a `key_note` whenever the two differ.
2. **Never drop a question.** A question with a missing graph, a cut-off option, a fifth
   option, no right answer, several right answers or numbers that do not work is rebuilt the
   smallest way into a sound question on the same concept, and the rebuild is recorded in
   `corrected`. A missing graph is drawn so that it fits the stem and options; a question whose
   graph cannot be inferred is rewritten in words.
3. **Tables go in the stem** as a KaTeX array, as Mathematics does:
   `$$\begin{array}{|c|c|}\hline \text{Price (₦)} & \text{Quantity} \\ \hline 50 & 500 \\ \hline\end{array}$$`.
   Graphs, curves, pie charts and histograms are `figure_svg`.
4. **Notation.** Plain text for words; KaTeX between single dollar signs for formulae and
   working: `$\text{PED} = \dfrac{\%\,\Delta Q_d}{\%\,\Delta P}$`, `$k = \dfrac{1}{1-\text{MPC}}$`,
   `$Q_d = 40 - 2P$`. Money as "₦20 million" in plain text.
5. **Facts that have changed since the exam.** Teach the answer that was right when the paper
   was set, and add one step on how it stands now if it has changed (for example, the 2005 bank
   consolidation and later recapitalization rounds; the NNPC became NNPC Limited in 2022). Never
   invent a figure. When textbooks disagree, teach what the syllabus's recommended texts teach.
6. **Judgement questions** ("a major problem of", "the main reason for") have one textbook
   answer. Teach it with its reason, and say in the `why` lines why each other option is weaker
   or wrong.
7. **Explanations and lessons for Economics.** Build each one in this order:
   1. Name the concept or law.
   2. Define it, or state the rule, in plain words.
   3. Explain how it works, as cause and effect, or work the calculation (data, formula,
      working, check, as in Physics).
   4. Give a Nigerian example: the price of garri or tomatoes in the market, petrol pump prices,
      the naira exchange rate, the CBN, NNPC, cocoa farmers in Ondo, a mama put stall.
   5. Give a way to remember it.
   6. Name the trap: the option that tempts, and why it is wrong.
8. **Spoken lines.**
   - Read symbols as words: "M P C" or "the marginal propensity to consume", "Q d", "P E D".
   - Say money in words: "twenty million naira", and percentages as "fifty per cent".
   - As in Chemistry, a `say` line has no `$`, no backslash, and none of `:` `;` `—` `–`
     ` - `. The checker refuses the word "correction" in spoken lines.
