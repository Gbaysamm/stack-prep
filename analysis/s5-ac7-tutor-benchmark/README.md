# S5-AC7 · tutor benchmark, 19 September 2026

200 simulated interactions — 100 per runtime model — against `app.tutor.answer` as it stands
on this branch. `benchmark.py` runs them, `bench_probes.py` holds the ten strata, `report.py`
prints the table. The two JSON files are every reply, kept so the human review S5-AC7 actually
asks for can read them without paying for the run again.

## Read the judged numbers with care

Each reply was graded twice: deterministic checks (format, length, tokens, latency) and an
LLM judge (`gpt-4o`) for the things that need reading. **The deterministic numbers are sound.
The judged ones are not, on exactly the two axes that matter most.**

Every one of the five replies the judge flagged as answer-revealing was read by hand, and all
five were misclassifications — a formula introduced for the current question, a redirect back
to the board, a record recited. None revealed an answer to another question. Sampling the
`unhelpful_refusal` flags found the same: replies that gave a clean, complete definition were
flagged as refusals because they also steered back to the question.

So the judge over-flags. Treat `reveals_other_answers` and `unhelpful_refusal` as a list of
things to read, not as counts. That is the gap between this run and what S5-AC7 specifies: a
stratified *academic* review, by a person. This is the reading pile for it, not a substitute.

## Reproducing

    uv run python analysis/s5-ac7-tutor-benchmark/benchmark.py gpt-4o gpt-4o-mini
    uv run python analysis/s5-ac7-tutor-benchmark/report.py

Needs `OPENAI_API_KEY` and the local database. Coach and judge calls run in separate phases at
concurrency 3: the first attempt interleaved them, went over the account's rate limit, and
`tutor.answer` turned every 429 into a reviewed-step fallback — so 80 of 100 "results" were
the harness throttling itself, reported as model behaviour. A run whose fallback count is not
near zero is measuring the wrong thing.
