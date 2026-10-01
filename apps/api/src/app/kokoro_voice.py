"""Kokoro: a free voice for the lesson board, made on this server.

WHY A SECOND VOICE. The studio voice is a hosted model, paid per line. Kokoro is an open model
(82M parameters) that runs on the API's own CPU, offline once its files are here, so a lesson
can be voiced for nothing. It is the voice of the explainer videos (`af_heart`, through the
same ONNX export SternHost uses), offered beside the studio voice so the two can be compared.

HOW. `kokoro-onnx` runs the model with onnxruntime and turns text into phonemes with espeak-ng.
The model reports how long it holds every phoneme, which is what places each word in time.
The clip is trimmed the way SternHost trims it (80 ms before the first sound, 150 ms after the
last) and encoded to mp3 with LAME, the same format the studio clips are kept in.

OPTIONAL. Both packages are the `kokoro` extra of this app and imported only here, lazily. A
deployment without them, or with `ai_kokoro` off, simply does not offer the voice: `available`
says no and the caller uses the studio voice instead.

Never raises out of `synthesize`'s callers' way: a failure is logged and returns None, so the
board treats it as silence, the same contract `tutor.speak` has.
"""

from __future__ import annotations

import importlib.util
import json
import logging
import threading
import time
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from app.config import Settings

_log = logging.getLogger(__name__)

_REPO_ROOT = Path(__file__).resolve().parents[4]

#: Where the model files come from: the kokoro-onnx project's own release, whose v1.1 export
#: carries the per-phoneme `duration` output the word timings are read from.
RELEASE = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1"
VOICES_FILE = "voices-v1.0.bin"

#: Bumped whenever trimming or encoding changes, so a kept clip is never one made another way.
RECIPE = "trim80-150|mp3-64k|say-as-1"

SAMPLE_RATE = 24_000
PAD_BEFORE_S = 0.080
PAD_AFTER_S = 0.150
#: Quieter than this is silence when trimming, as in SternHost's tts.mjs.
SILENCE = 0.01
MP3_KBPS = 64

#: Punctuation and spaces in the phoneme stream: timed, but not a sound of any word.
_NOT_A_SOUND = frozenset(" .,!?;:—…\"()“”-'")


@dataclass
class Clip:
    mp3: bytes
    #: Seconds of audio, pads included.
    duration: float
    #: Each spoken word and when it is said, in seconds from the start of the clip.
    words: list[dict[str, Any]] = field(default_factory=list)
    #: True when the times are shared out by length rather than read from the model.
    estimated: bool = False

    def timings(self) -> dict[str, Any]:
        return {
            "engine": "kokoro",
            "duration": round(self.duration, 3),
            "estimated": self.estimated,
            "words": self.words,
        }


def folder(settings: Settings) -> Path:
    configured = settings.kokoro_dir.strip()
    return Path(configured) if configured else _REPO_ROOT / ".local" / "kokoro"


def _installed() -> bool:
    return all(importlib.util.find_spec(name) is not None for name in ("kokoro_onnx", "lameenc"))


def _files(settings: Settings) -> tuple[Path, Path]:
    where = folder(settings)
    return where / settings.kokoro_model, where / VOICES_FILE


#: After the model fails to load, it is not tried again for this long: every attempt would
#: cost a student a long wait for the same failure.
BROKEN_REST_SECONDS = 600.0
_broken_until = 0.0
_loaded: Any = None
_loading = threading.Lock()
#: One clip at a time. onnxruntime already spreads one clip over every core, so two at once
#: only make both late.
_speaking = threading.Lock()


def available(settings: Settings) -> bool:
    """Whether this deployment can voice a line with Kokoro now (or after a download)."""
    if not settings.ai_kokoro or not _installed() or time.monotonic() < _broken_until:
        return False
    model, voices = _files(settings)
    return settings.kokoro_download or (model.is_file() and voices.is_file())


def download(settings: Settings) -> tuple[Path, Path]:
    """Fetch the model and voices into `folder`, if they are not already there."""
    for path in _files(settings):
        if path.is_file():
            continue
        path.parent.mkdir(parents=True, exist_ok=True)
        partial = path.with_suffix(path.suffix + ".part")
        _log.info("fetching %s", path.name)
        urllib.request.urlretrieve(f"{RELEASE}/{path.name}", partial)
        partial.replace(path)
    return _files(settings)


def _model(settings: Settings) -> Any:
    global _loaded
    with _loading:
        if _loaded is None:
            model, voices = _files(settings)
            if not (model.is_file() and voices.is_file()):
                if not settings.kokoro_download:
                    raise FileNotFoundError(f"Kokoro's files are not in {folder(settings)}")
                download(settings)
            from kokoro_onnx import Kokoro

            _loaded = Kokoro(str(model), str(voices))
        return _loaded


def trim(audio: Any, sample_rate: int = SAMPLE_RATE) -> tuple[Any, float]:
    """The clip cut to its sound with SternHost's pads, and how far it moved (seconds).

    The pads are made of silence rather than borrowed from the clip, so every clip starts
    and ends the same way however tightly the model trimmed its own.
    """
    import numpy as np

    loud = np.flatnonzero(np.abs(audio) >= SILENCE)
    if loud.size == 0:
        return audio, 0.0
    first, last = int(loud[0]), int(loud[-1])
    before = np.zeros(round(PAD_BEFORE_S * sample_rate), dtype=audio.dtype)
    after = np.zeros(round(PAD_AFTER_S * sample_rate), dtype=audio.dtype)
    cut = np.concatenate([before, audio[first : last + 1], after])
    return cut, PAD_BEFORE_S - first / sample_rate


def to_mp3(audio: Any, sample_rate: int = SAMPLE_RATE) -> bytes:
    import lameenc
    import numpy as np

    pcm = (np.clip(audio, -1.0, 1.0) * 32767).astype("<i2").tobytes()
    encoder = lameenc.Encoder()
    encoder.set_bit_rate(MP3_KBPS)
    encoder.set_in_sample_rate(sample_rate)
    encoder.set_channels(1)
    encoder.set_quality(2)
    return bytes(encoder.encode(pcm) + encoder.flush())


#: Stress and length marks: timed by the model, but written on one word and not another
#: depending on the words around it, so they are left out when the two are lined up.
_MARKS = frozenset("\u02c8\u02cc\u02d0")


def _sounds(phonemes: str) -> str:
    return "".join(p for p in phonemes if p not in _NOT_A_SOUND and p not in _MARKS)


def words_from_phonemes(
    words: list[str], word_phonemes: list[str], timed: list[tuple[str, float, float]]
) -> list[dict[str, Any]]:
    """Place each word in time from the model's per-phoneme timings.

    The model times the phonemes of the whole line; espeak does not say where one word's
    phonemes end ("500" comes back as one run, "fivehundred", and "of the" as "ʌvðə"). So
    each word is phonemized on its own, the words' sounds laid end to end are lined up with
    the line's timed sounds, and a word runs from the first of its sounds to the last. The
    few sounds context changes between the two are skipped; a word none of whose sounds line
    up sits between its neighbours.
    """
    import difflib

    sounds = [
        (p, start, end) for p, start, end in timed if p not in _NOT_A_SOUND and p not in _MARKS
    ]
    owner: list[int] = []
    for index, phonemes in enumerate(word_phonemes):
        owner += [index] * len(_sounds(phonemes))
    if not sounds or not owner:
        return []
    ours = "".join(_sounds(p) for p in word_phonemes)
    theirs = "".join(p for p, _, _ in sounds)
    spans: list[list[int]] = [[] for _ in words]
    matcher = difflib.SequenceMatcher(None, ours, theirs, autojunk=False)
    for block in matcher.get_matching_blocks():
        for offset in range(block.size):
            spans[owner[block.a + offset]].append(block.b + offset)

    placed: list[dict[str, Any]] = []
    for index, word in enumerate(words):
        if spans[index]:
            start, end = sounds[min(spans[index])][1], sounds[max(spans[index])][2]
        else:
            start = placed[-1]["end"] if placed else sounds[0][1]
            later = next((sounds[min(s)][1] for s in spans[index + 1 :] if s), start)
            end = max(start, later)
        if placed:
            start = max(start, placed[-1]["end"])
        placed.append({"w": word, "start": round(start, 3), "end": round(max(start, end), 3)})
    return placed


def estimated_words(words: list[str], start: float, end: float) -> list[dict[str, Any]]:
    """Words placed by their length across the spoken stretch, when the model gives no times."""
    lengths = [len(word) + 1 for word in words]
    total = sum(lengths)
    if total == 0 or end <= start:
        return []
    placed, at = [], start
    for word, length in zip(words, lengths, strict=True):
        span = (end - start) * length / total
        placed.append({"w": word, "start": round(at, 3), "end": round(at + span, 3)})
        at += span
    return placed


#: How the voice is told to say a word espeak gets wrong: Nigerian names read as English
#: ones ("Ike" as "like", "Ife" as "knife"), and naira as "nair-uh". Only the model hears
#: these; the timings and everything shown keep the word as written.
SAY_AS = {
    "naira": "nyra",
    "Naira": "Nyra",
    "UTME": "U T M E",
    "Ike": "Eekeh",
    "Ife": "Eefeh",
    "Musa": "Moosa",
    "Tunde": "Toon-day",
    "Bisi": "Bee-see",
    "Aisha": "Eye-sha",
    "Uche": "Oochay",
    "Obi": "Awbee",
    "Ada": "Ahda",
    "Abuja": "Ahbooja",
}


def say_as(word: str) -> str:
    """The word as the model should be given it, its punctuation kept."""
    core = word.strip(".,!?;:\"'()\u201c\u201d\u2018\u2019")
    if core in SAY_AS:
        return word.replace(core, SAY_AS[core], 1)
    return word


def _phonemize_each(kokoro: Any, words: list[str]) -> list[str]:
    # The words are phonemized in one call: espeak's start-up is most of a call's cost.
    import phonemizer
    from kokoro_onnx import tokenizer as module

    with module._espeak_lock:
        found = phonemizer.phonemize(words, "en-us", preserve_punctuation=True, with_stress=True)
    return [kokoro.tokenizer.known(p) for p in found]


def synthesize(said: str, settings: Settings) -> Clip | None:
    """The line spoken by Kokoro, with its word timings. Blocking: run it in a thread.

    `said` is the line as it is to be heard, already through `tutor.for_the_voice`.
    """
    global _broken_until
    if not said.strip() or not available(settings):
        return None
    try:
        kokoro = _model(settings)
    except Exception as failed:
        _log.warning("kokoro unavailable: %s: %s", type(failed).__name__, failed)
        _broken_until = time.monotonic() + BROKEN_REST_SECONDS
        return None
    words = said.split()
    heard = [say_as(word) for word in words]
    try:
        with _speaking:
            audio, rate, timed = kokoro.create_timed(
                " ".join(heard), settings.kokoro_voice, speed=settings.kokoro_speed
            )
            audio, moved = trim(audio, rate)
            duration = len(audio) / rate
            placed: list[dict[str, Any]] = []
            if timed:
                shifted = [
                    (t.phoneme, max(0.0, t.start + moved), min(duration, t.end + moved))
                    for t in timed
                ]
                placed = words_from_phonemes(words, _phonemize_each(kokoro, heard), shifted)
            estimated = not placed
            if estimated:
                placed = estimated_words(words, PAD_BEFORE_S, duration - PAD_AFTER_S)
            return Clip(to_mp3(audio, rate), duration, placed, estimated)
    except Exception as failed:
        _log.warning("kokoro failed: %s: %s", type(failed).__name__, failed)
        return None


def dumps(clip: Clip) -> bytes:
    return json.dumps(clip.timings(), ensure_ascii=False).encode()


if __name__ == "__main__":
    # `uv run --frozen python -m app.kokoro_voice` fetches the model ahead of the first lesson.
    from app.config import get_settings

    logging.basicConfig(level=logging.INFO)
    model, voices = download(get_settings())
    print(f"{model} ({model.stat().st_size // 1_000_000} MB)")
    print(f"{voices} ({voices.stat().st_size // 1_000_000} MB)")
