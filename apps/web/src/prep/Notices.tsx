/**
 * What Stack Prep has to tell a student, above every page: the admin's notice (Settings), any
 * announcement banners for them, and a note when support has replied. A pop-up announcement
 * opens once, over the page. Closing a banner or pop-up is remembered on the server, so it never
 * comes back; the notice can't be closed (it's for things like planned downtime).
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { IconArrowRight, IconClose, IconMail, IconMegaphone, IconSparkles } from './icons.js';
import { useStudent } from './store.js';
import { SUPPORT_CHANGED, supportApi, type Announcement, type ThreadLine } from './supportApi.js';
import { Button, Dialog } from './ui.js';
import './Notices.css';

function Go({ label, url, onGo }: { label: string; url: string; onGo?: () => void }) {
  return url.startsWith('/') ? (
    <Link to={url} className="nt-go" onClick={onGo}>
      {label} <IconArrowRight size={14} />
    </Link>
  ) : (
    <a href={url} className="nt-go" target="_blank" rel="noreferrer" onClick={onGo}>
      {label} <IconArrowRight size={14} />
    </a>
  );
}

export function Notices() {
  const { studentId } = useStudent();
  const [notice, setNotice] = useState('');
  const [items, setItems] = useState<Announcement[]>([]);
  const [replies, setReplies] = useState<ThreadLine[]>([]);

  useEffect(() => {
    supportApi
      .settings()
      .then((settings) => setNotice(settings.notice.trim()))
      .catch(() => undefined);
    supportApi
      .announcements(studentId)
      .then(setItems)
      .catch(() => undefined);
  }, [studentId]);

  const loadReplies = useCallback(() => {
    supportApi
      .threads(studentId)
      .then((threads) => setReplies(threads.filter((t) => t.unread)))
      .catch(() => undefined);
  }, [studentId]);
  useEffect(() => {
    loadReplies();
    window.addEventListener(SUPPORT_CHANGED, loadReplies);
    return () => window.removeEventListener(SUPPORT_CHANGED, loadReplies);
  }, [loadReplies]);

  const close = (id: string) => {
    setItems((now) => now.filter((item) => item.id !== id));
    void supportApi.dismiss(studentId, id).catch(() => undefined);
  };

  const banners = items.filter((item) => item.kind === 'banner');
  const popup = items.find((item) => item.kind === 'popup');
  const reply = replies[0];
  if (!notice && banners.length === 0 && !popup && !reply) return null;

  return (
    <>
      {notice || banners.length > 0 || reply ? (
        <div className="nt-wrap">
          {notice ? (
            <aside className="nt-bar warning" aria-label="Notice">
              <span className="nt-icon" aria-hidden="true">
                <IconMegaphone size={18} />
              </span>
              <p className="nt-text">{notice}</p>
            </aside>
          ) : null}
          {reply ? (
            <aside className="nt-bar good" aria-label="A reply from Stack Prep">
              <span className="nt-icon" aria-hidden="true">
                <IconMail size={18} />
              </span>
              <p className="nt-text">
                <strong>Stack Prep replied</strong>
                <span className="nt-more"> to “{reply.subject}”</span>
                {replies.length > 1 ? <span className="nt-more"> and {replies.length - 1} more</span> : null}
              </p>
              <Go label="Read it" url={`/help/messages/${reply.id}`} />
            </aside>
          ) : null}
          {banners.map((item) => (
            <aside key={item.id} className={`nt-bar ${item.tone}`} aria-label="Announcement">
              <span className="nt-icon" aria-hidden="true">
                <IconMegaphone size={18} />
              </span>
              <p className="nt-text">
                <strong>{item.title}</strong>
                {item.body ? <span className="nt-more"> {item.body}</span> : null}
              </p>
              {item.link_label && item.link_url ? (
                <Go label={item.link_label} url={item.link_url} onGo={() => close(item.id)} />
              ) : null}
              <button type="button" className="nt-close" aria-label="Close" onClick={() => close(item.id)}>
                <IconClose size={16} />
              </button>
            </aside>
          ))}
        </div>
      ) : null}
      {popup ? (
        <Dialog
          open
          onClose={() => close(popup.id)}
          title={popup.title}
          icon={<IconSparkles size={26} />}
          actions={
            <>
              <Button tone="ghost" onClick={() => close(popup.id)}>
                Close
              </Button>
              {popup.link_label && popup.link_url ? (
                popup.link_url.startsWith('/') ? (
                  <Link to={popup.link_url} className="sj-btn" onClick={() => close(popup.id)}>
                    {popup.link_label}
                  </Link>
                ) : (
                  <a href={popup.link_url} className="sj-btn" target="_blank" rel="noreferrer" onClick={() => close(popup.id)}>
                    {popup.link_label}
                  </a>
                )
              ) : null}
            </>
          }
        >
          {popup.body ? <p className="nt-popup-body">{popup.body}</p> : null}
        </Dialog>
      ) : null}
    </>
  );
}
