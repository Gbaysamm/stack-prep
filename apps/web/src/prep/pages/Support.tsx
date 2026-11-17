/**
 * Writing to Stack Prep from inside the app (routers/support.py): the "Write to us" section at
 * the foot of Help & guides, with the student's conversations beside it, and one conversation
 * at /help/messages/:threadId where they read replies and answer.
 */
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { friendly } from '../../lib/friendlyError.js';
import { Select } from '../../lib/Select.js';
import { IconArrowLeft, IconArrowRight, IconMail, IconSend } from '../icons.js';
import { useLoad, usePageTitle, useStudent } from '../store.js';
import {
  SUPPORT_TOPICS,
  supportApi,
  topicWord,
  when,
  type SupportTopic,
  type Thread,
} from '../supportApi.js';
import { Button, PageHero } from '../ui.js';
import './Support.css';

const STATUS_WORD = { open: 'Waiting for us', answered: 'Replied', closed: 'Closed' } as const;

/**
 * Write to us: what it is about, a title, the message. On the Messages page and in the floating
 * help popup (founder, 17 Nov 2026). `onSent` hears where the new conversation lives.
 */
export function WriteForm({ onSent, compact = false }: { onSent: (threadId: string) => void; compact?: boolean }) {
  const { studentId } = useStudent();
  const ids = useId();
  const [topic, setTopic] = useState<SupportTopic | ''>('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = (event: FormEvent) => {
    event.preventDefault();
    if (!topic) return setError('Choose what it’s about.');
    if (!subject.trim() || !body.trim()) return setError('Add a short title and your message.');
    setBusy(true);
    setError(null);
    supportApi
      .start(studentId, { topic, subject: subject.trim(), body: body.trim() })
      .then((thread) => onSent(thread.id))
      .catch((failure) => {
        setError(friendly(failure));
        setBusy(false);
      });
  };

  return (
    <form className={compact ? 'su-form compact' : 'sj-card su-form'} onSubmit={send} noValidate>
      {compact ? null : (
        <div className="su-head">
          <span className="su-icon" aria-hidden="true">
            <IconMail size={22} />
          </span>
          <div>
            <h2 id="su-title" className="sj-display sj-h3">
              Write to us
            </h2>
            <p>A person at Stack Prep reads every message and replies here, usually within a day.</p>
          </div>
        </div>
      )}
      <div className="sj-field">
        <label htmlFor={`${ids}-topic`}>What is it about?</label>
        <Select
          id={`${ids}-topic`}
          value={topic}
          onChange={(value) => {
            setTopic(value as SupportTopic);
            setError(null);
          }}
          placeholder="Choose one"
          options={SUPPORT_TOPICS}
        />
      </div>
      <div className="sj-field">
        <label htmlFor={`${ids}-subject`}>Title</label>
        <input
          id={`${ids}-subject`}
          className="sj-input"
          maxLength={120}
          value={subject}
          placeholder="For example: my plan didn’t start"
          onChange={(event) => {
            setSubject(event.target.value);
            setError(null);
          }}
        />
      </div>
      <div className="sj-field">
        <label htmlFor={`${ids}-body`}>Your message</label>
        <textarea
          id={`${ids}-body`}
          className="sj-input su-text"
          rows={compact ? 4 : 5}
          maxLength={4000}
          value={body}
          placeholder="Tell us what happened, and what you expected."
          onChange={(event) => {
            setBody(event.target.value);
            setError(null);
          }}
        />
      </div>
      {error ? (
        <p className="su-error" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" size="sm" busy={busy} icon={<IconSend size={16} />} className="su-send">
        Send
      </Button>
    </form>
  );
}

export function SupportBox() {
  const { studentId } = useStudent();
  const navigate = useNavigate();
  const threads = useLoad(() => supportApi.threads(studentId), [studentId]);
  const settings = useLoad(() => supportApi.settings(), []);

  const list = threads.data ?? [];
  return (
    <section className="hp-sec su-sec" aria-labelledby="su-title">
      <div className="su-grid">
        <WriteForm onSent={(id) => navigate(`/messages/${id}`)} />

        <div className="sj-card su-list">
          <h3 className="sj-display su-list-title">Your conversations</h3>
          {list.length === 0 ? (
            <p className="su-empty">
              {threads.loading ? 'Loading…' : 'Nothing yet. When you write to us, the conversation stays here with our replies.'}
            </p>
          ) : (
            <ul>
              {list.map((thread) => (
                <li key={thread.id}>
                  <Link to={`/messages/${thread.id}`} className={`su-line ${thread.unread ? 'unread' : ''}`}>
                    <span className="su-line-top">
                      <strong>{thread.subject}</strong>
                      <span className={`su-status ${thread.status}`}>
                        {thread.unread ? 'New reply' : STATUS_WORD[thread.status]}
                      </span>
                    </span>
                    <span className="su-line-last">
                      {thread.last_from_staff ? 'Stack Prep: ' : 'You: '}
                      {thread.last_body}
                    </span>
                    <span className="su-line-when">{when(thread.updated_at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <div className="su-other">
            <strong>Replies come here.</strong> When we answer, a green note shows at the top of the app until you read
            it.
            {settings.data?.support_email || settings.data?.support_whatsapp ? (
              <span className="su-ways">
                You can also reach us
                {settings.data.support_email ? (
                  <>
                    {' '}
                    at <a href={`mailto:${settings.data.support_email}`}>{settings.data.support_email}</a>
                  </>
                ) : null}
                {settings.data.support_email && settings.data.support_whatsapp ? ' or' : ''}
                {settings.data.support_whatsapp ? (
                  <>
                    {' '}
                    on WhatsApp at{' '}
                    <a href={`https://wa.me/${settings.data.support_whatsapp.replace(/[^0-9]/g, '')}`} target="_blank" rel="noreferrer">
                      {settings.data.support_whatsapp}
                    </a>
                  </>
                ) : null}
                .
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

export function SupportThread() {
  const { studentId } = useStudent();
  const { threadId = '' } = useParams();
  const [thread, setThread] = useState<Thread | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  usePageTitle('Help & guides');

  useEffect(() => {
    supportApi
      .thread(studentId, threadId)
      .then(setThread)
      .catch((failure) => setProblem(friendly(failure)));
  }, [studentId, threadId]);
  useEffect(() => end.current?.scrollIntoView({ block: 'nearest' }), [thread?.thread_messages.length]);

  const send = (event: FormEvent) => {
    event.preventDefault();
    if (!reply.trim()) return;
    setBusy(true);
    supportApi
      .reply(studentId, threadId, reply.trim())
      .then((next) => {
        setThread(next);
        setReply('');
        setProblem(null);
      })
      .catch((failure) => setProblem(friendly(failure)))
      .finally(() => setBusy(false));
  };

  return (
    <div className="sj-page su-page">
      <Link to="/messages" className="su-back">
        <IconArrowLeft size={16} /> Messages
      </Link>
      {thread ? (
        <>
          <header className="su-thread-head">
            <span className="sj-eyebrow">{topicWord(thread.topic)}</span>
            <h1 className="sj-display sj-h2">{thread.subject}</h1>
            <span className={`su-status ${thread.status}`}>{STATUS_WORD[thread.status]}</span>
          </header>
          <ol className="su-messages">
            {thread.thread_messages.map((message) => (
              <li key={message.id} className={message.from_staff ? 'them' : 'me'}>
                <span className="su-who">
                  {message.from_staff ? `${message.author_name ?? 'Stack Prep'} · Stack Prep` : 'You'} ·{' '}
                  {when(message.created_at)}
                </span>
                <p>{message.body}</p>
              </li>
            ))}
          </ol>
          <div ref={end} />
          <form className="sj-card su-reply" onSubmit={send}>
            <label htmlFor="su-reply" className="su-reply-label">
              {thread.status === 'closed' ? 'Write again to open it' : 'Add to this conversation'}
            </label>
            <textarea
              id="su-reply"
              className="sj-input su-text"
              rows={3}
              maxLength={4000}
              value={reply}
              onChange={(event) => setReply(event.target.value)}
            />
            {problem ? (
              <p className="su-error" role="alert">
                {problem}
              </p>
            ) : null}
            <div className="su-reply-actions">
              <Button type="submit" busy={busy} disabled={!reply.trim()} icon={<IconSend size={18} />}>
                Send
              </Button>
            </div>
          </form>
        </>
      ) : problem ? (
        <div className="sj-card su-missing">
          <p>{problem}</p>
          <Link to="/messages" className="su-back">
            Back to Messages <IconArrowRight size={14} />
          </Link>
        </div>
      ) : (
        <p className="su-empty">Loading…</p>
      )}
    </div>
  );
}

/** /messages: the student's own page for writing to the team and reading the replies. */
export function Messages() {
  usePageTitle('Messages');
  return (
    <div className="sj-page su-msgs">
      <PageHero
        eyebrow="Messages"
        title="Talk to a person"
        sub="Anything not working, a question about your plan, or a payment: write to us here and the reply comes back here."
      />
      <SupportBox />
    </div>
  );
}
