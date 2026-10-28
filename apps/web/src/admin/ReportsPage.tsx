/**
 * Reports: problems students (and reviewers) flagged on questions, newest first. An admin reads
 * each, fixes the question in the reviewer dashboard when it is wrong, and closes the report as
 * fixed or as not a problem, with a note.
 */
import { useCallback, useEffect, useState } from 'react';
import { Maths } from '../Maths.js';
import { friendly, request } from '../lib/friendlyError.js';
import { StaffPageHead } from '../staff/StaffShell.js';

export const REPORTS_CHANGED = 'stackprep:reports-changed';

interface QuestionReport {
  id: string;
  status: 'open' | 'triaged' | 'fixed' | 'rejected';
  reason: string;
  detail: string | null;
  where: string | null;
  created_at: string;
  reporter_kind: string;
  reporter_name: string | null;
  reporter_login: string | null;
  question_id: string;
  question_version_id: string;
  stem: string;
  subject_name: string | null;
  exam_year: number | null;
  others_open: number;
  resolved_at: string | null;
  resolved_by_name: string | null;
  resolution_note: string | null;
}

interface ReportList {
  open: number;
  reports: QuestionReport[];
}

const REASON: Record<string, string> = {
  wrong_answer: 'Answer looks wrong',
  ambiguous: 'Unclear',
  typo: 'Typing mistake',
  image_missing: 'Picture missing',
  off_syllabus: 'Not on the syllabus',
  other: 'Something else',
};

const WHERE: Record<string, string> = {
  practice: 'in practice',
  checkup: 'in a check-up',
  mock: 'during a mock',
  review: 'looking back over an answer',
  lesson: 'in a lesson',
};

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** The open count for the nav, kept fresh as reports are closed. */
export function useOpenReports(): number | undefined {
  const [open, setOpen] = useState<number>();
  useEffect(() => {
    const load = () =>
      request<ReportList>('/v1/admin/reports?limit=1')
        .then((list) => setOpen(list.open))
        .catch(() => undefined);
    void load();
    window.addEventListener(REPORTS_CHANGED, load);
    return () => window.removeEventListener(REPORTS_CHANGED, load);
  }, []);
  return open;
}

export function ReportsPage() {
  const [status, setStatus] = useState<'open' | 'closed'>('open');
  const [list, setList] = useState<ReportList | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(() => {
    setList(null);
    request<ReportList>(`/v1/admin/reports?status=${status}`)
      .then((rows) => {
        setList(rows);
        setProblem(null);
      })
      .catch((error) => setProblem(friendly(error)));
  }, [status]);
  useEffect(load, [load]);

  const closed = (report: QuestionReport) => {
    setList((current) =>
      current
        ? {
            open: Math.max(0, current.open - 1),
            reports: current.reports.filter((other) => other.id !== report.id),
          }
        : current,
    );
    window.dispatchEvent(new Event(REPORTS_CHANGED));
  };

  return (
    <>
      <StaffPageHead
        title="Question reports"
        sub="Problems students flagged on questions. Fix the question in the reviewer dashboard, then close the report."
        actions={
          <div className="st-seg" role="tablist" aria-label="Which reports">
            {(['open', 'closed'] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={status === value}
                className={status === value ? 'on' : undefined}
                onClick={() => setStatus(value)}
              >
                {value === 'open' ? `Open${list ? ` (${list.open})` : ''}` : 'Closed'}
              </button>
            ))}
          </div>
        }
      />
      {problem && <p className="st-error">{problem}</p>}
      {!list && !problem && <p className="st-muted">Loading…</p>}
      {list && list.reports.length === 0 && (
        <section className="st-panel">
          <p className="st-empty">{status === 'open' ? 'No open reports. Nothing waiting.' : 'No closed reports yet.'}</p>
        </section>
      )}
      <div className="st-reports">
        {list?.reports.map((report) => <ReportCard key={report.id} report={report} onClosed={closed} />)}
      </div>
    </>
  );
}

function ReportCard({ report, onClosed }: { report: QuestionReport; onClosed: (report: QuestionReport) => void }) {
  const [closing, setClosing] = useState<'fixed' | 'rejected' | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = report.status === 'open' || report.status === 'triaged';

  const close = async () => {
    if (!closing || busy) return;
    if (!note.trim()) {
      setError('Add a short note on what was done.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await request(`/v1/admin/reports/${report.id}/close`, {
        method: 'POST',
        body: JSON.stringify({ outcome: closing, note: note.trim() }),
      });
      onClosed(report);
    } catch (failure) {
      setError(friendly(failure));
      setBusy(false);
    }
  };

  const who =
    report.reporter_kind === 'student'
      ? `${report.reporter_name ?? 'A student'}${report.reporter_login ? ` (${report.reporter_login})` : ''}`
      : report.reporter_kind === 'reviewer'
        ? `Reviewer ${report.reporter_name ?? ''}`.trim()
        : 'Automatic check';

  return (
    <article className="st-panel st-report">
      <header className="st-report-head">
        <span className={`st-pill ${report.reason === 'wrong_answer' ? 'bad' : 'warn'}`}>
          {REASON[report.reason] ?? report.reason}
        </span>
        <span className="st-report-where">
          {[report.subject_name, report.exam_year ? `UTME ${report.exam_year}` : null].filter(Boolean).join(' · ')}
        </span>
        <span className="st-muted st-report-when">{when(report.created_at)}</span>
      </header>
      <div className="st-report-stem">
        <Maths text={report.stem} />
      </div>
      {report.detail && <blockquote className="st-report-detail">“{report.detail}”</blockquote>}
      <p className="st-muted st-report-by">
        From {who}
        {report.where ? `, ${WHERE[report.where] ?? report.where}` : ''}.
        {report.others_open > 0
          ? ` ${report.others_open} other open ${report.others_open === 1 ? 'report' : 'reports'} on this question.`
          : ''}
      </p>
      {open ? (
        closing ? (
          <div className="st-report-close">
            <label className="st-field">
              <span>{closing === 'fixed' ? 'What was fixed?' : 'Why is it not a problem?'}</span>
              <textarea
                rows={2}
                value={note}
                maxLength={1000}
                autoFocus
                onChange={(event) => {
                  setNote(event.target.value);
                  setError(null);
                }}
                placeholder={closing === 'fixed' ? 'Corrected the key to C.' : 'The key is right: B, because…'}
              />
            </label>
            {error && <p className="st-error">{error}</p>}
            <div className="st-row">
              <button type="button" className="sj-btn ghost sm" onClick={() => setClosing(null)} disabled={busy}>
                Cancel
              </button>
              <button type="button" className="sj-btn sm" onClick={() => void close()} disabled={busy}>
                {busy ? 'Closing…' : closing === 'fixed' ? 'Close as fixed' : 'Close as not a problem'}
              </button>
            </div>
          </div>
        ) : (
          <div className="st-row">
            <a className="sj-btn ghost sm" href="/review">
              Open the reviewer dashboard
            </a>
            <button type="button" className="sj-btn ghost sm" onClick={() => setClosing('rejected')}>
              Not a problem
            </button>
            <button type="button" className="sj-btn sm" onClick={() => setClosing('fixed')}>
              Mark fixed
            </button>
          </div>
        )
      ) : (
        <p className="st-report-outcome">
          <span className={`st-pill ${report.status === 'fixed' ? 'good' : 'reviewer'}`}>
            {report.status === 'fixed' ? 'Fixed' : 'Not a problem'}
          </span>{' '}
          {report.resolution_note}
          <span className="st-muted">
            {report.resolved_by_name ? ` · ${report.resolved_by_name}` : ''}
            {report.resolved_at ? `, ${when(report.resolved_at)}` : ''}
          </span>
        </p>
      )}
    </article>
  );
}
