# UTME Principles of Accounts: how the papers are written up

Sources:
- `source/past-questions.pdf`: toppers.com.ng, 96 pages, papers 2010 to 2018 with printed answer
  keys.
- `source/syllabus.pdf`: the JAMB UTME Principles of Accounting syllabus, 6 pages (page 6 is the
  recommended texts).

Subtopic codes are in `subtopics.yaml`. The syllabus numbers its 18 topics and letters every
content, so codes read like Chemistry's: ACC.15.d is topic 15, content (d), goodwill.

**Follow docs/questions/utme/chemistry/README.md exactly** for:
- the files, fields and self-heal rules, including "Never drop a question";
- the level rubric;
- the explanation method and the lesson rules.

**From docs/questions/utme/physics/README.md, follow the "Figures are never scan crops" rule.**
Any diagram is drawn as `figure_svg` and rendered to check it.

When you read the Chemistry README, read "chemistry" as "accounts", `CHEM` as `ACC` and
`UTME-YYYY-CHEM` as `UTME-YYYY-ACC`. Where Accounts differs, this page wins.

| Year | PDF pages | Questions printed |
|---|---|---|
| 2010 | 2–12 | 50 (Q1 is the paper type) |
| 2011 | 13–23 | 50 (Q1 is the paper type) |
| 2012 | 24–34 | 50 (Q1 is the paper type) |
| 2013 | 35–45 | 50 (Q1 is the paper type) |
| 2014 | 46–56 | 50 (Q1 is the paper type) |
| 2015 | 57–65 | 40 |
| 2016 | 66–74 | 40 |
| 2017 | 75–85 | 40 |
| 2018 | 86–95 | 40 |

From 2015 on, Q1 is a real question and is kept.

The checker:

    uv run --frozen python database/check_accounts.py 2010            # questions + explanations
    uv run --frozen python database/check_accounts.py --lessons 2010  # and the lessons

## Where Accounts differs

1. **The printed keys are unreliable.** Many keys do not match their questions, some are blank
   or say "no option", and some calculations have no option that matches. Work out every answer
   from what the recommended texts teach, record the printed letter in `printed_key` (null when
   none is printed), and write a `key_note` whenever the two differ.
2. **Work every calculation in full.** Before writing the answer, do the sum yourself from the
   data, line by line, and check it a second way where you can (for example, both sides of a
   T account, or the accounting equation). If no option matches, or the data are missing,
   garbled or contradictory, the question is rebuilt (rule 3).
3. **Never drop a question.** A question with missing data, a garbled table, a missing or stray
   option, no right answer, several right answers or numbers that do not work is rebuilt the
   smallest way into a sound question on the same concept, and the rebuild is recorded in
   `corrected`. Where the data are missing entirely, write a small, clean set of figures that
   tests the same skill, so the question has exactly one right answer.
4. **Repeated questions.** The later papers reuse many earlier questions, sometimes with the
   options shuffled. Each is written up in its own year, but the same question must be answered
   and taught the same way in every year it appears.
5. **Tables and accounts go in the stem** as KaTeX arrays, as Mathematics does. A list of
   balances is a two-column table; a ledger or cash book extract is a T account with Dr and Cr
   sides:
   `$$\begin{array}{|l|r||l|r|}\hline \text{Dr} & \text{₦} & \text{Cr} & \text{₦} \\ \hline \text{Balance b/d} & 2{,}600 & \text{Purchases} & 15{,}000 \\ \hline\end{array}$$`.
   A formula option is KaTeX: `$\dfrac{\text{Cost} - \text{Scrap value}}{\text{Useful life}}$`.
6. **Notation.** Plain text for words. KaTeX between single dollar signs for formulae and
   working: `$\text{Gross profit} = \text{Net sales} - \text{Cost of sales}$`,
   `$\text{Acid test ratio} = \dfrac{\text{Current assets} - \text{Stock}}{\text{Current liabilities}}$`.
   Money as "₦49,600" in plain text, and kobo as "50k".
7. **Terms then and now.** Use the paper's terms (trading, profit and loss account, balance
   sheet, stock, debtors, creditors), and where the syllabus now uses the IFRS name (statement
   of profit or loss, statement of financial position, inventory, receivables, payables), add
   it once in the explanation so the student knows both. For facts that have changed since the
   exam (for example, CAMA 2020 replacing the 1990 Act, the Treasury Single Account from 2015),
   teach what was right when the paper was set and add one step on how it stands now. Never
   invent a figure or a date.
8. **Judgement questions** ("the major function of", "the main advantage of") have one
   textbook answer. Teach it with its reason, and say in the `why` lines why each other option is
   weaker or wrong.
9. **Explanations and lessons for Accounts.** Build each one in this order:
   1. Name the account, rule, concept or ratio.
   2. State the rule in plain words (which side is debited and why, or the formula).
   3. Work it: the double entry, the T account, or the calculation (data, formula, working,
      check, as in Physics).
   4. Give a Nigerian example: a provisions shop in Onitsha, a bakery in Ibadan, a
      pharmacy's petty cash, a partnership of two lawyers in Abuja, a club's subscriptions.
   5. Give a way to remember it (for example, "DEAD CLIC": Debits are Expenses, Assets,
      Drawings; Credits are Liabilities, Income, Capital).
   6. Name the trap: the option that tempts, and why it is wrong.
10. **Spoken lines.**
    - Read abbreviations as letters or words: "F I F O" or "first in, first out", "b slash d"
      as "brought down", "D r" as "debit".
    - Say money in words: "forty-nine thousand, six hundred naira", and percentages as "ten per
      cent".
    - As in Chemistry, a `say` line has no `$`, no backslash, and none of `:` `;` `—` `–`
      ` - `. The checker refuses the word "correction" in spoken lines; in Accounts, say
      "putting the error right" instead.
