/**
 * /subjects — the student's subjects, each in its own colour, one tap from its page (founder,
 * 17 Nov 2026: subjects were too far away, under Exams). The score now, the way to the target,
 * the next check-up and how much practice is behind it.
 */

import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';

import { IconArrowRight, IconBook, IconReplay } from '../icons.js';
import { progressApi } from '../progressApi.js';
import { useLoad, usePageTitle, useStudent } from '../store.js';
import { initials, toneStyle } from '../subjectTone.js';
import { Button, Skeleton } from '../ui.js';
import { ExNote } from './Exams.js';
import { Section } from './Home.js';
import './Subjects.css';

function dayText(iso: string): string {
  const [y = 1970, m = 1, d = 1] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function Subjects() {
  usePageTitle('Subjects');
  const student = useStudent();
  const load = useLoad(() => progressApi.overview(student.studentId), [student.studentId]);
  const subjects = (load.data?.subjects ?? []).filter((s) => s.goal);

  return (
    <div className="sj-page sb">
      <Section
        eyebrow="Subjects"
        title="Your subjects"
        id="sb-title"
        className="sb-first"
        sub="Tap a subject for its topics, lessons and runs."
      >
        {load.error && !load.data ? (
          <ExNote
            icon={<IconReplay size={18} />}
            title="We could not load your subjects"
            action={
              <Button tone="soft" onClick={load.reload}>
                Try again
              </Button>
            }
          >
            {load.error}
          </ExNote>
        ) : !load.data ? (
          <div className="sb-grid" aria-busy="true">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} height={210} radius={8} />
            ))}
          </div>
        ) : subjects.length === 0 ? (
          <ExNote
            icon={<IconBook size={18} />}
            title="No subjects yet"
            action={
              <Button to="/exams" trailing={<IconArrowRight size={18} />}>
                Choose your subjects
              </Button>
            }
          >
            Choose the subjects you are sitting and each one gets its own page here.
          </ExNote>
        ) : (
          <ul className="sb-grid">
            {subjects.map((s) => {
              const score = s.scores?.score ?? null;
              const target = s.goal?.target_score ?? null;
              const due = s.scores?.checkup_due
                ? 'Check-up due now'
                : s.scores?.next_checkup_due
                  ? `Next check-up ${dayText(s.scores.next_checkup_due)}`
                  : s.latest_checkup
                    ? 'Check-up done'
                    : 'No check-up yet';
              return (
                <li key={s.subject_id}>
                  <Link
                    to={`/subjects/${s.subject_id}`}
                    className="sb-card"
                    style={toneStyle(s.subject_name) as CSSProperties}
                  >
                    <span className="sb-band">
                      <span className="sb-tile sj-display" aria-hidden="true">
                        {initials(s.subject_name)}
                      </span>
                      <span className="sb-name">
                        <b className="sj-display">{s.subject_name}</b>
                        <small>{s.examination_short_name}</small>
                      </span>
                      <span className="sb-score">
                        <b className="sj-num">{score !== null ? `${score}%` : '—'}</b>
                        <small>score now</small>
                      </span>
                    </span>
                    <span className="sb-body">
                      <span className="sb-track" aria-hidden="true">
                        <i style={{ width: `${Math.min(100, score ?? 0)}%` }} />
                        {target !== null ? <em style={{ left: `${Math.min(100, target)}%` }} /> : null}
                      </span>
                      <span className="sb-line">
                        {target !== null ? (
                          <>
                            Target <b>{target}%</b>
                            {score !== null && target - score > 0 ? ` · ${target - score} to go` : ''}
                          </>
                        ) : (
                          'No target yet'
                        )}
                      </span>
                      <span className="sb-facts">
                        <span>{due}</span>
                        <span>
                          {s.practice.runs_finished} {s.practice.runs_finished === 1 ? 'run' : 'runs'} ·{' '}
                          {s.practice.questions_answered} answered
                        </span>
                      </span>
                    </span>
                    <span className="sb-go">
                      Open {s.subject_name} <IconArrowRight size={16} />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </div>
  );
}
