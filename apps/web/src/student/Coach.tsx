/**
 * The coach: a face whose mouth moves with the sound it is making.
 *
 * WHY A FACE AND NOT A LABEL. The transcript used to sit on the board and say what was being
 * said; it covered the working, which is the thing the student is meant to be looking at. But
 * a lesson with no visible speaker is a disembodied voice, and a student whose volume is down
 * has nothing to tell them anything is happening at all. So: something small, in the corner,
 * that is plainly a person and plainly talking.
 *
 * THE MOUTH IS DRIVEN BY THE AUDIO, NOT BY A TIMER. The first version opened and closed on a
 * fixed loop, which reads as a mouth flapping rather than someone speaking — it keeps moving
 * through a pause and stops dead in the middle of a word. `faceRef` is handed to the player,
 * which reads the amplitude of whatever is sounding and writes it here as `--mouth`, so the
 * mouth is shut between sentences and widest on a vowel.
 *
 * It is drawn rather than loaded: no asset to fetch on a Nigerian mobile connection, and it
 * takes its colours from the board around it (prep/board.css, `.pb-face`).
 */

import type { RefObject } from 'react';

import '../prep/board.css';

export function Coach({
  faceRef,
  speaking,
  listening,
}: {
  /** The player writes `--mouth`, 0 to 1, onto this while sound is playing. */
  faceRef: RefObject<SVGSVGElement>;
  speaking: boolean;
  listening: boolean;
}) {
  return (
    <svg
      ref={faceRef}
      className={`pb-face ${speaking ? 'talking' : ''} ${listening ? 'listening' : ''}`}
      viewBox="0 0 64 64"
      role="img"
      aria-label={speaking ? 'The coach is speaking' : 'The coach'}
    >
      {/* Shoulders, so the head is not floating. */}
      <path className="pb-face-body" d="M10 64c0-11 9-17 22-17s22 6 22 17z" />
      <circle className="pb-face-skin" cx="32" cy="27" r="17" />
      <path className="pb-face-hair" d="M15 24a17 17 0 0 1 34 0c0-7-7-11-17-11S15 17 15 24z" />
      {/* The eyes blink on their own: a face that never blinks reads as a picture. */}
      <g className="pb-face-eyes">
        <circle cx="25" cy="26" r="2.1" />
        <circle cx="39" cy="26" r="2.1" />
      </g>
      {/* Scaled vertically by `--mouth`, which the player is writing sixty times a second. */}
      <ellipse className="pb-face-mouth" cx="32" cy="35" rx="5" ry="3.6" />
    </svg>
  );
}
