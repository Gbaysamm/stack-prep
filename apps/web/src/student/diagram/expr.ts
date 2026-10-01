/**
 * A GRAPH'S FUNCTION OF x, read safely: a tiny parser for `fn: 'x^2 - 4'` in a live diagram
 * (docs/plans/doodles-v2-contract.md section 8). Never `eval`: the text is tokenised and parsed
 * into a closure over plain arithmetic, and anything it does not know is refused.
 *
 * It knows: numbers (2, 0.5, .5), x, pi, e; + - * / ^ (right-associative, as in maths), unary
 * minus; brackets; implicit times (2x, 3(x+1), (x+1)(x-2), x sqrt(x)); the functions sqrt, abs,
 * sin, cos, tan (in degrees, as the exam sets them), ln, log (base 10) and exp. The typeset
 * signs a lesson file may carry are read as the ASCII ones: − × · ÷ ² ³ √.
 *
 * database/lesson_diagrams.py has the same grammar, so a lesson the loader takes is one the
 * board can draw.
 */

export type Fn = (x: number) => number;

type Token =
  | { t: "num"; v: number }
  | { t: "id"; v: string }
  | { t: "op"; v: string };

const FUNCS: Record<string, (v: number) => number> = {
  sqrt: Math.sqrt,
  abs: Math.abs,
  sin: (v) => Math.sin((v * Math.PI) / 180),
  cos: (v) => Math.cos((v * Math.PI) / 180),
  tan: (v) => Math.tan((v * Math.PI) / 180),
  ln: Math.log,
  log: Math.log10,
  exp: Math.exp,
};

/** The typeset signs, as the parser reads them. */
function plain(text: string): string {
  return text
    .replace(/[−–]/g, "-")
    .replace(/[×·]/g, "*")
    .replace(/÷/g, "/")
    .replace(/²/g, "^2")
    .replace(/³/g, "^3")
    .replace(/√/g, "sqrt");
}

function tokenise(text: string): Token[] {
  const out: Token[] = [];
  const s = plain(text);
  let i = 0;
  while (i < s.length) {
    const c = s[i]!;
    if (/\s/.test(c)) {
      i += 1;
      continue;
    }
    const num = /^(\d+\.?\d*|\.\d+)/.exec(s.slice(i));
    if (num) {
      out.push({ t: "num", v: Number(num[1]) });
      i += num[1]!.length;
      continue;
    }
    const word = /^[a-z]+/i.exec(s.slice(i));
    if (word) {
      // A run of letters is a function's name, pi, or single letters multiplied (2xe: 2·x·e).
      let rest = word[0].toLowerCase();
      while (rest) {
        const known = [...Object.keys(FUNCS), "pi"].find((name) => rest.startsWith(name));
        if (known) {
          out.push({ t: "id", v: known });
          rest = rest.slice(known.length);
        } else {
          out.push({ t: "id", v: rest[0]! });
          rest = rest.slice(1);
        }
      }
      i += word[0].length;
      continue;
    }
    if ("+-*/^()".includes(c)) {
      out.push({ t: "op", v: c });
      i += 1;
      continue;
    }
    throw new Error(`unexpected ${JSON.stringify(c)}`);
  }
  return out;
}

/**
 * Parse `text` into a function of x. Throws on anything it cannot read (an unknown name, an
 * unclosed bracket), so the caller can leave the plot out rather than draw nonsense.
 */
export function parseFn(text: string): Fn {
  const tokens = tokenise(text);
  let at = 0;
  const peek = () => tokens[at];
  const take = () => tokens[at++];
  const isOp = (v: string) => {
    const t = peek();
    return t?.t === "op" && t.v === v;
  };
  // A token that can start a factor directly after another (implicit times).
  const startsFactor = () => {
    const t = peek();
    return Boolean(t && (t.t === "num" || t.t === "id" || (t.t === "op" && t.v === "(")));
  };

  function expr(): Fn {
    let left = term();
    while (isOp("+") || isOp("-")) {
      const op = take()!.v;
      const right = term();
      const a = left;
      left = op === "+" ? (x) => a(x) + right(x) : (x) => a(x) - right(x);
    }
    return left;
  }
  function term(): Fn {
    let left = unary();
    for (;;) {
      if (isOp("*") || isOp("/")) {
        const op = take()!.v;
        const right = unary();
        const a = left;
        left = op === "*" ? (x) => a(x) * right(x) : (x) => a(x) / right(x);
      } else if (startsFactor()) {
        const right = power();
        const a = left;
        left = (x) => a(x) * right(x);
      } else return left;
    }
  }
  function unary(): Fn {
    if (isOp("-")) {
      take();
      const inner = unary();
      return (x) => -inner(x);
    }
    if (isOp("+")) {
      take();
      return unary();
    }
    return power();
  }
  function power(): Fn {
    const base = atom();
    if (isOp("^")) {
      take();
      const exponent = unary();
      return (x) => Math.pow(base(x), exponent(x));
    }
    return base;
  }
  function atom(): Fn {
    const t = take();
    if (!t) throw new Error("unexpected end");
    if (t.t === "num") return () => t.v;
    if (t.t === "op" && t.v === "(") {
      const inner = expr();
      if (!isOp(")")) throw new Error("missing )");
      take();
      return inner;
    }
    if (t.t === "id") {
      if (t.v === "x") return (x) => x;
      if (t.v === "pi") return () => Math.PI;
      if (t.v === "e") return () => Math.E;
      const f = FUNCS[t.v];
      if (f) {
        // sqrt(x) or sqrt x: the argument is the next power.
        const arg = power();
        return (x) => f(arg(x));
      }
    }
    throw new Error(`unexpected ${JSON.stringify(t.v)}`);
  }

  const fn = expr();
  if (at !== tokens.length) throw new Error("unexpected text at the end");
  return fn;
}

/** `parseFn`, or null where the text cannot be read. */
export function tryFn(text: string | null | undefined): Fn | null {
  if (!text) return null;
  try {
    return parseFn(text);
  } catch {
    return null;
  }
}
