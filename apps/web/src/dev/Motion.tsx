/**
 * /dev/motion — every animation in the app, played on demand, for reviewing and recording them
 * (founder, 18 Nov 2026). `?m=<name>` plays one straight away (the recorder uses it); Play again
 * replays it. Each gamification moment is added here as it is built.
 */
import { useEffect, useState, type ReactNode } from 'react';

import { Celebrate } from '../prep/Celebrate.js';
import '../prep/prep.css';
import './Motion.css';

interface Moment {
  name: string;
  label: string;
  where: string;
  play: (done: () => void) => ReactNode;
}

const MOMENTS: Moment[] = [
  {
    name: 'run',
    label: 'Run finished',
    where: 'The end of a practice run: XP, accuracy and the streak count up; the day fills.',
    play: (done) => (
      <Celebrate
        title="Run complete"
        sub="Electrolysis · 10 questions"
        next="Continue"
        onDone={done}
        gains={[
          { kind: 'xp', label: 'XP', value: 45, prefix: '+' },
          { kind: 'accuracy', label: 'Accuracy', value: 80, suffix: '%' },
          { kind: 'streak', label: 'Day streak', value: 7 },
        ]}
        ring={{ from: 2, to: 3, of: 3, label: "today's plan" }}
      />
    ),
  },
  {
    name: 'celebrate',
    label: 'Lesson finished',
    where: 'After a lesson: XP and the streak, and the day moving on.',
    play: (done) => (
      <Celebrate
        title="Lesson complete"
        sub="Electrolysis of brine · 12 minutes"
        next="Practise it"
        onDone={done}
        gains={[
          { kind: 'xp', label: 'XP', value: 20, prefix: '+' },
          { kind: 'streak', label: 'Day streak', value: 7 },
        ]}
        ring={{ from: 1, to: 2, of: 3, label: "today's plan" }}
      />
    ),
  },
  {
    name: 'plain',
    label: 'Plan saved',
    where: 'When onboarding is saved: the badge and the words, no figures.',
    play: (done) => <Celebrate title="Your plan is ready" sub="Your roadmap starts today" next="See it" onDone={done} />,
  },
];

export function Motion() {
  const asked = new URLSearchParams(window.location.search).get('m');
  const [current, setCurrent] = useState(MOMENTS.find((m) => m.name === asked) ?? MOMENTS[0]!);
  const [playing, setPlaying] = useState(Boolean(asked));
  const [run, setRun] = useState(0);

  useEffect(() => {
    document.title = 'Motion · Stack Prep';
  }, []);

  return (
    <div className="sj mo">
      <header className="mo-head">
        <span className="mo-eyebrow">Stack Prep · local review</span>
        <h1 className="sj-display">Animations</h1>
      </header>
      <div className="mo-main">
        <nav className="mo-list" aria-label="Animations">
          {MOMENTS.map((moment) => (
            <button
              key={moment.name}
              data-name={moment.name}
              type="button"
              className={moment.name === current.name ? 'on' : undefined}
              onClick={() => {
                setCurrent(moment);
                setPlaying(true);
                setRun((n) => n + 1);
              }}
            >
              <b>{moment.label}</b>
              <small>{moment.where}</small>
            </button>
          ))}
        </nav>
        <section className="mo-stage">
          <p>
            <b>{current.label}</b> · {current.where}
          </p>
          <button
            type="button"
            className="sj-btn sm"
            onClick={() => {
              setPlaying(true);
              setRun((n) => n + 1);
            }}
          >
            Play again
          </button>
        </section>
      </div>
      {playing ? <div key={run}>{current.play(() => setPlaying(false))}</div> : null}
    </div>
  );
}
