"""The coach after a subtopic lesson: answers the student's own questions, and marks a photo
of their working on the lesson's short problems (docs/lessons/subtopic-lesson-guide.md §9).

THE CONVERSATION IS KEPT (founder, 12 Nov 2026). Every question and reply is stored
(`lesson_coach_turns`), shown again when the student comes back to the lesson, and sent with
the next question, so the coach answers in the light of what it has already said to them.

Like the question coach (tutor.py), nothing here raises: no key, no SDK, a timeout or a
refusal all become a plain reply the student can read, and the lesson carries on.
"""

from __future__ import annotations

import base64
import json
import time
from dataclasses import dataclass

from app.config import Settings
from app.tutor import CALL_TIMEOUT_SECONDS, Reply

__all__ = ["Marked", "Reply", "answer", "mark_photo"]

#: The turns sent back with a new question: enough to follow the thread, small enough to be
#: quick and cheap.
HISTORY_TURNS = 6
#: The lesson's written lines sent as what was taught.
LESSON_LINES = 80

ANSWER_PROMPT = """\
You are a warm, clear secondary school teacher in Nigeria. A student has just watched your \
lesson on "{subtopic}" ({subject}) for JAMB, and is asking you about it.

Answer the way a good Nigerian teacher would at the board: plain words, short sentences, \
one idea at a time. Where a worked example helps, solve one step by step. Use the same terms \
and methods as the lesson below (Nigerian school usage: e.g. carbon(IV) oxide). Write maths \
and formulas in $...$. Keep it under about 150 words unless working needs more. If the \
question is not about this subject, say kindly that you can help with this lesson, and \
suggest what to ask. Never invent facts; if unsure, say so.

What the lesson wrote on the board, in order:
{lines}
"""

MARK_PROMPT = """\
You are marking a Nigerian secondary school student's handwritten working, from a photo, \
for this short problem set after a lesson on "{subtopic}" ({subject}).

Problem: {ask}
Expected answer: {answer}
Expected working: {working}

Look at the photo. Decide if their final answer is right (equivalent forms count). Then, in \
two or three plain sentences to the student, say what they did well and, if anything is \
wrong, the exact step where it went wrong and what it should be. If the photo is unreadable \
or is not working for this problem, say so kindly and set correct to null.

Reply only with JSON: {{"correct": true|false|null, "feedback": "..."}}
"""


@dataclass
class Marked:
    correct: bool | None
    feedback: str
    source: str
    input_tokens: int = 0
    output_tokens: int = 0


FALLBACK_ANSWER = (
    "I can't answer questions right now. Go back over the lesson's worked examples, then try "
    "the problems: they use exactly what it taught."
)
FALLBACK_MARK = (
    "I can't look at your working right now. Compare it with the working shown, step by step."
)


async def _client(settings: Settings):  # type: ignore[no-untyped-def]
    if not settings.openai_api_key:
        return None
    try:
        from openai import AsyncOpenAI
    except ImportError:
        return None
    return AsyncOpenAI(api_key=settings.openai_api_key, timeout=CALL_TIMEOUT_SECONDS)


async def answer(
    *,
    subtopic: str,
    subject: str,
    lines: list[str],
    history: list[tuple[str, str]],
    asked: str,
    settings: Settings,
) -> Reply:
    """The coach's reply to `asked`, given the lesson and the conversation so far."""
    client = await _client(settings)
    if client is None:
        return Reply(text=FALLBACK_ANSWER, source="fallback")
    messages: list[dict[str, object]] = [
        {
            "role": "system",
            "content": ANSWER_PROMPT.format(
                subtopic=subtopic,
                subject=subject,
                lines="\n".join(f"- {line}" for line in lines[:LESSON_LINES]),
            ),
        }
    ]
    for question, reply in history[-HISTORY_TURNS:]:
        messages += [
            {"role": "user", "content": question},
            {"role": "assistant", "content": reply},
        ]
    messages.append({"role": "user", "content": asked})
    started = time.monotonic()
    try:
        message = await client.chat.completions.create(
            model=settings.ai_runtime_model, messages=messages, max_completion_tokens=900
        )
    except Exception:
        return Reply(text=FALLBACK_ANSWER, source="fallback")
    choices = getattr(message, "choices", None) or []
    said = ""
    if choices:
        said = (getattr(getattr(choices[0], "message", None), "content", "") or "").strip()
    if not said:
        return Reply(text=FALLBACK_ANSWER, source="fallback")
    usage = getattr(message, "usage", None)
    return Reply(
        text=said,
        source="model",
        model=settings.ai_runtime_model,
        input_tokens=getattr(usage, "prompt_tokens", 0) or 0,
        output_tokens=getattr(usage, "completion_tokens", 0) or 0,
        latency_ms=int((time.monotonic() - started) * 1000),
    )


async def mark_photo(
    *,
    subtopic: str,
    subject: str,
    problem: dict[str, object],
    photo: bytes,
    mime: str,
    settings: Settings,
) -> Marked:
    """The coach's marking of a photo of the student's working on one problem."""
    client = await _client(settings)
    if client is None:
        return Marked(None, FALLBACK_MARK, "fallback")
    working = problem.get("working") or []
    prompt = MARK_PROMPT.format(
        subtopic=subtopic,
        subject=subject,
        ask=problem.get("ask", ""),
        answer=problem.get("answer", ""),
        working=" / ".join(str(step) for step in working) if isinstance(working, list) else "",
    )
    image = f"data:{mime};base64,{base64.b64encode(photo).decode('ascii')}"
    try:
        message = await client.chat.completions.create(
            model=settings.ai_runtime_model,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {"url": image}},
                    ],
                }
            ],
            response_format={"type": "json_object"},
            max_completion_tokens=600,
        )
        choices = getattr(message, "choices", None) or []
        raw = getattr(getattr(choices[0], "message", None), "content", "") if choices else ""
        found = json.loads(raw or "{}")
    except Exception:
        return Marked(None, FALLBACK_MARK, "fallback")
    feedback = str(found.get("feedback") or "").strip()
    if not feedback:
        return Marked(None, FALLBACK_MARK, "fallback")
    correct = found.get("correct")
    usage = getattr(message, "usage", None)
    return Marked(
        correct if isinstance(correct, bool) else None,
        feedback,
        "coach",
        getattr(usage, "prompt_tokens", 0) or 0,
        getattr(usage, "completion_tokens", 0) or 0,
    )
