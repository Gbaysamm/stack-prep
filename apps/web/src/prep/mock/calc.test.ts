import { describe, expect, it } from 'vitest';

import {
  CalcError,
  combinations,
  display,
  evaluate,
  factorial,
  formatNumber,
  initialCalc,
  permutations,
  press,
  type CalcState,
  type Env,
  type Key,
} from './calc.js';

const deg: Env = { angle: 'deg', ans: 0, memory: 0 };
const rad: Env = { angle: 'rad', ans: 0, memory: 0 };

/** Evaluate tokens written with spaces between them: "2 + 3 × 4". */
const calc = (expression: string, env: Env = deg) => evaluate(expression.split(' ').filter(Boolean), env);
const shown = (expression: string, env: Env = deg) => formatNumber(calc(expression, env));

/** Press keys in order and return the final state. */
const keys = (...pressed: Key[]): CalcState => pressed.reduce(press, initialCalc);

function failsWith(kind: 'math' | 'syntax', run: () => unknown) {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(CalcError);
    expect((error as CalcError).kind).toBe(kind);
    return;
  }
  throw new Error('expected a CalcError');
}

describe('precedence', () => {
  it('multiplies and divides before adding and subtracting', () => {
    expect(calc('2 + 3 × 4')).toBe(14);
    expect(calc('10 − 6 ÷ 3')).toBe(8);
    expect(calc('2 × 3 + 4 × 5')).toBe(26);
  });

  it('works left to right at one level', () => {
    expect(calc('10 − 4 − 3')).toBe(3);
    expect(calc('24 ÷ 4 ÷ 3')).toBe(2);
  });

  it('honours brackets, and closes one left open', () => {
    expect(calc('( 2 + 3 ) × 4')).toBe(20);
    expect(calc('2 × ( 3 + 4')).toBe(14);
    expect(calc('( ( 1 + 2 ) × ( 3 + 4 ) )')).toBe(21);
  });

  it('raises powers right to left, above unary minus', () => {
    expect(calc('2 ^ 3 ^ 2')).toBe(512);
    expect(calc('− 2 ^ 2')).toBe(-4);
    expect(calc('( − 2 ) ^ 2')).toBe(4);
    expect(calc('2 ^ − 1')).toBe(0.5);
    expect(calc('2 × 3 ^ 2')).toBe(18);
  });

  it('applies postfix operators to what they follow', () => {
    expect(calc('3 ²')).toBe(9);
    expect(calc('2 ³')).toBe(8);
    expect(calc('1 + 2 ²')).toBe(5);
    expect(calc('− 3 ²')).toBe(-9);
    expect(calc('4 ⁻¹')).toBe(0.25);
    expect(calc('50 %')).toBe(0.5);
    expect(calc('200 × 15 %')).toBe(30);
    expect(calc('5 !')).toBe(120);
    expect(calc('3 ! ²')).toBe(36);
  });

  it('multiplies a number written against a bracket, constant or function', () => {
    expect(calc('2 ( 3 + 4 )')).toBe(14);
    expect(calc('2 π')).toBeCloseTo(2 * Math.PI, 12);
    expect(calc('3 sin ( 30 )')).toBeCloseTo(1.5, 12);
    expect(calc('( 1 + 1 ) ( 2 + 2 )')).toBe(8);
  });

  it('reads nPr and nCr above × and below powers', () => {
    expect(calc('5 P 2')).toBe(20);
    expect(calc('5 C 2')).toBe(10);
    expect(calc('2 × 5 C 2')).toBe(20);
    expect(calc('2 ² C 2')).toBe(6);
  });

  it('reads EXP as times ten to the power', () => {
    expect(calc('2 E 3')).toBe(2000);
    expect(calc('1.5 E − 2')).toBeCloseTo(0.015, 15);
    expect(calc('3 E 2 + 1')).toBe(301);
  });
});

describe('functions', () => {
  it('does trigonometry in degrees, exactly at the quarter turns', () => {
    expect(shown('sin ( 30 )')).toBe('0.5');
    expect(calc('cos ( 60 )')).toBeCloseTo(0.5, 12);
    expect(calc('tan ( 45 )')).toBeCloseTo(1, 12);
    expect(calc('sin ( 180 )')).toBe(0);
    expect(calc('cos ( 90 )')).toBe(0);
    expect(calc('sin ( − 90 )')).toBe(-1);
    failsWith('math', () => calc('tan ( 90 )'));
    failsWith('math', () => calc('tan ( 270 )'));
  });

  it('does trigonometry in radians', () => {
    expect(calc('sin ( π ÷ 2 )', rad)).toBeCloseTo(1, 12);
    expect(calc('cos ( π )', rad)).toBeCloseTo(-1, 12);
  });

  it('gives inverse trigonometry in the angle mode', () => {
    expect(shown('asin ( 0.5 )')).toBe('30');
    expect(shown('acos ( 0 )')).toBe('90');
    expect(shown('atan ( 1 )')).toBe('45');
    expect(calc('atan ( 1 )', rad)).toBeCloseTo(Math.PI / 4, 12);
    failsWith('math', () => calc('asin ( 2 )'));
  });

  it('takes logarithms and their inverses', () => {
    expect(calc('log ( 1000 )')).toBeCloseTo(3, 12);
    expect(calc('ln ( e )')).toBeCloseTo(1, 12);
    expect(calc('pow10 ( 2 )')).toBe(100);
    expect(calc('exp ( 1 )')).toBeCloseTo(Math.E, 12);
    failsWith('math', () => calc('log ( 0 )'));
    failsWith('math', () => calc('ln ( − 1 )'));
  });

  it('takes roots', () => {
    expect(calc('sqrt ( 16 )')).toBe(4);
    expect(calc('cbrt ( 27 )')).toBeCloseTo(3, 12);
    expect(calc('cbrt ( − 8 )')).toBeCloseTo(-2, 12);
    expect(calc('3 root 8')).toBeCloseTo(2, 12);
    expect(calc('4 root 81')).toBeCloseTo(3, 12);
    expect(calc('3 root − 27')).toBeCloseTo(-3, 12);
    expect(calc('sqrt ( 9 ) + 1')).toBe(4);
    failsWith('math', () => calc('sqrt ( − 4 )'));
    failsWith('math', () => calc('2 root − 4'));
  });

  it('knows its constants, Ans and memory', () => {
    expect(calc('π')).toBe(Math.PI);
    expect(calc('e')).toBe(Math.E);
    expect(calc('Ans × 2', { ...deg, ans: 21 })).toBe(42);
    expect(calc('M + 1', { ...deg, memory: 9 })).toBe(10);
  });
});

describe('counting', () => {
  it('computes factorials, permutations and combinations', () => {
    expect(factorial(0)).toBe(1);
    expect(factorial(10)).toBe(3_628_800);
    expect(permutations(10, 3)).toBe(720);
    expect(combinations(10, 3)).toBe(120);
    expect(combinations(52, 5)).toBe(2_598_960);
  });

  it('refuses what has no meaning', () => {
    failsWith('math', () => factorial(-1));
    failsWith('math', () => factorial(2.5));
    failsWith('math', () => factorial(171));
    failsWith('math', () => permutations(3, 5));
    failsWith('math', () => combinations(5, -1));
  });
});

describe('errors', () => {
  it('reports a syntax error for a malformed expression', () => {
    failsWith('syntax', () => calc(''));
    failsWith('syntax', () => calc('2 +'));
    failsWith('syntax', () => calc('× 3'));
    failsWith('syntax', () => calc('2 )'));
    failsWith('syntax', () => calc('.'));
  });

  it('reports a maths error for division by zero and overflow', () => {
    failsWith('math', () => calc('1 ÷ 0'));
    failsWith('math', () => calc('0 ⁻¹'));
    failsWith('math', () => calc('10 ^ 400'));
    failsWith('math', () => calc('0 ^ − 1'));
  });
});

describe('display', () => {
  it('rounds to twelve significant figures', () => {
    expect(formatNumber(0.1 + 0.2)).toBe('0.3');
    expect(formatNumber(1 / 3)).toBe('0.333333333333');
    expect(formatNumber(-42)).toBe('-42');
  });

  it('switches to E notation when huge or tiny', () => {
    expect(formatNumber(1.5e15)).toBe('1.5E15');
    expect(formatNumber(2e-12)).toBe('2E-12');
  });

  it('writes the expression the way the student reads it', () => {
    expect(display(['2', '+', 'sqrt', '(', '9', ')', '×', 'asin', '(', '1'])).toBe('2 + √(9) × sin⁻¹(1');
  });
});

describe('keys', () => {
  it('types numbers digit by digit and evaluates on =', () => {
    const state = keys('1', '2', '.', '5', '+', '7', '.', '5', '=');
    expect(state.output).toBe('20');
    expect(state.ans).toBe(20);
  });

  it('ignores a second decimal point', () => {
    expect(keys('1', '.', '2', '.', '3').tokens).toEqual(['1.23']);
  });

  it('carries on from the answer when an operator follows =', () => {
    const state = keys('6', '×', '7', '=', '+', '8', '=');
    expect(state.output).toBe('50');
    expect(keys('6', '=', '9').tokens).toEqual(['9']);
  });

  it('uses Ans', () => {
    expect(keys('5', '=', 'Ans', 'x²', '=').output).toBe('25');
  });

  it('deletes the last digit, or a whole function with its bracket', () => {
    expect(keys('1', '2', '3', 'DEL').tokens).toEqual(['12']);
    expect(keys('2', '+', 'sin', 'DEL').tokens).toEqual(['2', '+']);
  });

  it('clears the entry with C and everything with AC', () => {
    expect(keys('2', '+', '3', '4', 'C').tokens).toEqual(['2', '+']);
    expect(keys('2', '+', '3', 'AC').tokens).toEqual([]);
  });

  it('toggles the sign of the number being typed', () => {
    expect(keys('5', '±', '+', '2', '=').output).toBe('-3');
    expect(keys('5', '±', '±', '=').output).toBe('5');
    expect(keys('9', '=', '±', '=').output).toBe('-9');
  });

  it('keeps a memory', () => {
    let state = keys('4', 'M+', '6', 'M+', '3', 'M−');
    expect(state.memory).toBe(7);
    state = press(press(state, 'AC'), 'MR');
    state = press(press(press(state, '×'), '2'), '=');
    expect(state.output).toBe('14');
    expect(press(state, 'MC').memory).toBe(0);
  });

  it('switches between degrees and radians', () => {
    const radians = keys('DRG', 'sin', 'π', '÷', '2', ')', '=');
    expect(radians.angle).toBe('rad');
    expect(radians.output).toBe('1');
    expect(keys('sin', '3', '0', ')', '=').output).toBe('0.5');
  });

  it('shows an error and recovers from it', () => {
    const broken = keys('1', '÷', '0', '=');
    expect(broken.error).toBe(true);
    expect(broken.output).toBe('Math ERROR');
    const fixed = press(press(press(broken, 'DEL'), '2'), '=');
    expect(fixed.output).toBe('0.5');
  });

  it('works through scientific keys', () => {
    expect(keys('2', 'xʸ', '1', '0', '=').output).toBe('1024');
    expect(keys('3', 'ʸ√x', '6', '4', '=').output).toBe('4');
    expect(keys('8', '1/x', '=').output).toBe('0.125');
    expect(keys('5', 'nCr', '3', '=').output).toBe('10');
    expect(keys('5', 'nPr', '3', '=').output).toBe('60');
    expect(keys('6', 'n!', '=').output).toBe('720');
    expect(keys('2', 'EXP', '3', '=').output).toBe('2000');
    expect(keys('log', '1', '0', '0', '=').output).toBe('2');
    expect(keys('10ˣ', '3', '=').output).toBe('1000');
    expect(keys('ln', 'eˣ', '2', '=').output).toBe('2');
    expect(keys('√', '2', '=').output).toBe('1.41421356237');
    expect(keys('∛', '1', '2', '5', '=').output).toBe('5');
    expect(keys('tan⁻¹', '1', '=').output).toBe('45');
  });
});
