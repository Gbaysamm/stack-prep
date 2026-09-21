# ADR-0009 · AI explanations grounded in stored solutions, precomputed in batch

- **Status:** Accepted
- **Date:** 2026-09-17

## Context

Students get AI help: "explain this differently" and "why is my answer wrong?".
Two hard constraints:

1. **Correctness.** A tutor that confidently writes a wrong algebra step is worse
   than no tutor. Language models still make arithmetic slips.
2. **Cost.** The product spec caps AI spend at $0.25 per active student per month.
   Per-request generation at exam-season usage would exceed that.

## Decision

- **Batch first.** When an item is approved, a job generates its alternative
  explanation and per-distractor "why this is wrong" text. A reviewer approves them
  once, and they are stored with the item version. At runtime students are served
  stored text.
- **Runtime calls only for genuine follow-up questions**, grounded in the stored
  worked solution, the skill note and the student's chosen option.
- **Answer check.** Any final answer in a model response is compared with the stored
  key. On mismatch the stored solution is shown instead, and the event is logged for
  review.
- **Never during assessment.** AI endpoints refuse check-up, mini-mock and full mock
  items.
- **The model never decides curriculum, plans or ratings.** It explains what the
  engine chose.
- **Models:** set by `AI_RUNTIME_MODEL` and `AI_BATCH_MODEL`, behind our own interface
  so a provider change touches one module.
  *Amended 19 September 2026: the provider is OpenAI, `gpt-4o` for both. The original
  decision paired a cheap runtime model with a larger batch one, and that pairing is
  dropped: the runtime call is the coach at the board, whose whole job is to explain
  the reviewed working, invent no method and reveal nothing early. The claim that a
  provider change touches one module was tested by making one: `app.tutor` and the two
  settings were the whole of it. The runtime model stays `gpt-4o` — see the measurement
  below, which did not support the reason originally given for it, and did not support
  changing it either.*
- **Controls:** every call logged with tokens, cost and latency; per-student daily
  cap; response caching; no student names in prompts; provider configured not to
  train on our data.

## What the refusal behaviour actually measures (19 September 2026)

The amendment above originally said refusal is the first thing a smaller model gives up,
and that the saving would therefore come out of the one property S5-AC7 treats as critical.
That was an assumption. It has now been measured: 100 stratified interactions per model
against the live tutor, ten strata of ten, held in `analysis/s5-ac7-tutor-benchmark/`.

**The assumption was not supported.** The judge flagged 3 answer-revealing replies for
`gpt-4o` and 2 for `gpt-4o-mini`. All five were read by hand and all five were
misclassifications — a formula introduced for the question in front of the student, a
redirect back to the board, a record recited back. **Across 200 interactions, no verified
instance of a reply revealing the answer to another question, by either model.** On the
critical defect the two are indistinguishable, and the smaller model did not give it up
first.

**The measurement does not settle the choice either**, and it is worth being exact about
why. The judge over-flags on precisely the two axes S5-AC7 names. Sampling the over-refusal
flags found replies that gave a clean, complete definition marked as refusals because they
also steered back to the question. So the judged columns below are a reading pile, not a
count. S5-AC7 asks for a stratified *academic* review — a person — and this is not one.

What the run does establish, from measured rather than judged numbers:

| | `gpt-4o` | `gpt-4o-mini` |
|---|---|---|
| Verified answer-revealing defects | 0 | 0 |
| Cost per 1000 asks | $4.34 | $0.49 |
| Mean latency | 3457 ms | 1881 ms |
| Mean input tokens, text only | 1193 | 1193 |
| Mean input tokens, question with a figure | 1586 | 13970 |
| Used a list, against the prompt | 20 | 5 |
| Longer than five sentences | 58 | 45 |
| Recited the student's record back at them | 1 | 6 |

Three of those rows matter more than the cost line.

**`gpt-4o-mini` bills a figure at roughly nine times `gpt-4o`'s token count** — 13,970
against 1,586 for the same image. The headline 8.9x saving is a text-only saving; on a
question carrying a diagram it narrows to about 2x. Now that the coach is sent figures
(`ai_send_figures`), the cheap model is much less cheap than it looks.

**`gpt-4o-mini` recites the student's record back at them six times more often**, and that
one was spot-checked and is real: "You got one question wrong today." The packet carries
`seen`, `right_unaided` and `taught` so the coach can choose what to teach, and the prompt
forbids reading them out. The smaller model holds that line less well. This is the only
place the original assumption's *shape* survives — not on answer-revealing, but on a rule
about what may be said aloud.

**Neither model obeys the length rule.** 58 and 45 replies of more than five sentences,
against an instruction to write three or four. This is a prompt problem, not a model
choice, and it is the more urgent of the two.

**Decision: runtime stays `gpt-4o`, and the refusal argument for it is withdrawn.** Cost
still favours the smaller model — $0.49 against $4.34 per 1000 asks — so this is a decision
taken against the cost evidence, not with it. It rests on the one verified behavioural
difference, that `gpt-4o-mini` reads the student's record back at them six times more often,
and on the figure-token finding that erodes much of the saving on exactly the questions a
coach is most needed for. Both are thinner grounds than the original argument claimed to
have. Revisit after a human review of the 200 stored transcripts, which is the S5-AC7
acceptance criterion and is still outstanding; if that review finds the record-reciting is
fixable in the prompt, the case for the expensive model largely goes with it.

**A cost problem this exposed, independent of the model.** At the current
`ai_daily_calls_per_student` of 20, a student who spends their allowance every day costs
$2.60 a month on `gpt-4o` — against the $0.25 per active student per month this ADR caps
spend at, in its own Context section. Ten times over. `gpt-4o-mini` lands at $0.29, still
over. The daily cap was described above as the thing that holds the cost down; at 20 a day
it does not. Either the cap comes down to about 2 a day, or the $0.25 figure moves, or the
reviewed-reply cache this ADR already calls for has to carry most of the traffic. That is
a decision the numbers force and this amendment does not make.

## Consequences

- Most help is instant and free at runtime, and has been read by a human before a
  student sees it.
- Content approval gains a step, and the authoring tools need a review screen for
  generated text.
- The cost dashboard, per-student caps and the nightly answer-check evaluation are
  build work, not configuration.

## Alternatives considered

- **Generate everything at runtime.** Simpler, unbounded cost, unreviewed text.
- **Fine-tuning.** No fixed dataset yet, and it would not fix arithmetic slips.
- **Retrieval over a vector store.** Content is structured and addressed by ID;
  similarity search adds machinery without improving grounding.
