# The reviewer's question bank (10 Nov 2026)

The founder found the reviewer dashboard (one queue with filters) hard to use, and wants
reviewers who will never have Claude Code to be able to grow the bank themselves.

## Part 1: browse and edit the bank (built)

- **Exams** in the menu (UTME today). A reviewer adds an exam: WAEC, Post-UTME, a school's own.
- **Subjects** of an exam as a grid: papers, questions, how many are approved, reports. A new
  subject can start from the topics (syllabus) of an existing one, since a question can only
  go live under an approved topic.
- **Papers** of a subject by year, plus **sets of our own** (no year, `authored` questions).
- **A paper's questions**: filter by what they need, open one to check its answer, level and
  topic and approve it (the existing review panel), **edit** it, **remove** it, or **add** one.
- Rules kept from the database: an approved question's working and hints are improved in
  place; changing what it asks, its options or its key makes a new version that waits for a
  check; the person who wrote or last edited a question can't approve it; removing a question
  retires it, so students' scores that point at it stay whole.

## Part 2: the question assistant (next)

On a paper's page, **Add with AI**: upload the paper as a PDF or photos, paste questions, or
ask for new ones on chosen topics. It runs the steps used to build the bank so far, each a
separate model call so one checks another:

1. **Read**: transcribe each question, its options and any diagram, exactly as printed.
2. **Solve**: work each one out independently, without the printed key.
3. **Check**: a second pass compares the answer with the key (when there is one) and with the
   solve; disagreements are flagged for the reviewer, never guessed.
4. **Teach**: the worked solution, a hint, the level and the topic, written to the house
   standard (`docs/lesson-style-guide.md`), and an SVG for any diagram, drawn from the
   question's own numbers and checked against them.
5. **Draft**: the questions land in the paper as drafts. A person approves each one.

Settings, in **Admin → Settings → AI**: the provider (OpenAI or Anthropic), the model for each
step, and the API key, stored encrypted and never shown again. Each run shows an estimate of
its cost before it starts, and the admin dashboard's AI usage page counts what it spent.

Open questions for the founder: which provider to start with, and a monthly spending limit.
