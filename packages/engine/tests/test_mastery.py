"""Mastery rules (product spec §9.1)."""

from __future__ import annotations

import math

import pytest

from engine.mastery import (
    GUESS_K_FACTOR,
    HINT_OUTCOME_CAP,
    K_FLOOR,
    UNSURE_K_FACTOR,
    Attempt,
    SkillRating,
    band,
    chance_level_for_options,
    confidence,
    difficulty_for_level,
    displayed_mastery,
    is_suspected_guess,
    learning_rate,
    predicted_probability,
    probability_correct,
    retained_mastery,
    update,
)


def attempt(**overrides: object) -> Attempt:
    defaults: dict[str, object] = {
        "is_correct": True,
        "level": 3,
        "response_ms": 70_000,
        "expected_seconds": 90.0,
    }
    return Attempt(**{**defaults, **overrides})  # type: ignore[arg-type]


def test_probability_is_a_half_when_ability_matches_difficulty() -> None:
    assert probability_correct(0.0, 0.0) == pytest.approx(0.5)


def test_probability_rises_with_ability() -> None:
    assert probability_correct(1.0, 0.0) > probability_correct(0.0, 0.0)


def test_unknown_level_is_rejected() -> None:
    with pytest.raises(ValueError, match=r"level must be 1\.\.5"):
        difficulty_for_level(6)


def test_learning_rate_shrinks_with_evidence_but_never_to_zero() -> None:
    assert learning_rate(0) > learning_rate(10) > learning_rate(100)
    assert learning_rate(10_000) == K_FLOOR


def test_correct_answer_raises_theta_and_wrong_answer_lowers_it() -> None:
    start = SkillRating()
    assert update(start, attempt(is_correct=True)).theta > start.theta
    assert update(start, attempt(is_correct=False)).theta < start.theta


def test_hint_earns_less_credit_than_an_unaided_answer() -> None:
    start = SkillRating(theta=-0.4, scored_attempts=5)
    unaided = update(start, attempt())
    hinted = update(start, attempt(hint_used=True))
    assert hinted.theta < unaided.theta


def test_hint_on_a_wrong_answer_is_not_rewarded() -> None:
    start = SkillRating(theta=0.5, scored_attempts=5)
    assert update(start, attempt(is_correct=False, hint_used=True)).theta < start.theta


def test_viewing_the_solution_first_is_not_scored() -> None:
    start = SkillRating(theta=0.3, scored_attempts=7, levels_seen=(2, 3))
    assert update(start, attempt(solution_viewed_before_answer=True)) == start


def test_suspected_guess_moves_theta_less() -> None:
    start = SkillRating(theta=-0.6, scored_attempts=4)
    worked = update(start, attempt(level=4, response_ms=90_000, expected_seconds=120))
    guessed = update(start, attempt(level=4, response_ms=5_000, expected_seconds=120))
    assert is_suspected_guess(attempt(level=4, response_ms=5_000, expected_seconds=120))
    assert guessed.theta < worked.theta


def test_no_self_report_scores_exactly_as_before() -> None:
    start = SkillRating(theta=0.2, scored_attempts=6, levels_seen=(2, 3))
    assert update(start, attempt()) == update(start, attempt(confidence=None))
    assert update(start, attempt()) == update(start, attempt(confidence="sure"))


def test_a_right_answer_the_student_guessed_is_scored_like_a_hinted_guess() -> None:
    start = SkillRating(theta=0.2, scored_attempts=6, levels_seen=(2, 3))
    guessed = update(start, attempt(confidence="guessed"))
    expected = predicted_probability(start, 3)
    step = learning_rate(start.scored_attempts) * GUESS_K_FACTOR
    assert guessed.theta == pytest.approx(start.theta + step * (HINT_OUTCOME_CAP - expected))
    assert guessed.theta < update(start, attempt(confidence="sure")).theta
    assert guessed.scored_attempts == start.scored_attempts + 1


def test_a_self_reported_guess_that_was_also_fast_is_damped_once() -> None:
    start = SkillRating(theta=-0.5, scored_attempts=4)
    fast = {"level": 4, "response_ms": 5_000, "expected_seconds": 120}
    both = update(start, attempt(confidence="guessed", **fast))
    expected = predicted_probability(start, 4)
    step = learning_rate(start.scored_attempts) * GUESS_K_FACTOR
    assert both.theta == pytest.approx(start.theta + step * (HINT_OUTCOME_CAP - expected))


def test_unsure_is_weaker_evidence_than_sure_but_still_evidence() -> None:
    start = SkillRating(theta=-0.4, scored_attempts=5)
    sure = update(start, attempt(confidence="sure"))
    unsure = update(start, attempt(confidence="unsure"))
    guessed = update(start, attempt(confidence="guessed"))
    assert start.theta < guessed.theta < unsure.theta < sure.theta
    assert unsure.theta - start.theta == pytest.approx((sure.theta - start.theta) * UNSURE_K_FACTOR)


@pytest.mark.parametrize("said", ["sure", "unsure", "guessed", None])
def test_a_wrong_answer_is_scored_the_same_whatever_was_said(said: str | None) -> None:
    start = SkillRating(theta=0.5, scored_attempts=5)
    assert update(start, attempt(is_correct=False, confidence=said)) == update(
        start, attempt(is_correct=False)
    )


def test_a_fast_wrong_answer_is_not_a_guess() -> None:
    assert not is_suspected_guess(attempt(is_correct=False, response_ms=2_000))


def test_attempts_and_levels_accumulate() -> None:
    rating = SkillRating()
    rating = update(rating, attempt(level=2))
    rating = update(rating, attempt(level=3))
    rating = update(rating, attempt(level=2))
    assert rating.scored_attempts == 3
    assert rating.levels_seen == (2, 3)


def test_band_withheld_until_there_is_evidence() -> None:
    assert band(SkillRating(theta=1.5, scored_attempts=2)) == "not_assessed"


@pytest.mark.parametrize(
    ("theta", "expected"),
    [
        (-1.5, "weak"),
        (-0.2, "developing"),
        (0.9, "exam_ready"),
        (1.5, "strong"),
        (2.5, "maintained"),
    ],
)
def test_bands_follow_displayed_mastery(theta: float, expected: str) -> None:
    assert band(SkillRating(theta=theta, scored_attempts=10, levels_seen=(2, 3))) == expected


def test_confidence_needs_both_volume_and_variety() -> None:
    assert confidence(SkillRating(scored_attempts=2)) == "low"
    assert confidence(SkillRating(scored_attempts=12, levels_seen=(3,))) == "medium"
    assert confidence(SkillRating(scored_attempts=12, levels_seen=(2, 3))) == "high"


def test_displayed_mastery_is_a_fraction() -> None:
    value = displayed_mastery(SkillRating(theta=0.4, scored_attempts=5))
    assert 0.0 < value < 1.0


def test_chance_level_comes_from_the_option_count() -> None:
    assert chance_level_for_options(4) == pytest.approx(0.25)
    assert chance_level_for_options(5) == pytest.approx(0.2)


@pytest.mark.parametrize("option_count", [0, 1, 7, -4])
def test_chance_level_rejects_impossible_option_counts(option_count: int) -> None:
    with pytest.raises(ValueError, match="option_count must be"):
        chance_level_for_options(option_count)


def test_retention_decays_towards_chance_not_zero() -> None:
    chance = chance_level_for_options(4)
    fresh = retained_mastery(0.82, 0.0, 3.0, chance)
    one_half_life = retained_mastery(0.82, 3.0, 3.0, chance)
    forgotten = retained_mastery(0.82, 10_000.0, 3.0, chance)

    assert fresh == pytest.approx(0.82)
    assert one_half_life == pytest.approx(0.82 * 0.5 + chance * 0.5)
    assert math.isclose(forgotten, chance, abs_tol=1e-6)


def test_a_five_option_item_forgets_to_a_lower_floor() -> None:
    four = retained_mastery(0.82, 30.0, 3.0, chance_level_for_options(4))
    five = retained_mastery(0.82, 30.0, 3.0, chance_level_for_options(5))

    assert five < four


def test_retention_rejects_impossible_inputs() -> None:
    with pytest.raises(ValueError):
        retained_mastery(0.5, 1.0, 0.0, 0.25)
    with pytest.raises(ValueError):
        retained_mastery(0.5, -1.0, 3.0, 0.25)
    with pytest.raises(ValueError):
        retained_mastery(0.5, 1.0, 3.0, 1.5)
