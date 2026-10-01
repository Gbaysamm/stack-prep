"""The talking mouth's sounds: when each phoneme of a spoken line is said.

The lesson board's mouth (docs/plans/doodles-v2-contract.md section 7) moves through the shapes
of a word's sounds in time with the voice, so it needs the line's phonemes and their times:
`phones: [{p, start, end}]`, in IPA, in seconds into the clip.

* THE KOKORO VOICE knows them: the model reports how long it holds every phoneme. They are
  kept from the synthesis that makes the clip, as it is made, so asking for them is a file
  read (a clip made before that has the model run again: it is deterministic, so the times
  are the same, but it takes a second or more, which the board covers with an estimate),
  merged from the model's
  one-character tokens into sounds (a stress mark goes with the vowel after it, a length mark
  with the vowel before it, t+ʃ is one sound), and kept beside the clip as
  `<name>.phones.json`.
* THE STUDIO VOICE gives no timings. Its line is phonemized with the espeak that comes with
  Kokoro (free, on this server) and the sounds are spread over the clip's real length, read
  from the mp3's frames, by how long each kind of sound usually takes. `estimated` says so.

And `say_word`: a short word said slowly by Kokoro, for a student who taps the mouth to hear
it again. Free, kept once made, letters only, and never the paid voice.
"""

from __future__ import annotations

import base64
import hashlib
import json
import logging
import re
from pathlib import Path
from typing import Any

from app import kokoro_voice, tutor, voice_store
from app.config import Settings

_log = logging.getLogger(__name__)

#: How fast the tapped word is said: slower than the lesson, so each sound can be seen.
WORD_SPEED = 0.8
#: The most a tapped request may ask to hear: a word or a short phrase.
MAX_WORDS = 3
MAX_WORD_CHARS = 40
_WORD = re.compile(r"[A-Za-z]+(?:['\u2019-][A-Za-z]+)*")

_STRESS = frozenset("\u02c8\u02cc")
_LONG = "\u02d0"
#: Not a sound: a pause, or punctuation the voice times.
_GAPS = frozenset(" .,!?;:\u2014\u2026\"()\u201c\u201d-'")
#: Kokoro's own letters for some diphthongs and affricates (misaki), as IPA.
_SPELLED = {
    "\u02a7": "t\u0283",
    "\u02a4": "d\u0292",
    "A": "e\u026a",
    "I": "a\u026a",
    "O": "o\u028a",
    "W": "a\u028a",
    "Y": "\u0254\u026a",
    "\u1d4a": "\u0259",
}
_AFFRICATES = {("t", "\u0283"): "t\u0283", ("d", "\u0292"): "d\u0292"}
_VOWELS = frozenset(
    "aeiou\u00e6\u0251\u0252\u0254\u0259\u025a\u025b\u025c\u026a\u028a\u028c\u0250\u1d7b"
)


def merge_phones(timed: list[tuple[str, float, float]]) -> list[dict[str, Any]]:
    """The model's timed one-character tokens as timed sounds.

    A stress mark's time goes to the vowel after it (it is the start of that syllable), a
    length mark's to the vowel before it; spaces and punctuation are gaps, not sounds.
    """
    out: list[dict[str, Any]] = []
    pending: float | None = None
    joinable = False
    for token, start, end in timed:
        if token in _STRESS:
            pending = start if pending is None else pending
            joinable = False
            continue
        if token in _GAPS:
            pending = None
            joinable = False
            continue
        if token == _LONG:
            if out and joinable:
                out[-1]["p"] += _LONG
                out[-1]["end"] = round(end, 3)
            continue
        sound = _SPELLED.get(token, token)
        if out and joinable and pending is None and (out[-1]["p"], sound) in _AFFRICATES:
            out[-1]["p"] = _AFFRICATES[(out[-1]["p"], sound)]
            out[-1]["end"] = round(end, 3)
            continue
        begin = pending if pending is not None else start
        out.append({"p": sound, "start": round(begin, 3), "end": round(max(begin, end), 3)})
        pending = None
        joinable = True
    return out


# --- the studio voice: phonemized here, spread over the clip --------------------------------

_tokenizer: Any = None


def phonemize(text: str) -> str | None:
    """The line in IPA, by the espeak that comes with Kokoro. None where it is not installed."""
    global _tokenizer
    if not kokoro_voice._installed():
        return None
    try:
        if _tokenizer is None:
            from kokoro_onnx.tokenizer import Tokenizer

            _tokenizer = Tokenizer()
        return str(_tokenizer.phonemize(text))
    except Exception as failed:
        _log.warning("phonemizer failed: %s: %s", type(failed).__name__, failed)
        return None


#: How long a pause the punctuation makes, against an ordinary consonant's 1.
_PAUSES = {",": 2.2, ";": 2.6, ":": 2.6, ".": 3.2, "!": 3.2, "?": 3.2, "—": 2.2}


def _weighed(phonemes: str) -> list[tuple[str | None, float]]:
    """Each sound with how long it usually takes, and None for a gap with its length."""
    timed: list[tuple[str, float, float]] = []
    at = 0.0
    for token in phonemes:
        if token in _PAUSES:
            span = _PAUSES[token]
        elif token == " ":
            span = 0.35
        elif token in _STRESS:
            span = 0.3
        elif token == _LONG:
            span = 0.7
        elif token in _GAPS:
            span = 0.0
        else:
            span = 1.35 if token in _VOWELS else 1.0
        timed.append((token, at, at + span))
        at += span
    sounds = merge_phones(timed)
    out: list[tuple[str | None, float]] = []
    at = 0.0
    for sound in sounds:
        if sound["start"] > at:
            out.append((None, sound["start"] - at))
        out.append((sound["p"], sound["end"] - sound["start"]))
        at = sound["end"]
    return out


#: The studio clip's speech is taken to start this far in and end this far from the end.
STUDIO_LEAD_S = 0.08
STUDIO_TAIL_S = 0.12


def estimated_phones(phonemes: str, duration: float) -> list[dict[str, Any]]:
    """The sounds spread over the clip's speech by how long each kind usually takes."""
    weighed = _weighed(phonemes)
    total = sum(span for _, span in weighed)
    start, end = STUDIO_LEAD_S, max(STUDIO_LEAD_S, duration - STUDIO_TAIL_S)
    if total <= 0 or end <= start:
        return []
    scale = (end - start) / total
    out: list[dict[str, Any]] = []
    at = start
    for sound, span in weighed:
        if sound is not None:
            out.append({"p": sound, "start": round(at, 3), "end": round(at + span * scale, 3)})
        at += span * scale
    return out


def estimated_word_times(
    said: str, phonemes: str, phones: list[dict[str, Any]], duration: float
) -> list[dict[str, Any]]:
    """The words placed over the estimated sounds where espeak kept them one for one, else
    shared out by length."""
    words = said.split()
    groups = [group for group in phonemes.split(" ") if any(c not in _GAPS for c in group)]
    if len(groups) == len(words) and phones:
        placed, k = [], 0
        for word, group in zip(words, groups, strict=True):
            count = len(merge_phones([(c, 0.0, 0.0) for c in group]))
            mine = phones[k : k + count]
            k += count
            if not mine:
                return kokoro_voice.estimated_words(words, STUDIO_LEAD_S, duration - STUDIO_TAIL_S)
            placed.append({"w": word, "start": mine[0]["start"], "end": mine[-1]["end"]})
        return placed
    return kokoro_voice.estimated_words(words, STUDIO_LEAD_S, duration - STUDIO_TAIL_S)


_BITRATES = {
    # (version is MPEG-1, layer III) and (MPEG-2/2.5, layer III), in kbps by index.
    True: (0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320),
    False: (0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160),
}
_RATES = {3: (44100, 48000, 32000), 2: (22050, 24000, 16000), 0: (11025, 12000, 8000)}


def mp3_duration(data: bytes) -> float | None:
    """Seconds of audio in an mp3 (layer III), by counting its frames. None if it is not one."""
    at = 0
    if data[:3] == b"ID3" and len(data) >= 10:
        size = (data[6] << 21) | (data[7] << 14) | (data[8] << 7) | data[9]
        at = 10 + size
    seconds, frames = 0.0, 0
    while at + 4 <= len(data):
        if data[at] != 0xFF or (data[at + 1] & 0xE0) != 0xE0:
            at += 1
            continue
        version = (data[at + 1] >> 3) & 0x3
        layer = (data[at + 1] >> 1) & 0x3
        rate_index = (data[at + 2] >> 2) & 0x3
        bit_index = (data[at + 2] >> 4) & 0xF
        padding = (data[at + 2] >> 1) & 0x1
        if version == 1 or layer != 1 or rate_index == 3 or bit_index in (0, 15):
            at += 1
            continue
        mpeg1 = version == 3
        rate = _RATES[version][rate_index]
        kbps = _BITRATES[mpeg1][bit_index]
        samples = 1152 if mpeg1 else 576
        length = (samples // 8) * kbps * 1000 // rate + padding
        if length <= 4:
            at += 1
            continue
        seconds += samples / rate
        frames += 1
        at += length
    return round(seconds, 3) if frames else None


# --- the clip's sounds, kept beside it -------------------------------------------------------


def phones_path(clip: Path) -> Path:
    return clip.with_name(f"{clip.stem}.phones.json")


def _kokoro_timed(
    said: str, settings: Settings, speed: float
) -> tuple[Any, int, float, list[tuple[str, float, float]]] | None:
    """Kokoro's audio for `said`, trimmed as the lesson's clips are, with its timed tokens."""
    if not said.strip() or not kokoro_voice.available(settings):
        return None
    try:
        kokoro = kokoro_voice._model(settings)
        heard = " ".join(kokoro_voice.say_as(word) for word in said.split())
        with kokoro_voice._speaking:
            audio, rate, timed = kokoro.create_timed(heard, settings.kokoro_voice, speed=speed)
            audio, moved = kokoro_voice.trim(audio, rate)
        duration = len(audio) / rate
        shifted = [
            (t.phoneme, max(0.0, t.start + moved), min(duration, t.end + moved)) for t in timed
        ]
        return audio, rate, duration, shifted
    except Exception as failed:
        _log.warning("kokoro failed: %s: %s", type(failed).__name__, failed)
        return None


def _read(path: Path) -> dict[str, Any] | None:
    if not path.is_file():
        return None
    try:
        kept: dict[str, Any] = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return kept


def keep_kokoro_phones(clip_path: Path, clip: kokoro_voice.Clip) -> None:
    """Keep a Kokoro clip's sounds beside it as it is made (voice_store._made_by_kokoro)."""
    phones = merge_phones(clip.tokens)
    if not phones:
        return
    found = {
        "engine": "kokoro",
        "duration": round(clip.duration, 3),
        "estimated": False,
        "words": clip.words,
        "phones": phones,
    }
    voice_store.write_atomically(
        phones_path(clip_path), json.dumps(found, ensure_ascii=False).encode()
    )


def beat_phones(line: str, settings: Settings, engine: voice_store.Engine) -> dict[str, Any] | None:
    """`{engine, duration, estimated, words, phones}` for a line whose clip is already made.

    Blocking (it may run the model or espeak): run it in a thread. None when the clip is not
    there, or its sounds cannot be had. Never calls the paid voice: a studio clip is only read.
    """
    heard_by = voice_store.engine_for(engine, settings)
    clip = voice_store.path_for(line, settings, heard_by)
    kept = _read(phones_path(clip))
    if kept is not None:
        return kept
    if not clip.is_file():
        return None
    said = tutor.for_the_voice(line)
    found: dict[str, Any] | None = None
    if heard_by == "kokoro":
        made = _kokoro_timed(said, settings, settings.kokoro_speed)
        words = _read(voice_store.words_path(clip))
        if made is not None:
            _, _, duration, timed = made
            phones = merge_phones(timed)
            found = {
                "engine": "kokoro",
                "duration": round(duration, 3),
                "estimated": False,
                # Written with the clip, before it (voice_store._made_by_kokoro).
                "words": (words or {}).get("words") or [],
                "phones": phones,
            }
    else:
        length = mp3_duration(clip.read_bytes())
        phonemes = phonemize(said)
        if length is not None and phonemes:
            duration = length
            phones = estimated_phones(phonemes, duration)
            found = {
                "engine": "studio",
                "duration": duration,
                "estimated": True,
                "words": estimated_word_times(said, phonemes, phones, duration),
                "phones": phones,
            }
    if found is None or not found["phones"]:
        return None
    voice_store.write_atomically(phones_path(clip), json.dumps(found, ensure_ascii=False).encode())
    return found


# --- a word said again, slowly, when the mouth is tapped -------------------------------------


def clean_word(asked: str) -> str | None:
    """The word or short phrase to say, or None where it is not letters, or too long."""
    words = asked.split()
    if not 1 <= len(words) <= MAX_WORDS or not all(_WORD.fullmatch(word) for word in words):
        return None
    joined = " ".join(words).lower()
    return joined if len(joined) <= MAX_WORD_CHARS else None


def word_path(word: str, settings: Settings) -> Path:
    key = (
        f"mouth|{settings.kokoro_model}|{settings.kokoro_voice}|{WORD_SPEED}"
        f"|{kokoro_voice.RECIPE}|{word}"
    )
    return voice_store.folder() / f"{hashlib.sha256(key.encode()).hexdigest()}.mp3"


def word_kept(word: str, settings: Settings) -> dict[str, Any] | None:
    """The word as already said and kept, if it has been."""
    clip = word_path(word, settings)
    kept = _read(phones_path(clip))
    if kept is None or not clip.is_file():
        return None
    return {**kept, "audio": _data_url(clip.read_bytes())}


def _data_url(mp3: bytes) -> str:
    return "data:audio/mpeg;base64," + base64.b64encode(mp3).decode("ascii")


def say_word(word: str, settings: Settings) -> dict[str, Any] | None:
    """`{engine, word, duration, phones, audio}`: the word said slowly by Kokoro, kept.

    Blocking: run it in a thread. `word` is already through `clean_word`. None when Kokoro is
    not on offer here; the board then moves the mouth without a voice.
    """
    kept = word_kept(word, settings)
    if kept is not None:
        return kept
    made = _kokoro_timed(word, settings, WORD_SPEED)
    if made is None:
        return None
    audio, rate, duration, timed = made
    try:
        mp3 = kokoro_voice.to_mp3(audio, rate)
    except Exception as failed:
        _log.warning("kokoro encoding failed: %s: %s", type(failed).__name__, failed)
        return None
    found = {
        "engine": "kokoro",
        "word": word,
        "duration": round(duration, 3),
        "phones": merge_phones(timed),
    }
    clip = word_path(word, settings)
    voice_store.write_atomically(phones_path(clip), json.dumps(found, ensure_ascii=False).encode())
    voice_store.write_atomically(clip, mp3)
    return {**found, "audio": _data_url(mp3)}
