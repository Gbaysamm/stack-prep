/**
 * /dev/emails — every email Stack Prep sends, as it is sent, for reviewing them (founder,
 * 17 Nov 2026). Rendered by the API from apps/api/src/app/emails with sample data
 * (GET /v1/dev/emails), so what shows here is exactly what goes out. Local and test setups only:
 * the API refuses it anywhere else. Laptop or phone width, as Gmail shows it (no web fonts), or
 * the plain-text copy.
 */
import { useEffect, useRef, useState } from 'react';

import { failure, friendly, reach } from '../lib/friendlyError.js';
import '../prep/prep.css';
import './EmailPreviews.css';

interface Preview {
  name: string;
  when: string;
  subject: string;
  html: string;
  text: string;
}
type Mode = 'laptop' | 'phone' | 'gmail' | 'text';

/** Gmail loads no web fonts: the email as its readers see it, in the phone's own font. */
const asGmail = (html: string) =>
  html
    .replace(/<link[^>]*(fonts\.googleapis|fontshare)[^>]*>/g, '')
    .replace(/'(Clash Display|Poppins|Space Mono)',/g, '')
    .replace(/'Segoe UI',/g, 'Roboto,');

export function EmailPreviews() {
  const [emails, setEmails] = useState<Preview[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [current, setCurrent] = useState(0);
  const [mode, setMode] = useState<Mode>('laptop');
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    document.title = 'Emails · Stack Prep';
    reach(`/v1/dev/emails?base=${encodeURIComponent(window.location.origin)}`)
      .then(async (response) => {
        if (!response.ok) throw await failure(response);
        setEmails((await response.json()) as Preview[]);
      })
      .catch((error) => setProblem(friendly(error)));
  }, []);

  // The email's own height, so it shows whole with no scrollbar of its own.
  const fit = () => {
    const doc = frame.current?.contentDocument;
    if (frame.current && doc?.documentElement) frame.current.style.height = `${doc.documentElement.scrollHeight}px`;
  };
  useEffect(() => {
    const timer = window.setTimeout(fit, 400);
    return () => window.clearTimeout(timer);
  }, [current, mode]);

  if (problem) return <p className="ep-problem">{problem}</p>;
  if (!emails) return <p className="ep-problem">Loading the emails…</p>;
  const email = emails[current]!;

  return (
    <div className="sj ep">
      <header className="ep-head">
        <span className="ep-eyebrow">Stack Prep · local review</span>
        <h1 className="sj-display">The emails students get</h1>
        <p>Each email with sample data, exactly as it is sent. None can be turned off.</p>
      </header>
      <div className="ep-main">
        <nav className="ep-list" aria-label="Emails">
          {emails.map((item, index) => (
            <button
              key={item.name}
              type="button"
              aria-current={index === current}
              className={index === current ? 'on' : undefined}
              onClick={() => setCurrent(index)}
            >
              <b>{item.name}</b>
              <small>{item.when}</small>
            </button>
          ))}
        </nav>
        <section className="ep-view">
          <div className="ep-meta">
            <span>Subject</span>
            <b>{email.subject}</b>
            <span>Sent</span>
            <em>{email.when}</em>
          </div>
          <div className="ep-seg" role="group" aria-label="Show as">
            {(['laptop', 'phone', 'gmail', 'text'] as const).map((m) => (
              <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}>
                {{ laptop: 'Laptop', phone: 'Phone', gmail: 'Gmail on a phone', text: 'Plain text' }[m]}
              </button>
            ))}
          </div>
          <div className="ep-stage">
            {mode === 'text' ? (
              <pre className="ep-text">{email.text}</pre>
            ) : (
              <iframe
                ref={frame}
                key={`${current}-${mode}`}
                className={`ep-frame ${mode === 'gmail' ? 'phone' : mode}`}
                title={email.name}
                srcDoc={mode === 'gmail' ? asGmail(email.html) : email.html}
                onLoad={fit}
              />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
