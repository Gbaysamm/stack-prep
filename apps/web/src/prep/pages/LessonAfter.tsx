/**
 * After a subtopic lesson (docs/lessons/subtopic-lesson-guide.md §9, founder 12 Nov 2026):
 * how well the student understood it, one or two short problems to try (typed, or a photo of
 * the working that the coach marks), and the coach for their own questions. The conversation
 * is kept on the server and shown again whenever they come back to this lesson.
 *
 * API: apps/api/src/app/routers/lesson_after.py.
 */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { friendly, request } from '../../lib/friendlyError.js';
import { Maths } from '../../Maths.js';
import { Celebrate } from '../Celebrate.js';
import { dayRing, loadGame, streakGain, type Game } from '../gameApi.js';
import { IconCamera, IconCheck, IconClose, IconLock, IconReplay, IconSend } from '../icons.js';
import { Button, PageHero, Skeleton, cx } from '../ui.js';
import { PlainShell } from '../shell.js';
import { useStudent } from '../store.js';
import './LessonAfter.css';
import { useLeaveWarning } from '../../lib/leaveWarning.js';

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
  part: number;
  parts: number;
  next_title: string | null;
  subtopic: string | null;
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
  /** Finishing: the lesson's title and what comes next, for the reward that follows. */
  onContinue: (done: { title: string; next: string | null }) => void;
  continuing: boolean;
}) {
  const base = `/v1/roadmap/${studentId}/lessons/${subtopicId}`;
  const q = `?part=${part}`;
  const [page, setPage] = useState<After | null>(null);
  const [error, setError] = useState<string | null>(null);
  useLeaveWarning(page !== null && !page.problems.every((problem) => problem.tried !== null));

  useEffect(() => {
    request<After>(`${base}/after${q}`)
      .then(setPage)
      .catch((problem) => setError(friendly(problem)));
  }, [base, q]);

  if (!page) {
    return (
      <div className="sj-page la-app">
        {error ? <p className="la-error">{error}</p> : <Skeleton height={360} radius={16} />}
      </div>
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
  // The lesson is finished once each problem has been tried (founder, 13 Nov 2026).
  const finished = page.problems.every((problem) => problem.tried !== null);
  const next = page.next_title
    ? `Next: ${page.next_title}`
    : `That was the last lesson${page.subtopic ? ` on ${page.subtopic}` : ''}. Next, a run to show you have it.`;

  return (
    <div className="sj-page la-app">
      <PageHero
        eyebrow={page.parts > 1 ? `Lesson ${page.part} of ${page.parts} · ${page.subject}` : `Lesson · ${page.subject}`}
        title={page.title}
        sub={finished ? next : `Try the problem below to finish the lesson. ${next}`}
        actions={
          <>
            {/* Locked until the problem is tried, and saying so (founder, 17 Nov 2026: a greyed lime
                button read as broken). */}
            {finished ? (
              <Button
                tone="lime"
                busy={continuing}
                icon={<IconCheck size={16} />}
                onClick={() => onContinue({ title: page.title, next: page.next_title ?? null })}
              >
                Continue
              </Button>
            ) : (
              <Button tone="soft" disabled icon={<IconLock size={16} />} className="la-locked">
                Try it first
              </Button>
            )}
            <Button tone="soft" icon={<IconReplay size={16} />} onClick={onWatchAgain}>
              Watch again
            </Button>
          </>
        }
      />

      <div className="la-layout">
        <div className="la-main">
          {page.problems.map((problem, index) => (
            <Problem
              key={index}
              base={base}
              q={q}
              index={index}
              count={page.problems.length}
              ask={problem.ask}
              needsWorking={problem.needs_working}
              subject={page.subject}
              tried={problem.tried}
              onTried={(result) => tried(index, result)}
            />
          ))}
        </div>
        <aside className="la-side">
          <section className="sj-card la-card">
            <h2 className="la-title">How well did you understand it?</h2>
            <div className="la-seg" role="radiogroup" aria-label="How well did you understand it?">
              {RATINGS.map((choice) => (
                <button
                  key={choice.value}
                  type="button"
                  role="radio"
                  aria-checked={page.rating === choice.value}
                  className={cx(page.rating === choice.value && 'on')}
                  onClick={() => rate(choice.value)}
                >
                  {choice.label}
                </button>
              ))}
            </div>
          </section>
          <Ask base={base} q={q} page={page} onTurn={(turn, left) => setPage((now) => (now ? { ...now, conversation: [...now.conversation, turn], asks_left: left } : now))} />
        </aside>
      </div>
    </div>
  );
}

/** The after-lesson page as its own page in the app (`/lesson/:subtopicId/after`). */
export function LessonAfterPage() {
  const { subtopicId = '' } = useParams();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const student = useStudent();
  const part = Number(search.get('part') ?? '1') || 1;
  const item = search.get('item');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<{ title: string; next: string | null } | null>(null);
  const [game, setGame] = useState<{ before: Game | null; after: Game | null } | null>(null);
  const finish = async (what: { title: string; next: string | null }) => {
    setSaving(true);
    try {
      const before = await loadGame(student.studentId);
      await request<void>(`/v1/roadmap/${student.studentId}/lessons/${subtopicId}/done`, {
        method: 'POST',
        body: JSON.stringify({ item_id: item, part }),
      });
      const after = await loadGame(student.studentId);
      setGame({ before, after });
      // The reward first, then the roadmap, on a tap.
      setDone(what);
    } finally {
      setSaving(false);
    }
  };
  return (
    <PlainShell
      title="After the lesson"
      backTo="/roadmap"
      backLabel="Roadmap"
      confirmExit={{
        title: 'Leave before finishing?',
        body: "This lesson isn't finished yet. It stays next on your roadmap until you try the problem and press Continue.",
        leave: 'Leave for now',
        stay: 'Stay and finish',
      }}
    >
    <LessonAfter
      studentId={student.studentId}
      subtopicId={subtopicId}
      part={part}
      continuing={saving}
      onContinue={(what) => void finish(what)}
      onWatchAgain={() => navigate(`/lesson/${subtopicId}?part=${part}${item ? `&item=${item}` : ''}`)}
    />
    {done ? (
      <Celebrate
        title="Lesson done!"
        sub={
          <>
            <b>{done.title}</b> is ticked off your roadmap.
            {done.next ? ` Next up: ${done.next}.` : ''}
          </>
        }
        next="Back to your roadmap"
        onDone={() => navigate('/roadmap')}
        gains={[
          ...(game?.before && game.after && game.after.xp_total > game.before.xp_total
            ? [{ kind: 'xp' as const, label: 'XP', value: game.after.xp_total - game.before.xp_total, prefix: '+' }]
            : []),
          ...streakGain(game?.after ?? null),
        ]}
        ring={dayRing(game?.before ?? null, game?.after ?? null)}
      />
    ) : null}
    </PlainShell>
  );
}

/** "Which is an element? A. water  B. copper …": the question and its lettered options. */
function splitOptions(ask: string): { stem: string; options: { key: string; text: string }[] } | null {
  const found = [...ask.matchAll(/(?:^|\s)([A-E])\.\s+/g)];
  if (found.length < 2 || found[0]![1] !== 'A') return null;
  const options = found.map((match, n) => {
    const from = match.index! + match[0].length;
    const to = n + 1 < found.length ? found[n + 1]!.index! : ask.length;
    return { key: match[1]!, text: ask.slice(from, to).trim() };
  });
  if (options.some((option, n) => option.key !== 'ABCDE'[n] || !option.text)) return null;
  return { stem: ask.slice(0, found[0]!.index!).trim(), options };
}

function Problem({
  base,
  q,
  index,
  count,
  ask,
  needsWorking,
  subject,
  tried,
  onTried,
}: {
  base: string;
  q: string;
  index: number;
  count: number;
  ask: string;
  needsWorking: boolean;
  subject: string;
  tried: Tried | null;
  onTried: (result: Tried) => void;
}) {
  const choice = needsWorking ? null : splitOptions(ask);
  const [typed, setTyped] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState<'typed' | 'photo' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const camera = useRef<HTMLInputElement>(null);
  const answer = choice ? picked : typed.trim();
  // A photo of working only where there is working to show: calculations (founder, 17 Nov 2026:
  // English, for one, has none).
  const workingSubject = needsWorking || /math|physics|chemistry|account|economics/i.test(subject);

  const check = async (event: FormEvent) => {
    event.preventDefault();
    if (!answer) return;
    setBusy('typed');
    setError(null);
    try {
      onTried(await request<Tried>(`${base}/problems/${index}/answer${q}`, { method: 'POST', body: JSON.stringify({ text: answer }) }));
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
    <section className="sj-card la-try">
      <span className="sj-eyebrow">{count > 1 ? `Try it · ${index + 1} of ${count}` : 'Try it'}</span>
      <div className="la-ask">
        <Maths text={choice ? choice.stem : ask} />
      </div>
      <form className="la-answer" onSubmit={check}>
        {choice ? (
          <div className="la-options" role="radiogroup" aria-label="Choose an answer">
            {choice.options.map((option) => (
              <button
                key={option.key}
                type="button"
                role="radio"
                aria-checked={picked === option.key}
                className={cx('la-option', picked === option.key && 'on')}
                onClick={() => setPicked(option.key)}
              >
                <b>{option.key}</b>
                <Maths text={option.text} />
              </button>
            ))}
          </div>
        ) : (
          <input
            className="sj-input"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            placeholder={needsWorking ? 'Your final answer' : 'Your answer'}
            aria-label={`Your answer to problem ${index + 1}`}
            maxLength={200}
          />
        )}
        <div className="la-actions">
          <Button type="submit" tone="dark" busy={busy === 'typed'} disabled={!answer || busy !== null}>
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
          {workingSubject ? (
            <Button
              tone={needsWorking ? 'primary' : 'ghost'}
              icon={<IconCamera size={16} />}
              busy={busy === 'photo'}
              disabled={busy !== null}
              onClick={() => camera.current?.click()}
            >
              {needsWorking ? 'Send a photo of your working' : 'Photo of working'}
            </Button>
          ) : null}
        </div>
      </form>
      {error ? <p className="la-error">{error}</p> : null}
      {tried ? (
        <div className={cx('la-result', tried.correct === true && 'right', tried.correct === false && 'wrong')} role="status">
          <p className="la-verdict">
            {tried.correct === true ? <IconCheck size={16} /> : tried.correct === false ? <IconClose size={16} /> : null}
            <strong>{tried.correct === true ? 'Right' : tried.correct === false ? 'Not quite' : 'Marked'}</strong>
          </p>
          <div className="la-feedback">
            <Maths text={tried.feedback} />
          </div>
          {tried.working.length ? (
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
          ) : null}
        </div>
      ) : null}
    </section>
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
        <p className="la-lede">Anything still unclear? The coach answers in writing.</p>
      )}
      {page.can_ask ? (
        <form className="la-compose" onSubmit={send}>
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Type your question"
            aria-label="Ask the coach about this lesson"
            maxLength={600}
            disabled={waiting !== null}
          />
          <button type="submit" className="la-send" aria-label="Send" disabled={!draft.trim() || waiting !== null}>
            <IconSend size={16} />
          </button>
        </form>
      ) : (
        <p className="la-lede">Asking the coach comes with a plan.</p>
      )}
      {error ? <p className="la-error">{error}</p> : null}
      {page.can_ask ? <p className="la-left">Kept for when you come back · {page.asks_left} left today</p> : null}
    </section>
  );
}
