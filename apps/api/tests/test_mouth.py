"""The talking mouth (docs/plans/doodles-v2-contract.md section 7).

The loader's rules (database/lesson_mouth.py, through DoodleBook), the board's lenient reading
(app/lesson_mouth.py, app/lesson_doodles.py), the sounds made from a voice's timings
(app/mouth_voice.py), their British RP phonemes (app/phonemes_rp.py), and the two endpoints
(app/routers/mouth.py). Nothing here runs the model, and only the one test of espeak's own RP
output runs espeak (skipped where it is not installed): the synthesizer and the phonemizer are
replaced, and the database is not touched.
"""

# ruff: noqa: RUF001  (IPA letters are what these tests are about)

from __future__ import annotations

import importlib.util
import itertools
import json
import sys
from collections.abc import AsyncIterator
from pathlib import Path
from types import ModuleType, SimpleNamespace
from typing import Any

import httpx
import pytest

from app import kokoro_voice, mouth_voice, phonemes_rp, premium, tutor, voice_store
from app.config import Settings, get_settings
from app.db import connection
from app.lesson_doodles import doodle_actions
from app.lesson_mouth import mouth_of
from app.main import app
from app.routers import mouth as mouth_router

_DATABASE = Path(__file__).resolve().parents[3] / "database"


def _load(name: str) -> ModuleType:
    sys.path.insert(0, str(_DATABASE))
    try:
        spec = importlib.util.spec_from_file_location(name, _DATABASE / f"{name}.py")
        assert spec and spec.loader
        module = importlib.util.module_from_spec(spec)
        sys.modules[name] = module
        spec.loader.exec_module(module)
        return module
    finally:
        sys.path.remove(str(_DATABASE))


doodles = _load("lesson_doodles")
mouths = sys.modules["lesson_mouth"]

SHEEP = "Listen to sheep: the long ee, lips spread wide."

_REAL_ESPEAK = phonemes_rp._espeak
#: What espeak's RP voice says for the words the endpoint tests use.
ESPEAK_SAYS = {"say": "sˈeɪ", "sheep": "ʃˈiːp", "now": "nˈaʊ"}


def _book() -> Any:
    return doodles.DoodleBook({"lightbulb"}, [], 2011, 86)


def _moment(book: Any, moment: dict[str, Any], index: int = 0) -> dict[str, Any]:
    stored, _ = book.moment(moment, index, [True] * (index + 1), f"moment {index}")
    return dict(stored)


# --- the loader ------------------------------------------------------------------------------


def test_a_mouth_is_stored_with_what_it_says() -> None:
    stored = _moment(
        _book(),
        {
            "say": SHEEP,
            "mouth": {
                "id": "m1",
                "word": "sheep",
                "sound": "iː",
                "syllables": ["sheep"],
                "stress": 1,
                "caption": "long ee: lips spread",
            },
        },
    )
    assert stored["mouth"] == {
        "id": "m1",
        "word": "sheep",
        "sound": "iː",
        "syllables": ["sheep"],
        "stress": 1,
        "caption": "long ee: lips spread",
    }


@pytest.mark.parametrize(
    ("mouth", "says"),
    [
        ({"sound": "iː"}, "word"),
        ({"word": "sheep", "sound": "Q"}, "IPA symbol"),
        ({"word": "sheep", "syllables": ["sheep"], "stress": 2}, "has 1 syllable"),
        ({"word": "sheep", "stress": 1}, "there are none"),
        ({"word": "sheep", "syllables": ["shi", "ip"]}, "do not spell"),
        ({"word": "sheep", "view": "top"}, "front or side"),
        ({"word": "sheep", "caption": "x" * 41}, "at most 40"),
        ({"word": "ship"}, "not said in this moment"),
        ({"word": "sheep", "on": "goat"}, "not said in this moment"),
        ({"word": "sheep4"}, "letters only"),
        ({"word": "one two three four"}, "at most 3 words"),
        ({"word": "sheep", "colour": "red"}, "has no ['colour']"),
        ({"word": "sheep", "id": "M1"}, "id is like m1"),
    ],
)
def test_a_mouth_that_breaks_a_rule_stops_the_load(mouth: dict[str, Any], says: str) -> None:
    with pytest.raises(SystemExit, match=says.replace("[", r"\[").replace("]", r"\]")):
        _moment(_book(), {"say": SHEEP, "mouth": mouth})


def test_on_names_the_word_that_starts_it_when_the_word_is_not_said() -> None:
    stored = _moment(
        _book(), {"say": "Now listen to the other one.", "mouth": {"word": "ship", "on": "listen"}}
    )
    assert stored["mouth"] == {"word": "ship", "on": "listen"}


def test_stress_is_counted_from_one_within_the_syllables() -> None:
    stored = _moment(
        _book(),
        {
            "say": "Comfortable has its stress at the front: COMfortable.",
            "mouth": {
                "word": "comfortable",
                "syllables": ["com", "fort", "a", "ble"],
                "stress": 1,
                "view": "front",
            },
        },
    )
    assert stored["mouth"]["stress"] == 1
    assert stored["mouth"]["view"] == "front"


def test_a_later_moment_makes_the_same_mouth_say_another_word() -> None:
    book = _book()
    _moment(book, {"say": SHEEP, "mouth": {"id": "m1", "word": "sheep"}})
    stored = _moment(
        book,
        {"say": "Now ship: shorter.", "doodle_do": [{"id": "m1", "op": "say", "word": "ship"}]},
        1,
    )
    assert stored["doodle_do"] == [{"id": "m1", "op": "say", "word": "ship"}]
    with_sound = _moment(
        book,
        {
            "say": "Ship again.",
            "doodle_do": [{"id": "m1", "op": "say", "word": "ship", "sound": "ɪ"}],
        },
        1,
    )
    assert with_sound["doodle_do"][0]["sound"] == "ɪ"
    with pytest.raises(SystemExit, match="IPA symbol"):
        _moment(book, {"say": "x", "doodle_do": [{"id": "m1", "op": "say", "sound": "Q"}]}, 1)
    pulse = _moment(book, {"say": "Look again.", "doodle_do": [{"id": "m1", "op": "pulse"}]}, 2)
    assert pulse["doodle_do"] == [{"id": "m1", "op": "pulse"}]


def test_a_mouth_takes_only_say_and_pulse_and_say_only_a_mouth() -> None:
    book = _book()
    _moment(book, {"say": SHEEP, "mouth": {"id": "m1", "word": "sheep"}})
    with pytest.raises(SystemExit, match="takes say or pulse"):
        _moment(book, {"say": "x", "doodle_do": [{"id": "m1", "op": "circle"}]}, 1)
    with pytest.raises(SystemExit, match="letters only"):
        _moment(book, {"say": "x", "doodle_do": [{"id": "m1", "op": "say", "word": "s1"}]}, 1)
    _moment(book, {"say": "A bulb.", "doodle": {"name": "lightbulb", "id": "bulb"}}, 1)
    with pytest.raises(SystemExit, match="say is for a talking mouth"):
        _moment(book, {"say": "x", "doodle_do": [{"id": "bulb", "op": "say"}]}, 2)


def test_a_mouth_and_a_doodle_cannot_share_an_id() -> None:
    book = _book()
    _moment(book, {"say": "A bulb.", "doodle": {"name": "lightbulb", "id": "m1"}})
    with pytest.raises(SystemExit, match="two doodles"):
        _moment(book, {"say": SHEEP, "mouth": {"id": "m1", "word": "sheep"}}, 1)


def test_the_known_sounds_cover_the_papers_vowels_and_consonants() -> None:
    for sound in ["iː", "ɪ", "æ", "ʌ", "ɜː", "eɪ", "əʊ", "θ", "ð", "ʃ", "ʒ", "tʃ", "dʒ", "ŋ"]:
        assert sound in mouths.KNOWN_SOUNDS, sound


# --- the board's reading ---------------------------------------------------------------------


def test_the_board_reads_a_mouth_leniently() -> None:
    read = mouth_of({"id": "m1", "word": "sheep", "stress": 3, "syllables": ["sheep"]})
    assert read is not None
    assert read.stress is None, "a stress outside the syllables is dropped, not the mouth"
    assert read.view == "front"
    assert mouth_of({"sound": "iː"}) is None
    side = mouth_of({"word": "think", "view": "side", "on": "think", "on_nth": 2})
    assert side is not None and side.view == "side"
    assert side.on is not None and side.on.nth == 2


def test_say_is_kept_for_a_mouth_brought_in_earlier() -> None:
    acts = doodle_actions(
        [
            {"say": SHEEP, "mouth": {"id": "m1", "word": "sheep"}},
            {"say": "ship", "doodle_do": [{"id": "m1", "op": "say", "word": "ship"}]},
            {"say": "x", "doodle_do": [{"id": "m2", "op": "say", "word": "ship"}]},
        ]
    )
    assert acts[1] is not None and acts[1][0].op == "say" and acts[1][0].word == "ship"
    assert acts[2] is None, "no mouth m2 was brought in"


# --- the sounds ------------------------------------------------------------------------------


def test_the_models_tokens_are_merged_into_sounds() -> None:
    timed = [
        ("ʃ", 0.52, 0.57),
        ("ˈ", 0.57, 0.64),
        ("i", 0.64, 0.69),
        ("ː", 0.69, 0.77),
        ("p", 0.77, 0.82),
        (",", 0.82, 0.84),
        (" ", 0.92, 0.95),
        ("t", 1.0, 1.05),
        ("ʃ", 1.05, 1.1),
    ]
    assert mouth_voice.merge_phones(timed) == [
        {"p": "ʃ", "start": 0.52, "end": 0.57},
        {"p": "iː", "start": 0.57, "end": 0.77},
        {"p": "p", "start": 0.77, "end": 0.82},
        {"p": "tʃ", "start": 1.0, "end": 1.1},
    ]


def test_studio_words_spread_over_the_clip_with_pauses() -> None:
    words = mouth_voice.studio_words(["Say", "sheep.", "Now", "ship."], 3.0)
    assert [w["w"] for w in words] == ["Say", "sheep.", "Now", "ship."]
    assert words[0]["start"] == pytest.approx(mouth_voice.STUDIO_LEAD_S)
    assert words[-1]["end"] <= 3.0 - mouth_voice.STUDIO_TAIL_S + 0.001
    gaps = [b["start"] - a["end"] for a, b in itertools.pairwise(words)]
    assert all(gap > 0 for gap in gaps)
    assert gaps[1] > gaps[0], "a full stop pauses longer than a space"


# --- British RP phonemes ---------------------------------------------------------------------

#: The plan's check list (docs/plans/2026-10-01-exact-lip-sync.md): each word in RP.
RP_CHECKS = {
    "enclosure": "ɪ n k l əʊ ʒ ə",
    "vision": "v ɪ ʒ ə n",
    "nation": "n eɪ ʃ ə n",
    "measure": "m e ʒ ə",
    "of": "ɒ v",
    "gnash": "n æ ʃ",
    "think": "θ ɪ ŋ k",
    "this": "ð ɪ s",
    "ship": "ʃ ɪ p",
    "sheep": "ʃ iː p",
    "boys": "b ɔɪ z",
    "hot": "h ɒ t",
    "dance": "d ɑː n s",
    "comfortable": "k ʌ m f t ə b ə l",
    "political": "p ə l ɪ t ɪ k ə l",
}


@pytest.mark.parametrize(("word", "rp"), RP_CHECKS.items())
def test_each_check_word_is_its_rp_transcription(word: str, rp: str) -> None:
    assert phonemes_rp.words_phonemes([word]) == [rp.split()]
    assert phonemes_rp.words_phonemes([word.capitalize() + "."]) == [rp.split()]


def test_the_closed_set_is_44_rp_phonemes() -> None:
    assert len(phonemes_rp.PHONEMES) == 44
    for sounds in phonemes_rp.LEXICON.values():
        assert set(sounds) <= phonemes_rp.PHONEMES


def test_espeaks_letters_become_rp_phonemes() -> None:
    normalise = phonemes_rp.normalise
    assert normalise("ɛŋklˈəʊʒɐ") == ["e", "ŋ", "k", "l", "əʊ", "ʒ", "ə"]
    assert normalise("ˈaʊɐ") == ["aʊ", "ə"]
    assert normalise("fˈaɪə") == ["f", "aɪ", "ə"]
    assert normalise("dʒˈʌdʒ") == ["dʒ", "ʌ", "dʒ"]
    assert normalise("tʃˈɜːtʃ") == ["tʃ", "ɜː", "tʃ"]
    assert normalise("hˈiə") == ["h", "ɪə"]
    assert normalise("ðˈeə") == ["ð", "eə"]
    assert normalise("ɹˈɛd") == ["r", "e", "d"]
    assert normalise("bˈʌɾɚ") == ["b", "ʌ", "t", "ə"]
    assert normalise("ɡˈəʊɪŋ") == ["g", "əʊ", "ɪ", "ŋ"]
    assert normalise("ɹˈəʊzᵻz") == ["r", "əʊ", "z", "ɪ", "z"]


def test_rp_drops_an_r_unless_a_vowel_follows(monkeypatch: pytest.MonkeyPatch) -> None:
    said = {"far": "fˈɑːɹ", "away": "ɐwˈeɪ", "card": "kˈɑːɹd", "red": "ɹˈɛd", "very": "vˈɛɹi"}
    monkeypatch.setattr(phonemes_rp, "_espeak", lambda words: [said[w] for w in words])
    got = phonemes_rp.words_phonemes(["far", "away", "card", "red", "very", "far."])
    assert got == [
        ["f", "ɑː", "r"],
        ["ə", "w", "eɪ"],
        ["k", "ɑː", "d"],
        ["r", "e", "d"],
        ["v", "e", "r", "ɪ"],
        ["f", "ɑː"],
    ], "a linking r before away; none before a consonant, or at the end of the line"


def test_espeaks_own_rp_matches_the_check_list(monkeypatch: pytest.MonkeyPatch) -> None:
    """Espeak's RP voice, normalised, without the lexicon: the lexicon only fixes enclosure,
    whose n espeak assimilates to the ŋ of a careless reading."""
    monkeypatch.setattr(phonemes_rp, "_espeak", _REAL_ESPEAK)
    monkeypatch.setattr(phonemes_rp, "LEXICON", {})
    words = list(RP_CHECKS)
    heard = phonemes_rp._espeak(words)
    if heard is None:
        pytest.skip("espeak-ng is not installed here")
    got = {word: phonemes_rp.words_phonemes([word])[0] for word in words}
    differ = {w for w in words if got[w] != RP_CHECKS[w].split()}
    assert differ <= {"enclosure"}, {w: got[w] for w in differ}


def test_without_espeak_letter_rules_still_give_rp_phonemes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(phonemes_rp, "_espeak", lambda words: None)
    got = phonemes_rp.words_phonemes(["Shipping", "teacher", "think", "sheep"])
    assert all(sounds and set(sounds) <= phonemes_rp.PHONEMES for sounds in got)
    assert got[3] == ["ʃ", "iː", "p"]


def _tiles(words: list[dict[str, Any]], phones: list[dict[str, Any]]) -> None:
    """Every phone is RP and names a real word; each word's phones tile its window."""
    assert all(p["p"] in phonemes_rp.PHONEMES for p in phones)
    assert all(isinstance(p["w"], int) and 0 <= p["w"] < len(words) for p in phones)
    assert [p["w"] for p in phones] == sorted(p["w"] for p in phones)
    for index, word in enumerate(words):
        mine = [p for p in phones if p["w"] == index]
        if not mine:
            continue
        assert mine[0]["start"] == word["start"] and mine[-1]["end"] == word["end"]
        assert all(a["end"] == b["start"] for a, b in itertools.pairwise(mine))
        assert all(p["end"] >= p["start"] for p in mine)


def test_the_phones_tile_each_words_window() -> None:
    words = [
        {"w": w, "start": round(0.1 + i * 0.61, 3), "end": round(0.1 + i * 0.61 + 0.457, 3)}
        for i, w in enumerate(RP_CHECKS)
    ]
    phones = phonemes_rp.align(words)
    _tiles(words, phones)
    said = " ".join(RP_CHECKS.values()).replace("m e ʒ ə", "m e ʒ ə r").split()
    assert [p["p"] for p in phones] == said, "measure of: a linking r"
    sheep = [p for p in phones if p["w"] == list(RP_CHECKS).index("sheep")]
    length = {p["p"]: p["end"] - p["start"] for p in sheep}
    assert length["iː"] > length["ʃ"] > length["p"], "a long vowel, then a fricative, then a stop"
    boys = [p for p in phones if p["w"] == list(RP_CHECKS).index("boys")]
    assert boys[1]["end"] - boys[1]["start"] == max(p["end"] - p["start"] for p in boys)


def test_the_voices_own_lengths_guide_a_word_where_they_line_up() -> None:
    words = [{"w": "Say", "start": 0.1, "end": 0.5}, {"w": "this", "start": 0.6, "end": 0.9}]
    guide = [
        {"p": "s", "start": 0.1, "end": 0.3},
        {"p": "e", "start": 0.3, "end": 0.4},
        {"p": "ɪ", "start": 0.4, "end": 0.5},
        {"p": "ð", "start": 0.6, "end": 0.7},
    ]
    phones = phonemes_rp.align(words, None, guide)
    _tiles(words, phones)
    assert phones[0] == {"p": "s", "start": 0.1, "end": 0.3, "w": 0}, "e+ɪ is one diphthong"
    assert phones[1] == {"p": "eɪ", "start": 0.3, "end": 0.5, "w": 0}
    this = [p for p in phones if p["w"] == 1]
    assert [p["p"] for p in this] == ["ð", "ɪ", "s"], "too few guides: typical lengths"


def _mp3(frames: int) -> bytes:
    # MPEG-1 layer III, 128 kbps, 44.1 kHz, no padding: 417 bytes a frame of 1152 samples.
    frame = bytes([0xFF, 0xFB, 0x90, 0x00]) + bytes(413)
    return b"ID3" + bytes([4, 0, 0, 0, 0, 0, 2]) + b"\x00\x00" + frame * frames


def test_an_mp3s_length_is_read_from_its_frames() -> None:
    assert mouth_voice.mp3_duration(_mp3(100)) == pytest.approx(100 * 1152 / 44100, abs=0.001)
    assert mouth_voice.mp3_duration(b"not audio") is None


def test_a_tapped_word_is_letters_and_at_most_three_words() -> None:
    assert mouth_voice.clean_word("  Sheep ") == "sheep"
    assert mouth_voice.clean_word("thirty three") == "thirty three"
    assert mouth_voice.clean_word("don't") == "don't"
    for bad in ["", "a b c d", "sh33p", "<b>", "x" * 41, "rm -rf"]:
        assert mouth_voice.clean_word(bad) is None, bad


# --- the endpoints ---------------------------------------------------------------------------

SESSION = "00000000-0000-0000-0000-000000000001"
VERSION = "00000000-0000-0000-0000-000000000002"
PHONES = f"/v1/practice/{SESSION}/lesson/{VERSION}/voice/0/phones"


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
    monkeypatch.setattr(
        phonemes_rp, "_espeak", lambda words: [ESPEAK_SAYS.get(w.lower(), "") for w in words]
    )
    mouth_router._made_for.clear()
    return tmp_path


@pytest.fixture
def paid(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    """Records any call to the paid voice, which the mouth must never make."""
    called: list[str] = []

    async def speak(line: str, *args: object, **kwargs: object) -> bytes:
        called.append(line)
        return b"studio-mp3"

    monkeypatch.setattr(tutor, "speak", speak)
    return called


@pytest.fixture
def model(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    """Kokoro replaced: 'says' the text as one token a letter, 0.1 s each, after the pad."""
    said: list[str] = []

    def timed(
        text: str, settings: Settings, speed: float
    ) -> tuple[Any, int, float, list[tuple[str, float, float]]]:
        said.append(f"{text}@{speed}")
        letters = [c for c in text if c.isalpha()]
        tokens = [(c, 0.08 + i * 0.1, 0.18 + i * 0.1) for i, c in enumerate(letters)]
        return [0.0], 24_000, 0.08 + len(letters) * 0.1 + 0.15, tokens

    monkeypatch.setattr(mouth_voice, "_kokoro_timed", timed)
    monkeypatch.setattr(kokoro_voice, "to_mp3", lambda audio, rate=24_000: b"word-mp3")

    def clip(text: str, settings: Settings) -> kokoro_voice.Clip:
        words = [
            {"w": w, "start": i * 0.3, "end": i * 0.3 + 0.25} for i, w in enumerate(text.split())
        ]
        return kokoro_voice.Clip(b"kokoro-mp3", 2.0, words)

    monkeypatch.setattr(kokoro_voice, "synthesize", clip)
    return said


@pytest.fixture
async def client(monkeypatch: pytest.MonkeyPatch) -> AsyncIterator[httpx.AsyncClient]:
    async def owner(*args: object, **kwargs: object) -> None:
        return None

    async def beats(*args: object, **kwargs: object) -> tuple[list[Any], str]:
        return [SimpleNamespace(say="Say sheep.")], "script"

    async def no_db() -> AsyncIterator[None]:
        yield None

    monkeypatch.setattr(mouth_router, "require_session_owner", owner)
    monkeypatch.setattr(mouth_router, "_lesson_is_open", owner)
    monkeypatch.setattr(premium, "check_voice", owner)  # Premium is tested in test_billing
    monkeypatch.setattr(mouth_router, "_lesson_beats", beats)
    app.dependency_overrides[connection] = no_db
    app.dependency_overrides[get_settings] = lambda: _settings()
    transport = httpx.ASGITransport(app=app)
    try:
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as made:
            yield made
    finally:
        app.dependency_overrides.pop(connection, None)
        app.dependency_overrides.pop(get_settings, None)


async def test_kokoro_phones_are_british_and_kept_as_the_clip_is_made(
    client: httpx.AsyncClient, model: list[str], paid: list[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    def clip(text: str, settings: Settings) -> kokoro_voice.Clip:
        tokens = [
            ("s", 0.08, 0.2),
            ("ˈ", 0.2, 0.22),
            ("e", 0.22, 0.3),
            ("ɪ", 0.3, 0.35),
            (" ", 0.35, 0.4),
            ("ʃ", 0.4, 0.5),
            ("ˈ", 0.5, 0.52),
            ("i", 0.52, 0.6),
            ("ː", 0.6, 0.7),
            ("p", 0.7, 0.8),
        ]
        words = [
            {"w": "Say", "start": 0.08, "end": 0.35},
            {"w": "sheep.", "start": 0.4, "end": 0.8},
        ]
        return kokoro_voice.Clip(b"kokoro-mp3", 2.0, words, False, tokens)

    monkeypatch.setattr(kokoro_voice, "synthesize", clip)
    got = await client.get(f"{PHONES}?engine=kokoro")
    assert got.status_code == 200
    body = got.json()
    assert body["engine"] == "kokoro" and body["estimated"] is False
    assert body["accent"] == "rp"
    assert [(p["p"], p["w"]) for p in body["phones"]] == [
        ("s", 0),
        ("eɪ", 0),
        ("ʃ", 1),
        ("iː", 1),
        ("p", 1),
    ]
    assert body["phones"][0]["end"] == pytest.approx(0.2), "the model's own lengths guide them"
    assert body["phones"][3] == {"p": "iː", "start": 0.5, "end": 0.7, "w": 1}
    assert [w["w"] for w in body["words"]] == ["Say", "sheep."]
    _tiles(body["words"], body["phones"])
    assert model == [], "the sounds came from the synthesis that made the clip"
    assert paid == []
    again = await client.get(f"{PHONES}?engine=kokoro")
    assert again.json() == body


async def test_kokoro_phones_for_an_older_clip_run_the_model_once(
    client: httpx.AsyncClient, model: list[str], paid: list[str], tmp_path: Path
) -> None:
    settings = _settings()
    clip = voice_store.path_for("Say sheep.", settings, "kokoro")
    clip.write_bytes(b"kokoro-mp3")
    words = [{"w": "Say", "start": 0.08, "end": 0.38}, {"w": "sheep.", "start": 0.38, "end": 0.88}]
    voice_store.words_path(clip).write_text(json.dumps({"words": words}), encoding="utf-8")
    body = (await client.get(f"{PHONES}?engine=kokoro")).json()
    assert body["accent"] == "rp"
    assert [p["p"] for p in body["phones"]] == ["s", "eɪ", "ʃ", "iː", "p"]
    _tiles(body["words"], body["phones"])
    assert len(model) == 1
    assert len(list(tmp_path.glob("*.phones.json"))) == 1
    assert (await client.get(f"{PHONES}?engine=kokoro")).json() == body
    assert len(model) == 1, "the second asking reads what was kept"
    assert paid == []


async def test_sounds_kept_before_the_mouth_spoke_rp_are_made_rp(
    client: httpx.AsyncClient, model: list[str]
) -> None:
    settings = _settings()
    clip = voice_store.path_for("Say sheep.", settings, "kokoro")
    clip.write_bytes(b"kokoro-mp3")
    before = {
        "engine": "kokoro",
        "duration": 1.0,
        "estimated": False,
        "words": [
            {"w": "Say", "start": 0.1, "end": 0.4},
            {"w": "sheep.", "start": 0.5, "end": 0.9},
        ],
        "phones": [{"p": "s", "start": 0.1, "end": 0.2}, {"p": "eɪ", "start": 0.2, "end": 0.4}],
    }
    mouth_voice.phones_path(clip).write_text(json.dumps(before), encoding="utf-8")
    body = (await client.get(f"{PHONES}?engine=kokoro")).json()
    assert body["accent"] == "rp"
    assert body["phones"][:2] == [
        {"p": "s", "start": 0.1, "end": 0.2, "w": 0},
        {"p": "eɪ", "start": 0.2, "end": 0.4, "w": 0},
    ]
    _tiles(body["words"], body["phones"])
    assert model == []


async def test_studio_phones_are_estimated_over_the_clip_without_paying(
    client: httpx.AsyncClient, paid: list[str]
) -> None:
    settings = _settings()
    assert (await client.get(PHONES)).status_code == 404, "no studio clip yet: nothing is made"
    assert paid == []
    clip = voice_store.path_for("Say sheep.", settings, "studio")
    clip.write_bytes(_mp3(60))
    body = (await client.get(PHONES)).json()
    assert body["engine"] == "studio" and body["estimated"] is True
    assert body["accent"] == "rp"
    assert body["duration"] == pytest.approx(60 * 1152 / 44100, abs=0.001)
    assert [p["p"] for p in body["phones"]] == ["s", "eɪ", "ʃ", "iː", "p"]
    assert [w["w"] for w in body["words"]] == ["Say", "sheep."]
    _tiles(body["words"], body["phones"])
    assert paid == []
    assert mouth_voice.phones_path(clip).is_file()


async def test_a_tapped_word_is_said_slowly_by_kokoro_and_kept(
    client: httpx.AsyncClient, model: list[str], paid: list[str]
) -> None:
    got = await client.get(f"/v1/practice/{SESSION}/mouth/say", params={"word": "Sheep"})
    assert got.status_code == 200
    body = got.json()
    assert body["engine"] == "kokoro" and body["word"] == "sheep"
    assert body["accent"] == "rp"
    assert body["audio"].startswith("data:audio/mpeg;base64,")
    assert body["words"] == [{"w": "sheep", "start": 0.08, "end": 0.58}]
    assert [p["p"] for p in body["phones"]] == ["ʃ", "iː", "p"]
    _tiles(body["words"], body["phones"])
    assert model == [f"sheep@{mouth_voice.WORD_SPEED}"]
    again = await client.get(f"/v1/practice/{SESSION}/mouth/say", params={"word": "sheep"})
    assert again.json() == body
    assert len(model) == 1, "a word already made is read, not made again"
    assert paid == []


def test_a_tapped_phrases_words_are_parted_by_the_models_spaces() -> None:
    timed = [("s", 0.1, 0.2), ("e", 0.2, 0.3), (" ", 0.3, 0.35), ("n", 0.35, 0.5)]
    assert mouth_voice.word_windows(["say", "now"], timed) == [
        {"w": "say", "start": 0.1, "end": 0.3},
        {"w": "now", "start": 0.35, "end": 0.5},
    ]
    shared = mouth_voice.word_windows(["say", "now", "sheep"], timed)
    assert shared[0]["start"] == 0.1 and shared[-1]["end"] == 0.5


@pytest.mark.parametrize("word", ["sh33p", "one two three four", "<script>", "x" * 41])
async def test_a_tapped_word_must_be_a_few_letters(client: httpx.AsyncClient, word: str) -> None:
    got = await client.get(f"/v1/practice/{SESSION}/mouth/say", params={"word": word})
    assert got.status_code == 422


async def test_new_tapped_words_are_limited_per_sitting(
    client: httpx.AsyncClient, model: list[str]
) -> None:
    letters = "abcdefghijklmnopqrstuvwxyz"
    for k in range(mouth_router.WORDS_PER_WINDOW):
        word = "w" + letters[k]
        got = await client.get(f"/v1/practice/{SESSION}/mouth/say", params={"word": word})
        assert got.status_code == 200, word
    over = await client.get(f"/v1/practice/{SESSION}/mouth/say", params={"word": "wzz"})
    assert over.status_code == 429
    kept = await client.get(f"/v1/practice/{SESSION}/mouth/say", params={"word": "wa"})
    assert kept.status_code == 200, "a word already made is still free"


async def test_without_kokoro_a_tapped_word_is_refused_not_paid_for(
    client: httpx.AsyncClient, paid: list[str]
) -> None:
    app.dependency_overrides[get_settings] = lambda: _settings(ai_kokoro=False)
    got = await client.get(f"/v1/practice/{SESSION}/mouth/say", params={"word": "sheep"})
    assert got.status_code == 503
    assert paid == []


def test_the_kept_phones_are_json_beside_the_clip(tmp_path: Path) -> None:
    clip = tmp_path / "abc.mp3"
    assert mouth_voice.phones_path(clip).name == "abc.phones.json"
    json.dumps({"phones": mouth_voice.merge_phones([("a", 0.0, 0.1)])})
