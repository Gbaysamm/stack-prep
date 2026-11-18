/**
 * Talking to students: the Support inbox (routers/support.py) and Announcements
 * (routers/announcements.py). The inbox is a list and the open conversation side by side on a
 * laptop; on a phone the conversation takes the screen, with a way back.
 */
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { friendly, request } from '../lib/friendlyError.js';
import { Select } from '../lib/Select.js';
import { IconArrowLeft, IconMail, IconMegaphone, IconSearch, IconUser } from '../prep/icons.js';
import { topicWord, when, type SupportMessage, type SupportStatus, type SupportTopic } from '../prep/supportApi.js';
import { StaffPageHead } from '../staff/StaffShell.js';
import { ago } from './StudentsPage.js';

/* ------------------------------------------------------------------ the inbox */

interface InboxLine {
  id: string;
  topic: SupportTopic;
  subject: string;
  status: SupportStatus;
  created_at: string;
  updated_at: string;
  last_body: string;
  last_from_staff: boolean;
  messages: number;
  student_id: string | null;
  who: string;
  contact: string | null;
}

interface InboxThread extends InboxLine {
  thread_messages: SupportMessage[];
  can_email: boolean;
}

interface Inbox {
  threads: InboxLine[];
  counts: Record<SupportStatus, number>;
}

type Filter = SupportStatus | 'all';
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'open', label: 'Waiting for us' },
  { value: 'answered', label: 'Replied' },
  { value: 'closed', label: 'Closed' },
  { value: 'all', label: 'All' },
];
const STATUS_PILL: Record<SupportStatus, [string, string]> = {
  open: ['Waiting', 'warn'],
  answered: ['Replied', 'good'],
  closed: ['Closed', ''],
};

/** Sent when a conversation changes, so the menu's count can catch up. */
const INBOX_CHANGED = 'stackprep:inbox-changed';

/** How many conversations wait for a reply, for the menu. */
export function useWaitingSupport(): number | undefined {
  const [open, setOpen] = useState<number>();
  useEffect(() => {
    const load = () =>
      request<Inbox>('/v1/admin/support?status=open')
        .then((inbox) => setOpen(inbox.counts.open))
        .catch(() => undefined);
    void load();
    window.addEventListener(INBOX_CHANGED, load);
    return () => window.removeEventListener(INBOX_CHANGED, load);
  }, []);
  return open;
}

export function SupportPage() {
  const { threadId } = useParams();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('open');
  const [typed, setTyped] = useState('');
  const [q, setQ] = useState('');
  const [inbox, setInbox] = useState<Inbox | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setQ(typed.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [typed]);

  const load = useCallback(() => {
    const query = new URLSearchParams({ status: filter, ...(q ? { q } : {}) });
    request<Inbox>(`/v1/admin/support?${query}`)
      .then((next) => {
        setInbox(next);
        setProblem(null);
      })
      .catch((error) => setProblem(friendly(error)));
  }, [filter, q]);
  useEffect(load, [load]);

  return (
    <>
      <StaffPageHead
        title="Support"
        sub="Messages from students and the contact form. Your reply shows in their app and, where there's an address, goes by email too."
      />
      {problem && <p className="st-error">{problem}</p>}
      <div className={`sp-inbox ${threadId ? 'reading' : ''}`}>
        <section className="st-panel sp-list">
          <div className="st-seg sp-seg" role="tablist" aria-label="Show">
            {FILTERS.map((item) => (
              <button
                key={item.value}
                type="button"
                role="tab"
                aria-selected={filter === item.value}
                className={filter === item.value ? 'on' : undefined}
                onClick={() => setFilter(item.value)}
              >
                {item.label}
                {item.value !== 'all' && inbox ? <span className="sp-count">{inbox.counts[item.value]}</span> : null}
              </button>
            ))}
          </div>
          <label className="sp-search">
            <IconSearch size={16} />
            <input value={typed} placeholder="Search by name, email or title" onChange={(e) => setTyped(e.target.value)} />
          </label>
          {!inbox ? (
            <p className="st-muted">Loading…</p>
          ) : inbox.threads.length === 0 ? (
            <p className="st-empty">{filter === 'open' && !q ? 'Nothing waiting. Every message has a reply.' : 'No conversations here.'}</p>
          ) : (
            <ul className="sp-lines">
              {inbox.threads.map((thread) => (
                <li key={thread.id}>
                  <Link to={`/support/${thread.id}`} className={`sp-line ${thread.id === threadId ? 'on' : ''}`}>
                    <span className={`hm-avatar ${thread.student_id ? 'purple' : 'blue'}`} aria-hidden="true">
                      {thread.who.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="sp-line-text">
                      <span className="sp-line-top">
                        <strong>{thread.who}</strong>
                        <span className="sp-time">{ago(thread.updated_at)}</span>
                      </span>
                      <span className="sp-line-subject">{thread.subject}</span>
                      <span className="sp-line-last">
                        {thread.last_from_staff ? 'You: ' : ''}
                        {thread.last_body}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="st-panel sp-read">
          {threadId ? (
            <Conversation key={threadId} threadId={threadId} onChanged={load} onBack={() => navigate('/support')} />
          ) : (
            <div className="sp-none">
              <span className="hm-icon lg blue" aria-hidden="true">
                <IconMail size={24} />
              </span>
              <p>Choose a conversation to read it and reply.</p>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function Conversation({ threadId, onChanged, onBack }: { threadId: string; onChanged: () => void; onBack: () => void }) {
  const [thread, setThread] = useState<InboxThread | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    request<InboxThread>(`/v1/admin/support/${threadId}`)
      .then(setThread)
      .catch((error) => setProblem(friendly(error)));
  }, [threadId]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' });
  }, [thread?.thread_messages.length]);

  const act = (path: string, init: RequestInit, after?: () => void) => {
    setBusy(true);
    setProblem(null);
    request<InboxThread>(path, init)
      .then((next) => {
        setThread(next);
        after?.();
        onChanged();
        window.dispatchEvent(new Event(INBOX_CHANGED));
      })
      .catch((error) => setProblem(friendly(error)))
      .finally(() => setBusy(false));
  };
  const send = (event: FormEvent) => {
    event.preventDefault();
    if (!reply.trim() || busy) return;
    act(`/v1/admin/support/${threadId}/messages`, { method: 'POST', body: JSON.stringify({ body: reply.trim() }) }, () =>
      setReply(''),
    );
  };
  const setStatus = (status: SupportStatus) =>
    act(`/v1/admin/support/${threadId}/status`, { method: 'PUT', body: JSON.stringify({ status }) });

  if (!thread) return problem ? <p className="st-error">{problem}</p> : <p className="st-muted">Loading…</p>;
  const [pillWord, pillTone] = STATUS_PILL[thread.status];
  return (
    <div className="sp-thread">
      <button type="button" className="sp-back" onClick={onBack}>
        <IconArrowLeft size={16} /> All messages
      </button>
      <header className="sp-thread-head">
        <div>
          <h2>{thread.subject}</h2>
          <p className="st-muted">
            {topicWord(thread.topic)} · started {when(thread.created_at)}
          </p>
        </div>
        <span className={`st-pill ${pillTone}`}>{pillWord}</span>
      </header>
      <div className="sp-who">
        <span className="hm-icon sm purple" aria-hidden="true">
          <IconUser size={16} />
        </span>
        <span>
          <strong>{thread.who}</strong>
          {thread.contact ? <span className="st-muted"> · {thread.contact}</span> : null}
          {!thread.student_id ? <span className="st-muted"> · from the contact form</span> : null}
        </span>
        {thread.student_id ? (
          <Link to={`/students/${thread.student_id}`} className="hm-more">
            Their page
          </Link>
        ) : null}
      </div>
      <ol className="sp-messages">
        {thread.thread_messages.map((message) => (
          <li key={message.id} className={message.from_staff ? 'us' : 'them'}>
            <span className="sp-msg-who">
              {message.from_staff ? (message.author_name ?? 'Stack Prep') : thread.who} · {when(message.created_at)}
            </span>
            <p>{message.body}</p>
          </li>
        ))}
      </ol>
      <div ref={end} />
      {problem && <p className="st-error">{problem}</p>}
      <form className="sp-reply" onSubmit={send}>
        <textarea
          aria-label="Your reply"
          rows={4}
          maxLength={4000}
          value={reply}
          placeholder={`Reply to ${thread.who.split(' ')[0]}…`}
          onChange={(e) => setReply(e.target.value)}
        />
        <div className="sp-reply-bar">
          <span className="st-muted">
            {thread.student_id
              ? thread.can_email
                ? 'Shows in their app and goes to their email.'
                : 'Shows in their app.'
              : thread.can_email
                ? 'Goes to their email.'
                : 'Email isn’t set up, so they won’t get this until it is (see System health).'}
          </span>
          <div className="sp-reply-actions">
            {thread.status === 'closed' ? (
              <button type="button" className="sj-btn ghost" disabled={busy} onClick={() => setStatus('open')}>
                Reopen
              </button>
            ) : (
              <button type="button" className="sj-btn ghost" disabled={busy} onClick={() => setStatus('closed')}>
                Close
              </button>
            )}
            <button type="submit" className="sj-btn" disabled={busy || !reply.trim()}>
              {busy ? 'Sending…' : 'Send reply'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

/* ------------------------------------------------------------------ announcements */

type Kind = 'banner' | 'popup';
type Audience = 'all' | 'free' | 'paid' | 'ss1' | 'ss2' | 'ss3' | 'graduated';
type Tone = 'info' | 'good' | 'warning';

interface AdminAnnouncement {
  id: string;
  kind: Kind;
  title: string;
  body: string | null;
  link_label: string | null;
  link_url: string | null;
  tone: Tone;
  audience: Audience;
  starts_at: string;
  ends_at: string | null;
  active: boolean;
  created_at: string;
  created_by_name: string | null;
  state: 'showing' | 'scheduled' | 'ended' | 'off';
  dismissed: number;
  reach: number;
}

const AUDIENCES: { value: Audience; label: string }[] = [
  { value: 'all', label: 'Everyone' },
  { value: 'free', label: 'Students without a plan' },
  { value: 'paid', label: 'Students on a plan' },
  { value: 'ss1', label: 'SS1' },
  { value: 'ss2', label: 'SS2' },
  { value: 'ss3', label: 'SS3' },
  { value: 'graduated', label: 'Left school' },
];
const TONES: { value: Tone; label: string }[] = [
  { value: 'info', label: 'News (purple)' },
  { value: 'good', label: 'Good news (green)' },
  { value: 'warning', label: 'Heads up (yellow)' },
];
const STATE_PILL: Record<AdminAnnouncement['state'], [string, string]> = {
  showing: ['Showing', 'good'],
  scheduled: ['Scheduled', 'admin'],
  ended: ['Ended', ''],
  off: ['Off', 'warn'],
};

interface Draft {
  id: string | null;
  kind: Kind;
  title: string;
  body: string;
  link_label: string;
  link_url: string;
  audience: Audience;
  tone: Tone;
  starts: string;
  ends: string;
  active: boolean;
}

const BLANK: Draft = {
  id: null,
  kind: 'banner',
  title: '',
  body: '',
  link_label: '',
  link_url: '',
  audience: 'all',
  tone: 'info',
  starts: '',
  ends: '',
  active: true,
};

/** An ISO time as the value of a datetime-local input, in local time. */
const toLocal = (iso: string | null) => {
  if (!iso) return '';
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const fromLocal = (value: string) => (value ? new Date(value).toISOString() : null);
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export function AnnouncementsPage() {
  const [items, setItems] = useState<AdminAnnouncement[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    request<AdminAnnouncement[]>('/v1/admin/announcements')
      .then(setItems)
      .catch((error) => setProblem(friendly(error)));
  }, []);
  useEffect(load, [load]);

  const edit = (item: AdminAnnouncement) =>
    setDraft({
      id: item.id,
      kind: item.kind,
      title: item.title,
      body: item.body ?? '',
      link_label: item.link_label ?? '',
      link_url: item.link_url ?? '',
      audience: item.audience,
      tone: item.tone,
      starts: toLocal(item.starts_at),
      ends: toLocal(item.ends_at),
      active: item.active,
    });
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((now) => (now ? { ...now, [key]: value } : now));

  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!draft || busy) return;
    setBusy(true);
    setProblem(null);
    const body = {
      kind: draft.kind,
      title: draft.title,
      body: draft.body || null,
      link_label: draft.link_label || null,
      link_url: draft.link_url || null,
      audience: draft.audience,
      tone: draft.tone,
      starts_at: fromLocal(draft.starts),
      ends_at: fromLocal(draft.ends),
      active: draft.active,
    };
    request<AdminAnnouncement>(draft.id ? `/v1/admin/announcements/${draft.id}` : '/v1/admin/announcements', {
      method: draft.id ? 'PUT' : 'POST',
      body: JSON.stringify(body),
    })
      .then(() => {
        setDraft(null);
        load();
      })
      .catch((error) => setProblem(friendly(error)))
      .finally(() => setBusy(false));
  };
  const remove = (item: AdminAnnouncement) => {
    if (!window.confirm(`Delete “${item.title}”? Students who haven't closed it stop seeing it.`)) return;
    request(`/v1/admin/announcements/${item.id}`, { method: 'DELETE' })
      .then(() => {
        setDraft(null);
        load();
      })
      .catch((error) => setProblem(friendly(error)));
  };

  const showing = (items ?? []).filter((item) => item.state === 'showing');
  return (
    <>
      <StaffPageHead
        title="Announcements"
        sub="Tell students something in the app: a banner along the top until they close it, or a pop-up they see once."
        actions={
          <button type="button" className="sj-btn" onClick={() => setDraft({ ...BLANK })}>
            New announcement
          </button>
        }
      />
      {problem && !draft && <p className="st-error">{problem}</p>}
      {!items && !problem && <p className="st-muted">Loading…</p>}
      {items && items.length === 0 && (
        <section className="st-panel an-empty">
          <span className="hm-icon lg purple" aria-hidden="true">
            <IconMegaphone size={24} />
          </span>
          <div>
            <h2>Nothing announced yet</h2>
            <p className="st-muted">
              For example: “Mocks are free this weekend”, “New: Literature past questions”, or “The app is down for
              10 minutes at midnight”.
            </p>
          </div>
          <button type="button" className="sj-btn" onClick={() => setDraft({ ...BLANK })}>
            Write the first one
          </button>
        </section>
      )}
      {items && items.length > 0 && (
        <>
          <p className="st-muted an-summary">
            {showing.length === 0
              ? 'Nothing is showing to students right now.'
              : `${showing.length} showing now, to up to ${Math.max(...showing.map((s) => s.reach)).toLocaleString('en-NG')} students.`}
          </p>
          <ul className="an-list">
            {items.map((item) => {
              const [word, tone] = STATE_PILL[item.state];
              return (
                <li key={item.id} className="st-panel an-item">
                  <div className={`an-preview ${item.tone}`}>
                    <span className="an-preview-icon" aria-hidden="true">
                      <IconMegaphone size={16} />
                    </span>
                    <span className="an-preview-text">
                      <strong>{item.title}</strong>
                      {item.body ? <span> {item.body}</span> : null}
                    </span>
                    {item.link_label ? <span className="an-preview-go">{item.link_label} →</span> : null}
                  </div>
                  <div className="an-meta">
                    <span className={`st-pill ${tone}`}>{word}</span>
                    <span>{item.kind === 'popup' ? 'Pop-up' : 'Banner'}</span>
                    <span>For {AUDIENCES.find((a) => a.value === item.audience)?.label.toLowerCase()}</span>
                    <span>
                      {day(item.starts_at)}
                      {item.ends_at ? ` to ${day(item.ends_at)}` : ', no end'}
                    </span>
                    <span>
                      Reaches {item.reach.toLocaleString('en-NG')} · closed by {item.dismissed.toLocaleString('en-NG')}
                    </span>
                    <span className="an-actions">
                      <button type="button" className="sj-btn ghost sm" onClick={() => edit(item)}>
                        Edit
                      </button>
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {draft && (
        <div className="pp-drawer" role="dialog" aria-modal="true" aria-label={draft.id ? 'Edit the announcement' : 'A new announcement'}>
          <button type="button" className="pp-drawer-scrim" aria-label="Close" onClick={() => !busy && setDraft(null)} />
          <aside className="pp-drawer-panel">
            <header className="pp-drawer-head">
              <h3>{draft.id ? 'Edit the announcement' : 'A new announcement'}</h3>
              <button type="button" className="pp-drawer-close" aria-label="Close" onClick={() => setDraft(null)} disabled={busy}>
                ×
              </button>
            </header>
            <form className="st-form" onSubmit={save}>
              <div className={`an-preview big ${draft.tone}`} aria-label="How it looks">
                <span className="an-preview-icon" aria-hidden="true">
                  <IconMegaphone size={16} />
                </span>
                <span className="an-preview-text">
                  <strong>{draft.title || 'Your title'}</strong>
                  {draft.body ? <span> {draft.body}</span> : null}
                </span>
                {draft.link_label ? <span className="an-preview-go">{draft.link_label} →</span> : null}
              </div>
              <div className="st-seg an-kind" role="radiogroup" aria-label="Kind">
                {(['banner', 'popup'] as Kind[]).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    role="radio"
                    aria-checked={draft.kind === kind}
                    className={draft.kind === kind ? 'on' : undefined}
                    onClick={() => set('kind', kind)}
                  >
                    {kind === 'banner' ? 'Banner along the top' : 'Pop-up, once'}
                  </button>
                ))}
              </div>
              <label className="st-field">
                <span>Title</span>
                <input value={draft.title} maxLength={80} placeholder="Mocks are free this weekend" onChange={(e) => set('title', e.target.value)} />
              </label>
              <label className="st-field">
                <span>More (optional)</span>
                <textarea rows={3} maxLength={600} value={draft.body} onChange={(e) => set('body', e.target.value)} />
              </label>
              <div className="an-two">
                <label className="st-field">
                  <span>Button words (optional)</span>
                  <input value={draft.link_label} maxLength={30} placeholder="Sit a mock" onChange={(e) => set('link_label', e.target.value)} />
                </label>
                <label className="st-field">
                  <span>Goes to</span>
                  <input value={draft.link_url} maxLength={300} placeholder="/mock or https://…" onChange={(e) => set('link_url', e.target.value)} />
                </label>
                <div className="st-field">
                  <span>Who sees it</span>
                  <Select<Audience> aria-label="Who sees it" value={draft.audience} onChange={(v) => set('audience', v)} options={AUDIENCES} />
                </div>
                <div className="st-field">
                  <span>Colour</span>
                  <Select<Tone> aria-label="Colour" value={draft.tone} onChange={(v) => set('tone', v)} options={TONES} />
                </div>
                <label className="st-field">
                  <span>Starts (blank: now)</span>
                  <input type="datetime-local" value={draft.starts} onChange={(e) => set('starts', e.target.value)} />
                </label>
                <label className="st-field">
                  <span>Ends (blank: no end)</span>
                  <input type="datetime-local" value={draft.ends} onChange={(e) => set('ends', e.target.value)} />
                </label>
              </div>
              <div className="st-setting an-switch">
                <div>
                  <strong>Switched on</strong>
                  <span className="st-muted">Off keeps it here without showing it to anyone.</span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={draft.active}
                  aria-label="Switched on"
                  className={`st-toggle ${draft.active ? 'on' : ''}`}
                  onClick={() => set('active', !draft.active)}
                >
                  <span />
                </button>
              </div>
              {problem && <p className="st-error">{problem}</p>}
              <div className="an-drawer-actions">
                {draft.id ? (
                  <button
                    type="button"
                    className="sj-btn ghost an-delete"
                    disabled={busy}
                    onClick={() => {
                      const item = items?.find((i) => i.id === draft.id);
                      if (item) remove(item);
                    }}
                  >
                    Delete
                  </button>
                ) : null}
                <button type="submit" className="sj-btn" disabled={busy || !draft.title.trim()}>
                  {busy ? 'Saving…' : draft.id ? 'Save' : 'Announce'}
                </button>
              </div>
            </form>
          </aside>
        </div>
      )}
    </>
  );
}
