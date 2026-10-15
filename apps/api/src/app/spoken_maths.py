"""Mathematics said out loud: LaTeX turned into the words a teacher would use.

WHY THIS IS A PARSER AND NOT A LIST OF SUBSTITUTIONS. The first version was a dozen regular
expressions, and the stored explanations defeated it at once. `$60^{\\circ}$` went through the
"to the power" rule and came out as "sixty to the power"; `\\dfrac` and `\\tfrac`, which the
reviewed steps use thousands of times, were not recognised at all; and `\\frac{\\sqrt{3}}{2}`
has braces inside braces, which no single regular expression can match. Walking the LaTeX
token by token, with each command reading its own arguments, is what makes nesting work.

WHAT IT AIMS FOR. The words a Nigerian secondary-school maths teacher says at the board —
"three quarters", "x squared", "angle P Q R", "log base two of eight", "sixty degrees" — not
a screen reader's spelling of the symbols. Where there is no natural spoken form (a matrix,
a table) it says what the thing is rather than reading every cell.

WHAT IT DOES NOT DO. It does not try to be a complete LaTeX engine. Anything it does not
recognise is dropped rather than spelled out, because a voice saying "backslash mathbb" is
worse than a voice skipping a symbol the board is showing anyway.
"""

from __future__ import annotations

import re

#: Commands that are a single spoken word or phrase and take no argument.
_WORDS = {
    "times": "times",
    "cdot": "times",
    "div": "divided by",
    "pm": "plus or minus",
    "mp": "minus or plus",
    "le": "is less than or equal to",
    "leq": "is less than or equal to",
    "leqslant": "is less than or equal to",
    "ge": "is greater than or equal to",
    "geq": "is greater than or equal to",
    "geqslant": "is greater than or equal to",
    "neq": "is not equal to",
    "ne": "is not equal to",
    "approx": "is approximately",
    "equiv": "is equivalent to",
    "propto": "varies as",
    "infty": "infinity",
    "pi": "pi",
    "alpha": "alpha",
    "beta": "beta",
    "gamma": "gamma",
    "delta": "delta",
    "Delta": "delta",
    "theta": "theta",
    "lambda": "lambda",
    "mu": "mu",
    "sigma": "sigma",
    "Sigma": "the sum of",
    "phi": "phi",
    "varphi": "phi",
    "omega": "omega",
    "rho": "rho",
    "epsilon": "epsilon",
    "cup": "union",
    "cap": "intersection",
    "in": "is in",
    "notin": "is not in",
    "subset": "is a subset of",
    "subseteq": "is a subset of",
    "varnothing": "the empty set",
    "emptyset": "the empty set",
    "angle": "angle",
    "triangle": "triangle",
    "parallel": "is parallel to",
    "perp": "is perpendicular to",
    "therefore": "therefore",
    "rightarrow": "gives",
    "leftrightarrow": "matches",
    "iff": "exactly when",
    "to": "tends to",
    "Rightarrow": "so",
    "ldots": "and so on",
    "cdots": "and so on",
    "dots": "and so on",
    "circ": "degrees",
    "degree": "degrees",
    "prime": "dash",
    "sin": "sine",
    "cos": "cos",
    "tan": "tan",
    "cot": "cot",
    "sec": "sec",
    "csc": "cosec",
    "cosec": "cosec",
    "log": "log",
    "ln": "the natural log of",
    "lim": "the limit",
    "int": "the integral",
    "sum": "the sum",
    "min": "min",
    "max": "max",
    "%": "percent",
    "{": "",
    "}": "",
}

#: Spacing and sizing commands: spoken as nothing at all.
_SILENT = {
    "left",
    "right",
    "big",
    "Big",
    "bigg",
    "Bigg",
    "displaystyle",
    "textstyle",
    "quad",
    "qquad",
    ",",
    ";",
    ":",
    "!",
    " ",
    "limits",
    "nolimits",
    "hline",
    "cline",
    "noindent",
}

#: Commands whose one argument is spoken as it is, with nothing added.
_TRANSPARENT = {
    "text",
    "textrm",
    "textbf",
    "textit",
    "mathrm",
    "mathbf",
    "mathit",
    "operatorname",
    "boldsymbol",
    "mbox",
    "emph",
}

#: Units as they are said. Only ever applied to a whole \text{...} argument.
_UNITS = {
    "cm": "centimetres",
    "m": "metres",
    "km": "kilometres",
    "mm": "millimetres",
    "g": "grams",
    "kg": "kilograms",
    "s": "seconds",
    "h": "hours",
    "hr": "hours",
    "min": "minutes",
    "km/h": "kilometres per hour",
    "m/s": "metres per second",
    "cm/s": "centimetres per second",
    "l": "litres",
    "ml": "millilitres",
    "cl": "centilitres",
}


class _Reader:
    """A cursor over a LaTeX string that hands out one token or one argument at a time."""

    def __init__(self, source: str) -> None:
        self.s = source
        self.i = 0

    def done(self) -> bool:
        return self.i >= len(self.s)

    def peek(self) -> str:
        return self.s[self.i] if self.i < len(self.s) else ""

    def skip_space(self) -> None:
        while self.i < len(self.s) and self.s[self.i].isspace():
            self.i += 1

    def command(self) -> str:
        """Read the name after a backslash: letters, or a single symbol."""
        start = self.i
        if self.i < len(self.s) and self.s[self.i].isalpha():
            while self.i < len(self.s) and self.s[self.i].isalpha():
                self.i += 1
        else:
            self.i += 1
        return self.s[start : self.i]

    def group(self) -> str:
        """Read one argument: a braced group, one command, or one character."""
        self.skip_space()
        if self.peek() == "{":
            depth, start = 0, self.i
            while self.i < len(self.s):
                c = self.s[self.i]
                if c == "\\":
                    self.i += 2
                    continue
                if c == "{":
                    depth += 1
                elif c == "}":
                    depth -= 1
                    if depth == 0:
                        self.i += 1
                        return self.s[start + 1 : self.i - 1]
                self.i += 1
            return self.s[start + 1 :]
        if self.peek() == "\\":
            self.i += 1
            return "\\" + self.command()
        c = self.peek()
        self.i += 1
        return c

    def optional(self) -> str | None:
        """Read a [bracketed] optional argument, if there is one."""
        self.skip_space()
        if self.peek() != "[":
            return None
        end = self.s.find("]", self.i)
        if end == -1:
            return None
        value = self.s[self.i + 1 : end]
        self.i = end + 1
        return value


def _matching(latex: str, start: int) -> int:
    """Index of the bracket that closes the one at `start` (or the end of the string)."""
    opening = latex[start]
    closing = ")" if opening == "(" else "]"
    depth = 0
    for i in range(start, len(latex)):
        if latex[i] == opening:
            depth += 1
        elif latex[i] == closing:
            depth -= 1
            if depth == 0:
                return i
    return len(latex)


def _has_operator(inner: str) -> bool:
    """True when a bracket holds a sum or difference, so saying it without the bracket misleads.

    A leading minus is a sign, not an operator: f(-1) and (-2, 3) do not need a bracket said.
    """
    body = re.sub(r"\{[^{}]*\}", "", inner.strip())
    body = body.lstrip("-")
    return bool(re.search(r"(?<![,(])\s*[-+]|\\pm|\\mp", body)) and "," not in body


def _is_int(text: str) -> bool:
    return bool(re.fullmatch(r"-?\d+", text.strip()))


#: The fractions a student hears as words and understands at once. Everything else is said
#: "9 over 2": "nine halves" and "fifteen halves" are correct English that nobody in a
#: Nigerian classroom says, and a student listening for the numbers loses them.
_FRACTION_WORDS = {
    (1, 2): "a half",
    (1, 3): "a third",
    (2, 3): "two thirds",
    (1, 4): "a quarter",
    (3, 4): "three quarters",
}


def _fraction(num: str, den: str) -> str:
    """ "a half" and "three quarters" for the familiar few, "a over b" for everything else."""
    if _is_int(num) and _is_int(den):
        words = _FRACTION_WORDS.get((int(num), int(den)))
        if words:
            return words
    top, bottom = speak(num), speak(den)
    # a long top or bottom gets a pause so "x plus 1 over x minus 1" is not heard as x + 1/x - 1
    if len(top.split()) > 1 or len(bottom.split()) > 1:
        return f"{top}, all over {bottom},"
    return f"{top} over {bottom}"


def _power(base_spoken: str, exponent: str) -> str:
    exp = exponent.strip()
    if exp in ("\\circ", "\\degree", "o"):
        return " degrees"
    if exp == "2":
        return " squared"
    if exp == "3":
        return " cubed"
    if exp in ("\\prime", "'"):
        return " dash"
    if exp == "-1":
        return " to the power minus one"
    if exp == "T":
        return " transpose"
    return f" to the power {speak(exp)}"


def _matrix(body: str, kind: str) -> str:
    rows = [r for r in re.split(r"\\\\", body) if r.strip()]
    spoken = "; ".join(", ".join(speak(cell) for cell in row.split("&")) for row in rows)
    lead = "the determinant with rows" if kind == "vmatrix" else "the matrix with rows"
    return f"{lead} {spoken}"


# ------------------------------------------------------------------------------- chemistry
#
# Chemistry is written with KaTeX's mhchem: $\ce{H2SO4}$, $\ce{N2 + 3H2 <=> 2NH3}$. Read as
# ordinary LaTeX, "->" came out "minus is greater than" and "Ca" as the letters c and a run
# together. A chemistry teacher spells a formula out a symbol at a time ("H two S O four"),
# says the charge after the ion ("S O four, two minus") and reads an arrow as "gives".

#: Arrows, longest first so "<=>" is not read as "<" then "=>".
_CE_ARROWS = (
    ("<=>>", "is in equilibrium with"),
    ("<<=>", "is in equilibrium with"),
    ("<=>", "is in equilibrium with"),
    ("<-->", "is in equilibrium with"),
    ("<->", "is in equilibrium with"),
    ("->", "gives"),
    ("<-", "is formed from"),
)
_CE_STATES = {"aq": "aqueous", "s": "solid", "l": "liquid", "g": "gas"}
_CE_COUNTS = {"2": "twice", "3": "three times"}


def _ce_condition(text: str) -> str:
    """What is written over or under an arrow: words as they are, LaTeX read as usual."""
    text = text.strip()
    if text.startswith("{") and text.endswith("}"):
        text = text[1:-1]
    if text.strip() in (r"\Delta", r"\triangle"):
        return "heat"  # a delta over the arrow means heating
    if text.startswith("$") and text.endswith("$"):
        return speak(text.strip("$"))
    return speak_chemistry(text)


def _ce_charge(sign: str) -> str:
    """'2-' as 'two minus', '+' as 'plus'; also '-2' and the dot/sign-less forms."""
    sign = sign.strip().strip("{}")
    found = re.fullmatch(r"(\d*)([+-]?)(\d*)", sign)
    if not found:
        return speak(sign)
    number = found.group(1) or found.group(3)
    word = {"+": "plus", "-": "minus", "": ""}[found.group(2)]
    return " ".join(part for part in (number, word) if part)


def _ce_species(token: str) -> str:
    """One formula, ion or nuclide: "CaCO3", "SO4^2-", "^{235}_{92}U", "2e-", "NaCl(aq)"."""
    out: list[str] = []
    i = 0
    # A nuclide's mass number and atomic number come first: ^{235}_{92}U.
    nuclide = re.match(r"\^\{?(\d+)\}?_\{?(-?\d+)\}?", token)
    if nuclide:
        rest = _ce_species(token[nuclide.end() :])
        atomic = nuclide.group(2).replace("-", "minus ")
        return f"{rest}, mass number {nuclide.group(1)}, atomic number {atomic}"
    coefficient = re.match(r"\d+(?:/\d+)?(?:\.\d+)?", token)
    if coefficient and coefficient.end() < len(token):
        out.append(coefficient.group(0))
        i = coefficient.end()
    if token[i:] in ("e-", "e^-", "e^{-}"):
        many = bool(out) and out[-1] != "1"
        return " ".join([*out, "electrons" if many else "an electron"])
    while i < len(token):
        c = token[i]
        rest = token[i:]
        if c.isupper():
            symbol = re.match(r"[A-Z][a-z]?", rest)
            assert symbol
            out.append(" ".join(symbol.group(0).upper()))
            i += symbol.end()
        elif c.isdigit():
            number = re.match(r"\d+", rest)
            assert number
            out.append(number.group(0))
            i += number.end()
        elif c.islower():
            word = re.match(r"[a-z]+", rest)
            assert word
            out.append(word.group(0))
            i += word.end()
        elif c == "(":
            close = _matching(token, i)
            inner = token[i + 1 : close]
            i = close + 1
            if inner in _CE_STATES:
                out.append(_CE_STATES[inner])
                continue
            count = re.match(r"\d+", token[i:])
            out.append(_ce_species(inner))
            if count:
                out.append(_CE_COUNTS.get(count.group(0), f"{count.group(0)} times"))
                i += count.end()
        elif c == "[":
            close = _matching(token, i)
            out.append(_ce_species(token[i + 1 : close]))
            i = close + 1
        elif c == "^":
            charge = re.match(r"\^(\{[^}]*\}|\d*[+-]|[+-]?\d*)", rest)
            assert charge
            out.append(_ce_charge(charge.group(1)))
            i += charge.end()
        elif c == "_":
            sub = re.match(r"_(\{[^}]*\}|.)", rest)
            assert sub
            out.append(_ce_species(sub.group(1).strip("{}")))
            i += sub.end()
        elif c in "+-" and (i + 1 == len(token) or token[i + 1] in "+-"):
            # Na+, Cl-, and the doubled O2-- some books write: a charge with no caret
            out.append("plus" if c == "+" else "minus")
            i += 1
        elif rest.startswith(("°C", "℃")):
            out.append("degrees Celsius")
            i += 2 if rest.startswith("°C") else 1
        elif c == "°":
            out.append("degrees")
            i += 1
        elif c in ".*·":
            out.append("dot")  # the dot in a hydrate: CuSO4.5H2O
            i += 1
        elif c == "=":
            out.append("double bond")
            i += 1
        elif c == "#":
            out.append("triple bond")
            i += 1
        elif c == "\\":
            command = re.match(r"\\[a-zA-Z]+(?:\{[^{}]*\})*", rest)
            end = command.end() if command else 2
            out.append(speak(rest[:end]))
            i += end
        elif c == "{":
            close = token.find("}", i)
            close = len(token) if close == -1 else close
            out.append(_ce_species(token[i + 1 : close]))
            i = close + 1
        else:
            i += 1  # a single bond's "-" and anything else on the board is not said
    return " ".join(part for part in out if part)


def speak_chemistry(body: str) -> str:
    """The inside of \\ce{...} as a chemistry teacher says it."""
    out: list[str] = []
    i = 0
    s = body.strip()
    while i < len(s):
        if s[i].isspace():
            i += 1
            continue
        arrow = next(((a, w) for a, w in _CE_ARROWS if s.startswith(a, i)), None)
        if arrow:
            i += len(arrow[0])
            conditions = []
            while i < len(s) and s[i] == "[":
                close = _matching(s, i)
                conditions.append(_ce_condition(s[i + 1 : close]))
                i = close + 1
            said = [c for c in conditions if c]
            if not said:
                out.append(arrow[1])
            elif arrow[1].endswith(" with"):
                # "is in equilibrium, with V 2 O 5 and 450 degrees Celsius, with"
                out.append(f"{arrow[1][: -len(' with')]}, with {' and '.join(said)}, with")
            else:
                out.append(f"{arrow[1]}, with {' and '.join(said)},")
            continue
        if s[i] == "+" and (i + 1 == len(s) or s[i + 1].isspace()):
            out.append("plus")
            i += 1
            continue
        if s[i] == "$":
            close = s.find("$", i + 1)
            close = len(s) if close == -1 else close
            out.append(speak(s[i + 1 : close]))
            i = close + 1
            continue
        # One species runs to the next space, keeping brackets and braces whole.
        start, depth = i, 0
        while i < len(s) and (depth or not s[i].isspace()):
            if s[i] in "({[":
                depth += 1
            elif s[i] in ")}]":
                depth = max(0, depth - 1)
            if not depth and any(s.startswith(a, i) for a, _ in _CE_ARROWS) and i > start:
                break
            i += 1
        token = s[start:i]
        if token in ("v", "(v)"):
            out.append("which is precipitated")
        elif token in ("^", "(^)"):
            out.append("which is given off")
        else:
            out.append(_ce_species(token))
    text = " ".join(part for part in out if part)
    return re.sub(r"\s{2,}", " ", text).strip(" ,")


_BETWEEN = re.compile(r"^\s*(-?[\w.\\{}]+)\s*<\s*([a-zA-Z])\s*<\s*(-?[\w.\\{}]+)\s*$")


def speak(latex: str) -> str:
    """One LaTeX expression (the inside of $...$) as spoken words."""
    between = _BETWEEN.match(latex)
    if between:
        low, var, high = between.groups()
        return f"{var} is between {speak(low)} and {speak(high)}"
    r = _Reader(latex)
    out: list[str] = []

    def emit(text: str) -> None:
        if text:
            out.append(text)

    while not r.done():
        c = r.peek()
        if c == "\\":
            r.i += 1
            name = r.command()
            if name in ("frac", "dfrac", "tfrac", "cfrac"):
                num, den = r.group(), r.group()
                # "2\tfrac{1}{2}" is a mixed number: "two and a half"
                if out and re.fullmatch(r"\d+", out[-1]) and _is_int(num) and _is_int(den):
                    out[-1] = f"{out[-1]} and {_fraction(num, den)}"
                else:
                    emit(_fraction(num, den))
            elif name == "sqrt":
                # a number or letter written straight against the root is its coefficient
                starts = r.i - len("\\sqrt")
                coefficient = bool(out) and latex[:starts][-1:].isalnum()
                index = r.optional()
                body = speak(r.group())
                if index and index.strip() == "3":
                    emit(f"the cube root of {body}")
                elif index:
                    emit(f"the {speak(index)}th root of {body}")
                elif coefficient and len(body.split()) == 1:
                    emit(f"root {body}")  # 2\sqrt{3} is said "two root three"
                else:
                    emit(f"the square root of {body}")
            elif name in ("sin", "cos", "tan", "cot", "sec", "csc", "cosec") and r.peek() == "^":
                # sin^2 x reads "sine squared x"
                r.i += 1
                emit(_WORDS[name] + _power("", r.group()))
            elif name == "log" and r.peek() == "_":
                r.i += 1
                emit(f"log base {speak(r.group())} of")
            elif name == "int" and r.peek() in "_^":
                # \int_{0}^{\pi/4} reads "the integral from 0 to pi over 4 of"
                limits = {}
                while r.peek() in ("_", "^") and r.peek():
                    mark = r.s[r.i]
                    r.i += 1
                    limits[mark] = speak(r.group())
                emit(f"the integral from {limits.get('_', '')} to {limits.get('^', '')} of")
            elif name == "ce":
                emit(speak_chemistry(r.group()))  # mhchem: \ce{H2SO4}
            elif name == "pu":
                emit(speak(r.group()))  # mhchem's physical unit: \pu{25 cm^3}
            elif name == "lim" and r.peek() == "_":
                r.i += 1
                emit(f"the limit as {speak(r.group())}, of")
            elif name in _TRANSPARENT:
                body = r.group()
                if "\\" in body or "$" in body:
                    emit(speak(body))
                else:
                    # \text{cm} is a word, not the letters c and m
                    plain = body.strip()
                    emit(_UNITS.get(plain, plain))
            elif name in ("overline", "bar"):
                emit(f"{speak(r.group())} bar")
            elif name == "hat":
                emit(f"{speak(r.group())} hat")
            elif name == "vec":
                emit(f"vector {speak(r.group())}")
            elif name == "begin":
                env = r.group()
                end_tag = f"\\end{{{env}}}"
                stop = latex.find(end_tag, r.i)
                body = latex[r.i : stop if stop != -1 else len(latex)]
                r.i = stop + len(end_tag) if stop != -1 else len(latex)
                if env in ("pmatrix", "bmatrix", "matrix", "vmatrix"):
                    emit(_matrix(body, env))
                elif env in ("array", "tabular"):
                    emit("the table")
                else:
                    emit(speak(body))
            elif name in _SILENT:
                continue
            elif name in _WORDS:
                emit(_WORDS[name])
            # anything else is dropped rather than spelled out
        elif c == "{":
            emit(speak(r.group()))
        elif c == "^":
            r.i += 1
            exponent = r.group()
            if out:
                out[-1] = out[-1] + _power("", exponent)
            else:
                emit(speak(exponent))  # ^{n}C_{r} has nothing to raise: it is just "n C r"
        elif c == "_":
            r.i += 1
            sub = speak(r.group())
            if out and re.fullmatch(r"\d+", out[-1]):
                out[-1] = f"{out[-1]} base {sub}"  # 34_{n}: a numeral in base n
            else:
                emit(sub)
        elif c.isdigit() or (c == "." and latex[r.i + 1 : r.i + 2].isdigit()):
            m = re.match(r"\d[\d,]*(?:\.\d+)?|\.\d+", latex[r.i :])
            assert m
            number = m.group(0)
            r.i += len(number)
            # 50{,}000 is typeset as 50 then {,} then 000: glue the parts back together
            while latex[r.i : r.i + 3] == "{,}":
                r.i += 3
                more = re.match(r"\d+", latex[r.i :])
                if not more:
                    break
                number += "," + more.group(0)
                r.i += len(more.group(0))
            emit(number)
        elif c.isalpha():
            r.i += 1
            emit(c)
        elif c in "+":
            r.i += 1
            emit("plus")
        elif c == "-":
            r.i += 1
            emit("minus")
        elif c == "=":
            r.i += 1
            emit("equals")
        elif c == "<":
            r.i += 1
            emit("is less than")
        elif c == ">":
            r.i += 1
            emit("is greater than")
        elif c == "|":
            r.i += 1
            # |x - 3| is "the size of" the thing inside; the closing bar is silent
            closing = latex.find("|", r.i)
            if closing != -1:
                emit(f"the size of {speak(latex[r.i : closing])}")
                r.i = closing + 1
        elif c == "!":
            r.i += 1
            emit("factorial")
        elif c == ":":
            r.i += 1
            emit("to" if out and re.fullmatch(r"\d+", out[-1]) else "such that")
        elif c == "&":
            r.i += 1
            emit(",")
        elif c in "([":
            close = _matching(latex, r.i)
            inner = latex[r.i + 1 : close]
            before = latex[r.i - 1 : r.i]
            r.i = close + 1
            touching = re.sub(r"\\left\s*$", "", latex[: close - len(inner) - 1]).rstrip()[-1:]
            # n(A \cup B) and P(5) are functions only when what is inside has no small letters
            capitals_only = not re.search(r"[a-z]", re.sub(r"\\[a-zA-Z]+", "", inner))
            if (
                before.isalpha()
                and out
                and out[-1] == before
                and (before in "fgh" or (before in "nP" and capitals_only))
            ):
                emit(f"of {speak(inner)}")  # f(x) is "f of x"
            elif _has_operator(inner):
                # the bracket is doing work: 3p - (q - 3r) is not 3p - q - 3r
                if touching and (touching.isalnum() or touching == "}") and out:
                    emit("times")  # 2(x + 1), \sqrt{2}(x - 1): a factor against a bracket
                emit(f"the bracket {speak(inner)},")
            elif "," in inner and "{,}" not in inner:
                # a point or pair: (2, 0) is "2 comma 0", so it is heard as one thing
                emit(" comma ".join(speak(part) for part in inner.split(",")))
            else:
                emit(speak(inner))
            after = re.sub(r"^\s*(\\right\s*[)\]]?)?\s*(\\left)?\s*", "", latex[r.i :])
            if after[:1] in ("(", "[") or latex[r.i : r.i + 1] in ("(", "["):
                emit("times")  # (x + 1)(x - 2): brackets side by side multiply
        elif c in ")]":
            r.i += 1
        elif c in ",;":
            r.i += 1
            emit(",")
        elif c == "'":
            r.i += 1
            emit("dash")
        elif c == "%":
            r.i += 1
            emit("percent")
        elif c == "/":
            r.i += 1
            emit("over")
        else:
            r.i += 1
            if not c.isspace() and c not in "~":
                emit(c)

    text = " ".join(out)
    text = re.sub(r"\s+([,.;])", r"\1", text)
    text = re.sub(r",\s*,", ",", text)
    return re.sub(r"\s{2,}", " ", text).strip(" ,")


_INLINE = re.compile(r"\$\$(.+?)\$\$|\$([^$]+)\$", re.S)


def speak_text(line: str) -> str:
    """A sentence with its $...$ mathematics turned into words, ready for a voice.

    The words around the maths are left alone. Marks that only make sense on a screen — a
    tick, markdown asterisks — are removed, because a voice will otherwise read them out.
    """
    spoken = _INLINE.sub(lambda m: " " + speak(m.group(1) or m.group(2)) + " ", line)
    # ₦26,400 is said "26,400 naira", number first
    spoken = re.sub(r"₦\s*([\d,]+(?:\.\d+)?)", r"\1 naira", spoken)
    spoken = spoken.replace("✓", "").replace("✗", "")
    spoken = re.sub(r"\*([^*]+)\*", r"\1", spoken)
    spoken = re.sub(r"\s+([,.;:?!])", r"\1", spoken)
    spoken = re.sub(r"([,;])(?=[,;.])", "", spoken)
    return re.sub(r"\s{2,}", " ", spoken).strip()
