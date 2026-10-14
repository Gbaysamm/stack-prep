"""The talking mouth's sounds: when each phoneme of a spoken line is said.

The lesson board's mouth (docs/plans/doodles-v2-contract.md section 7, and
docs/plans/2026-10-01-exact-lip-sync.md) shows each word's lip sequence in time with the voice,
so it needs the line's words and their sounds: `words: [{w, start, end}]` and
`phones: [{p, start, end, w}]`, in seconds into the clip. The sounds are British RP whatever the
voice (`accent: "rp"`, app/phonemes_rp.py): one RP phoneme each, `w` the index of their word,
and each word's sounds tile its window.

* THE KOKORO VOICE knows when each word is said: the model reports how long it holds every
  phoneme. The words' windows are kept from the synthesis that makes the clip, and its own
  (American) phonemes, merged from one-character tokens into sounds, guide how a word's
  window is shared among its RP sounds where they line up one for one. They are kept beside
  the clip as `<name>.phones.json` as it is made, so asking for them is a file read (a clip
  made before that has the model run again: it is deterministic, so the times are the same).
* THE STUDIO VOICE gives no timings. Its words are spread over the clip's real length, read
  from the mp3's frames, by their RP sounds' typical lengths and the pauses their punctuation
  makes. `estimated` says so.

And `say_word`: a short word said slowly by Kokoro, for a student who taps the mouth to hear
it again, with its RP sounds timed the same way. Free, kept once made, letters only, and
never the paid voice.
"""

from __future__ import annotations

import base64
import hashlib
import json
import logging
import re
from pathlib import Path
from typing import Any

from app import kokoro_voice, phonemes_rp, tutor, voice_store
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


# --- the RP sounds, in each word's window ----------------------------------------------------

#: How long a pause the punctuation after a word makes, against an ordinary consonant's 1.
_PAUSES = {",": 2.2, ";": 2.6, ":": 2.6, ".": 3.2, "!": 3.2, "?": 3.2, "—": 2.2}
_BETWEEN_WORDS = 0.35

#: The studio clip's speech is taken to start this far in and end this far from the end.
STUDIO_LEAD_S = 0.08
STUDIO_TAIL_S = 0.12


def studio_words(words: list[str], duration: float) -> list[dict[str, Any]]:
    """The studio clip's words placed over its speech by their RP sounds' typical lengths,
    with the pauses their punctuation makes. The paid voice gives no timings."""
    start, end = STUDIO_LEAD_S, max(STUDIO_LEAD_S, duration - STUDIO_TAIL_S)
    sounds = phonemes_rp.words_phonemes(words)
    spans: list[tuple[float, float]] = []
    for index, (word, mine) in enumerate(zip(words, sounds, strict=True)):
        length = sum(phonemes_rp.weights(mine)) if mine else 0.5
        gap = 0.0
        if index + 1 < len(words):
            trail = word.rstrip()[-1:]
            gap = _BETWEEN_WORDS + _PAUSES.get(trail, 0.0)
        spans.append((length, gap))
    total = sum(length + gap for length, gap in spans)
    if not words or total <= 0 or end <= start:
        return []
    scale = (end - start) / total
    placed: list[dict[str, Any]] = []
    at = start
    for word, (length, gap) in zip(words, spans, strict=True):
        finish = min(end, at + length * scale)
        placed.append({"w": word, "start": round(at, 3), "end": round(finish, 3)})
        at = finish + gap * scale
    return placed


def rp_sounds(
    engine: str,
    duration: float,
    estimated: bool,
    words: list[dict[str, Any]],
    guide: list[dict[str, Any]],
) -> dict[str, Any]:
    """`{engine, duration, estimated, accent, words, phones}`, the phones British RP.

    The Kokoro voice was given some words respelled (kokoro_voice.SAY_AS), so it is those
    the mouth says; `guide` is the voice's own timed sounds, which share a word's window out
    where they line up one for one with its RP sounds.
    """
    heard = [
        kokoro_voice.say_as(str(word["w"])) if engine == "kokoro" else str(word["w"])
        for word in words
    ]
    return {
        "engine": engine,
        "duration": round(duration, 3),
        "estimated": estimated,
        "accent": phonemes_rp.ACCENT,
        "words": words,
        "phones": phonemes_rp.align(words, heard, guide),
    }


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
    if not clip.words:
        return
    found = rp_sounds("kokoro", clip.duration, False, clip.words, merge_phones(clip.tokens))
    if not found["phones"]:
        return
    voice_store.write_atomically(
        phones_path(clip_path), json.dumps(found, ensure_ascii=False).encode()
    )


def _from_before(kept: dict[str, Any]) -> dict[str, Any] | None:
    """Sounds kept before the mouth spoke RP, made RP: their words' windows are kept, and
    their (American) sounds are the guide."""
    words = kept.get("words") or []
    if not words:
        return None
    return rp_sounds(
        str(kept.get("engine", "kokoro")),
        float(kept.get("duration", 0.0)),
        bool(kept.get("estimated", False)),
        words,
        kept.get("phones") or [] if kept.get("engine") == "kokoro" else [],
    )


def beat_phones(line: str, settings: Settings, engine: voice_store.Engine) -> dict[str, Any] | None:
    """`{engine, duration, estimated, accent, words, phones}` for a line whose clip is made.

    `phones` are British RP, one phoneme each, with `w` the index of their word in `words`;
    each word's phones tile its window. Blocking (it may run the model or espeak): run it in
    a thread. None when the clip is not there, or its sounds cannot be had. Never calls the
    paid voice: a studio clip is only read.
    """
    heard_by = voice_store.engine_for(engine, settings)
    clip = voice_store.path_for(line, settings, heard_by)
    kept = _read(phones_path(clip))
    if kept is not None and kept.get("accent") == phonemes_rp.ACCENT:
        return kept
    if not clip.is_file():
        return None
    found: dict[str, Any] | None = _from_before(kept) if kept is not None else None
    said = tutor.for_the_voice(line)
    if found is not None:
        pass
    elif heard_by == "kokoro":
        # Written with the clip, before it (voice_store._made_by_kokoro).
        words = (_read(voice_store.words_path(clip)) or {}).get("words") or []
        made = _kokoro_timed(said, settings, settings.kokoro_speed) if words else None
        if made is not None:
            _, _, duration, timed = made
            found = rp_sounds("kokoro", duration, False, words, merge_phones(timed))
    else:
        length = mp3_duration(clip.read_bytes())
        if length is not None:
            found = rp_sounds("studio", length, True, studio_words(said.split(), length), [])
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


def word_windows(words: list[str], timed: list[tuple[str, float, float]]) -> list[dict[str, Any]]:
    """A tapped word's (or short phrase's) words in time, from the model's timed tokens: its
    spaces part the words where they are as many as the words, else the words share the span
    of its sounds by length."""
    groups: list[list[tuple[str, float, float]]] = [[]]
    for token in timed:
        if token[0] == " ":
            groups.append([])
        elif token[0] not in _GAPS:
            groups[-1].append(token)
    groups = [group for group in groups if group]
    if not groups:
        return []
    if len(groups) == len(words):
        return [
            {"w": word, "start": round(group[0][1], 3), "end": round(group[-1][2], 3)}
            for word, group in zip(words, groups, strict=True)
        ]
    return kokoro_voice.estimated_words(words, groups[0][0][1], groups[-1][-1][2])


def word_kept(word: str, settings: Settings) -> dict[str, Any] | None:
    """The word as already said and kept, if it has been (made RP if kept before that)."""
    clip = word_path(word, settings)
    kept = _read(phones_path(clip))
    if kept is None or not clip.is_file():
        return None
    if kept.get("accent") != phonemes_rp.ACCENT:
        phones = kept.get("phones") or []
        if not phones:
            return None
        windows = kokoro_voice.estimated_words(
            word.split(), float(phones[0]["start"]), float(phones[-1]["end"])
        )
        kept = {
            **rp_sounds("kokoro", float(kept.get("duration", 0.0)), False, windows, phones),
            "word": word,
        }
        voice_store.write_atomically(
            phones_path(clip), json.dumps(kept, ensure_ascii=False).encode()
        )
    return {**kept, "audio": _data_url(clip.read_bytes())}


def _data_url(mp3: bytes) -> str:
    return "data:audio/mpeg;base64," + base64.b64encode(mp3).decode("ascii")


def say_word(word: str, settings: Settings) -> dict[str, Any] | None:
    """`{engine, word, duration, estimated, accent, words, phones, audio}`: the word said
    slowly by Kokoro, kept, with its British RP sounds timed as `beat_phones` times a line's.

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
    windows = word_windows(word.split(), timed)
    found = {**rp_sounds("kokoro", duration, False, windows, merge_phones(timed)), "word": word}
    clip = word_path(word, settings)
    voice_store.write_atomically(phones_path(clip), json.dumps(found, ensure_ascii=False).encode())
    voice_store.write_atomically(clip, mp3)
    return {**found, "audio": _data_url(mp3)}
