"""The free Kokoro voice: kept apart from the studio voice, never paid for, and optional.

The synthesizer is replaced in every test here, so nothing downloads the model and nothing
runs it: what is tested is what surrounds it.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import httpx
import numpy as np
import pytest

from app import kokoro_voice, tutor, voice_store
from app.config import Settings, get_settings
from app.main import app

LINE = r"Now factorise $x^2 - x - 6$. That costs ₦500."


def _settings(**changes: object) -> Settings:
    base: dict[str, object] = {
        "openai_api_key": "",
        "ai_speak": True,
        "ai_kokoro": True,
        "kokoro_download": True,
    }
    base.update(changes)
    return Settings(**base)  # type: ignore[arg-type]


@pytest.fixture(autouse=True)
def _kept_in(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setattr(voice_store, "folder", lambda: tmp_path)
    monkeypatch.setattr(kokoro_voice, "_installed", lambda: True)
    monkeypatch.setattr(kokoro_voice, "_broken_until", 0.0)
    return tmp_path


@pytest.fixture
def no_paid_voice(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    """Records any call to the paid voice, which a Kokoro line must never make."""
    called: list[str] = []

    async def paid(line: str, *args: object, **kwargs: object) -> bytes:
        called.append(line)
        return b"studio-mp3"

    monkeypatch.setattr(tutor, "speak", paid)
    return called


@pytest.fixture
def kokoro_makes(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    said: list[str] = []

    def fake(text: str, settings: Settings) -> kokoro_voice.Clip:
        said.append(text)
        words = [
            {"w": w, "start": i * 0.3, "end": i * 0.3 + 0.25} for i, w in enumerate(text.split())
        ]
        return kokoro_voice.Clip(b"kokoro-mp3", 2.0, words, estimated=False)

    monkeypatch.setattr(kokoro_voice, "synthesize", fake)
    return said


# --- where a clip is kept --------------------------------------------------------------------


def test_the_two_voices_never_share_a_file() -> None:
    settings = _settings()
    studio = voice_store.path_for(LINE, settings, "studio")
    kokoro = voice_store.path_for(LINE, settings, "kokoro")
    assert studio != kokoro
    assert studio.parent == kokoro.parent, "both voices keep the same folder layout"
    assert voice_store.words_path(kokoro).name == f"{kokoro.stem}.words.json"


def test_studio_clips_already_kept_are_still_found() -> None:
    """The studio key is exactly what it was before there were two voices."""
    settings = _settings()
    said = tutor.for_the_voice(LINE)
    old = hashlib.sha256(
        f"{settings.ai_speech_model}|{settings.ai_speech_voice}|{tutor.SPEECH_STYLE}|{said}".encode()
    ).hexdigest()
    assert voice_store.path_for(LINE, settings).stem == old


def test_a_changed_kokoro_voice_or_speed_is_a_new_clip() -> None:
    first = voice_store.path_for(LINE, _settings(), "kokoro")
    assert voice_store.path_for(LINE, _settings(kokoro_speed=0.95), "kokoro") != first
    assert voice_store.path_for(LINE, _settings(kokoro_voice="af_bella"), "kokoro") != first


# --- which voice answers -----------------------------------------------------------------------


def test_kokoro_is_offered_only_when_switched_on_and_installed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    assert voice_store.engine_for("kokoro", _settings()) == "kokoro"
    assert voice_store.engine_for("studio", _settings()) == "studio"
    assert voice_store.engine_for("kokoro", _settings(ai_kokoro=False)) == "studio"
    monkeypatch.setattr(kokoro_voice, "_installed", lambda: False)
    assert voice_store.engine_for("kokoro", _settings()) == "studio"


def test_without_its_files_and_no_download_kokoro_is_not_offered(tmp_path: Path) -> None:
    settings = _settings(kokoro_dir=str(tmp_path / "empty"), kokoro_download=False)
    assert not kokoro_voice.available(settings)


async def test_a_kokoro_line_is_made_without_the_paid_voice(
    no_paid_voice: list[str], kokoro_makes: list[str]
) -> None:
    settings = _settings(openai_api_key="sk-test")
    path = await voice_store.voiced(LINE, settings, engine="kokoro")

    assert path is not None
    assert path.read_bytes() == b"kokoro-mp3"
    assert no_paid_voice == []
    # The mathematics and the naira are said in words, as the studio voice says them.
    assert kokoro_makes == [tutor.for_the_voice(LINE)]
    assert "x squared minus x minus 6" in kokoro_makes[0]
    assert "500 naira" in kokoro_makes[0]

    kept = voice_store.timings(LINE, settings, "kokoro")
    assert kept is not None
    assert kept["engine"] == "kokoro" and kept["estimated"] is False
    assert kept["words"][0] == {"w": "Now", "start": 0.0, "end": 0.25}

    # A second hearing is the kept file, made once.
    await voice_store.voiced(LINE, settings, engine="kokoro")
    assert len(kokoro_makes) == 1


async def test_kokoro_switched_off_falls_back_to_the_studio_voice(
    no_paid_voice: list[str], kokoro_makes: list[str]
) -> None:
    settings = _settings(ai_kokoro=False)
    path = await voice_store.voiced(LINE, settings, engine="kokoro")

    assert path == voice_store.path_for(LINE, settings, "studio")
    assert path is not None and path.read_bytes() == b"studio-mp3"
    assert kokoro_makes == []
    assert no_paid_voice == [LINE]
    assert voice_store.timings(LINE, settings, "kokoro") is None, "the studio keeps no timings"


async def test_a_failed_kokoro_line_is_silence_not_a_paid_one(
    no_paid_voice: list[str], monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setattr(kokoro_voice, "synthesize", lambda text, settings: None)
    assert await voice_store.voiced(LINE, _settings(), engine="kokoro") is None
    assert no_paid_voice == []
    assert list(tmp_path.iterdir()) == []


async def test_warming_with_kokoro_makes_every_line(
    no_paid_voice: list[str], kokoro_makes: list[str]
) -> None:
    made, failed = await voice_store.voice_all(
        ["One.", "Two.", "One."], _settings(), engine="kokoro"
    )
    assert (made, failed) == (3, 0)
    assert sorted(kokoro_makes) == ["One.", "Two."]
    assert no_paid_voice == []


# --- the synthesizer's own pieces -------------------------------------------------------------


def test_words_are_placed_from_the_phoneme_timings() -> None:
    # Each word phonemized alone keeps a stress mark the whole line drops; the sounds still
    # line up, and each word spans its own.
    words = ["5", "cats."]
    stress = "\u02c8"
    each = [f"f{stress}aiv", f"k{stress}ats."]
    line = f"f{stress}aiv kats."
    timed = [(p, i * 0.1, i * 0.1 + 0.1) for i, p in enumerate(line)]
    placed = kokoro_voice.words_from_phonemes(words, each, timed)
    assert [w["w"] for w in placed] == words
    assert placed[0]["start"] == 0.0 and placed[0]["end"] == pytest.approx(0.5)
    assert placed[1]["start"] == pytest.approx(0.6) and placed[1]["end"] == pytest.approx(1.0)


def test_estimated_words_share_the_stretch_by_length() -> None:
    placed = kokoro_voice.estimated_words(["a", "bbb"], 1.0, 3.0)
    assert placed[0] == {"w": "a", "start": 1.0, "end": 1.667}
    assert placed[1]["end"] == 3.0


def test_trimming_keeps_sternhosts_pads() -> None:
    rate = 1000
    audio = np.concatenate([np.zeros(300), np.full(100, 0.5), np.zeros(450)]).astype(np.float32)
    cut, moved = kokoro_voice.trim(audio, rate)
    assert len(cut) == 80 + 100 + 150
    assert moved == pytest.approx(0.080 - 0.300)


def test_names_are_respelled_for_the_voice_only() -> None:
    assert kokoro_voice.say_as("Ike,") == "Eekeh,"
    assert kokoro_voice.say_as("naira.") == "nyra."
    assert kokoro_voice.say_as("Emeka") == "Emeka"


def test_timings_are_json_the_board_can_read() -> None:
    clip = kokoro_voice.Clip(b"", 1.23456, [{"w": "Hi", "start": 0.08, "end": 0.4}], True)
    assert json.loads(kokoro_voice.dumps(clip)) == {
        "engine": "kokoro",
        "duration": 1.235,
        "estimated": True,
        "words": [{"w": "Hi", "start": 0.08, "end": 0.4}],
    }


# --- the API ---------------------------------------------------------------------------------


@pytest.fixture
async def client() -> httpx.AsyncClient:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


async def test_the_engine_is_one_of_two(client: httpx.AsyncClient) -> None:
    session = "00000000-0000-0000-0000-000000000000"
    bad = await client.get(f"/v1/practice/{session}/speech/nothing?engine=robot")
    assert bad.status_code == 422
    good = await client.get(f"/v1/practice/{session}/speech/nothing?engine=kokoro")
    assert good.status_code == 404, "a known engine, but no such line"


async def test_features_say_whether_kokoro_is_offered(client: httpx.AsyncClient) -> None:
    app.dependency_overrides[get_settings] = lambda: _settings(ai_kokoro=False)
    try:
        assert (await client.get("/v1/features")).json()["kokoro_voice"] is False
        app.dependency_overrides[get_settings] = lambda: _settings()
        assert (await client.get("/v1/features")).json()["kokoro_voice"] is True
    finally:
        app.dependency_overrides.pop(get_settings, None)


def test_the_lesson_voice_endpoints_take_an_engine() -> None:
    paths = app.openapi()["paths"]
    for path, method in [
        ("/v1/practice/{session_id}/lesson/{question_version_id}/voice/{beat}", "get"),
        ("/v1/practice/{session_id}/lesson/{question_version_id}/voice/{beat}/words", "get"),
        ("/v1/practice/{session_id}/lesson/{question_version_id}/warm", "post"),
        ("/v1/practice/{session_id}/speech/{handle}", "get"),
    ]:
        names = {p["name"] for p in paths[path][method]["parameters"]}
        assert "engine" in names, path
