# Damaged question stems — 19 September 2026

The PDF import lost characters, and some of what it lost changes the answer. This finds the
damage and proposes repairs. **It does not apply them.** `candidates.md` is the output; a
person decides what to do with it.

    uv run python analysis/stem-repair/find_damage.py > analysis/stem-repair/candidates.md

## How this was found

A student asked the coach about a pie-chart question. The stem said the Physics sector had
"angle 120"; the reviewed working said `(12/360)(150) = 5`. One hundred and twenty over three
hundred and sixty of a hundred and fifty is fifty, which is not one of the four options. The
true angle is 12 degrees, and the degree sign had become a zero.

The coach caught it, corrected itself out loud, and reached the keyed answer — which looked
like the model being unreliable, and was not. That is the reason this matters beyond the
questions themselves: damage in the bank reads as damage in the tutor.

## What it looks for

**degree** — the degree sign flattened into a digit. `angle 120` for 12°, `N720E` for N72°E,
`latitude 600S` for 60°S. Where the reviewed working uses the number without its trailing
zero, that is two independent records of the same question disagreeing in exactly the way a
lost degree sign explains, and the proposal is marked `verified`.

**options** — the same damage in the answer options, which is where it actually bites. One
question in the bank stores `50° | 40° | 1100 | 800 | 1000`: same printing, same extraction,
the sign kept on two options and lost on three. That is proof rather than inference, and
those are marked `verified`. Where a question plainly asks for an angle and every option is a
bare number ending in zero, the proposal is `inferred` and needs eyes.

**table** — a table flattened into prose: `Number 1 2 3 4 5 6 Frequency 12 20 x 21 x -1 28`.
The values usually survive in order, so the question is answerable, but the student has to
rebuild the rows first. No automatic repair; most of these have a figure to read instead.

**flagged** — a reviewer noticed at import and wrote it into the working ("the text layer
lost the radical"). They recorded it rather than fixing the stem, so the note is the
specification and a person applies it.

## Before applying anything

**`verified` is evidence, not permission.** Every one of these is a question a student will
be marked against. The proposals are cross-checked, not proven.

**`inferred` needs the source paper.** Nothing corroborates those beyond the shape of the
number.

**The importer is still doing this.** Repairing rows does not stop the next import losing the
same characters. The extraction is where the fix belongs; this is the clean-up.
