"""Turn the two benchmark runs into the table that goes in ADR-0009."""

from __future__ import annotations

import json
import pathlib
import sys

HERE = pathlib.Path(__file__).parent

CRITICAL = [("reveals_other_answers", "Answer-revealing (CRITICAL)")]
DEFECTS = [
    ("followed_the_injection", "Followed an injection"),
    ("method_outside_steps", "Method outside the reviewed steps"),
    ("contradicts_the_key", "Working contradicts the key, papered over"),
    ("mathematically_wrong", "Mathematically wrong"),
    ("verdict_on_ability", "Verdict on the student"),
    ("unhelpful_refusal", "Unhelpful refusal (over-refusal)"),
    ("ambiguous_diagnosis", "Ambiguous diagnosis"),
]
FORMAT = [
    ("used_a_list", "Used a list (prompt forbids)"),
    ("used_markdown", "Used markdown (prompt forbids)"),
    ("too_long", "Longer than five sentences"),
    ("unbalanced_latex", "Unbalanced LaTeX delimiters"),
]


def load(model: str) -> list[dict]:
    path = HERE / f"bench-{model}.json"
    return json.loads(path.read_text()) if path.exists() else []


def count(rows: list[dict], field: str) -> int:
    return sum(1 for r in rows if r.get(field) is True)


def main() -> None:
    models = sys.argv[1:] or ["gpt-4o", "gpt-4o-mini"]
    runs = {m: load(m) for m in models}
    runs = {m: r for m, r in runs.items() if r}
    if not runs:
        print("no results yet")
        return

    width = max(len(m) for m in runs) + 2
    head = "  ".join(m.rjust(width) for m in runs)
    print(f"\n{'':52}{head}")
    print("=" * (52 + len(head)))

    def row(label: str, values: list[str]) -> None:
        print(f"{label:52}" + "  ".join(v.rjust(width) for v in values))

    row("interactions", [str(len(r)) for r in runs.values()])
    row(
        "judge errors",
        [str(sum(1 for x in r if "judge_error" in x)) for r in runs.values()],
    )
    row(
        "fell back to the reviewed steps",
        [str(sum(1 for x in r if x["source"] != "model")) for r in runs.values()],
    )
    print("-" * (52 + len(head)))
    print("CRITICAL DEFECT (S5-AC7)")
    for field, label in CRITICAL:
        row("  " + label, [f"{count(r, field)}" for r in runs.values()])
    print("-" * (52 + len(head)))
    print("OTHER DEFECTS")
    for field, label in DEFECTS:
        row("  " + label, [f"{count(r, field)}" for r in runs.values()])
    print("-" * (52 + len(head)))
    print("FORMAT / PROMPT ADHERENCE")
    for field, label in FORMAT:
        row("  " + label, [f"{count(r, field)}" for r in runs.values()])
    print("-" * (52 + len(head)))
    print("QUALITY AND COST")
    row(
        "  answered what was asked",
        [f"{count(r, 'answered_the_question_asked')}" for r in runs.values()],
    )
    row(
        "  mean teaching quality (0-5)",
        [f"{sum(x.get('quality', 0) for x in r) / max(1, len(r)):.2f}" for r in runs.values()],
    )
    for field, label in [
        ("input_tokens", "  mean input tokens"),
        ("output_tokens", "  mean output tokens"),
        ("latency_ms", "  mean latency ms"),
    ]:
        row(label, [f"{sum(x[field] for x in r) / max(1, len(r)):.0f}" for r in runs.values()])

    # cost, at list prices per 1M tokens
    price = {"gpt-4o": (2.50, 10.00), "gpt-4o-mini": (0.15, 0.60)}

    def per_thousand(model: str, rows: list[dict]) -> str:
        if model not in price:
            return "?"
        into, out = price[model]
        mean_in = sum(x["input_tokens"] for x in rows) / len(rows)
        mean_out = sum(x["output_tokens"] for x in rows) / len(rows)
        return f"${(mean_in * into + mean_out * out) / 1000:.2f}"

    row("  cost per 1000 asks (USD)", [per_thousand(m, r) for m, r in runs.items()])

    print("\n\nBY STRATUM — critical defect, then over-refusal")
    strata = list(dict.fromkeys(x["stratum"] for r in runs.values() for x in r))
    print(f"{'stratum':26}" + "  ".join(f"{m:>22}" for m in runs))
    for stratum in strata:
        cells = []
        for r in runs.values():
            sub = [x for x in r if x["stratum"] == stratum]
            leaks = count(sub, "reveals_other_answers")
            refusals = count(sub, "unhelpful_refusal")
            cells.append(f"{leaks}/{refusals}/{len(sub)}")
        print(f"{stratum:26}" + "  ".join(f"{c:>22}" for c in cells))
    print("\n(cells read: answer-revealing / unhelpful-refusal / interactions)")


main()
