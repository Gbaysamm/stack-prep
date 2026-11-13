"""The lesson edit check (routers/bank_lessons.py): words change, the timing stays sound."""

from app.routers.bank_lessons import MomentEdit, check_edit

LESSON = [
    {
        "section": "Welcome",
        "say": "Welcome. Today's lesson is melting points.",
        "write": "Melting points",
    },
    {
        "say": "The melting point of a solid is the temperature at which it becomes a liquid.",
        "write": "Melting point: the temperature at which a solid becomes a liquid",
        "point": [{"at": "a solid becomes a liquid", "kind": "underline", "line": 1}],
    },
    {
        "say": "Look at the flat part of the curve.",
        "diagram_do": [{"show": "flat", "on": "flat part"}],
    },
]


def test_a_plain_rewording_is_saved() -> None:
    new, problems = check_edit(
        LESSON,
        [
            MomentEdit(
                index=0, say="Welcome. Today we learn melting points.", write="Melting points"
            )
        ],
    )
    assert problems == []
    assert new[0]["say"] == "Welcome. Today we learn melting points."
    assert LESSON[0]["say"].startswith("Welcome. Today's")  # the original is untouched


def test_a_cue_word_must_still_be_said() -> None:
    _, problems = check_edit(
        LESSON, [MomentEdit(index=2, say="Look at the level stretch of the curve.")]
    )
    assert any("flat part" in p for p in problems)


def test_a_marked_phrase_must_stay_on_its_line() -> None:
    _, problems = check_edit(
        LESSON,
        [
            MomentEdit(
                index=1, say=LESSON[1]["say"], write="Melting point: when a solid turns to liquid"
            )
        ],
    )
    assert any("a solid becomes a liquid" in p for p in problems)


def test_a_line_cannot_be_added_or_emptied() -> None:
    _, added = check_edit(
        LESSON, [MomentEdit(index=2, say="Look at the flat part of the curve.", write="Flat")]
    )
    _, emptied = check_edit(LESSON, [MomentEdit(index=0, say="Welcome.", write="")])
    assert added and emptied


def test_no_such_moment() -> None:
    _, problems = check_edit(LESSON, [MomentEdit(index=9, say="Hello")])
    assert problems == ["Moment 10: no such moment."]
