/**
 * The lessons the public site plays (files in public/showcase/, made by
 * scripts/showcase_lessons.py), in the order of the home page's tabs. Kept apart from the
 * watch page so the pages that list them never load the board itself.
 */
export const SHOWCASE = [
  { id: 'm84_12', subject: 'Mathematics', label: 'Number bases' },
  { id: 'm97_35', subject: 'Mathematics', label: 'Trigonometry' },
  { id: 'e14_7d', subject: 'English', label: 'Comprehension' },
] as const;

export const SIGN_UP = '/?mode=signup';
export const LOG_IN = '/?mode=login';
