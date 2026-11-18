/**
 * Messages with Stack Prep (routers/support.py), as a chat app (founder, 18 Nov 2026: the form on
 * the page every time was too much). /messages lists the conversations, newest first, with the
 * last line and a dot for a reply not yet read; with none, a quiet empty screen. A round + starts
 * one in a sheet (what it is about, and the message). /messages/:threadId is the chat: our
 * messages on the left, theirs on the right, a reply box always at the bottom.
 */
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate, useParams } from "react-router-dom";

import { friendly } from "../../lib/friendlyError.js";
import { IconArrowLeft, IconClose, IconMail, IconSend } from "../icons.js";
import { useLoad, usePageTitle, useStudent } from "../store.js";
import {
  SUPPORT_TOPICS,
  supportApi,
  type SupportTopic,
  type Thread,
} from "../supportApi.js";
import { Button, PageHero, Skeleton } from "../ui.js";
import "./Support.css";

const STATUS_WORD = {
  open: "Waiting for us",
  answered: "Replied",
  closed: "Closed",
} as const;

/** A short time: today's as a clock, this week's as a day, older as a date. */
function short(iso: string): string {
  const at = new Date(iso);
  const now = new Date();
  const days = Math.floor((now.getTime() - at.getTime()) / 86_400_000);
  if (at.toDateString() === now.toDateString())
    return at.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });
  if (days < 7) return at.toLocaleDateString("en-GB", { weekday: "short" });
  return at.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** The title of a new conversation: the message's first line, cut short. */
const titleFrom = (body: string) => {
  const line = body.trim().split("\n")[0] ?? "";
  return line.length > 70 ? `${line.slice(0, 67).trimEnd()}…` : line;
};

/**
 * A new message: what it is about (one tap) and the message. In the + sheet here and in the help
 * button's panel. `onSent` hears where the new conversation lives.
 */
export function WriteForm({
  onSent,
  compact = false,
}: {
  onSent: (threadId: string) => void;
  compact?: boolean;
}) {
  const { studentId } = useStudent();
  const ids = useId();
  const [topic, setTopic] = useState<SupportTopic | "">("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = (event: FormEvent) => {
    event.preventDefault();
    if (!topic) return setError("Choose what it’s about.");
    if (!body.trim()) return setError("Write your message.");
    setBusy(true);
    setError(null);
    supportApi
      .start(studentId, { topic, subject: titleFrom(body), body: body.trim() })
      .then((thread) => onSent(thread.id))
      .catch((failure) => {
        setError(friendly(failure));
        setBusy(false);
      });
  };

  return (
    <form
      className={`mc-form ${compact ? "compact" : ""}`}
      onSubmit={send}
      noValidate
    >
      <div
        className="mc-topics"
        role="radiogroup"
        aria-label="What is it about?"
      >
        {SUPPORT_TOPICS.map((choice) => (
          <button
            key={choice.value}
            type="button"
            role="radio"
            aria-checked={topic === choice.value}
            className={topic === choice.value ? "on" : undefined}
            onClick={() => {
              setTopic(choice.value);
              setError(null);
            }}
          >
            {choice.label}
          </button>
        ))}
      </div>
      <label htmlFor={`${ids}-body`} className="mc-sr">
        Your message
      </label>
      <textarea
        id={`${ids}-body`}
        className="sj-input mc-text"
        rows={compact ? 4 : 5}
        maxLength={4000}
        value={body}
        placeholder="Write your message…"
        onChange={(event) => {
          setBody(event.target.value);
          setError(null);
        }}
      />
      {error ? (
        <p className="mc-error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="mc-send-wide" disabled={busy}>
        <IconSend size={16} /> {busy ? "Sending…" : "Send"}
      </button>
    </form>
  );
}

/** /messages: the conversations, and a + to start one. */
export function Messages() {
  usePageTitle("Messages");
  const { studentId } = useStudent();
  const navigate = useNavigate();
  const threads = useLoad(() => supportApi.threads(studentId), [studentId]);
  const [writing, setWriting] = useState(false);
  const list = [...(threads.data ?? [])].sort((a, b) =>
    b.updated_at.localeCompare(a.updated_at),
  );

  return (
    <div className="sj-page mc">
      <PageHero
        eyebrow="Messages"
        title="Talk to us"
        sub="A person at Stack Prep replies, usually within a day."
        actions={
          <Button className="mc-new" onClick={() => setWriting(true)}>
            New message
          </Button>
        }
      />
      {threads.loading && !threads.data ? (
        <div className="mc-list" aria-busy="true">
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} height={68} radius={10} />
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className="mc-empty">
          <span className="mc-empty-icon" aria-hidden="true">
            <IconMail size={28} />
          </span>
          <b className="sj-display">No messages yet</b>
          <p>
            Something not working, or a question? A person at Stack Prep
            replies, usually within a day.
          </p>
          <button
            type="button"
            className="sj-btn"
            onClick={() => setWriting(true)}
          >
            Write to us
          </button>
        </div>
      ) : (
        <ul className="mc-list">
          {list.map((thread) => (
            <li key={thread.id}>
              <Link
                to={`/messages/${thread.id}`}
                className={`mc-row ${thread.unread ? "unread" : ""}`}
              >
                <span className="mc-avatar" aria-hidden="true">
                  <img src="/brand/mark-96.png" alt="" width={26} height={26} />
                </span>
                <span className="mc-row-text">
                  <span className="mc-row-top">
                    <b>{thread.subject}</b>
                    <small>{short(thread.updated_at)}</small>
                  </span>
                  <span className="mc-row-last">
                    <span>
                      {thread.last_from_staff ? "" : "You: "}
                      {thread.last_body}
                    </span>
                    {thread.unread ? (
                      <i className="mc-dot" aria-label="New reply" />
                    ) : null}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/* Outside the page (a portal): the page's entrance motion would carry them with it. */}
      {createPortal(
        <div className="sj mc-layer">
          <button
            type="button"
            className="mc-fab"
            onClick={() => setWriting(true)}
            aria-label="New message"
          >
            <span aria-hidden="true">+</span>
          </button>
          {writing ? (
            <div className="mc-sheet-root">
              <div
                className="mc-scrim"
                onClick={() => setWriting(false)}
                aria-hidden="true"
              />
              <section
                className="mc-sheet"
                role="dialog"
                aria-modal="true"
                aria-labelledby="mc-new"
              >
                <span className="mc-handle" aria-hidden="true" />
                <div className="mc-sheet-head">
                  <b id="mc-new" className="sj-display">
                    New message
                  </b>
                  <button
                    type="button"
                    className="mc-close"
                    onClick={() => setWriting(false)}
                    aria-label="Close"
                  >
                    <IconClose size={18} />
                  </button>
                </div>
                <WriteForm onSent={(id) => navigate(`/messages/${id}`)} />
              </section>
            </div>
          ) : null}
        </div>,
        document.body,
      )}
    </div>
  );
}

/** /messages/:threadId: one conversation as a chat, the reply box always at the bottom. */
export function SupportThread() {
  const { studentId } = useStudent();
  const { threadId = "" } = useParams();
  const [thread, setThread] = useState<Thread | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  // Optimistic (founder, 18 Nov 2026): a message shows the moment it is sent, "Sending…" under
  // it until the server has it, and "Not sent · tap to try again" if it could not go.
  const [outbox, setOutbox] = useState<
    { key: string; body: string; failed: boolean }[]
  >([]);
  const end = useRef<HTMLDivElement>(null);
  usePageTitle(thread?.subject ?? "Messages");

  useEffect(() => {
    supportApi
      .thread(studentId, threadId)
      .then(setThread)
      .catch((failure) => setProblem(friendly(failure)));
  }, [studentId, threadId]);
  // A body, not an arrow that returns: newer browsers' scrollIntoView returns a promise, and React
  // would take it for a clean-up function and crash when the effect runs again.
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [thread?.thread_messages.length, outbox.length]);


  const deliver = (key: string, body: string) => {
    setOutbox((now) =>
      now.map((m) => (m.key === key ? { ...m, failed: false } : m)),
    );
    supportApi
      .reply(studentId, threadId, body)
      .then((next) => {
        setThread(next);
        setOutbox((now) => now.filter((m) => m.key !== key));
        setProblem(null);
      })
      .catch(() =>
        setOutbox((now) =>
          now.map((m) => (m.key === key ? { ...m, failed: true } : m)),
        ),
      );
  };

  const send = (event?: FormEvent) => {
    event?.preventDefault();
    const body = reply.trim();
    if (!body) return;
    const key = `out-${Date.now()}`;
    setOutbox((now) => [...now, { key, body, failed: false }]);
    setReply("");
    deliver(key, body);
  };

  return (
    <div className="sj-page mc mc-chat">
      <div className="mc-chat-bar">
        <Link to="/messages" className="mc-back">
          <IconArrowLeft size={16} /> All messages
        </Link>
        {thread ? (
          <span className={`mc-status ${thread.status}`}>
            {STATUS_WORD[thread.status]}
          </span>
        ) : null}
      </div>

      {thread ? (
        <ol className="mc-bubbles">
          {thread.thread_messages.map((message) => (
            <li key={message.id} className={message.from_staff ? "them" : "me"}>
              <p>{message.body}</p>
              <small>
                {message.from_staff && message.author_name
                  ? `${message.author_name} · `
                  : ""}
                {short(message.created_at)}
              </small>
            </li>
          ))}
          {outbox.map((message) => (
            <li
              key={message.key}
              className={`me ${message.failed ? "failed" : "pending"}`}
              onClick={
                message.failed
                  ? () => deliver(message.key, message.body)
                  : undefined
              }
            >
              <p>{message.body}</p>
              <small>
                {message.failed ? "Not sent · tap to try again" : "Sending…"}
              </small>
            </li>
          ))}
          <div ref={end} />
        </ol>
      ) : problem ? (
        <p className="mc-problem">{problem}</p>
      ) : (
        <div className="mc-bubbles" aria-busy="true">
          <Skeleton height={64} width="70%" radius={14} />
          <Skeleton height={48} width="55%" radius={14} />
        </div>
      )}

      {thread ? (
        <form className="mc-composer" onSubmit={send}>
          {problem ? (
            <p className="mc-error" role="alert">
              {problem}
            </p>
          ) : null}
          <div className="mc-composer-row">
            <label htmlFor="mc-reply" className="mc-sr">
              Your reply
            </label>
            <textarea
              id="mc-reply"
              className="mc-input"
              rows={1}
              maxLength={4000}
              value={reply}
              placeholder={
                thread.status === "closed"
                  ? "Write to open it again…"
                  : "Message"
              }
              onChange={(event) => setReply(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  window.matchMedia("(min-width: 861px)").matches
                ) {
                  event.preventDefault();
                  send();
                }
              }}
            />
            <button
              type="submit"
              className="mc-send"
              disabled={!reply.trim()}
              aria-label="Send"
            >
              <IconSend size={18} />
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
