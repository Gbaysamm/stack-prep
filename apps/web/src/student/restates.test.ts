import { describe, expect, it } from 'vitest';

import { restates } from './Board.js';

describe('a line that restates the question', () => {
  it('is the same words, however they are marked up', () => {
    expect(restates('Elements, compounds and mixtures', 'Elements, compounds and mixtures')).toBe(true);
    expect(
      restates(
        'Find the coordinate of the midpoint of the $x$ and $y$ intercepts of the line $2y = 4x - 8$',
        'Find the coordinate of the midpoint of the x and y intercepts of the line 2y = 4x - 8',
      ),
    ).toBe(true);
    expect(restates(String.raw`Water is $\ce{H2O}$.`, 'Water is H2O')).toBe(true);
  });

  it('is not a line of working', () => {
    expect(restates('$2y = 4x - 8$', 'Find the midpoint of the intercepts of the line 2y = 4x - 8')).toBe(false);
    expect(restates('every substance is an element, a compound or a mixture', 'Elements, compounds and mixtures')).toBe(false);
    expect(restates('anything', '')).toBe(false);
  });
});
