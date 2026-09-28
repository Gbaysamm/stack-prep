/**
 * What each check-in answer means, and what Stack Prep does with it, in the student's words.
 *
 * One place, so the room (the "saved" moment after a check-in) and the check-ins page say the
 * same thing. Written from what the code does, not what it might do:
 *   - how sure: the engine (guessed-right answers are capped and don't count as known;
 *     "I think so" moves mastery three quarters as far) — packages/engine mastery.py
 *   - two misses: recorded as taught, not known (routers/practice.py practice_taught)
 *   - "still unsure" / "too hard": listed under "Worth another look" on Progress
 *     (routers/progress.py lesson_feedback). They don't change which questions come next.
 */

import type { LessonContext, MatchedWorking, Understood } from './lessonFeedbackApi.js';

export type Tone = 'lime' | 'purple' | 'yellow';

export interface Word {
  label: string;
  /** What the answer says about the student, plainly. */
  means: string;
  /** What happens because of it. */
  then: string;
  tone: Tone;
}

/** Why the board opened: the answer before the lesson. */
export const WHY_BOARD: Record<LessonContext, Word> = {
  after_guess: {
    label: 'Right, but you guessed',
    means: 'You picked the right answer but said it was a guess.',
    then: 'A lucky guess isn’t counted as knowing it. This idea comes back as a fresh question so you can prove it.',
    tone: 'yellow',
  },
  after_unsure: {
    label: 'Right, but unsure',
    means: 'You picked the right answer but weren’t fully sure.',
    then: 'It counts, but for less than a sure answer: three quarters of the step up.',
    tone: 'purple',
  },
  after_misses: {
    label: 'Missed twice',
    means: 'Both tries were wrong, so the coach worked it through with you.',
    then: 'Counted as taught, not known. A fresh question on the same idea comes back later.',
    tone: 'yellow',
  },
};

export const MATCHED_WORD: Record<MatchedWorking, Word> = {
  yes: {
    label: 'Yes, the same way',
    means: 'Your own working matched the coach’s, so your right answer came from understanding.',
    then: 'Good sign. Next time you feel this sure, trust yourself and pick “I knew it”.',
    tone: 'lime',
  },
  partly: {
    label: 'Partly',
    means: 'Some of your thinking was right, and some of it went a different way.',
    then: 'Look back at the step where the coach’s working left yours. That step is the one to practise.',
    tone: 'purple',
  },
  no: {
    label: 'No, I guessed',
    means: 'You didn’t really work it out. Saying so is what keeps your scores honest.',
    then: 'Treat this idea as new. The lesson you just saw is your starting point.',
    tone: 'yellow',
  },
};

export const UNDERSTOOD_WORD: Record<Understood, Word> = {
  got_it: {
    label: 'Got it',
    means: 'The lesson made sense and you could do one like it now.',
    then: 'Nothing more to do. The next question on this idea will show whether it stuck.',
    tone: 'lime',
  },
  unsure: {
    label: 'Still unsure',
    means: 'Some of the lesson made sense, not all of it.',
    then: 'It goes on your “Worth another look” list on Progress. Practise the topic when you’re ready, or ask the coach about the step that lost you.',
    tone: 'purple',
  },
  too_hard: {
    label: 'Too hard',
    means: 'You lost the thread somewhere in the lesson.',
    then: 'It goes on your “Worth another look” list on Progress. Try the lesson again slowly, or practise the topic with easier questions first.',
    tone: 'yellow',
  },
};
