/**
 * After a subtopic lesson (docs/lessons/subtopic-lesson-guide.md §9, founder 12 Nov 2026):
 * how well the student understood it, one or two short problems to try (typed, or a photo of
 * the working that the coach marks), and the coach for their own questions. The conversation
 * is kept on the server and shown again whenever they come back to this lesson.
 *
 * API: apps/api/src/app/routers/lesson_after.py.
 */
import { useEffect, useRef, useState, type FormEvent } from 'react';

import { friendly, request } from '../../lib/friendlyError.js';
import { Maths } from '../../Maths.js';
import { IconCamera, IconCheck, IconClose, IconReplay, IconSend } from '../icons.js';
import { FocusShell } from '../shell.js';
import { Button, Skeleton, cx } from '../ui.js';
import './LessonAfter.css';

interface Tried {
  correct: boolean | null;
  feedback: string;
  answer_text: string | null;
  by_photo: boolean;
  answer: string;
  working: string[];
}

interface After {
  title: string;
  subject: string;
  problems: { ask: string; needs_working: boolean; tried: Tried | null }[];
  rating: number | null;
  conversation: { asked: string; reply: string }[];
  can_ask: boolean;
  asks_left: number;
}

const RATINGS = [
  { value: 1, label: 'Not yet' },
  { value: 2, label: 'Mostly' },
  { value: 3, label: 'Got it' },
];

export function LessonAfter({
  studentId,
  subtopicId,
  part = 1,
  onWatchAgain,
  onContinue,
  continuing,
}: {
  studentId: string;
  subtopicId: string;
  /** Which of the subtopic's lessons this follows. */
  part?: number;
  onWatchAgain: () => void;
  onContinue: () => void;
  continuing: boolean;
}) {
  const base = `/v1/roadmap/${studentId}/lessons/${subtopicId}`;
  const q = `?part=${part}`;
  const [page, setPage] = useState<After | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    request<After>(`${base}/after${q}`)
      .then(setPage)
      .catch((problem) => setError(friendly(problem)));
  }, [base, q]);

  if (!page) {
    return (
      <FocusShell title="After the lesson" exitTo="/roadmap">
        <main className="la-page">{error ? <p className="la-error">{error}</p> : <Skeleton height={360} radius={16} />}</main>
      </FocusShell>
    );
  }

  const rate = (rating: number) => {
    setPage({ ...page, rating });
    void request<void>(`${base}/rating${q}`, { method: 'POST', body: JSON.stringify({ rating }) }).catch(() => undefined);
  };
  const tried = (index: number, result: Tried) =>
    setPage((now) =>
      now ? { ...now, problems: now.problems.map((p, n) => (n === index ? { ...p, tried: result } : p)) } : now,
    );

  return (
    <FocusShell title={page.title} exitTo="/roadmap">
      <main className="la-page">
        <header className="la-head">
          <span className="sj-eyebrow">After the lesson · {page.subject}</span>
          <h1 className="sj-display sj-h2">{page.title}</h1>
        </header>

        <section className="sj-card la-card">
          <h2 className="la-title">How well did you understand it?</h2>
          <div className="la-ratings" role="group" aria-label="How well did you understand it?">
            {RATINGS.map((choice) => (
              <button
                key={choice.value}
                type="button"
                className="sj-chip"
                aria-pressed={page.rating === choice.value}
                onClick={() => rate(choice.value)}
              >
                {choice.label}
              </button>
            ))}
          </div>
        </section>

        {page.problems.length ? (
          <section className="sj-card la-card">
            <h2 className="la-title">Try it</h2>
            <ol className="la-problems">
              {page.problems.map((problem, index) => (
                <Problem
                  key={index}
                  base={base}
                  q={q}
                  index={index}
                  ask={problem.ask}
                  needsWorking={problem.needs_working}
                  tried={problem.tried}
                  onTried={(result) => tried(index, result)}
                />
              ))}
            </ol>
          </section>
        ) : null}

        <Ask base={base} q={q} page={page} onTurn={(turn, left) => setPage((now) => (now ? { ...now, conversation: [...now.conversation, turn], asks_left: left } : now))} />

        <div className="la-foot">
          <Button tone="ghost" icon={<IconReplay size={16} />} onClick={onWatchAgain}>
            Watch again
          </Button>
          <Button tone="lime" size="lg" busy={continuing} icon={<IconCheck size={16} />} onClick={onContinue}>
            Continue
          </Button>
        </div>
      </main>
    </FocusShell>
  );
}

function Problem({
  base,
  q,
  index,
  ask,
  needsWorking,
  tried,
  onTried,
}: {
  base: string;
  q: string;
  index: number;
  ask: string;
  needsWorking: boolean;
  tried: Tried | null;
  onTried: (result: Tried) => void;
}) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState<'typed' | 'photo' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const camera = useRef<HTMLInputElement>(null);

  const check = async (event: FormEvent) => {
    event.preventDefault();
    if (!typed.trim()) return;
    setBusy('typed');
    setError(null);
    try {
      onTried(await request<Tried>(`${base}/problems/${index}/answer${q}`, { method: 'POST', body: JSON.stringify({ text: typed }) }));
    } catch (problem) {
      setError(friendly(problem));
    } finally {
      setBusy(null);
    }
  };
  const send = async (file: File) => {
    setBusy('photo');
    setError(null);
    try {
      const form = new FormData();
      form.append('photo', file);
      const response = await fetch(`${base}/problems/${index}/photo${q}`, { method: 'POST', body: form, credentials: 'same-origin' });
      if (!response.ok) {
        const detail = ((await response.json().catch(() => ({}))) as { detail?: string }).detail;
        throw new Error(detail ?? 'The photo did not send. Try again.');
      }
      onTried((await response.json()) as Tried);
    } catch (problem) {
      setError(friendly(problem));
    } finally {
      setBusy(null);
    }
  };

  return (
    <li className="la-problem">
      <div className="la-ask">
        <Maths text={ask} />
      </div>
      <form className="la-answer" onSubmit={check}>
        <input
          className="sj-input"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          placeholder={needsWorking ? 'Your final answer (or send a photo)' : 'Your answer'}
          aria-label={`Your answer to problem ${index + 1}`}
          maxLength={200}
        />
        <Button type="submit" tone="dark" busy={busy === 'typed'} disabled={!typed.trim() || busy !== null}>
          Check
        </Button>
        <input
          ref={camera}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void send(file);
          }}
        />
        <Button
          tone={needsWorking ? 'primary' : 'soft'}
          icon={<IconCamera size={16} />}
          busy={busy === 'photo'}
          disabled={busy !== null}
          onClick={() => camera.current?.click()}
        >
          Photo of working
        </Button>
      </form>
      {error ? <p className="la-error">{error}</p> : null}
      {tried ? (
        <div className={cx('la-result', tried.correct === true && 'right', tried.correct === false && 'wrong')}>
          <p className="la-verdict">
            {tried.correct === true ? <IconCheck size={16} /> : tried.correct === false ? <IconClose size={16} /> : null}
            <Maths text={tried.feedback} />
          </p>
          <div className="la-working">
            <span className="sj-eyebrow">The working</span>
            <ol>
              {tried.working.map((step, n) => (
                <li key={n}>
                  <Maths text={step} />
                </li>
              ))}
            </ol>
          </div>
        </div>
      ) : null}
    </li>
  );
}

function Ask({
  base,
  q,
  page,
  onTurn,
}: {
  base: string;
  q: string;
  page: After;
  onTurn: (turn: { asked: string; reply: string }, left: number) => void;
}) {
  const [draft, setDraft] = useState('');
  const [waiting, setWaiting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [page.conversation.length, waiting]);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const asked = draft.trim();
    if (!asked) return;
    setDraft('');
    setWaiting(asked);
    setError(null);
    try {
      const got = await request<{ reply: string; asks_left: number }>(`${base}/ask${q}`, {
        method: 'POST',
        body: JSON.stringify({ question: asked }),
      });
      onTurn({ asked, reply: got.reply }, got.asks_left);
    } catch (problem) {
      setDraft(asked);
      setError(friendly(problem));
    } finally {
      setWaiting(null);
    }
  };

  return (
    <section className="sj-card la-card">
      <h2 className="la-title">Ask the coach</h2>
      {page.conversation.length || waiting ? (
        <div className="la-chat">
          {page.conversation.map((turn, n) => (
            <div key={n} className="la-turn">
              <p className="la-me">{turn.asked}</p>
              <div className="la-coach">
                <Maths text={turn.reply} />
              </div>
            </div>
          ))}
          {waiting ? (
            <div className="la-turn">
              <p className="la-me">{waiting}</p>
              <div className="la-coach la-thinking">Thinking…</div>
            </div>
          ) : null}
          <div ref={end} />
        </div>
      ) : (
        <p className="la-lede">Anything in the lesson still unclear? Ask it here. Your questions and the answers are kept for when you come back.</p>
      )}
      {page.can_ask ? (
        <form className="la-askbox" onSubmit={send}>
          <input
            className="sj-input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Ask about this lesson…"
            aria-label="Ask the coach about this lesson"
            maxLength={600}
            disabled={waiting !== null}
          />
          <Button type="submit" tone="primary" icon={<IconSend size={16} />} disabled={!draft.trim() || waiting !== null}>
            Ask
          </Button>
        </form>
      ) : (
        <p className="la-lede">Asking the coach comes with a plan.</p>
      )}
      {error ? <p className="la-error">{error}</p> : null}
      {page.can_ask ? <p className="la-left sj-small">{page.asks_left} questions left today</p> : null}
    </section>
  );
}
