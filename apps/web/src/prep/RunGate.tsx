/**
 * When the roadmap holds a run back, say so where the student is, in a popup, at once: never by
 * moving them to another page (founder, 16 Nov 2026). Today's roadmap is read up front, so the
 * button needs no wait on the server; the server still holds the same rules.
 *
 * - A run the student starts waits while today's plan has items left.
 * - A run on a topic they choose waits until enough planned runs are done (own_runs_in).
 */

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';

import { IconArrowRight, IconSpark } from './icons.js';
import { itemLabel, roadmapApi, today as todayOf } from './roadmapApi.js';
import { useLoad, useStudent } from './store.js';
import { Button } from './ui.js';
import { useStartPractice } from './pages/Home.js';
import './pages/PracticeHub.css';

interface Why {
  title: string;
  body: string;
}

/**
 * `ready`: false holds the roadmap read back until the page's own data is in, so the two do not
 * race for the server on a page that waits for its own (the check-up report).
 */
export function useRunGate(ready = true) {
  const student = useStudent();
  const navigate = useNavigate();
  const plan = useLoad(
    () => (ready ? roadmapApi.read(student.studentId) : new Promise<never>(() => undefined)),
    [student.studentId, ready],
  );
  const [why, setWhy] = useState<Why | null>(null);
  const next = plan.data ? todayOf(plan.data).next : null;
  const ownLeft = plan.data?.record.own_runs_in ?? 0;

  const todayFirst: Why = {
    title: 'Today’s plan comes first',
    body: 'Finish today’s items on your roadmap first. Then you can start your own runs in any subject.',
  };

  /** A run the student starts: held while today's plan has items left. */
  const startRun = (go: () => void) => (next ? setWhy(todayFirst) : go());

  /** A run on topics the student picked: held until enough planned runs are done, then by today's plan. */
  const startOwn = (go: () => void) => {
    if (ownLeft > 0) {
      setWhy({
        title: 'Your roadmap picks your runs for now',
        body: `Choosing your own topic opens after ${ownLeft} more planned ${ownLeft === 1 ? 'run' : 'runs'}. Follow your roadmap until then.`,
      });
    } else if (next) {
      setWhy(todayFirst);
    } else {
      go();
    }
  };

  // A topic's Practise starts the run at once, here (founder, 17 Nov 2026: a quick action never
  // takes the student to another page first). Anything that stops it is said in the popup.
  const starter = useStartPractice();
  useEffect(() => {
    if (starter.planFirst) setWhy(todayFirst);
    else if (starter.exhausted)
      setWhy({
        title: 'Nothing new in this topic',
        body: 'You have met every question we have on it. Practise another topic, or come back after its lesson.',
      });
    else if (starter.error) setWhy({ title: 'That run didn’t start', body: starter.error });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [starter.planFirst, starter.exhausted, starter.error]);

  /** Practise one topic: `href` is its run-builder link (subject and subtopic in the query). */
  const openTopic = (href: string) =>
    startOwn(() => {
      const query = new URL(href, window.location.origin).searchParams;
      const subject = query.get('subject');
      const subtopic = query.get('subtopic');
      if (subject && subtopic) void starter.start(subject, { subtopicIds: [subtopic] }, subtopic);
      else navigate(href);
    });

  const popup: ReactNode = why
    ? createPortal(
        <div className="sj">
          <div className="sj-scrim" onMouseDown={(event) => event.target === event.currentTarget && setWhy(null)}>
            <div className="sj-dialog ph-plan-dialog" role="dialog" aria-modal="true" aria-labelledby="run-gate-title">
              <span className="ph-plan-icon" aria-hidden="true">
                <IconSpark size={22} />
              </span>
              <h2 id="run-gate-title" className="sj-display sj-h3">
                {why.title}
              </h2>
              <p>{why.body}</p>
              {next ? (
                <p className="ph-plan-next">
                  Next on your plan: <b>{itemLabel(next)}</b>
                </p>
              ) : null}
              <div className="ph-plan-actions">
                <Button tone="ghost" onClick={() => setWhy(null)}>
                  Not now
                </Button>
                <Button to="/roadmap" tone="primary" trailing={<IconArrowRight size={16} />}>
                  Go to your roadmap
                </Button>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )
    : null;

  return { startRun, startOwn, openTopic, popup, show: (w: Why) => setWhy(w), todayFirst, busy: starter.busy };
}
