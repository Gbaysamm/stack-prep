/**
 * The mock exam's scientific calculator: its keys, its expression, and the arithmetic.
 *
 * Pure and free of React, so every rule is unit tested (calc.test.ts). Nothing here uses
 * `eval` or `Function`: the expression is a list of tokens the keys put there, read by a
 * recursive-descent parser with these precedences, loosest first:
 *
 *   + −                 left to right
 *   × ÷ (and 2π, 3(4))  left to right; a number written against a bracket or a constant multiplies
 *   nPr nCr             left to right
 *   unary −             so −2² is −4, as on paper
 *   xʸ  ʸ√x             right to left, so 2^3^2 is 2^9; the exponent may be negative (2^−1)
 *   x² x³ x⁻¹ % n!      after the number they follow
 *   EXP                 2 EXP 3 is 2×10³
 *
 * A bracket left open at the end is closed for the student, as a hand calculator does.
 */

export type AngleMode = 'deg' | 'rad';

export class CalcError extends Error {
  readonly kind: 'math' | 'syntax';
  constructor(kind: 'math' | 'syntax') {
    super(kind === 'math' ? 'Math ERROR' : 'Syntax ERROR');
    this.kind = kind;
    this.name = 'CalcError';
  }
}

/** Functions take a bracketed argument: the key inserts the name and its open bracket. */
export const FUNCTIONS = ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'log', 'ln', 'sqrt', 'cbrt', 'pow10', 'exp'] as const;
export type FunctionName = (typeof FUNCTIONS)[number];
const FUNCTION_SET = new Set<string>(FUNCTIONS);

const CONSTANTS = new Set(['π', 'e', 'Ans', 'M']);
const POSTFIX = new Set(['²', '³', '⁻¹', '%', '!']);
const NUMBER = /^(\d+\.?\d*|\.\d+|\d*\.)$/;

const isNumber = (token: string | undefined): token is string => token !== undefined && NUMBER.test(token);

/** Can this token begin an operand (so a number written before it multiplies)? */
function startsOperand(token: string | undefined): boolean {
  if (token === undefined) return false;
  return isNumber(token) || token === '(' || CONSTANTS.has(token) || FUNCTION_SET.has(token);
}

export interface Env {
  angle: AngleMode;
  ans: number;
  memory: number;
}

const DEG = Math.PI / 180;

function finite(value: number): number {
  if (!Number.isFinite(value) || Number.isNaN(value)) throw new CalcError('math');
  return value;
}

function isInteger(value: number): boolean {
  return Number.isInteger(Math.round(value * 1e9) / 1e9) && Math.abs(value - Math.round(value)) < 1e-9;
}

export function factorial(n: number): number {
  if (!isInteger(n) || n < 0 || n > 170) throw new CalcError('math');
  let result = 1;
  for (let k = 2; k <= Math.round(n); k += 1) result *= k;
  return result;
}

export function permutations(n: number, r: number): number {
  if (!isInteger(n) || !isInteger(r) || n < 0 || r < 0 || r > n) throw new CalcError('math');
  let result = 1;
  for (let k = 0; k < Math.round(r); k += 1) result *= Math.round(n) - k;
  return finite(result);
}

export function combinations(n: number, r: number): number {
  if (!isInteger(n) || !isInteger(r) || n < 0 || r < 0 || r > n) throw new CalcError('math');
  const N = Math.round(n);
  const R = Math.min(Math.round(r), N - Math.round(r));
  let result = 1;
  for (let k = 1; k <= R; k += 1) result = (result * (N - R + k)) / k;
  return finite(Math.round(result));
}

/** Trigonometry in degrees is exact at the quarter turns, where floating point is not. */
function trig(name: 'sin' | 'cos' | 'tan', x: number, angle: AngleMode): number {
  if (angle === 'deg') {
    const turn = ((x % 360) + 360) % 360;
    if (isInteger(turn) && Math.round(turn) % 90 === 0) {
      const quarter = Math.round(turn) / 90;
      const table = {
        sin: [0, 1, 0, -1],
        cos: [1, 0, -1, 0],
        tan: [0, Number.NaN, 0, Number.NaN],
      }[name];
      const value = table[quarter % 4]!;
      if (Number.isNaN(value)) throw new CalcError('math');
      return value;
    }
    x *= DEG;
  }
  const value = name === 'sin' ? Math.sin(x) : name === 'cos' ? Math.cos(x) : Math.tan(x);
  return finite(value);
}

function applyFunction(name: FunctionName, x: number, angle: AngleMode): number {
  const toAngle = (radians: number) => (angle === 'deg' ? radians / DEG : radians);
  switch (name) {
    case 'sin':
    case 'cos':
    case 'tan':
      return trig(name, x, angle);
    case 'asin':
    case 'acos':
      if (x < -1 || x > 1) throw new CalcError('math');
      return toAngle(name === 'asin' ? Math.asin(x) : Math.acos(x));
    case 'atan':
      return toAngle(Math.atan(x));
    case 'log':
      if (x <= 0) throw new CalcError('math');
      return Math.log10(x);
    case 'ln':
      if (x <= 0) throw new CalcError('math');
      return Math.log(x);
    case 'sqrt':
      if (x < 0) throw new CalcError('math');
      return Math.sqrt(x);
    case 'cbrt':
      return Math.cbrt(x);
    case 'pow10':
      return finite(10 ** x);
    case 'exp':
      return finite(Math.exp(x));
  }
}

function power(base: number, exponent: number): number {
  if (base === 0 && exponent < 0) throw new CalcError('math');
  if (base < 0 && !isInteger(exponent)) {
    // An odd root of a negative number is real: (−8)^(1/3) is −2.
    const inverse = 1 / exponent;
    if (isInteger(inverse) && Math.round(inverse) % 2 !== 0) return -((-base) ** exponent);
    throw new CalcError('math');
  }
  return finite(base ** exponent);
}

function root(index: number, radicand: number): number {
  if (index === 0) throw new CalcError('math');
  if (radicand < 0) {
    if (isInteger(index) && Math.round(index) % 2 !== 0) return -((-radicand) ** (1 / index));
    throw new CalcError('math');
  }
  return finite(radicand ** (1 / index));
}

/** Evaluate a token list. Throws CalcError. */
export function evaluate(tokens: readonly string[], env: Env): number {
  if (tokens.length === 0) throw new CalcError('syntax');
  let at = 0;
  const peek = () => tokens[at];
  const next = () => tokens[at++];

  function additive(): number {
    let value = multiplicative();
    for (;;) {
      const op = peek();
      if (op === '+') {
        next();
        value = value + multiplicative();
      } else if (op === '−') {
        next();
        value = value - multiplicative();
      } else return finite(value);
    }
  }

  function multiplicative(): number {
    let value = combinatoric();
    for (;;) {
      const op = peek();
      if (op === '×') {
        next();
        value *= combinatoric();
      } else if (op === '÷') {
        next();
        const divisor = combinatoric();
        if (divisor === 0) throw new CalcError('math');
        value /= divisor;
      } else if (startsOperand(op)) {
        value *= combinatoric();
      } else return finite(value);
    }
  }

  function combinatoric(): number {
    let value = unary();
    for (;;) {
      const op = peek();
      if (op === 'P') {
        next();
        value = permutations(value, unary());
      } else if (op === 'C') {
        next();
        value = combinations(value, unary());
      } else return value;
    }
  }

  function unary(): number {
    const op = peek();
    if (op === '−' || op === 'neg') {
      next();
      return -unary();
    }
    if (op === '+') {
      next();
      return unary();
    }
    return exponential();
  }

  function exponential(): number {
    const base = postfix();
    const op = peek();
    if (op === '^') {
      next();
      return power(base, unary());
    }
    if (op === 'root') {
      next();
      return root(base, unary());
    }
    return base;
  }

  function postfix(): number {
    let value = primary();
    for (;;) {
      const op = peek();
      if (op === undefined || !POSTFIX.has(op)) break;
      next();
      if (op === '²') value = value * value;
      else if (op === '³') value = value * value * value;
      else if (op === '⁻¹') {
        if (value === 0) throw new CalcError('math');
        value = 1 / value;
      } else if (op === '%') value = value / 100;
      else value = factorial(value);
    }
    return finite(value);
  }

  function primary(): number {
    const token = next();
    if (token === undefined) throw new CalcError('syntax');
    if (isNumber(token)) {
      if (token === '.') throw new CalcError('syntax');
      let value = Number(token);
      if (peek() === 'E') {
        next();
        let sign = 1;
        if (peek() === '−' || peek() === 'neg') {
          next();
          sign = -1;
        } else if (peek() === '+') next();
        const exponent = next();
        if (!isNumber(exponent) || exponent === '.') throw new CalcError('syntax');
        value = value * 10 ** (sign * Number(exponent));
      }
      return finite(value);
    }
    if (token === 'π') return Math.PI;
    if (token === 'e') return Math.E;
    if (token === 'Ans') return env.ans;
    if (token === 'M') return env.memory;
    if (token === '(') return bracketed();
    if (FUNCTION_SET.has(token)) {
      if (next() !== '(') throw new CalcError('syntax');
      return applyFunction(token as FunctionName, bracketed(), env.angle);
    }
    throw new CalcError('syntax');
  }

  /** After an open bracket: the inside, then its close (or the end, which closes it). */
  function bracketed(): number {
    const value = additive();
    if (peek() === ')') next();
    else if (peek() !== undefined) throw new CalcError('syntax');
    return value;
  }

  const value = additive();
  if (at !== tokens.length) throw new CalcError('syntax');
  return finite(value);
}

/** A result as the display shows it: twelve significant figures, E notation when huge or tiny. */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) throw new CalcError('math');
  if (value === 0) return '0';
  const rounded = Number(value.toPrecision(12));
  const size = Math.abs(rounded);
  if (size >= 1e12 || size < 1e-9) {
    const [mantissa, exponent] = rounded.toExponential(9).split('e');
    const trimmed = mantissa!.replace(/\.?0+$/, '');
    return `${trimmed}E${Number(exponent)}`;
  }
  return String(rounded);
}

/* ------------------------------------------------------------------ display */

const SHOWN: Record<string, string> = {
  asin: 'sin⁻¹',
  acos: 'cos⁻¹',
  atan: 'tan⁻¹',
  sqrt: '√',
  cbrt: '∛',
  pow10: '10^',
  exp: 'e^',
  neg: '−',
  root: 'ˣ√',
  P: 'P',
  C: 'C',
  E: 'E',
  '−': ' − ',
  '+': ' + ',
  '×': ' × ',
  '÷': ' ÷ ',
};

/** The expression as the student reads it. */
export function display(tokens: readonly string[]): string {
  return tokens
    .map((token) => SHOWN[token] ?? token)
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ------------------------------------------------------------------ keys */

export type Key =
  | '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '.'
  | '+' | '−' | '×' | '÷' | '(' | ')' | '%' | '±'
  | 'x²' | 'x³' | 'xʸ' | '√' | '∛' | 'ʸ√x' | '1/x' | 'π' | 'e' | 'EXP' | 'n!' | 'nPr' | 'nCr'
  | 'sin' | 'cos' | 'tan' | 'sin⁻¹' | 'cos⁻¹' | 'tan⁻¹' | 'log' | 'ln' | '10ˣ' | 'eˣ'
  | 'Ans' | '=' | 'AC' | 'C' | 'DEL' | 'MC' | 'MR' | 'M+' | 'M−' | 'DRG';

export interface CalcState {
  tokens: string[];
  /** The last answer, as shown, or the error. */
  output: string;
  error: boolean;
  /** The expression was just evaluated: a new number starts a new one. */
  done: boolean;
  ans: number;
  memory: number;
  angle: AngleMode;
}

export const initialCalc: CalcState = {
  tokens: [],
  output: '0',
  error: false,
  done: false,
  ans: 0,
  memory: 0,
  angle: 'deg',
};

const INSERT: Partial<Record<Key, string[]>> = {
  '+': ['+'],
  '−': ['−'],
  '×': ['×'],
  '÷': ['÷'],
  '(': ['('],
  ')': [')'],
  '%': ['%'],
  'x²': ['²'],
  'x³': ['³'],
  'xʸ': ['^'],
  'ʸ√x': ['root'],
  '1/x': ['⁻¹'],
  'n!': ['!'],
  nPr: ['P'],
  nCr: ['C'],
  EXP: ['E'],
  '√': ['sqrt', '('],
  '∛': ['cbrt', '('],
  sin: ['sin', '('],
  cos: ['cos', '('],
  tan: ['tan', '('],
  'sin⁻¹': ['asin', '('],
  'cos⁻¹': ['acos', '('],
  'tan⁻¹': ['atan', '('],
  log: ['log', '('],
  ln: ['ln', '('],
  '10ˣ': ['pow10', '('],
  'eˣ': ['exp', '('],
  π: ['π'],
  e: ['e'],
  Ans: ['Ans'],
  MR: ['M'],
};

/** Keys that carry on from the last answer when pressed straight after "=". */
const CARRIES_ON = new Set<Key>(['+', '−', '×', '÷', 'x²', 'x³', 'xʸ', 'ʸ√x', '1/x', 'n!', 'nPr', 'nCr', '%']);

function value(state: CalcState): number {
  return evaluate(state.tokens, state);
}

/** What one key press does. */
export function press(state: CalcState, key: Key): CalcState {
  const s: CalcState = { ...state, tokens: [...state.tokens] };
  const fail = (error: unknown): CalcState => {
    if (!(error instanceof CalcError)) throw error;
    return { ...s, output: error.message, error: true, done: false };
  };

  switch (key) {
    case 'AC':
      return { ...s, tokens: [], output: '0', error: false, done: false };
    case 'C': {
      // Clear the number being typed; after an error, just the error; otherwise the line.
      const last = s.tokens[s.tokens.length - 1];
      if (s.error) return { ...s, error: false, output: '0' };
      if (!s.done && isNumber(last)) {
        s.tokens.pop();
        return s;
      }
      return { ...s, tokens: [], output: '0', done: false };
    }
    case 'DEL': {
      if (s.done) return { ...s, done: false, error: false };
      const last = s.tokens.pop();
      if (last === '(' && FUNCTION_SET.has(s.tokens[s.tokens.length - 1] ?? '')) s.tokens.pop();
      else if (isNumber(last) && last.length > 1) s.tokens.push(last.slice(0, -1));
      return { ...s, error: false };
    }
    case 'DRG':
      return { ...s, angle: s.angle === 'deg' ? 'rad' : 'deg' };
    case 'MC':
      return { ...s, memory: 0 };
    case 'M+':
    case 'M−': {
      try {
        const amount = s.tokens.length && !s.done ? value(s) : s.ans;
        const memory = s.memory + (key === 'M+' ? amount : -amount);
        if (s.tokens.length && !s.done) {
          return { ...s, memory, ans: amount, output: formatNumber(amount), error: false, done: true };
        }
        return { ...s, memory };
      } catch (error) {
        return fail(error);
      }
    }
    case '=': {
      if (s.tokens.length === 0) return s;
      try {
        const result = value(s);
        return { ...s, ans: result, output: formatNumber(result), error: false, done: true };
      } catch (error) {
        return fail(error);
      }
    }
    case '±': {
      // After "=", negate the answer; otherwise toggle the sign of the operand being typed.
      if (s.done) return { ...s, tokens: ['neg', 'Ans'], done: false, error: false };
      const at = s.tokens.length - 1;
      const last = s.tokens[at];
      if (isNumber(last) || CONSTANTS.has(last ?? '')) {
        if (s.tokens[at - 1] === 'neg') s.tokens.splice(at - 1, 1);
        else s.tokens.splice(at, 0, 'neg');
      } else {
        s.tokens.push('neg');
      }
      return { ...s, error: false };
    }
    default:
      break;
  }

  // Typing: digits join the number being typed; everything else is its own token.
  if (s.done) {
    s.tokens = CARRIES_ON.has(key) ? ['Ans'] : [];
    s.done = false;
  }
  s.error = false;
  if (/^\d$/.test(key) || key === '.') {
    const last = s.tokens[s.tokens.length - 1];
    if (isNumber(last)) {
      if (key === '.' && last.includes('.')) return s;
      s.tokens[s.tokens.length - 1] = last + key;
    } else {
      s.tokens.push(key);
    }
    return s;
  }
  const insert = INSERT[key];
  if (insert) s.tokens.push(...insert);
  return s;
}
