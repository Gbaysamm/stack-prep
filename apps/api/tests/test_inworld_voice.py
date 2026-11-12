"""The Inworld voice (app/inworld_voice.py): its word timings, and the studio voice where no
key is configured."""

from __future__ import annotations

from app import inworld_voice, voice_store
from app.config import Settings


def test_word_timings_keep_only_spoken_words() -> None:
    alignment = {
        "words": ["Welcome", ". ", "Today's", " ", "lesson", ".", ""],
        "wordStartTimeSeconds": [0.0, 0.63, 0.88, 1.31, 1.31, 1.9, 2.0],
        "wordEndTimeSeconds": [0.6, 0.88, 1.31, 1.31, 1.7, 2.0, 2.05],
    }
    assert inworld_voice.words_from(alignment) == [
        {"w": "Welcome", "start": 0.0, "end": 0.6},
        {"w": "Today's", "start": 0.88, "end": 1.31},
        {"w": "lesson", "start": 1.31, "end": 1.7},
    ]


def test_without_a_key_the_studio_voice_answers() -> None:
    off = Settings(inworld_api_key="")
    on = Settings(inworld_api_key="abc")
    assert voice_store.engine_for("inworld", off) == "studio"
    assert voice_store.engine_for("inworld", on) == "inworld"
    # Its clips are kept apart from the other voices'.
    assert voice_store.path_for("Hello.", on, "inworld") != voice_store.path_for("Hello.", on)


def test_a_refused_account_sends_lessons_to_the_studio_voice(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    """No credit left: every line would fail, so no lesson is ever whole or kept. For a few
    minutes after the refusal the studio voice answers instead; a one-line failure does not."""
    on = Settings(inworld_api_key="abc")
    monkeypatch.setattr(inworld_voice, "_refused_until", 0.0)
    inworld_voice._refused(500)
    assert voice_store.engine_for("inworld", on) == "inworld"
    inworld_voice._refused(402)
    assert inworld_voice.refusing()
    assert voice_store.engine_for("inworld", on) == "studio"
    monkeypatch.setattr(inworld_voice, "_refused_until", 0.0)
    assert voice_store.engine_for("inworld", on) == "inworld"
