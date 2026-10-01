"""A lesson's TALKING MOUTH, checked before loading (docs/plans/doodles-v2-contract.md section 7).

For oral English (vowels, consonants, rhymes and stress), a moment may bring in a mouth that
says a word in time with the voice:

    mouth: {id: m1, word: 'shop', sound: 'ʃ', syllables: ['shop'], stress: 1, on: 'shop',
            caption: 'sh: lips pushed out', view: front}

and a later moment may make it say another word: `doodle_do: [{id: m1, op: say, word: ship}]`.

The rules:

* `word` (required): a word or short phrase (at most three words, letters only). It must be
  said in the moment's `say`, unless `on` names the word that starts it instead.
* `sound`: an IPA symbol from KNOWN_SOUNDS (the vowels, diphthongs and consonants of English).
* `syllables`: the word split up, which must spell the word; `stress` (from 1) picks one of
  them, and needs them.
* `view`: front or side. `caption`: 40 characters or fewer.
* `on` (with `on_nth`): words said in this moment (database/lesson_cues.py); `word` by default.
* `id`: a lesson-unique handle like a doodle's; `say` and `pulse` are the actions it takes.

DoodleBook (lesson_doodles.py) calls `clean_mouth` for a moment's `mouth` and `clean_say` for a
`say` action, so both loaders check it without a change of their own.
"""

from __future__ import annotations

import re
from typing import Any

from lesson_cues import cue_count, spoken_words

#: The sounds a mouth may be asked to hold: RP's, as the papers write them, and the US forms
#: espeak gives where they differ.
_SOUNDS = (
    # Vowels, then diphthongs, then consonants.
    "i\u02d0 i \u026a e \u025b \u00e6 \u0251\u02d0 \u0251 \u0252 "
    "\u0254\u02d0 \u0254 \u028a u\u02d0 u \u028c \u025c\u02d0 \u025c "
    "\u0259 \u025a "
    "e\u026a a\u026a \u0254\u026a \u0259\u028a o\u028a a\u028a "
    "\u026a\u0259 e\u0259 \u028a\u0259 "
    "p b t d k g \u0261 f v \u03b8 \u00f0 s z \u0283 \u0292 h t\u0283 "
    "d\u0292 m n \u014b l r \u0279 w j "
)
KNOWN_SOUNDS = frozenset(_SOUNDS.split())
VIEWS = {"front", "side"}
MAX_CAPTION = 40
MAX_WORDS = 3
MAX_SYLLABLES = 8
_ID = re.compile(r"[a-z][a-z0-9_]*")
_WORD = re.compile(r"[A-Za-z]+(?:['\u2019-][A-Za-z]+)*")
_KEYS = {"id", "word", "sound", "syllables", "stress", "view", "on", "on_nth", "caption"}
_SAY_KEYS = {"id", "op", "word", "sound"}


def _word(value: object, where: str, what: str = "word") -> str:
    if not isinstance(value, str) or not value.strip():
        raise SystemExit(f"{where}: a mouth's {what} is a word or a few, letters only ({value!r})")
    words = value.split()
    if len(words) > MAX_WORDS or not all(_WORD.fullmatch(word) for word in words):
        raise SystemExit(
            f"{where}: a mouth's {what} is at most {MAX_WORDS} words, letters only ({value!r})"
        )
    return " ".join(words)


def clean_mouth(value: object, say: str, where: str) -> dict[str, Any]:
    """A moment's `mouth`, checked, as it is stored."""
    if not isinstance(value, dict):
        raise SystemExit(f"{where}: mouth is {{word, sound?, syllables?, stress?, view?, on?}}")
    unknown = set(value) - _KEYS
    if unknown:
        raise SystemExit(f"{where}: a mouth has no {sorted(unknown)} (it takes {sorted(_KEYS)})")
    word = _word(value.get("word"), where)
    clean: dict[str, Any] = {}
    handle = value.get("id")
    if handle is not None:
        if not isinstance(handle, str) or not _ID.fullmatch(handle):
            raise SystemExit(f"{where}: a mouth's id is like m1 or mouth ([a-z][a-z0-9_]*)")
        clean["id"] = handle
    clean["word"] = word
    sound = value.get("sound")
    if sound is not None:
        if not isinstance(sound, str) or sound.strip().strip("/") not in KNOWN_SOUNDS:
            raise SystemExit(
                f"{where}: a mouth's sound is an IPA symbol, one of "
                f"{' '.join(sorted(KNOWN_SOUNDS))} ({sound!r})"
            )
        clean["sound"] = sound.strip().strip("/")
    syllables = value.get("syllables")
    stress = value.get("stress")
    if syllables is not None:
        if (
            not isinstance(syllables, list)
            or not 1 <= len(syllables) <= MAX_SYLLABLES
            or not all(isinstance(s, str) and s.strip() for s in syllables)
        ):
            raise SystemExit(
                f"{where}: syllables is the word in pieces, 1 to {MAX_SYLLABLES} ({syllables!r})"
            )
        parts = [str(s).strip() for s in syllables]
        spelt = word.replace(" ", "").replace("-", "").lower()
        if "".join(parts).replace("-", "").lower() != spelt:
            raise SystemExit(f"{where}: the syllables {parts} do not spell {word!r}")
        clean["syllables"] = parts
    if stress is not None:
        if syllables is None:
            raise SystemExit(f"{where}: stress picks one of the syllables, and there are none")
        if isinstance(stress, bool) or not isinstance(stress, int):
            raise SystemExit(f"{where}: stress is which syllable, from 1 ({stress!r})")
        if not 1 <= stress <= len(clean["syllables"]):
            raise SystemExit(
                f"{where}: stress {stress}, but {word!r} has {len(clean['syllables'])} syllable(s)"
            )
        clean["stress"] = stress
    view = value.get("view")
    if view is not None:
        if view not in VIEWS:
            raise SystemExit(f"{where}: a mouth's view is front or side ({view!r})")
        clean["view"] = view
    on, nth = value.get("on"), value.get("on_nth")
    if nth is not None and on is None:
        raise SystemExit(f"{where}: on_nth picks which time the `on` words are said; no on")
    if on is not None:
        if not isinstance(on, str) or not spoken_words(on):
            raise SystemExit(f"{where}: a mouth's on is a word said in this moment ({on!r})")
        if isinstance(nth, bool) or (nth is not None and (not isinstance(nth, int) or nth < 1)):
            raise SystemExit(f"{where}: on_nth is which time the words are said, from 1 ({nth!r})")
        found = cue_count(say, on)
        if found == 0:
            raise SystemExit(f"{where}: the mouth's on {on!r} is not said in this moment: {say!r}")
        if nth is not None and nth > found:
            raise SystemExit(f"{where}: on {on!r} on_nth {nth}, but it is said {found} time(s)")
        clean["on"] = on.strip()
        if nth is not None and nth > 1:
            clean["on_nth"] = nth
    elif cue_count(say, word) == 0:
        raise SystemExit(
            f"{where}: the mouth's word {word!r} is not said in this moment; say it, or give "
            f"`on` for the word that starts it: {say!r}"
        )
    caption = value.get("caption")
    if caption is not None:
        if not isinstance(caption, str) or not caption.strip():
            raise SystemExit(f"{where}: a mouth's caption is a few words")
        if len(caption.strip()) > MAX_CAPTION:
            raise SystemExit(
                f"{where}: a mouth's caption is at most {MAX_CAPTION} characters "
                f"({len(caption.strip())}: {caption.strip()!r})"
            )
        clean["caption"] = caption.strip()
    return clean


def clean_say(action: dict[str, Any], where: str) -> dict[str, Any]:
    """A `say` action on a mouth (`{id, op: say, word?}`), checked, as it is stored."""
    unknown = set(action) - _SAY_KEYS
    if unknown:
        raise SystemExit(f"{where}: say takes no {sorted(unknown)} (it takes word, sound, on)")
    clean: dict[str, Any] = {"id": action["id"], "op": "say"}
    if action.get("word") is not None:
        clean["word"] = _word(action["word"], where, "say's word")
    sound = action.get("sound")
    if sound is not None:
        if not isinstance(sound, str) or sound.strip().strip("/") not in KNOWN_SOUNDS:
            raise SystemExit(f"{where}: say's sound is an IPA symbol, as a mouth's is ({sound!r})")
        clean["sound"] = sound.strip().strip("/")
    return clean
