# Plan: the talking mouth shows each word's exact lip sequence

Status: **built 14 October 2026** (decisions: British RP throughout, keep the af_heart voice, the word strip on every oral lesson, no scrubbing yet). Still to do: the expert sign-off of the shape table.

## The requirement
The founder watched the mouth say "enclosure". The lips moved, but not through that word's
actual sequence of shapes. That misses the point: if students are told to watch the lips,
**the mouth must show the exact lip sequence of the word being said, frame by frame, in time
with the voice.** A generally moving mouth is not enough.

## Why it falls short today
The mouth was built in contract §7 and fixed on 1 October in commit 08d76e8.

1. **Too few shapes.** There are about 13 shape groups, so many different sounds draw the same
   shape. sh and s look alike, and so do oo, o and aw.
2. **The sh/zh shape is wrong.** /ʃ/ and /ʒ/ should push the lips forward and round them
   slightly. Today they are drawn flat and nearly closed.
3. **Voicing is invisible.** /ʃ/ (nation) and /ʒ/ (vision) differ only by the buzz in the
   throat, so on the lips they look identical.
4. **American timings for a British exam.** Kokoro's phonemes come from espeak en-us. JAMB's
   reference accent is British RP, so some vowels get the wrong shape (e.g. in "dance", "hot",
   and the -ure of "enclosure").
5. **No coarticulation.** Real lips start shaping the next sound early ("enCLOSure" rounds
   before the o). Our shapes change one sound at a time.
6. **Hard to check.** Nothing compares the drawn sequence against a reference for the word.

## The build, when it is scheduled
1. **A shape per sound.**
   - Give each British RP phoneme its own articulation: about 44 phonemes (20 vowels and
     diphthongs, 24 consonants).
   - Each is set by measured parameters: jaw opening, lip rounding, lip spreading, lip
     protrusion, upper and lower teeth showing, and tongue tip and body position for the
     side view.
   - Diphthongs (aʊ, ɔɪ, eɪ, əʊ, ɪə, eə, ʊə) move between two targets over their duration.
   - Take the values from a standard articulatory reference for RP, e.g. Cruttenden's
     *Gimson's Pronunciation of English* and Roach's *English Phonetics and Phonology*.
     Record the source for each phoneme in a table in the code.
2. **Coarticulation.**
   - Blend toward the next phoneme's lip rounding and jaw opening before it starts (about
     60–120 ms of anticipation).
   - Keep the lips closed for the full hold of p, b and m.
3. **British phonemes for the mouth.**
   - Phonemize each word in British English (espeak en-gb / en-rp), and use those phonemes
     for the shapes.
   - Keep the timings real: align the British phonemes into the clip's measured word windows
     (Kokoro word timings, or the studio estimate fitted to pauses). Within each word, share
     the time out by typical phoneme durations, guided by Kokoro's phoneme durations where the
     counts match.
   - Option to evaluate: a British Kokoro voice (bf_emma, bm_george) or af_heart with en-gb
     phonemes, so that the voice and the mouth share one British phoneme stream. The founder
     likes af_heart, so compare by ear before switching.
4. **Show voicing.** A small throat or voice-box mark beside the mouth vibrates for voiced
   sounds (b d g v ð z ʒ dʒ m n ŋ l r w j and all vowels) and is still for voiceless ones.
   Then vision and nation, or v and f, visibly differ.
5. **Front and side together** for consonant questions, plus the taught sound held and
   labelled, as today.
6. **The word strip.** Under the mouth, a row of small mouth shapes, one per phoneme of the
   word, with its IPA underneath. The current one lights up as it's said. Tapping a tile plays
   that sound alone, slowly, with the free voice.
7. **Checks.**
   - **Automated:** for a test list of words (enclosure, vision, nation, measure, of, gnash,
     think, this, ship, sheep, boys, hot, dance, comfortable, political), the drawn phoneme
     sequence must equal the British RP transcription, and each shape must sit within 40 ms
     of its phoneme in the clip.
   - **Visual:** a frame strip of every test word on laptop and phone, compared side by side
     with the reference articulation chart.
   - **Expert:** an English teacher or phonetician signs off the shape table, and the 117 oral
     English lessons are spot-checked by ear and eye.

## Open questions for the founder or expert
- British RP throughout? (JAMB's reference is RP.)
- Keep the af_heart voice, or use a British Kokoro voice for oral English lessons, so voice
  and lips match fully?
- Is the word strip wanted on every oral lesson, or only on tap?
- Should a student be able to scrub the word: drag along the strip to see each shape?

## Effort
Roughly 4–6 days:
- the shape table and drawing: 2 days;
- British phonemes and alignment: 1 day;
- voicing mark and word strip: 1 day;
- checks: 1–2 days.
Plus the expert review.
