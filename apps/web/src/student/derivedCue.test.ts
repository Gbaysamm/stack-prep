import { describe, expect, it } from 'vitest';

import { derivedCue, derivedWriteCue } from './wordClock.js';

describe('a mark cued on what it points at', () => {
  it('finds the number, the signed number, or the phrase in what is said', () => {
    const say = 'The x-values of our two intercepts are 2 and 0. 2 plus 0 is 2.';
    expect(derivedCue('2', say)).toEqual({ word: '2', nth: 1 });
    expect(derivedCue('0)', say)).toEqual({ word: '0', nth: 1 });
    expect(derivedCue('−4', 'The y-values are 0 and negative 4.')).toEqual({ word: 'negative 4', nth: 1 });
    expect(derivedCue('cannot be split', 'An element cannot be split by chemical means.')).toEqual({
      word: 'cannot be split',
      nth: 1,
    });
  });

  it('gives nothing when it is not said', () => {
    expect(derivedCue('7', 'The answer is 2.')).toBeNull();
    expect(derivedCue(null, 'anything')).toBeNull();
  });
});

describe('a line written on its words', () => {
  it('waits for its first words when they come later in the moment', () => {
    const say = 'Chemists sort every substance into three kinds. In an element, every atom is the same kind.';
    expect(derivedWriteCue('Three kinds: element, compound, mixture', say)).toEqual({ word: 'three kinds', nth: 1 });
  });
  it('is written at once when its words open the moment, or are not said', () => {
    expect(derivedWriteCue('All matter is made of atoms', 'All matter is made of very tiny particles.')).toBeNull();
    expect(derivedWriteCue('Matter: everything around you', 'Everything around you is matter.')).toBeNull();
  });
});
