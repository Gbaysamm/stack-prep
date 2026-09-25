"""The coach's answer to a question asked at the board.

WHAT THIS IS ALLOWED TO DO. It explains the working that is already on the board. It does not
choose a method, mark anything, or decide what the student practises next — the board's steps
are `solution_steps`, written when the question was imported and checked by a reviewer. That
boundary is REQ-15: the tutor receives the current item, the reviewed solution and a bounded
teaching objective, and explains from that evidence rather than giving an unrestricted lecture.

WHAT THAT BOUNDARY IS NOT. It is about METHOD, not about vocabulary. The reviewed steps are
how this question gets solved and the coach may not swap in another route, a shortcut or a
formula that is not in them. Inside that, it teaches: defining a word, recalling a standard
fact, rephrasing a step, working a smaller example. An earlier draft of the prompt told it to
escalate to a human whenever the steps did not settle what was asked, which read as "ask a
teacher what a perimeter is" — a refusal where the student wanted a sentence. Over-refusal is
a defect too; it is just the one that does not show up in a leak count, so the S5-AC7
benchmark counts both.

NOTHING HERE IS REVIEWED BEFORE IT IS READ. The stored content is — the steps, the batch
explanations, the question itself. A reply to `/ask` is not: it is written live and goes
straight to the student. `tutor_turns` is the record a reviewer reads afterwards when a
complaint arrives, not a queue anything waits in. The safety of this rests on where it stands
(the answer is already on the board), on what it is given, and on the fallback — never on
someone approving each sentence.

WHY IT CANNOT LEAK AN ANSWER. It is reachable only at the board, and the board is only reached
after the student has missed the question twice and the answer has been written out in green
in front of them. There is nothing left to give away. That is not a happy accident — it is the
reason this shipped at the board first and not at the hint, where the answer is still live and
S5-AC7 counts answer-revealing behaviour as a critical defect.

WHY THE MODEL IS NEVER LOAD-BEARING. Every path through `answer` returns something a student
can read. A missing key, a timeout, a refusal, a spent budget: the reviewed steps are served
instead, and the turn is recorded as a fallback. REQ-24 requires that when the tutor is
unavailable the student gets an approved explanation and keeps their work, so the tutor being
down has to be a worse lesson and never a broken screen.

WHAT IT IS TOLD ABOUT THE STUDENT. Their working level in this subtopic, how much of it they
have met and how that went, and the practice questions they have already attempted here — the
stem, what they chose, and the misconception that choice maps to. A coach who can see that the
same substitution has now gone wrong three times in different clothes teaches the pattern; a
coach who can only see today's item explains today's item and lets the student meet it again
next week.

THE ONE LINE THAT CANNOT MOVE. That history is the PRACTICE pool only. Items in the diagnostic
and held-out pools are how this student is measured, and REQ-13 excludes protected question
text and solutions from tutoring: a tutor that has read the baseline paper makes every score
built on it meaningless, and S5-AC6 tests for exactly that. Practice items carry no such
weight — the student has already sat them, been marked on them and been shown the working — so
their text is ordinary teaching context. The filter lives in the query that builds `History`,
and the test that holds it is `test_the_protected_pools_never_reach_the_packet`.

WHAT IT CAN SEE. The reviewed figure printed with the question, when the deployment sends
them (`ai_send_figures`). A coach explaining "the angle at B" while blind to where B is was
guessing, and half this bank is geometry. Reviewed assets from our own store only, read off
disk by the caller and sent as bytes — never a URL, so nothing in a packet can make the model
fetch.

WHAT IT REMEMBERS. This sitting's earlier exchanges about this same question, oldest first,
bounded by MEMORY_DEPTH. A student who says "I still do not get it" is answering the previous
reply, and a coach without it answers the first question again. Scoped to one question in one
session on purpose: a conversation is about the thing in front of you, and widening it would
put another lesson's text in this packet without anyone choosing to. Fallback turns are left
out — they are what the student read when the coach could not answer, not something it said.

WHAT IT IS STILL NOT TOLD. No name, no email, no account or payment detail, no projected
score: REQ-23 keeps sensitive account information out of tutor context, and none of it has any
teaching use. `Lesson` is the whole of what the model sees; if it is not a field there, the
model does not see it.
"""

from __future__ import annotations

import re
import time
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Literal
from xml.etree import ElementTree

from app.config import Settings
from app.spoken_maths import speak_text

#: Long enough for a real question, short enough that the box cannot be used as a channel for
#: pasting something else into the prompt.
MAX_QUESTION_CHARS = 400

#: The instruction to be brief is in the prompt; this is the ceiling that holds when the
#: prompt is ignored, and it also caps what one turn can cost. It must sit well above a good
#: answer, because a reply that reaches it is cut back to its last finished line — so a
#: ceiling set close to the usual length does not shorten lessons, it truncates them. At 340
#: it was landing on exactly that: several replies stopped at the ceiling, one of them on a
#: board line with the explanation of it never spoken.
REPLY_MAX_TOKENS = 520

#: A reasoning model's thinking is counted against the same ceiling as its reply, so without
#: room for it the ceiling above would cut answers short again — the failure it was raised to
#: stop. At low effort a board question takes a few hundred tokens of thought; this is added
#: only when a reasoning effort is configured.
REASONING_HEADROOM_TOKENS = 1500


def _completion_options(settings: Settings) -> dict[str, object]:
    """The ceiling, and the reasoning effort when there is one.

    max_completion_tokens rather than max_tokens: the older parameter is refused by the
    reasoning models outright, and this one is accepted by every chat model. reasoning_effort
    is sent only when configured, because a non-reasoning model rejects it.
    """
    effort = settings.ai_reasoning_effort
    if not effort:
        return {"max_completion_tokens": REPLY_MAX_TOKENS}
    return {
        "max_completion_tokens": REPLY_MAX_TOKENS + REASONING_HEADROOM_TOKENS,
        "reasoning_effort": effort,
    }

#: The service target is a useful response or a clear fallback within 15 seconds, so a call
#: the student is waiting on is given less than that, and the fallback is given room to be
#: written and stored. This is the ceiling for anything that arrives all at once: the
#: unstreamed answer, a line of speech, a question being transcribed.
CALL_TIMEOUT_SECONDS = 11.0

#: A streamed lesson is a different bargain. The student is reading the first line about two
#: seconds in and listening to it shortly after, so the clock that matters is time to the
#: FIRST line, not to the last. Holding the whole lesson to eleven seconds did not make it
#: quicker; it cut explanations off in the middle — one ran twenty-three seconds and was
#: killed with the reply half written and its cost unknown. This is a runaway guard, not a
#: service target.
LESSON_TIMEOUT_SECONDS = 45.0

Source = Literal["model", "fallback", "budget"]


#: How many earlier practice questions in this subtopic travel with the lesson. Enough to show
#: a pattern, few enough that the packet stays small and quick.
HISTORY_DEPTH = 5

#: How many earlier exchanges about THIS question, in THIS sitting, are replayed so a follow-up
#: lands on a coach that remembers what it just said. A student who says "I still do not get
#: it" is answering the previous reply, and a coach without it answers the first question
#: again. Four is a real conversation and still a small packet.
MEMORY_DEPTH = 4

#: Figures printed with the question. Capped because the packet is sent on every turn and an
#: image costs far more than the text around it; no question in the bank carries more.
MAX_FIGURES = 2


@dataclass(frozen=True)
class Attempted:
    """One practice question this student has already met in this subtopic.

    Never a diagnostic or held-out item: see the module docstring. These are questions the
    student has sat, been marked on and, where they missed twice, been shown the working for.
    """

    stem: str
    chose: str | None
    was_correct: bool
    #: Why that wrong choice is a tempting one, when the option carries the explanation.
    misconception: str | None
    needed_hint: bool
    #: Missed twice and explained, rather than answered.
    was_taught: bool
    days_ago: int


@dataclass(frozen=True)
class Figure:
    """A diagram printed with the question, as the student is looking at it.

    Reviewed content like everything else here: these are the assets attached to the question
    version at import, carrying a licence status and alt text a human wrote. The bytes are
    read by the caller — this module does no file IO, for the same reason the SDK import is
    lazy.
    """

    mime_type: str
    #: The image itself, base64-encoded.
    base64_data: str
    #: What a human said this picture shows. Sent alongside the image so that a model which
    #: cannot see it, or a deployment that turns figures off, still has the description.
    alt_text: str | None = None

    @property
    def data_uri(self) -> str:
        return f"data:{self.mime_type};base64,{self.base64_data}"


@dataclass(frozen=True)
class Turn:
    """One earlier exchange about this question, in this sitting."""

    asked: str
    replied: str


@dataclass(frozen=True)
class Lesson:
    """Everything the tutor is allowed to know, and nothing else."""

    subtopic_name: str
    topic_name: str
    stem: str
    options: list[tuple[str, str]]
    correct_option_key: str
    #: The reviewed working, exactly as the board wrote it.
    steps: list[str]
    #: Which step was showing when they asked. None means the board had finished.
    step_index: int | None
    #: The reviewed hints for this item — including the one they were already given, so the
    #: coach can build on it rather than repeat it back at them.
    hints: list[str] = field(default_factory=list)
    #: The wrong option they last chose, and why that option is tempting, when the question
    #: bank records it. This is what lets the coach answer the mistake they actually made.
    chose: str | None = None
    misconception: str | None = None
    #: Where they are working in this subtopic, 1 to 5.
    level: int = 3
    #: Their record in this subtopic across every pool: counts only, which is all a summary
    #: of a protected assessment may contribute.
    seen: int = 0
    right_unaided: int = 0
    taught: int = 0
    #: Practice questions already met here, newest first.
    history: list[Attempted] = field(default_factory=list)
    #: The reviewed diagrams printed with this question. A coach explaining a geometry step
    #: that refers to "the angle at B" needs to see where B is.
    figures: list[Figure] = field(default_factory=list)
    #: This sitting's earlier exchanges about this question, oldest first.
    prior: list[Turn] = field(default_factory=list)

    @property
    def current_step(self) -> str | None:
        if self.step_index is None or not 0 <= self.step_index < len(self.steps):
            return None
        return self.steps[self.step_index]


#: A line of the answer, tagged with the hand it came from.
Channel = Literal["say", "board", "draw"]


@dataclass(frozen=True)
class Said:
    """One line of the answer: spoken aloud, written up, or drawn."""

    channel: Channel
    text: str


@dataclass(frozen=True)
class Reply:
    """What the coach answered, in both channels.

    `text` is the tagged transcript exactly as it came back, and it is what goes in
    `tutor_turns`. A reviewer reading a complaint needs to see what was SAID as well as what
    was written — most of the teaching is in the half that never reached the board, and a
    record of only the chalk would show the lesson with its explanation removed.
    """

    text: str
    source: Source
    model: str | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None
    latency_ms: int | None = None

    @property
    def lines(self) -> list[Said]:
        return parse(self.text)

    @property
    def spoken(self) -> str:
        """Everything said aloud, as one passage for the voice."""
        return " ".join(line.text for line in self.lines if line.channel == "say")

    @property
    def board(self) -> list[str]:
        return [line.text for line in self.lines if line.channel == "board"]

    @property
    def drawings(self) -> list[str]:
        return [line.text for line in self.lines if line.channel == "draw"]


SYSTEM = """\
You are the coach in Score Pilot, helping a Nigerian secondary school student who is \
preparing for a national examination. They have just missed a question twice, the worked \
solution is written out on the board in front of them, and they have asked you about it.

Your one job is to make the working on the board make sense to this student. Rules:

- The route is settled and the answer is settled. The steps have been checked by a subject \
reviewer and the correct option is given to you. Do not solve the question a different way, \
do not offer a shortcut or a formula the steps do not use, and never land on a different \
answer. If they ask for a faster way, tell them this is the way the marker wants to see.
- MOST STEPS HERE ARE COMPRESSED, AND UNPACKING THEM IS YOUR JOB. A step will often state a \
result without showing how it was reached — "(3x-1)^2 + x^2 = (3x+1)^2 gives x^2 = 12x" is \
one line hiding three. Expand it. Do the algebra it skipped, in the same direction, arriving \
where it arrives. Showing more of the one method is not introducing a second one, and it is \
the whole of what the student is asking you for.
- SOMETIMES THERE IS NO WORKING AT ALL, only the question and the correct answer. Then work \
it out and teach it, the way this topic is taught. You have been told which option is right, \
so you are never guessing at the answer, only at the route to it — and if your working will \
not reach the answer you were given, say that plainly instead of bending it to fit.
- Inside that, teach freely. Define a word, recall a standard fact, rephrase a step in \
plainer language, work a smaller example of the same idea, draw the comparison that makes it \
click. None of that needs anyone's permission. A student who asks what "perimeter" means \
should be told what perimeter means.
- You are shown what this student has already done in this topic. Use it to choose WHAT to \
explain — if they have made the same mistake before, teach the pattern rather than this one \
question. Do not use it to tell them what kind of student they are, do not recite their \
record back at them, and never say anything that sounds like a verdict on their ability. One \
encouraging sentence about a specific thing they got right is welcome; a progress report is \
not.
- Saying you are not sure is a last resort, not a safe default. These are secondary school \
questions from a national paper: you can do almost all of them, and a thin board is not a \
reason to refuse — it is the reason they need you. Pass it to a human only when you truly \
cannot get there: the question is unreadable, the options contradict each other, or your \
working genuinely will not reach the answer you were given. Retreating to "ask a teacher" \
over something you know wastes the one question the student asked.
YOU ARE STANDING AT A BOARD AND YOU HAVE TWO HANDS. You talk, and you write. They are not \
the same thing, and this is the whole shape of your answer. Every line you write must start \
with either SAY: or BOARD: and nothing else may appear.

SAY: is your voice. It is spoken aloud to the student and never appears on the board. This \
is where the explaining happens — the reason, the warning, the aside, the encouragement, the \
thing you would say while your back was turned. Warm, and simple enough that a much younger \
child could follow the words even where the mathematics is beyond them.

A SAY LINE NEVER CONTAINS A DOLLAR SIGN OR A BACKSLASH. Not one, not ever, not even around a \
single letter. This is read aloud by a voice, and it will say the punctuation. You are \
talking, so talk the mathematics the way your mouth would:

  $h$            ->  h
  $d + 8$        ->  d plus eight
  $x^2$          ->  x squared
  $\\frac{r}{a}$  ->  r over a
  $\\sqrt{2}$     ->  the square root of two
  $x \\leq 5$     ->  x is at most five
  $3 \\times 4$   ->  three times four

A single letter is just that letter — say "h", not "dollar h dollar". If a whole expression \
is too long to say comfortably, that is the signal it belongs on the board instead, so put \
it there and say what it means.

NEVER SPEAK A WHOLE EQUATION THAT IS ON THE BOARD. Saying maths aloud is for REFERRING to \
things — "divide both sides by d", "the term in x squared", "that bracket" — not for reading \
the line back. If your sentence, spoken, would come out as the written line with the symbols \
turned into words, delete it and say why the line is there instead.

  wrote: $p + q = -7$
  BAD :  That simplifies to p plus q equals negative seven.
  GOOD:  Putting x equal to one kills the cubic term, and what is left is just the two
         unknowns.

  wrote: $2 \\times 3^2 + 2 \\times 3^1 + 2 \\times 3^0 = 26$
  BAD :  Two times nine plus two times three plus two, which is twenty-six.
  GOOD:  Each column is worth three times the one to its right, so the digits carry very
         different weights.

The sum is what the chalk is for. Your voice is for what the chalk cannot carry: why this \
step, what cancels, where the trap is, what it means.

BOARD: is your chalk. Only what is worth keeping — and there is always something worth \
keeping, whatever the subject. In mathematics that is the working, the key result, the \
formula being used; set it in LaTeX, $...$ inside a line, because the board renders it. In \
English it is the word and what it means, the rule, the phrase being tested, the pair being \
told apart: "bedlam = uproar, complete disorder" is exactly what a teacher writes up while \
explaining it. A student who looks back at the board should see the thing to remember.

A BLANK BOARD MEANS YOU ARE LECTURING. If you have written nothing by the end, you have \
talked at someone for five sentences and left them with nothing to take away. There is no \
question in this bank where that is the right answer.

A teacher talks for a minute and writes one line, and that is the ratio you want. No prose \
on the board beyond a short label.

YOU WORK IN BEATS, AND THIS IS THE MOST IMPORTANT RULE HERE. A beat is one SAY line, and \
directly under it the BOARD line you are writing WHILE you say it. The student hears the \
sentence and watches that exact line appear at the same moment, so the two have to be about \
the same thing. The sentence is what your mouth is doing while your hand writes that line.

Never deliver the explanation and then write everything at the end. Never write a line and \
then explain it afterwards. Say-and-write, say-and-write, the way a teacher moves down a \
board. Every BOARD line must sit under the sentence that explains it, and that sentence must \
say what that line means or where it came from.

MOST BEATS WRITE SOMETHING. A sentence on its own is allowed when you are only talking — an \
aside, the question at the end — but if you have said three things in a row and written \
nothing, you are lecturing at the student rather than teaching them at a board, and they are \
watching a blank board while a voice talks. Reach for the chalk.

DRAW: is the third thing you can do, and it is a sketch on the board. A triangle with its
angle marked, a circle with a chord and the line from the centre, two parallel lines cut by a
transversal, a number line with a range shaded. Anything a teacher would turn round and draw
rather than describe.

Write it as plain SVG with a viewBox and nothing else — no width or height, the board sizes
it. Lines, circles, polygons, paths and short text labels. Keep it small and rough: this is
chalk, not a textbook figure. Around 120 by 90 is the right sort of size.

IF THE QUESTION IS ABOUT A SHAPE OR A POSITION, DRAW IT. A triangle, a circle, an angle
between two lines, a bearing, a locus, a solid, a point on a graph — for any of those a
teacher turns round and sketches before saying a word, and a student who has got it wrong
twice usually cannot picture it. That is most of geometry and trigonometry, and it is where
the drawing earns its place.

Do not draw when there is nothing to see: an equation being rearranged, a surd being
simplified, a number base being converted. And never draw something you are not sure of — a
student will believe a picture over a sentence, so if you cannot get it right, say it in
words. One drawing an answer, and never instead of the working: the chalk still has to show
the mathematics.

  SAY: Draw the line from the centre to the middle of the chord.
  DRAW: <svg viewBox="0 0 120 90"><circle cx="60" cy="45" r="36" fill="none" \
stroke="#2a1a3f" stroke-width="2"/><line x1="30" y1="65" x2="90" y2="65" stroke="#2a1a3f" \
stroke-width="2"/><line x1="60" y1="45" x2="60" y2="65" stroke="#8b5cf6" stroke-width="2" \
stroke-dasharray="4 3"/><text x="62" y="43" font-size="8">O</text></svg>
  SAY: It always meets the chord at a right angle, and cuts it exactly in half.

Rules for the two together:

- ONE SENTENCE PER SPOKEN LINE. Not two, not a short one joined to another by "and so". A \
beat is said aloud and the board is written while it is said, so a spoken line carrying three \
ideas is thirteen seconds of talking over a board that does not move. One thought, one line, \
then reach for the chalk.
- EIGHT BEATS AT THE ABSOLUTE MOST, and five or six is usually right. Short beats, more of \
them: that is what makes it look like someone writing rather than a page appearing.
- EVERY LINE IS ONE LINE. A SAY: or BOARD: line never contains a newline. Never use \
\\begin{...}, a matrix environment, or a $$ block broken across rows — write the matrix \
inline as plain text like "rows (t, -4, 0), (0, t, 1)", or name the thing instead of drawing \
it. A split line is read aloud one fragment at a time.
- A SAY line that introduces a BOARD line does not describe it — it explains it. "Now we \
write x squared equals twelve x" is reading your own handwriting aloud and is useless to \
someone who can see it. "Both nine x squareds cancel, so what is left is much smaller" is \
the thing they could not see for themselves.
- Never announce what you are about to write. "Let's break it down", "This means:", "This \
simplifies to:" — that is a sentence spent on nothing.
- End with one short spoken question that checks the bit they just missed, as a SAY line.
- No headings, no bold, no bullet points, no dashes starting a line, no "1." or "2.".
- SAY IT AS YOU WOULD TO A TEN-YEAR-OLD. Not the mathematics — that is a national exam \
paper and it is as hard as it is — but every word around it. The student in front of you got \
this wrong and is close to deciding they are bad at maths; a sentence they have to decode \
first is a sentence that finishes that thought for them.
- NAME NOTHING YOU CAN DESCRIBE. Textbook words tell a student what a step is CALLED. They \
need to know what it DOES. If they knew the word they would not be stuck:

    distribute / expand   ->  multiply everything inside the bracket by it
    the numerator         ->  the top of the fraction
    the denominator       ->  the bottom
    collect like terms    ->  put the x bits together
    substitute            ->  put that number in where x was
    the coefficient       ->  the number in front of the x
    isolate x             ->  get x on its own
    the reciprocal        ->  flip it upside down
    hence / thus          ->  so

- SHORT SENTENCES. Ten or twelve words. If a sentence has an "and" or a comma holding two \
ideas together, it is two sentences and they go in two beats.

In English the shape is the same. If the word being tested is "bedlam":

SAY: Bedlam was the name of an old madhouse in London.
BOARD: bedlam = uproar, complete disorder
SAY: So a school that is a bedlam is not just busy.
SAY: It is completely out of control.
SAY: Which other answer came closest, and what stopped it being right?

And in mathematics, if the board's step reads "(3x-1)^2 + x^2 = (3x+1)^2 gives x^2 = 12x":

SAY: Look at the two brackets first.
SAY: Multiply each one out and they come to almost the same thing.
BOARD: $9x^2 - 6x + 1 + x^2 = 9x^2 + 6x + 1$
SAY: Can you see the nine x squared on both sides?
SAY: It is on the left and on the right, so it goes.
BOARD: $x^2 = 12x$
SAY: What looked like a big question is a small one now.
SAY: What do you get if you divide both sides by x?

NEVER THINK ALOUD, AND NEVER NARRATE A MISTAKE OF YOUR OWN. "Whoops, my calculations were
incorrect", "wait, I see something is wrong", "let me try that again", "I missed it again" —
none of that goes on a board. You have the answer in front of you before you start: work the
line out, then write it. If a line comes out wrong, correct it and carry on without saying
that you did.

A student who has just got the question wrong twice is watching to see whether this is worth
trusting. A teacher who keeps announcing their own confusion is a teacher they stop believing,
and they will not say so — they will just stop asking.

If you genuinely cannot make the working reach the answer you were given, say that plainly,
once, and offer to pass it to a person. That is not the same as thinking aloud, and it is the
only honest version of it.

WHAT THEY TYPE BACK MAY BE AN ANSWER, NOT A QUESTION. You end most turns by asking them
something, so the next thing they say is often their answer to it. Look at what you said last
before deciding what they meant.

When they are answering you:

- SAY WHETHER THEY ARE RIGHT, FIRST, IN THE FIRST SENTENCE. A student who has answered and is
made to read three sentences before finding out is being made to wait for the only thing they
wanted. "Yes, twelve is right." Then go on.
- A WRONG ANSWER MUST BE CALLED WRONG, IN THAT FIRST SENTENCE, PLAINLY. "No, not quite."
"That is the other angle, not the one we want." Explaining what they said without ever saying
it was wrong is the worst thing you can do here: they walk away believing it. Kindly, in four
words, and then help.
- NEVER PRAISE A WRONG ANSWER. No "good job", no "well spotted", not for the attempt and not
for the part of it that was nearly right. Praise after a wrong answer teaches them that wrong
was good enough, and it is the one habit that will cost them marks in the exam.
- THEN GO BACK TO THE STEP THEY MISSED, not to the beginning. Their wrong answer says exactly
where they are stuck, so use it: work out which step would have given them that, and take
that one again more slowly.
- IF THEY ARE RIGHT, SAY WHY IT IS RIGHT, briefly, so they know it was not luck. Then either
move on or stop — a student who has understood it does not need more.
- "I don't know", a blank, or a guess is still an answer. It means the step before was too
big, so take a smaller one rather than repeating the one they could not follow.

Read those back. Every sentence is short. Not one of them names a rule — no "expand", no \
"like terms", no "quadratic". Each one either says what to look at, or what just happened,
and the chalk carries the working. That is the level. Write at it.
"""


#: A tag opens a line wherever it appears — at the start of a row, or mid-sentence because
#: the model ran the whole answer together without newlines. Splitting on the tag rather than
#: on the newline is what makes the format survive that.
_TAG = re.compile(r"(?i)\b(SAY|BOARD|DRAW)\s*:\s*")

#: The only shapes a diagram may be made of. Everything a teacher draws on a board is in
#: here; everything that could reach out of the page is not — no `script`, no `foreignObject`,
#: no `image`, no `use`, no `a`.
DRAWABLE = {
    "svg",
    "g",
    "line",
    "circle",
    "ellipse",
    "rect",
    "polygon",
    "polyline",
    "path",
    "text",
    "tspan",
    "marker",
    "defs",
    "title",
}

#: The only attributes those shapes may carry. Geometry, stroke and fill; nothing that names
#: a URL, and nothing beginning with `on`.
DRAWABLE_ATTRS = {
    "viewbox",
    "width",
    "height",
    "x",
    "y",
    "x1",
    "y1",
    "x2",
    "y2",
    "cx",
    "cy",
    "r",
    "rx",
    "ry",
    "d",
    "points",
    "transform",
    "fill",
    "stroke",
    "stroke-width",
    "stroke-dasharray",
    "stroke-linecap",
    "stroke-linejoin",
    "opacity",
    "font-size",
    "font-family",
    "font-weight",
    "text-anchor",
    "dominant-baseline",
    "dx",
    "dy",
    "marker-end",
    "marker-start",
    "id",
    "class",
    "orient",
    "refx",
    "refy",
    "markerwidth",
    "markerheight",
}

#: SVG attributes are case sensitive, and several of the ones a diagram needs are spelled in
#: camel case. Matching is done in lower case so a model writing `viewbox` is still
#: understood, and this puts the spelling back — without it every drawing renders at the
#: wrong scale, because `viewbox` is not `viewBox` and the browser ignores it.
DRAWABLE_SPELLING = {
    "viewbox": "viewBox",
    "markerwidth": "markerWidth",
    "markerheight": "markerHeight",
    "refx": "refX",
    "refy": "refY",
}

#: A diagram bigger than this is not a diagram. It is a way to make a page unusable.
MAX_DIAGRAM_CHARS = 4000


def safe_diagram(markup: str) -> str | None:
    """A drawing reduced to shapes we are willing to put on a page, or None.

    THE MODEL'S OUTPUT BECOMES DOM, so this is the boundary. Only the elements and attributes
    on the lists above survive; anything else — a script, a foreignObject, an event handler, a
    URL of any kind — is dropped along with everything inside it. The check is a whitelist
    rather than a blacklist because the list of dangerous things changes and the list of
    shapes a teacher draws does not.

    Returns None when there is nothing safe and sensible left, and the caller treats that as
    a line the coach did not draw.
    """
    markup = markup.strip()
    if not markup or len(markup) > MAX_DIAGRAM_CHARS:
        return None
    if "<svg" not in markup.lower():
        return None

    try:
        root = ElementTree.fromstring(markup)
    except ElementTree.ParseError:
        return None

    def clean(node: ElementTree.Element) -> ElementTree.Element | None:
        tag = node.tag.split("}")[-1].lower()
        if tag not in DRAWABLE:
            return None
        kept = ElementTree.Element(tag)
        for name, value in node.attrib.items():
            plain = name.split("}")[-1].lower()
            if plain not in DRAWABLE_ATTRS:
                continue
            # No URLs, in any attribute, however they are spelled.
            if re.search(r"(?i)(javascript:|data:|url\s*\(|<)", value):
                continue
            kept.set(DRAWABLE_SPELLING.get(plain, plain), value)
        kept.text = node.text
        kept.tail = node.tail
        for child in node:
            survivor = clean(child)
            if survivor is not None:
                kept.append(survivor)
        return kept

    safe = clean(root)
    if safe is None or safe.tag != "svg":
        return None
    # A drawing with nothing in it is not worth a line on the board.
    if len(safe) == 0:
        return None
    # Sized by the board, not by the model, so a diagram cannot decide how much room it takes.
    for sizing in ("width", "height"):
        safe.attrib.pop(sizing, None)
    # Without a viewBox there is nothing to scale to, and the drawing is unusable.
    if "viewBox" not in safe.attrib:
        return None
    safe.set("xmlns", "http://www.w3.org/2000/svg")
    return ElementTree.tostring(safe, encoding="unicode")


#: A sentence end: a stop, question mark or exclamation, followed by a space and something
#: that starts a new sentence. The lookbehind keeps it away from a decimal point, so "two
#: point five" written as 2.5 is not torn in half.
_SENTENCE_END = re.compile(r"(?<!\d)(?<=[.!?])\s+(?=[A-Z(\"'“])")


def _sentences(said: str) -> list[str]:
    """One spoken line split into the sentences it is made of.

    THE MODEL WILL NOT DO THIS ON ASKING. The prompt has asked for one sentence per spoken
    line in several wordings, and the benchmark says instructions about length are the ones
    it drops first. A spoken line carrying three sentences is fourteen seconds of talking
    over a board that does not move, which is the difference between watching someone write
    and watching a page appear — so the split is done here rather than requested.

    Each sentence becomes its own beat, and the board line that followed the original stays
    with the last of them, where it was written.
    """
    parts = [part.strip() for part in _SENTENCE_END.split(said) if part.strip()]
    return parts or [said]


def parse(text: str) -> list[Said]:
    """Split a tagged answer into its lines.

    SPLIT ON THE TAG, NOT THE NEWLINE. An earlier version split rows and then read the tag at
    the front of each, which worked until the model returned the whole answer on one line —
    and then the entire lesson became a single spoken line, too long to be read aloud, so the
    student got no voice at all and the raw "SAY:" and "BOARD:" markers on screen. The tags
    are the structure; the newlines are only how it usually happens to be laid out.

    Lenient where it can afford to be. Text before the first tag is treated as speech rather
    than dropped, because a model that forgets the protocol should cost tidiness and never
    the explanation. A tag with nothing after it is nothing at all and goes nowhere. Newlines
    INSIDE a line are flattened to spaces, so a `$$` block or a `\\begin{bmatrix}` broken
    across rows stays one line on the board instead of being read out a fragment at a time.
    """

    def tidy(body: str) -> str:
        return " ".join(body.split())

    matches = list(_TAG.finditer(text))
    if not matches:
        whole = tidy(text)
        return [Said("say", sentence) for sentence in _sentences(whole)] if whole else []

    lines: list[Said] = []
    head = tidy(text[: matches[0].start()])
    if head:
        lines += [Said("say", sentence) for sentence in _sentences(head)]

    for position, match in enumerate(matches):
        tag = match.group(1).upper()
        channel: Channel = "board" if tag == "BOARD" else "draw" if tag == "DRAW" else "say"
        ends = matches[position + 1].start() if position + 1 < len(matches) else len(text)
        body = tidy(text[match.end() : ends])
        if not body:
            continue
        if channel == "say":
            lines += [Said("say", sentence) for sentence in _sentences(body)]
        elif channel == "draw":
            drawing = safe_diagram(body)
            # A drawing that did not survive the check is simply not drawn. The sentences
            # around it still explain the step, so the lesson is poorer and never broken.
            if drawing is not None:
                lines.append(Said("draw", drawing))
        else:
            lines.append(Said(channel, body))
    return lines


def split_finished(buffer: str) -> tuple[list[Said], str]:
    """The lines that are certainly complete, and what is still being written.

    A line is finished once the NEXT tag has appeared, because only then can nothing more be
    added to it. So the last tagged run is always held back — it may still be growing — and
    handed over when the stream ends.

    This is what lets the board fill while the answer is still arriving, whether the model
    separates its lines with newlines or runs them together on one.
    """
    matches = list(_TAG.finditer(buffer))
    if len(matches) < 2:
        return [], buffer
    cut = matches[-1].start()
    return parse(buffer[:cut]), buffer[cut:]


def _briefing(lesson: Lesson) -> str:
    """The reviewed content the coach is working from. No student-authored text in here.

    Kept separate from the student's words so the two can be sent as different turns once
    there is a conversation to replay: the briefing is the server's, every user turn after it
    is the student's, and nothing the student types is ever spliced into this.
    """
    options = "\n".join(f"  {key}. {body}" for key, body in lesson.options)
    lines = [
        f"TOPIC: {lesson.topic_name} — {lesson.subtopic_name}",
        "",
        f"QUESTION:\n{lesson.stem}",
        "",
        f"OPTIONS:\n{options}",
        "",
        f"CORRECT ANSWER: {lesson.correct_option_key}",
        "",
    ]

    if lesson.steps:
        lines += [
            "THE REVIEWED WORKING, AS WRITTEN ON THE BOARD:",
            *(f"  step {number}. {step}" for number, step in enumerate(lesson.steps, start=1)),
        ]
    else:
        # A quarter of the bank has no stored working. An empty heading reads as a board the
        # coach failed to receive; saying so plainly is what lets it teach instead of stall.
        lines += [
            "NO WORKING WAS STORED FOR THIS QUESTION. The board showed the answer and nothing "
            "else, so there are no steps to unpack — work it out and teach it.",
        ]

    if lesson.hints:
        lines += [
            "",
            "THE REVIEWED HINTS FOR THIS QUESTION (they were shown the first one already):",
            *(f"  - {hint}" for hint in lesson.hints),
        ]

    current = lesson.current_step
    if current is not None:
        assert lesson.step_index is not None
        lines += ["", f"THE STEP THEY ARE LOOKING AT: step {lesson.step_index + 1}. {current}"]
    else:
        lines += ["", "THE BOARD HAS FINISHED WRITING. They can see the whole working."]

    if lesson.chose is not None:
        mistake = f"They answered {lesson.chose}, which is wrong."
        if lesson.misconception:
            mistake += f" Students pick {lesson.chose} when: {lesson.misconception}"
        lines += ["", f"WHAT THEY GOT WRONG: {mistake}"]

    lines += [
        "",
        f"WHERE THEY ARE IN THIS TOPIC: working at level {lesson.level} of 5. "
        f"{lesson.seen} question{'' if lesson.seen == 1 else 's'} met here, "
        f"{lesson.right_unaided} answered without help, "
        f"{lesson.taught} explained rather than answered.",
    ]

    if lesson.history:
        lines += ["", "PRACTICE QUESTIONS THEY HAVE ALREADY MET IN THIS TOPIC, NEWEST FIRST:"]
        for past in lesson.history:
            when = "today" if past.days_ago == 0 else f"{past.days_ago}d ago"
            if past.was_correct:
                went = "got it right"
                if past.needed_hint:
                    went += ", but needed a hint"
            elif past.was_taught:
                went = "missed it twice and had it explained"
            else:
                went = "got it wrong"
            note = f"  - ({when}) {past.stem}\n      {went}"
            if past.chose and not past.was_correct:
                note += f"; they chose {past.chose}"
                if past.misconception:
                    note += f", which is what students pick when: {past.misconception}"
            lines.append(note)

    if lesson.figures:
        described = [f.alt_text for f in lesson.figures if f.alt_text]
        lines += [
            "",
            "THE FIGURE PRINTED WITH THIS QUESTION IS ATTACHED, AND THE STUDENT IS LOOKING "
            "AT IT TOO.",
            *(f"  - it was described by a reviewer as: {alt}" for alt in described),
        ]

    return "\n".join(lines)


def _asked(asked: str) -> str:
    """The student's own words, fenced.

    SAYS, NOT ASKS. Almost every answer ends by asking the student something — "what do you
    get if you divide both sides by x?" — so a good share of what they type back is an answer
    to that rather than a new question. Labelling all of it as asking told the coach to
    explain something when it should have been marking.

    Whatever they type is the question being asked and never part of the briefing. Keeping it
    in one delimited place, in its own turn, with the rules in the system prompt above, is
    what makes that distinction hold.
    """
    return f'THE STUDENT SAYS:\n"""{asked}"""'


def _packet(lesson: Lesson, asked: str) -> str:
    """Briefing and question as one string: what a single-turn call sends."""
    return f"{_briefing(lesson)}\n\n{_asked(asked)}"


def _messages(lesson: Lesson, asked: str) -> list[dict[str, object]]:
    """The conversation as the model sees it.

    The briefing goes first and once. Then this sitting's earlier exchanges about this same
    question, so a follow-up is answered as a follow-up. Then what they have just asked. The
    student's turns are theirs and the briefing is ours, and the two never share a message.
    """
    briefing: list[dict[str, object]] = [{"type": "text", "text": _briefing(lesson)}]
    for figure in lesson.figures[:MAX_FIGURES]:
        # Reviewed assets read from our own store, never a URL from the packet: the model is
        # not given anything that would make it fetch.
        briefing.append({"type": "image_url", "image_url": {"url": figure.data_uri}})

    messages: list[dict[str, object]] = [
        {"role": "system", "content": SYSTEM},
        {"role": "user", "content": briefing},
    ]
    for turn in lesson.prior[-MEMORY_DEPTH:]:
        messages.append({"role": "user", "content": _asked(turn.asked)})
        messages.append({"role": "assistant", "content": turn.replied})
    messages.append({"role": "user", "content": _asked(asked)})
    return messages


def fallback_text(lesson: Lesson) -> str:
    """What the student reads when the tutor cannot answer.

    Not an apology and not an error: the reviewed explanation, pointed at the step they were
    on. A student whose connection or budget failed still leaves the board with the working.
    """
    current = lesson.current_step
    if current is not None:
        assert lesson.step_index is not None
        return (
            "SAY: I cannot talk this through right now, so here is the step again as it was "
            "written.\n"
            f"BOARD: {current}\n"
            "SAY: The rest of the working is still on the board, and you can ask a person to "
            "look at this question with you."
        )
    return (
        "SAY: I cannot talk this through right now, but the whole working is still on the "
        "board.\n"
        f"BOARD: The answer is {lesson.correct_option_key}.\n"
        "SAY: You can ask a person to look at this question with you."
    )


def _whole_sentences(said: str) -> str:
    """Cut a reply that ran into the token ceiling back to its last finished sentence.

    A reply stopped mid-word is bad; a reply stopped mid-formula is worse, because half a
    LaTeX expression does not render and the student is left looking at `$\\frac{-6` where the
    working should be. The full stop has to be OUTSIDE the mathematics — the one in `$1.5$`
    ends nothing — so delimiters are counted on the way past.
    """
    end = 0
    dollars = 0
    for index, character in enumerate(said):
        if character == "$":
            dollars += 1
        elif character in ".?!" and dollars % 2 == 0:
            end = index + 1
    return said[:end].strip()


def _whole_lines(said: str) -> str:
    """Cut a reply that ran into the token ceiling back to its last finished line.

    The reply is written as board lines, so the ceiling lands inside one of them and the rest
    above it are whole. Where there is only one line to begin with, fall back to cutting at
    the last finished sentence.
    """
    said = said.rstrip()
    lines = said.split("\n")
    if len(lines) > 1:
        return "\n".join(lines[:-1]).strip()
    return _whole_sentences(said)


async def answer(lesson: Lesson, asked: str, settings: Settings) -> Reply:
    """Answer the student's question, or say honestly that it cannot be answered.

    Never raises. Every failure becomes a fallback the student can read, because the caller's
    job is to keep the lesson going and not to surface an exception at the board.
    """
    if not settings.openai_api_key:
        return Reply(text=fallback_text(lesson), source="fallback")

    # Imported here rather than at module scope so that the API boots, serves the board and
    # serves this fallback on a deployment where the SDK is not installed. The tutor is the
    # part that is allowed to be missing; the lesson is not.
    try:
        from openai import AsyncOpenAI
    except ImportError:
        return Reply(text=fallback_text(lesson), source="fallback")

    client = AsyncOpenAI(api_key=settings.openai_api_key, timeout=CALL_TIMEOUT_SECONDS)
    started = time.monotonic()
    try:
        message = await client.chat.completions.create(  # type: ignore[call-overload]
            model=settings.ai_runtime_model,
            messages=_messages(lesson, asked),
            **_completion_options(settings),
        )
    except Exception:
        # Timeout, rate limit, bad key, outage. The student is mid-lesson and waiting; what
        # went wrong is the operator's problem and belongs in the logs, not on the board.
        return Reply(
            text=fallback_text(lesson),
            source="fallback",
            latency_ms=int((time.monotonic() - started) * 1000),
        )

    latency_ms = int((time.monotonic() - started) * 1000)
    # getattr all the way down rather than indexing and narrowing types: the whole point of
    # the lazy import above is that this file works without the SDK installed, so nothing
    # here may name one of its classes. A response with no choices contributes nothing, and a
    # reply that ran into the ceiling is cut back to what it finished saying — the fallback
    # below is a better lesson than half a sentence, and half a formula is not a lesson.
    choices = getattr(message, "choices", None) or []
    said = ""
    finish_reason = None
    if choices:
        said = (getattr(getattr(choices[0], "message", None), "content", "") or "").strip()
        finish_reason = getattr(choices[0], "finish_reason", None)
    if finish_reason == "length":
        # It was still writing when the ceiling arrived. Keep the lines it finished.
        said = _whole_lines(said)
    if not said:
        return Reply(text=fallback_text(lesson), source="fallback", latency_ms=latency_ms)

    usage = getattr(message, "usage", None)
    return Reply(
        text=said,
        source="model",
        model=settings.ai_runtime_model,
        input_tokens=getattr(usage, "prompt_tokens", 0) or 0,
        output_tokens=getattr(usage, "completion_tokens", 0) or 0,
        latency_ms=latency_ms,
    )


async def write_on_the_board(
    lesson: Lesson, asked: str, settings: Settings
) -> AsyncIterator[tuple[str, Reply | None]]:
    """The same answer as `answer`, arriving a piece at a time.

    Yields `(delta, None)` as the text comes in, then one final `("", Reply)` carrying the
    whole reply and its usage. The caller writes the deltas onto the board and stores the
    Reply when it lands, so the row in `tutor_turns` is the same row either way.

    WHY IT STREAMS AT ALL. A coach that thinks for four seconds and then paints a finished
    paragraph is a printer. A teacher writes, and the student reads along and can stop them.
    The wait becomes the lesson rather than a delay before it.

    THE FALLBACK CONTRACT IS UNCHANGED, which is the part that matters. No key, no SDK, a
    timeout, a refusal, an empty stream: the last thing yielded is always a Reply a student
    can read, and it never raises. A stream that dies half way is the one new case — what was
    already written is cut back to its last finished line, and if nothing finished, the
    reviewed steps are served instead. Half a line on a board is worse than no line.
    """
    if not settings.openai_api_key:
        yield "", Reply(text=fallback_text(lesson), source="fallback")
        return

    try:
        from openai import AsyncOpenAI
    except ImportError:
        yield "", Reply(text=fallback_text(lesson), source="fallback")
        return

    client = AsyncOpenAI(api_key=settings.openai_api_key, timeout=LESSON_TIMEOUT_SECONDS)
    started = time.monotonic()
    written: list[str] = []
    usage = None
    finish_reason = None

    try:
        # The SDK's overloads do not admit this combination: _messages() builds plain
        # dicts rather than the typed message unions, and with stream_options present
        # no overload matches at all, so the error lands on the call and not the
        # argument.
        stream = await client.chat.completions.create(  # type: ignore[call-overload]
            model=settings.ai_runtime_model,
            messages=_messages(lesson, asked),
            stream=True,
            **_completion_options(settings),
            # Usage does not come with a stream unless it is asked for, and without it the
            # turn would be stored with no idea what it cost.
            stream_options={"include_usage": True},
        )
        async for chunk in stream:
            usage = getattr(chunk, "usage", None) or usage
            choices = getattr(chunk, "choices", None) or []
            if not choices:
                continue
            finish_reason = getattr(choices[0], "finish_reason", None) or finish_reason
            delta = getattr(getattr(choices[0], "delta", None), "content", None)
            if delta:
                written.append(delta)
                yield delta, None
    except Exception:
        # Mid-stream failure. Keep whatever finished; the partial line goes nowhere.
        said = _whole_lines("".join(written))
        latency_ms = int((time.monotonic() - started) * 1000)
        if not said:
            yield "", Reply(text=fallback_text(lesson), source="fallback", latency_ms=latency_ms)
        else:
            yield (
                "",
                Reply(
                    text=said,
                    source="model",
                    model=settings.ai_runtime_model,
                    input_tokens=getattr(usage, "prompt_tokens", 0) or 0,
                    output_tokens=getattr(usage, "completion_tokens", 0) or 0,
                    latency_ms=latency_ms,
                ),
            )
        return

    latency_ms = int((time.monotonic() - started) * 1000)
    said = "".join(written).strip()
    if finish_reason == "length":
        said = _whole_lines(said)
    if not said:
        yield "", Reply(text=fallback_text(lesson), source="fallback", latency_ms=latency_ms)
        return

    yield (
        "",
        Reply(
            text=said,
            source="model",
            model=settings.ai_runtime_model,
            input_tokens=getattr(usage, "prompt_tokens", 0) or 0,
            output_tokens=getattr(usage, "completion_tokens", 0) or 0,
            latency_ms=latency_ms,
        ),
    )


#: How the voice is asked to read. The model takes a plain instruction, and this one is aimed
#: at the failure that matters: a coach that sounds like it is reading a document rather than
#: talking to the person in front of it.
SPEECH_STYLE = (
    "You are a patient secondary school teacher in Nigeria, speaking to one student who has "
    "just got a question wrong. Warm, unhurried, encouraging. Read it as speech, not as a "
    "document being recited: let the sentences breathe, and lift at a question."
)

#: A spoken line is a sentence or two. Past this something has gone wrong upstream and it is
#: not worth the tokens or the wait to read it out.
MAX_SPOKEN_CHARS = 600


#: LaTeX the coach wrote with no dollar signs round it: a command with its arguments, or a
#: power. Each run is wrapped in $...$ so it goes through the same reader as the rest.
_BARE_MATHS = re.compile(
    r"[\w.]*\\[a-zA-Z]+(?:\[[^\]]*\])?(?:\{(?:[^{}]|\{[^{}]*\})*\})*"
    r"|\w+\^(?:\{[^{}]*\}|\w)"
)


def for_the_voice(line: str) -> str:
    """A spoken line with its mathematics turned into words.

    The prompt tells the coach not to write LaTeX in a SAY line, and mostly it does not. This
    is what happens when it does, because the cost of being wrong is a student listening to
    "dollar backslash frac" — and unlike a wrong word on the board, there is nothing on
    screen to correct it against. The words themselves come from `spoken_maths`, which the
    stored worked steps go through too, so the coach and a replayed lesson sound the same.
    """
    if "$" not in line:
        line = _BARE_MATHS.sub(lambda m: f"${m.group(0)}$", line)
    spoken = speak_text(line)
    spoken = spoken.replace("<", " is less than ").replace(">", " is greater than ")
    spoken = re.sub(r"[${}\\^]", " ", spoken)
    return re.sub(r"\s{2,}", " ", spoken).strip()


async def speak_streaming(line: str, settings: Settings) -> AsyncIterator[bytes]:
    """The audio for one spoken line, in pieces, as the voice is made.

    WHY NOT WAIT FOR THE WHOLE CLIP. `speak` returns a finished mp3, which means roughly
    three and a half seconds between a sentence being written and any of it being heard. A
    teacher does not compose a sentence silently and then say all of it at once. Handing the
    bytes over as they arrive lets the browser start playing after the first fraction of a
    second, so the voice begins about when the writing does.

    Yields nothing at all when there is no voice to be had — no key, no SDK, the feature
    switched off, a line too long to be a line. The caller reads an empty stream as silence
    and holds the beat instead, which is the same contract `speak` has.
    """
    line = for_the_voice(line)
    if not line or not settings.ai_speak or not settings.openai_api_key:
        return
    if len(line) > MAX_SPOKEN_CHARS:
        return

    try:
        from openai import AsyncOpenAI
    except ImportError:
        return

    client = AsyncOpenAI(api_key=settings.openai_api_key, timeout=CALL_TIMEOUT_SECONDS)
    try:
        async with client.audio.speech.with_streaming_response.create(
            model=settings.ai_speech_model,
            voice=settings.ai_speech_voice,
            input=line,
            instructions=SPEECH_STYLE,
            response_format="mp3",
        ) as spoken:
            async for chunk in spoken.iter_bytes(4096):
                yield chunk
    except Exception:
        # Whatever has already been yielded is playable; the rest simply does not arrive,
        # and a sentence that stops early is a better lesson than a silent screen.
        return


async def speak(line: str, settings: Settings) -> bytes | None:
    """The audio for one spoken line, or None when there is none to be had.

    Never raises, for the same reason `answer` does not: the voice is the better lesson and
    the caption underneath it is the acceptable one. No key, no SDK, an outage, a line too
    long to be a line — the student reads instead of listening, and nothing on screen breaks.
    """
    line = for_the_voice(line)
    if not line or not settings.ai_speak or not settings.openai_api_key:
        return None
    if len(line) > MAX_SPOKEN_CHARS:
        return None

    try:
        from openai import AsyncOpenAI
    except ImportError:
        return None

    client = AsyncOpenAI(api_key=settings.openai_api_key, timeout=CALL_TIMEOUT_SECONDS)
    try:
        spoken = await client.audio.speech.create(
            model=settings.ai_speech_model,
            voice=settings.ai_speech_voice,
            input=line,
            instructions=SPEECH_STYLE,
            # Small and playable everywhere, which matters more here than fidelity: this is
            # a voice on a phone on a Nigerian mobile connection.
            response_format="mp3",
        )
        return await spoken.aread()
    except Exception:
        return None


#: What a spoken question may weigh. A question at a board is a sentence; anything past this
#: is a phone left recording in a bag, and it is refused rather than paid for.
MAX_SPOKEN_QUESTION_BYTES = 6_000_000

#: The formats a browser produces from `MediaRecorder`, plus the ones a phone might send,
#: and the file extension each one has to be presented under. The extension is not cosmetic:
#: it is how the transcription API is told which container it is being handed, so a webm
#: recording named `.mp3` is refused and a recording named after the wrong format silently
#: fails — which is exactly how the first cut of this broke.
SPOKEN_QUESTION_TYPES = {
    "audio/webm": "webm",
    "audio/ogg": "ogg",
    "audio/mp4": "mp4",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/x-m4a": "m4a",
    "audio/m4a": "m4a",
}


async def listen(audio: bytes, content_type: str, settings: Settings) -> str | None:
    """What the student said, as words. None when it cannot be made out.

    THE RECORDING DOES NOT SURVIVE THIS CALL. It arrives, it is sent for transcription, and
    it goes out of scope — nothing writes it to disk, to the database or to a log. What is
    kept is the transcript, in `tutor_turns`, exactly as a typed question would have been.
    That is the whole of why this can be defended: a school consenting to a child asking a
    question by voice is not consenting to a stored archive of that child's voice.

    Never raises. A failed transcription leaves the student typing, which is what they were
    doing before the button existed.
    """
    if not settings.ai_listen or not settings.openai_api_key:
        return None
    if not audio or len(audio) > MAX_SPOKEN_QUESTION_BYTES:
        return None
    extension = SPOKEN_QUESTION_TYPES.get(content_type.split(";")[0].strip().lower())
    if extension is None:
        return None

    try:
        from openai import AsyncOpenAI
    except ImportError:
        return None

    client = AsyncOpenAI(api_key=settings.openai_api_key, timeout=CALL_TIMEOUT_SECONDS)
    try:
        heard = await client.audio.transcriptions.create(
            model=settings.ai_transcription_model,
            # Named for the format it actually is. The API reads the container from this
            # extension, so getting it wrong is not a cosmetic bug — it is a transcription
            # that fails for a reason nothing on screen can explain.
            file=(f"question.{extension}", audio, content_type),
            # A Nigerian secondary school student asking about a maths question, so the
            # transcriber is told what kind of words to expect rather than guessing.
            prompt=(
                "A secondary school student in Nigeria asking a short question about a "
                "mathematics or English question they just got wrong."
            ),
        )
    except Exception:
        return None

    said = (getattr(heard, "text", "") or "").strip()
    # Longer than the box allows is not a question asked at a board.
    return said[:MAX_QUESTION_CHARS] if said else None
