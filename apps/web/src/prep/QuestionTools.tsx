/**
 * The two small actions every question carries: keep it (a bookmark, to revise later as a run)
 * and report a problem with it (it goes to the Stack Prep team's queue). Used in practice,
 * check-ups, the mock room and every review of an answered question.
 */
import { useEffect, useId, useState, type FormEvent } from 'react';

import { friendly } from '../lib/friendlyError.js';
import { IconBookmark, IconCheck, IconFlag } from './icons.js';
import { REPORT_REASONS, savedApi, type ReportPlace, type ReportReason } from './savedApi.js';
import { useIdentity } from './store.js';
import { Button, Dialog, cx, useToast } from './ui.js';
import './QuestionTools.css';

export function QuestionTools({
  versionId,
  where,
  sessionId,
  bookmark = true,
  tone = 'light',
  className,
}: {
  versionId: string;
  where: ReportPlace;
  sessionId?: string;
  /** Off where keeping a question makes no sense (none yet; kept for the room's own choice). */
  bookmark?: boolean;
  /** "dark" on a dark surface. */
  tone?: 'light' | 'dark';
  className?: string;
}) {
  const { identity } = useIdentity();
  const studentId = identity?.studentId;
  const toast = useToast();
  const [kept, setKept] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [reporting, setReporting] = useState(false);

  useEffect(() => {
    if (!studentId || !bookmark) return;
    let live = true;
    setKept(null);
    savedApi
      .isBookmarked(studentId, versionId)
      .then((state) => live && setKept(state))
      .catch(() => live && setKept(false));
    return () => {
      live = false;
    };
  }, [studentId, versionId, bookmark]);

  if (!studentId) return null;

  const toggle = async () => {
    if (busy || kept === null) return;
    setBusy(true);
    try {
      if (kept) {
        await savedApi.unbookmark(studentId, versionId);
        setKept(false);
        toast('Removed from your bookmarks');
      } else {
        await savedApi.bookmark(studentId, versionId);
        setKept(true);
        toast('Bookmarked. Revise it any time from Bookmarks.');
      }
    } catch (error) {
      toast(friendly(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cx('qt', tone === 'dark' && 'dark', className)}>
      {bookmark ? (
        <button
          type="button"
          className={cx('qt-btn', kept && 'on')}
          aria-pressed={Boolean(kept)}
          onClick={() => void toggle()}
          disabled={busy || kept === null}
          title={kept ? 'Remove the bookmark' : 'Bookmark this question to revise later'}
        >
          <IconBookmark size={16} fill={kept ? 'currentColor' : 'none'} />
          <span>{kept ? 'Bookmarked' : 'Bookmark'}</span>
        </button>
      ) : null}
      <button
        type="button"
        className="qt-btn"
        onClick={() => setReporting(true)}
        title="Report a problem with this question"
      >
        <IconFlag size={16} />
        <span>Report</span>
      </button>
      <ReportDialog
        open={reporting}
        onClose={() => setReporting(false)}
        studentId={studentId}
        versionId={versionId}
        where={where}
        sessionId={sessionId}
      />
    </div>
  );
}

function ReportDialog({
  open,
  onClose,
  studentId,
  versionId,
  where,
  sessionId,
}: {
  open: boolean;
  onClose: () => void;
  studentId: string;
  versionId: string;
  where: ReportPlace;
  sessionId?: string;
}) {
  const ids = useId();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [detail, setDetail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!open) return;
    setReason(null);
    setDetail('');
    setError(null);
    setSent(false);
  }, [open, versionId]);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (busy) return;
    if (!reason) {
      setError('Choose what is wrong.');
      return;
    }
    if (reason === 'other' && !detail.trim()) {
      setError('Tell us what is wrong in a few words.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await savedApi.report(studentId, {
        question_version_id: versionId,
        reason,
        detail: detail.trim() || undefined,
        where,
        session_id: sessionId,
      });
      setSent(true);
    } catch (failure) {
      setError(friendly(failure));
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <Dialog
        open={open}
        onClose={onClose}
        icon={<IconCheck size={26} />}
        title="Thank you"
        actions={<Button onClick={onClose}>{where === 'mock' ? 'Back to the exam' : 'Done'}</Button>}
      >
        Our team will check this question and fix it if something is wrong.
        {where === 'mock' ? ' Your timer kept running, so carry on when you are ready.' : null}
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onClose={onClose} icon={<IconFlag size={24} />} title="Report a problem">
      <form className="qt-form" onSubmit={send} noValidate>
        <p className="qt-lede">
          What is wrong with this question?
          {where === 'mock' ? ' Your timer keeps running while you tell us.' : null}
        </p>
        <div className="qt-reasons" role="radiogroup" aria-label="What is wrong">
          {REPORT_REASONS.map((option) => (
            <label key={option.value} className={cx('qt-reason', reason === option.value && 'on')}>
              <input
                type="radio"
                name={`${ids}-reason`}
                value={option.value}
                checked={reason === option.value}
                onChange={() => {
                  setReason(option.value);
                  setError(null);
                }}
              />
              <span>
                <strong>{option.label}</strong>
                <small>{option.hint}</small>
              </span>
            </label>
          ))}
        </div>
        <div className="sj-field">
          <label htmlFor={`${ids}-detail`}>
            Anything to add? <span className="qt-optional">{reason === 'other' ? '' : 'Optional'}</span>
          </label>
          <textarea
            id={`${ids}-detail`}
            className="sj-input qt-detail"
            rows={3}
            maxLength={1000}
            value={detail}
            placeholder={reason === 'wrong_answer' ? 'Which answer do you think is right, and why?' : 'What did you notice?'}
            onChange={(event) => {
              setDetail(event.target.value);
              setError(null);
            }}
          />
        </div>
        {error ? (
          <p className="qt-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="qt-actions">
          <Button tone="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" busy={busy}>
            Send report
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
