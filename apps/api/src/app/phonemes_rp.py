"""British RP phonemes for the talking mouth, timed into each word's window.

The mouth shows the lip sequence of the word being said, so it needs the word's sounds as a
British RP speaker makes them (JAMB's reference accent), not the American ones the Kokoro voice
is built on (docs/plans/2026-10-01-exact-lip-sync.md). The voice itself is not changed.

* WHICH SOUNDS: each word is phonemized by the espeak-ng that comes with Kokoro, in its RP
  voice (`en-gb-x-rp`), and written in a closed set of 44 RP phonemes (`PHONEMES`): stress and
  length variants stripped, espeak's own letters mapped to RP ones, diphthongs and the
  affricates tʃ dʒ one symbol each, and the r of non-rhotic RP dropped unless a vowel follows
  it (in the word, or as a linking r in the next). A few words are fixed in `LEXICON`, which
  wins over espeak. Where espeak is not installed, a small set of letter rules stands in.
* WHEN: `align` shares each word's measured window out among its sounds by how long each kind
  usually takes in RP (stops short, vowels longer, diphthongs longest, the last syllable a
  little longer), or by the voice's own phoneme durations where those line up one for one.
  The sounds tile the window exactly; silence between words gets no sound.
"""

# ruff: noqa: RUF001  (IPA letters are what this module is about)

from __future__ import annotations

import logging
import re
from collections.abc import Sequence
from typing import Any

_log = logging.getLogger(__name__)

ACCENT = "rp"
#: The espeak-ng voice: Received Pronunciation.
ESPEAK_VOICE = "en-gb-x-rp"

LONG = "ː"
VOWELS = frozenset(["iː", "ɪ", "e", "æ", "ʌ", "ɑː", "ɒ", "ɔː", "ʊ", "uː", "ɜː", "ə"])
DIPHTHONGS = frozenset(["eɪ", "aɪ", "ɔɪ", "əʊ", "aʊ", "ɪə", "eə", "ʊə"])
CONSONANTS = frozenset(
    "p b t d k g f v θ ð s z ʃ ʒ h tʃ dʒ m n ŋ l r w j".split()  # noqa: SIM905
)
#: Every sound the mouth is sent: one British RP phoneme each.
PHONEMES = VOWELS | DIPHTHONGS | CONSONANTS
_SOUNDING = VOWELS | DIPHTHONGS

#: Words written out by hand, which win over espeak (the plan's check list among them).
LEXICON: dict[str, tuple[str, ...]] = {
    word: tuple(sounds.split())
    for word, sounds in {
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
    }.items()
}

# --- espeak's letters as RP phonemes -----------------------------------------------------------

#: Marks that change no lip shape: stress, syllabic and other diacritics, ties.
_MARKS = re.compile("[ˈˌ̩̯̃͜͡ʰʲʷ̚.‿|-]")
#: espeak's letter runs, longest first, as RP sounds. A triphthong is a diphthong and a schwa.
_RUNS: dict[str, tuple[str, ...]] = {
    "aɪə": ("aɪ", "ə"),
    "aɪɐ": ("aɪ", "ə"),
    "aʊə": ("aʊ", "ə"),
    "aʊɐ": ("aʊ", "ə"),
    "tʃ": ("tʃ",),
    "dʒ": ("dʒ",),
    "eɪ": ("eɪ",),
    "ɛɪ": ("eɪ",),
    "aɪ": ("aɪ",),
    "ɑɪ": ("aɪ",),
    "ɔɪ": ("ɔɪ",),
    "əʊ": ("əʊ",),
    "oʊ": ("əʊ",),
    "ɐʊ": ("əʊ",),
    "aʊ": ("aʊ",),
    "iə": ("ɪə",),
    "ɪə": ("ɪə",),
    "ɪɐ": ("ɪə",),
    "eə": ("eə",),
    "ɛə": ("eə",),
    "ɛɐ": ("eə",),
    "ʊə": ("ʊə",),
    "ʊɐ": ("ʊə",),
    "iː": ("iː",),
    "uː": ("uː",),
    "ɑː": ("ɑː",),
    "ɔː": ("ɔː",),
    "ɜː": ("ɜː",),
    "ɛː": ("eə",),
    "oː": ("ɔː",),
}
_ONE: dict[str, tuple[str, ...]] = {
    "ɐ": ("ə",),
    "ɚ": ("ə",),
    "ᵻ": ("ɪ",),
    "ɨ": ("ɪ",),
    "i": ("ɪ",),
    "y": ("ɪ",),
    "a": ("æ",),
    "ɛ": ("e",),
    "ɑ": ("ɑː",),
    "ɔ": ("ɔː",),
    "o": ("ɒ",),
    "u": ("uː",),
    "ɜ": ("ɜː",),
    "ɝ": ("ɜː",),
    "ɾ": ("t",),
    "ɹ": ("r",),
    "ɻ": ("r",),
    "ɡ": ("g",),
    "x": ("k",),
    "ç": ("h",),
    "ɬ": ("l",),
    "ɫ": ("l",),
    "ʔ": (),
    "ː": (),
}


def normalise(espeak: str) -> list[str]:
    """espeak's IPA for one word as RP phonemes from `PHONEMES`; anything else is dropped."""
    text = _MARKS.sub("", espeak)
    out: list[str] = []
    at = 0
    while at < len(text):
        for size in (3, 2):
            run = text[at : at + size]
            if run in _RUNS:
                out += _RUNS[run]
                at += size
                break
        else:
            letter = text[at]
            at += 1
            if letter in _ONE:
                out += _ONE[letter]
            elif letter in PHONEMES:
                out.append(letter)
    return out


# --- espeak, and the letter rules where it is missing -------------------------------------------

_ready = False


def _espeak(words: list[str]) -> list[str] | None:
    """Each word's IPA by espeak-ng's RP voice, or None where espeak is not installed."""
    global _ready
    try:
        import phonemizer
        from kokoro_onnx import tokenizer as module

        if not _ready:
            module.Tokenizer()  # points phonemizer at the espeak-ng library Kokoro bundles
            _ready = True
        with module._espeak_lock:
            found = phonemizer.phonemize(
                words,
                language=ESPEAK_VOICE,
                backend="espeak",
                with_stress=True,
                strip=True,
                njobs=1,
            )
    except Exception as failed:
        _log.warning("espeak rp failed: %s: %s", type(failed).__name__, failed)
        return None
    said = [str(one) for one in found]
    return said if len(said) == len(words) else None


#: The fallback's spelling rules, longest first, tried at each letter.
_LETTERS: list[tuple[str, tuple[str, ...]]] = [
    (spelling, tuple(sounds.split()))
    for spelling, sounds in [
        ("tion", "ʃ ə n"),
        ("sion", "ʒ ə n"),
        ("ture", "tʃ ə"),
        ("sure", "ʒ ə"),
        ("tch", "tʃ"),
        ("igh", "aɪ"),
        ("air", "eə"),
        ("ear", "ɪə"),
        ("eer", "ɪə"),
        ("our", "aʊ ə"),
        ("ch", "tʃ"),
        ("sh", "ʃ"),
        ("th", "θ"),
        ("ph", "f"),
        ("ng", "ŋ"),
        ("nk", "ŋ k"),
        ("ck", "k"),
        ("qu", "k w"),
        ("wh", "w"),
        ("kn", "n"),
        ("gn", "n"),
        ("wr", "r"),
        ("ee", "iː"),
        ("ea", "iː"),
        ("oo", "uː"),
        ("ou", "aʊ"),
        ("ow", "aʊ"),
        ("oi", "ɔɪ"),
        ("oy", "ɔɪ"),
        ("ai", "eɪ"),
        ("ay", "eɪ"),
        ("oa", "əʊ"),
        ("ar", "ɑː"),
        ("or", "ɔː"),
        ("er", "ɜː"),
        ("ir", "ɜː"),
        ("ur", "ɜː"),
        ("aw", "ɔː"),
        ("au", "ɔː"),
        ("a", "æ"),
        ("e", "e"),
        ("i", "ɪ"),
        ("o", "ɒ"),
        ("u", "ʌ"),
        ("y", "ɪ"),
        ("c", "k"),
        ("x", "k s"),
        ("j", "dʒ"),
        ("q", "k"),
        *[(c, c) for c in "bdfghklmnprstvwz"],
    ]
]


def by_letters(word: str) -> list[str]:
    """A rough RP reading from the spelling: only where espeak is missing."""
    letters = re.sub(r"[^a-z]", "", word.lower())
    if len(letters) > 2 and letters.endswith("e") and letters[-2] not in "aeiouy":
        letters = letters[:-1]  # a silent final e
    letters = re.sub(r"([bdfgklmnprstz])\1", r"\1", letters)
    out: list[str] = []
    at = 0
    while at < len(letters):
        if at == 0 and letters[0] == "y" and len(letters) > 1:
            out.append("j")
            at = 1
            continue
        for spelling, sounds in _LETTERS:
            if letters.startswith(spelling, at):
                if spelling == "er" and at + 2 == len(letters):
                    sounds = ("ə",)
                out += sounds
                at += len(spelling)
                break
        else:
            at += 1
    return out


# --- a line's words as RP phonemes -------------------------------------------------------------

_EDGES = ".,!?;:\"'()[]{}—–…“”‘’*_"


def bare(word: str) -> str:
    """The word without the punctuation around it."""
    return word.strip(_EDGES + " ")


def words_phonemes(words: Sequence[str]) -> list[list[str]]:
    """Each word's RP phonemes, in order: the lexicon first, then espeak, else letter rules.

    An r is kept only where a vowel follows it: in the word, or (a linking r) at the start of
    the next word when this one is spelled with a final r.
    """
    cores = [bare(word) for word in words]
    wanted = [core for core in cores if core and core.lower() not in LEXICON]
    heard = _espeak(wanted) if wanted else []
    if heard is None:
        _log.info("espeak is not installed: the mouth's RP sounds come from letter rules")
    by_espeak = dict(zip(wanted, heard, strict=True)) if heard is not None else {}
    out: list[list[str]] = []
    for core in cores:
        if not core:
            out.append([])
        elif core.lower() in LEXICON:
            out.append(list(LEXICON[core.lower()]))
        elif core in by_espeak:
            out.append(normalise(by_espeak[core]))
        else:
            out.append(by_letters(core))
    for index, sounds in enumerate(out):
        word = words[index].rstrip()
        # A linking r runs on into the next word only where no punctuation parts them.
        joined = index + 1 < len(out) and word[-1:].isalnum()
        following = out[index + 1][0] if joined and out[index + 1] else None
        kept: list[str] = []
        for at, sound in enumerate(sounds):
            if sound == "r" and at > 0:
                after = sounds[at + 1] if at + 1 < len(sounds) else following
                if after not in _SOUNDING:
                    continue
            kept.append(sound)
        spelled_r = re.search(r"re?$", cores[index].lower()) is not None
        if spelled_r and kept and kept[-1] in _SOUNDING and following in _SOUNDING:
            kept.append("r")
        out[index] = kept
    return out


# --- timing ------------------------------------------------------------------------------------

#: How long each sound usually lasts in RP, against a short vowel's 1 (after Roach's and
#: Cruttenden's relative durations: stops short, long vowels and diphthongs longest).
_WEIGHTS: dict[str, float] = {
    **dict.fromkeys(["p", "t", "k"], 0.65),
    **dict.fromkeys(["b", "d", "g"], 0.55),
    **dict.fromkeys(["tʃ", "dʒ"], 0.95),
    **dict.fromkeys(["s", "ʃ"], 0.95),
    **dict.fromkeys(["z", "ʒ", "f", "v", "θ", "ð"], 0.8),
    "h": 0.6,
    **dict.fromkeys(["m", "n"], 0.75),
    "ŋ": 0.8,
    **dict.fromkeys(["l", "r", "w", "j"], 0.6),
    **dict.fromkeys(["ɪ", "e", "æ", "ʌ", "ɒ", "ʊ"], 1.0),
    "ə": 0.6,
    **dict.fromkeys(["iː", "ɑː", "ɔː", "uː", "ɜː"], 1.5),
    **dict.fromkeys(DIPHTHONGS, 1.75),
}
#: The last syllable of a word (its last vowel onward) is held a little longer.
FINAL_LENGTHENING = 1.2


def weights(sounds: Sequence[str]) -> list[float]:
    """Each sound's typical length, the word's last syllable lengthened."""
    out = [_WEIGHTS.get(sound, 0.8) for sound in sounds]
    last = max((at for at, sound in enumerate(sounds) if sound in _SOUNDING), default=None)
    if last is not None:
        for at in range(last, len(out)):
            out[at] *= FINAL_LENGTHENING
    return out


def tile(
    sounds: Sequence[str], start: float, end: float, guide: Sequence[float] | None = None
) -> list[tuple[str, float, float]]:
    """The sounds sharing [start, end] exactly, end to end, by `guide` where it is one length
    a sound, else by their typical lengths."""
    if not sounds:
        return []
    end = max(start, end)
    shares = (
        [max(0.01, g) for g in guide]
        if guide is not None and len(guide) == len(sounds)
        else weights(sounds)
    )
    total = sum(shares)
    bounds = [start]
    running = 0.0
    for share in shares[:-1]:
        running += share
        bounds.append(max(bounds[-1], round(start + (end - start) * running / total, 3)))
    bounds.append(end)
    return [(sound, bounds[at], bounds[at + 1]) for at, sound in enumerate(sounds)]


#: The voice's two-letter diphthongs, which it times as two sounds.
_PAIRS = frozenset(["eɪ", "aɪ", "ɔɪ", "oʊ", "əʊ", "aʊ"])


def _guide_lengths(inside: Sequence[tuple[str, float]]) -> list[float]:
    """The voice's (American) sounds in a word as RP-like lengths: a diphthong it times as
    two sounds is one, and an r that no vowel follows is held with the vowel before it."""
    out: list[tuple[str, float]] = []
    for at, (sound, length) in enumerate(inside):
        bare_sound = sound.replace(LONG, "").lstrip("ˈˌ")
        after = inside[at + 1][0].replace(LONG, "").lstrip("ˈˌ") if at + 1 < len(inside) else ""
        if out and out[-1][0] + bare_sound in _PAIRS:
            out[-1] = (out[-1][0] + bare_sound, out[-1][1] + length)
        elif out and bare_sound in ("ɹ", "r") and not (after and after[0] in "aeiouæɑɒɔəɛɜɪʊʌ"):
            out[-1] = (out[-1][0], out[-1][1] + length)
        else:
            out.append((bare_sound, length))
    return [length for _, length in out]


def align(
    words: Sequence[dict[str, Any]],
    heard: Sequence[str] | None = None,
    guide: Sequence[dict[str, Any]] = (),
) -> list[dict[str, Any]]:
    """`[{p, start, end, w}]`: each word's RP sounds tiling its window, `w` its index in words.

    `heard` is each word as the voice was given it (a name may be respelled), default the
    words themselves. `guide` is the voice's own timed sounds (`[{p, start, end}]`): where
    the ones inside a word's window are as many as its RP sounds, their lengths share it out.
    """
    said = list(heard) if heard is not None else [str(word["w"]) for word in words]
    out: list[dict[str, Any]] = []
    for index, (word, sounds) in enumerate(zip(words, words_phonemes(said), strict=True)):
        start, end = float(word["start"]), float(word["end"])
        inside = [
            (str(p["p"]), float(p["end"]) - float(p["start"]))
            for p in guide
            if start <= (float(p["start"]) + float(p["end"])) / 2 <= end
        ]
        for sound, begin, finish in tile(sounds, start, end, _guide_lengths(inside) or None):
            out.append({"p": sound, "start": begin, "end": finish, "w": index})
    return out
