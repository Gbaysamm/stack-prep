"""The board writes only the reviewed working; the teacher's talk is what is generated."""

import json

from app.tutor import Lesson, _board_item, _narration_from, _taught

STEP = r"Use $R = 7$, $P = 2$, so $2 = \dfrac{K}{49}$ and $K = 98$."

LESSON = Lesson(
    subtopic_name="Variation",
    topic_name="Algebra",
    stem=r"If $P$ varies inversely as $V$, find $P$ when $R = 7$.",
    options=[("A", "$98$"), ("B", "$49$"), ("C", "$7$"), ("D", "$2$")],
    correct_option_key="A",
    steps=[r"Write $P = \dfrac{k}{V}$.", STEP],
    step_index=None,
)


def test_the_steps_own_maths_may_go_up_spacing_aside() -> None:
    assert _board_item(r"$2=\dfrac{K}{49}$", STEP) == r"$2=\dfrac{K}{49}$"
    assert _board_item("So $K = 98$", STEP) == "So $K = 98$"


def test_a_short_label_without_new_numbers_may_go_up() -> None:
    assert _board_item("Find K first", STEP) == "Find K first"


def test_a_formula_the_step_does_not_contain_is_refused() -> None:
    assert _board_item("$K = 99$", STEP) is None


def test_a_sentence_or_a_new_number_is_not_a_label() -> None:
    assert _board_item("Now we use the values we are given in the question", STEP) is None
    assert _board_item("Answer is 12", STEP) is None


def test_each_item_goes_up_as_its_words_begin() -> None:
    taught = _taught(
        [
            {"say": "We know two things.", "write": "$R = 7$"},
            {"say": "Put them into the equation.", "write": r"$2 = \dfrac{K}{49}$"},
            {"say": "Then multiply both sides by 49.", "write": None},
        ],
        STEP,
    )
    assert taught is not None
    assert taught.board == ["$R = 7$", r"$2 = \dfrac{K}{49}$"]
    assert taught.at[0] == 0.0
    assert 0.2 < taught.at[1] < 0.5
    assert taught.said.startswith("We know two things. Put them")


def test_a_stray_item_is_dropped_and_the_talk_kept() -> None:
    taught = _taught(
        [
            {"say": "First this.", "write": "$K = 99$"},
            {"say": "Then that.", "write": "$K = 98$"},
        ],
        STEP,
    )
    assert taught is not None
    assert taught.board == ["$K = 98$"]
    assert taught.said == "First this. Then that."


def test_a_step_never_taught_over_an_empty_board_when_it_has_maths() -> None:
    taught = _taught([{"say": "Look.", "write": "$K = 99$"}, {"say": "See?", "write": None}], STEP)
    assert taught is not None
    assert taught.board == ["$R = 7$", "$P = 2$"]


def _reply(steps: list[object]) -> str:
    return json.dumps(
        {
            "opening": [{"say": "You chose B. Let us see why.", "write": "$R = 7$"}],
            "steps": steps,
            "closing": "So the answer is A. Well done for sticking with it.",
        }
    )


def test_a_whole_reply_is_checked_and_kept() -> None:
    narration = _narration_from(
        _reply(
            [
                [{"say": "Inverse means k over V.", "write": r"$P = \dfrac{k}{V}$"}],
                [{"say": "Now put in what we know.", "write": "$K = 98$"}],
            ]
        ),
        LESSON,
    )
    assert narration is not None
    assert narration.opening.board == ["$R = 7$"]
    assert [step.board for step in narration.steps] == [[r"$P = \dfrac{k}{V}$"], ["$K = 98$"]]
    assert narration.closing.startswith("So the answer is A")


def test_a_reply_with_the_wrong_number_of_steps_is_refused() -> None:
    assert _narration_from(_reply([[{"say": "Only one.", "write": None}]]), LESSON) is None


def test_a_reply_that_is_not_json_is_refused() -> None:
    assert _narration_from("Sure! Here is the lesson.", LESSON) is None
