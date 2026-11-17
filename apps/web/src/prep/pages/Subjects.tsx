/**
 * /subjects — the student's subjects, one tap from each one's page (founder, 17 Nov 2026).
 * Drawn like the Roadmap: the dark hero with the total in lime, then one white card listing
 * the subjects, each with a purple tile, its score on a purple bar to the target, and when its
 * next check-up is. Our colours only: purple, ink, lime.
 */

import { Link } from 'react-router-dom';

import { IconArrowRight, IconBook, IconChevronRight, IconReplay } from '../icons.js';
import { progressApi } from '../progressApi.js';
import { useLoad, usePageTitle, useStudent } from '../store.js';
import { initials } from '../subjectTone.js';
import { Button, PageHero, Skeleton } from '../ui.js';
import { ExNote } from './Exams.js';
import { HeroStats, Section } from './Home.js';
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
  const exam = subjects[0]?.examination_short_name ?? '';
  const scored = subjects.filter((s) => s.scores?.score != null);
  const total = scored.reduce((n, s) => n + (s.scores?.score ?? 0), 0);
  const targets = subjects.reduce((n, s) => n + (s.goal?.target_score ?? 0), 0);

  return (
    <div className="sj-page sb2">
      <PageHero
        eyebrow="Your subjects"
        title={subjects.length > 0 ? `${subjects.length} ${subjects.length === 1 ? 'subject' : 'subjects'}${exam ? ` for ${exam}` : ''}` : 'Your subjects'}
        sub="Tap a subject for its topics, lessons and runs."
        aside={
          scored.length > 0 && scored.length === subjects.length ? (
            <HeroStats
              stats={[
                {
                  label: 'Your score now',
                  value: total,
                  unit: `/ ${subjects.length * 100}`,
                  tone: 'lime',
                  note: targets > 0 ? `Target ${targets}` : undefined,
                },
              ]}
            />
          ) : undefined
        }
      />

      <Section eyebrow="One tap to each" title="All your subjects" id="sb2-title">
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
          <Skeleton height={300} radius={12} />
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
          <ul className="sb2-list">
            {subjects.map((s) => {
              const score = s.scores?.score ?? null;
              const target = s.goal?.target_score ?? null;
              const due = s.scores?.checkup_due
                ? 'Check-up due now'
                : s.scores?.next_checkup_due
                  ? `Next check-up ${dayText(s.scores.next_checkup_due)}`
                  : 'No check-up yet';
              const runs = s.practice.runs_finished;
              return (
                <li key={s.subject_id}>
                  <Link to={`/subjects/${s.subject_id}`} className="sb2-row">
                    <span className="sb2-tile sj-display" aria-hidden="true">
                      {initials(s.subject_name)}
                    </span>
                    <span className="sb2-name">
                      <b>{s.subject_name}</b>
                      <small>
                        {due} · {runs} {runs === 1 ? 'run' : 'runs'}
                      </small>
                    </span>
                    <span className="sb2-bar" aria-hidden="true">
                      <i style={{ width: `${Math.min(100, score ?? 0)}%` }} />
                      {target !== null ? <em style={{ left: `${Math.min(100, target)}%` }} /> : null}
                    </span>
                    <span className="sb2-nums">
                      <strong className="sj-num">{score !== null ? `${score}%` : '—'}</strong>
                      {target !== null ? <small>target {target}</small> : null}
                    </span>
                    <IconChevronRight size={18} className="sb2-go" />
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
