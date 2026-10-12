/**
 * What the check-up found, in the plain numbers of docs/student-scoring.md.
 *
 * The screen is ordered the way a student reads it: the result first (right ÷ answered, now the
 * predicted score), then the subject's score from every answer, then topic by topic, then what
 * to do about it. Every number carries the count behind it. A topic the sitting never reached
 * shows as "not reached" rather than as a low score: silence is not evidence of weakness.
 */

import { useEffect, useState } from 'react';

import { api, type CheckupReport, type SubtopicReport, type TopicStatus } from './api.js';
import './theme.css';

const STATUS_LABEL: Record<TopicStatus, string> = {
  not_tried: 'not tried yet',
  just_started: 'just started',
  needs_work: 'needs work',
  getting_there: 'getting there',
  strong: 'strong',
};

const STATUS_BAND: Record<TopicStatus, string> = {
  not_tried: 'grey',
  just_started: 'yellow',
  needs_work: 'pink',
  getting_there: 'mint',
  strong: 'green',
};

const signed = (value: number) => (value > 0 ? `+${value}` : value < 0 ? `−${Math.abs(value)}` : '0');

export function Result({
  sessionId,
  onRestart,
  onTrain,
}: {
  sessionId: string;
  onRestart: () => void;
  /** Absent until the subject is known; training starts on the weakest topics. */
  onTrain?: () => Promise<void>;
}) {
  const [report, setReport] = useState<CheckupReport | null>(null);
  const [issue, setIssue] = useState<string | null>(null);

  useEffect(() => {
    api.report(sessionId).then(setReport).catch((error: Error) => setIssue(error.message));
  }, [sessionId]);

  if (issue) {
    return (
      <div className="sp">
        <main className="sp-content">
          <div className="sp-card pinkish">
            <h2>Your result could not be loaded</h2>
            <p className="sp-small">{issue}</p>
          </div>
        </main>
      </div>
    );
  }
  if (!report) {
    return (
      <div className="sp">
        <main className="sp-content">
          <div className="sp-card">
            <p className="sp-small sp-muted" style={{ margin: 0 }}>
              Working out your result…
            </p>
          </div>
        </main>
      </div>
    );
  }

  const standing = report.standing;
  const topicScores = new Map((standing?.topics ?? []).map((t) => [t.subtopic_id, t]));
  const byTopic = new Map<string, SubtopicReport[]>();
  for (const subtopic of report.subtopics) {
    byTopic.set(subtopic.topic_name, [...(byTopic.get(subtopic.topic_name) ?? []), subtopic]);
  }

  return (
    <div className="sp">
      <header className="sp-topbar">
        <div className="sp-title">
          <span className="sp-kicker">Your check-up</span>
          <h1>Your result</h1>
        </div>
      </header>
      <main className="sp-content">
        <div className="sp-two">
          <div className="sp-card dark hard">
            <span className="sp-eyebrow">Predicted score</span>
            {report.score !== null ? (
              <>
                <div className="sp-hero-num" style={{ margin: '12px 0 6px' }}>
                  {report.score}
                  <span style={{ fontSize: 20, color: '#d7bdff' }}>%</span>
                </div>
                <p className="sp-tiny sp-muted" style={{ margin: 0 }}>
                  You got {report.right} of {report.answered} right in this check-up
                  {report.previous_score !== null
                    ? `. Last check-up ${report.previous_score}% → now ${report.score}% (${signed(report.score - report.previous_score)}).`
                    : '.'}
                </p>
                {standing ? (
                  <div
                    className="sp-grid3"
                    style={{ marginTop: 18, borderTop: '1px solid #3a1a70', paddingTop: 16 }}
                  >
                    <div className="sp-stat">
                      <b style={{ color: '#85de4c' }}>{standing.score !== null ? `${standing.score}%` : '—'}</b>
                      <small style={{ color: '#c9b8ea' }}>
                        your score · {standing.right} of {standing.answered} right
                      </small>
                    </div>
                    <div className="sp-stat">
                      <b>{standing.started_score !== null ? `${standing.started_score}%` : '—'}</b>
                      <small style={{ color: '#c9b8ea' }}>
                        started at{standing.change !== null ? ` · ${signed(standing.change)}` : ''}
                      </small>
                    </div>
                    <div className="sp-stat">
                      <b style={{ color: '#f4fe6e' }}>{standing.checkups.length}</b>
                      <small style={{ color: '#c9b8ea' }}>
                        {standing.checkups.length === 1 ? 'check-up' : 'check-ups'}
                      </small>
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="sp-small sp-muted" style={{ marginTop: 12 }}>
                No answers yet. Answer a few questions and your result shows here.
              </p>
            )}
          </div>
          <div className="sp-stack">
            <div className="sp-card lav">
              <b className="sp-small">How this is worked out</b>
              <p className="sp-small" style={{ margin: '6px 0 0' }}>
                Right ÷ answered. Only your latest answer to each question counts, and questions you got
                wrong or guessed come back in practice. A check-up is due every 7 days, and the latest one is
                your predicted score.
              </p>
            </div>
          </div>
        </div>

        <h2 style={{ margin: '26px 0 12px', fontSize: 20 }}>Topic by topic</h2>
        <div className="sp-three">
          {[...byTopic.entries()].map(([topic, subtopics]) => (
            <div className="sp-card" key={topic}>
              <h3 style={{ margin: 0 }}>{topic}</h3>
              <div style={{ marginTop: 10 }}>
                {subtopics.map((subtopic) => {
                  const score = topicScores.get(subtopic.subtopic_id);
                  const status: TopicStatus = score?.status ?? (subtopic.answered > 0 ? 'just_started' : 'not_tried');
                  const value = score?.score ?? null;
                  return (
                    <div key={subtopic.subtopic_id} style={{ padding: '10px 0' }}>
                      <div className="sp-row between" style={{ marginBottom: 5 }}>
                        <b className="sp-small">{subtopic.name}</b>
                        <span className={`sp-pill ${status === 'just_started' ? 'grey' : STATUS_BAND[status]}`}>{STATUS_LABEL[status]}</span>
                      </div>
                      <div className={`sp-bar thin ${STATUS_BAND[status]}`}>
                        <i style={{ width: value !== null ? `${value}%` : '0%' }} />
                      </div>
                      <div className="sp-tiny sp-muted" style={{ marginTop: 4 }}>
                        {subtopic.answered > 0
                          ? `${subtopic.correct} of ${subtopic.answered} right in this check-up`
                          : 'not reached in this check-up'}
                        {score && value !== null ? ` · topic score ${value}% (${score.right} of ${score.answered})` : ''}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {report.unassessed_topics.length > 0 ? (
          <div className="sp-notice warn" style={{ marginTop: 14 }}>
            <b>Not reached:</b> {report.unassessed_topics.join(', ')}. These were not sampled, so
            nothing here is a judgement about them.
          </div>
        ) : null}

        <div className="sp-row" style={{ marginTop: 22 }}>
          {onTrain ? (
            <button className="sp-btn primary" onClick={() => void onTrain()} type="button">
              Start training
            </button>
          ) : null}
          <button className="sp-btn light" onClick={onRestart} type="button">
            Back to my subjects
          </button>
        </div>
      </main>
    </div>
  );
}
