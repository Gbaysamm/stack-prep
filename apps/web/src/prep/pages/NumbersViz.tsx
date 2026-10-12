/**
 * The small worked pictures on /help/numbers: one per number, drawn in HTML and CSS from the
 * same example numbers the words use (METRICS[id].example), so the picture and the sentence
 * under it never disagree. Decorative: the sentence is the accessible version.
 */

import type { CSSProperties, ReactNode } from 'react';

import { IconCheck, IconClose, IconFlame } from '../icons.js';
import type { MetricId } from './HowItsWorkedOut.js';

const pct = (value: number) => `${value}%`;

/** An equation strip: labelled boxes joined by operators. The last box is the answer. */
function Eq({ parts }: { parts: (readonly [label: string, value: ReactNode] | '×' | '÷' | '=')[] }) {
  return (
    <div className="nv-eq">
      {parts.map((part, index) =>
        typeof part === 'string' ? (
          <span key={index} className="nv-op">
            {part}
          </span>
        ) : (
          <span key={index} className={`nv-tok ${index === parts.length - 1 ? 'is-answer' : ''}`}>
            <span className="nv-tok-label">{part[0]}</span>
            <span className="nv-tok-value">{part[1]}</span>
          </span>
        ),
      )}
    </div>
  );
}

/** A 0–100 scale with ticks, for anything on the score scale. */
function Scale({ children }: { children: ReactNode }) {
  return (
    <div className="nv-scale">
      <div className="nv-scale-track">{children}</div>
      <div className="nv-scale-ticks">
        {[0, 25, 50, 75, 100].map((tick) => (
          <span key={tick} style={{ left: pct(tick) }}>
            {tick}
          </span>
        ))}
      </div>
    </div>
  );
}

function Dot({ at, tone, label, below }: { at: number; tone: 'ink' | 'green' | 'gray'; label: ReactNode; below?: boolean }) {
  return (
    <span className={`nv-dot ${tone} ${below ? 'below' : ''}`} style={{ left: pct(at) }}>
      <span className="nv-dot-label">{label}</span>
    </span>
  );
}

function Flag({ at, label }: { at: number; label: ReactNode }) {
  return (
    <span className="nv-flag" style={{ left: pct(at) }}>
      <span className="nv-flag-label">{label}</span>
    </span>
  );
}

function Mark({ right }: { right: boolean }) {
  return (
    <span className={`nv-mark ${right ? 'right' : 'wrong'}`}>
      {right ? <IconCheck size={13} strokeWidth={2.6} /> : <IconClose size={13} strokeWidth={2.6} />}
    </span>
  );
}

/** Two topic bars and their average: the shape of "your score". */
function Average({ rows, answer, label }: { rows: { name: string; value: number }[]; answer: number; label: string }) {
  return (
    <>
      <ol className="nv-rank">
        {rows.map((row) => (
          <li key={row.name}>
            <span className="nv-rank-n sj-mono">·</span>
            <span className="nv-rank-name">{row.name}</span>
            <span className="nv-rank-bar">
              <span style={{ width: pct(row.value) }} className={row.value >= 50 ? 'there' : 'needs'} />
            </span>
            <span className="nv-rank-val sj-mono">{row.value}%</span>
          </li>
        ))}
      </ol>
      <Eq
        parts={[
          ['Add', rows.map((row) => row.value).join(' + ')],
          '÷',
          ['Topics', String(rows.length)],
          '=',
          [label, `${answer}%`],
        ]}
      />
    </>
  );
}

function Score() {
  return (
    <Average
      rows={[
        { name: 'Vowels', value: 20 },
        { name: 'Stress', value: 40 },
      ]}
      answer={30}
      label="Your score"
    />
  );
}

function Started() {
  return (
    <>
      <Scale>
        <span className="nv-rise" style={{ left: pct(30), width: pct(20) }} />
        <Dot at={30} tone="gray" label="Started 30%" below />
        <Dot at={50} tone="green" label="Now 50%" />
      </Scale>
      <div className="nv-sum">
        <span className="sj-mono">50 − 30 =</span> <b>+20</b>
      </div>
    </>
  );
}

function Predicted() {
  return (
    <>
      <Average
        rows={[
          { name: 'Vowels', value: 40 },
          { name: 'Stress', value: 60 },
        ]}
        answer={50}
        label="Predicted"
      />
      <p className="nv-note">That check-up’s answers only. Practice doesn’t move it; the next check-up does.</p>
    </>
  );
}

function Checkup() {
  const sittings = [
    { label: 'Week 1', value: 30 as number | null },
    { label: 'Week 2', value: 38 },
    { label: 'Week 3', value: 47 },
    { label: 'Due', value: null },
  ];
  return (
    <div className="nv-steps">
      {sittings.map((step, index) => (
        <div key={step.label} className={`nv-step ${step.value === null ? 'next' : ''}`} style={{ '--i': index } as CSSProperties}>
          <span className="nv-step-val sj-mono">{step.value === null ? 'in 7 days' : `${step.value}%`}</span>
          <span className="nv-step-bar">{step.value === null ? null : <span style={{ height: pct(step.value * 2) }} />}</span>
          <span className="nv-step-label">{step.label}</span>
        </div>
      ))}
    </div>
  );
}

function Target() {
  return (
    <Scale>
      <span className="nv-fill" style={{ width: pct(60) }} />
      <Flag at={60} label="Target 60%" />
    </Scale>
  );
}

function Gap() {
  return (
    <>
      <Scale>
        <span className="nv-gap" style={{ left: pct(47), width: pct(13) }} />
        <Dot at={47} tone="green" label="Predicted 47%" below />
        <Flag at={60} label="Target 60%" />
      </Scale>
      <div className="nv-sum">
        <span className="sj-mono">60 − 47 =</span> <b className="nv-short">13 short</b>
      </div>
    </>
  );
}

function Topic() {
  return (
    <>
      <div className="nv-cells" aria-hidden="true">
        {Array.from({ length: 10 }, (_, index) => (
          <span key={index} className={index < 3 ? 'on' : ''} style={{ '--i': index } as CSSProperties} />
        ))}
        <span className="nv-cells-note">Vowels · 3 of 10 right · 30%</span>
      </div>
      <Eq parts={[['Right', '3'], '÷', ['Answered', '10'], '=', ['Vowels', '30%']]} />
    </>
  );
}

function Status() {
  const bands = [
    { name: 'Needs work', from: 0, to: 50, tone: 'needs' },
    { name: 'Getting there', from: 50, to: 80, tone: 'there' },
    { name: 'Strong', from: 80, to: 100, tone: 'strong' },
  ];
  return (
    <>
      <div className="nv-bands">
        {bands.map((band) => (
          <span key={band.name} className={`nv-bandseg ${band.tone}`} style={{ width: pct(band.to - band.from) }}>
            <span>{band.name}</span>
          </span>
        ))}
        <span className="nv-pin" style={{ left: pct(30) }}>
          3 of 10
        </span>
        <span className="nv-pin" style={{ left: pct(60) }}>
          6 of 10
        </span>
      </div>
      <div className="nv-keys">
        <span>
          <i className="nv-swatch few" /> Just started: fewer than 3 answered
        </span>
        <span>
          <i className="nv-swatch none" /> Not tried yet: nothing answered
        </span>
      </div>
    </>
  );
}

function Weakest() {
  const rows = [
    { name: 'Sets', value: 22 },
    { name: 'Variation', value: 35 },
    { name: 'Probability', value: 48 },
  ];
  return (
    <ol className="nv-rank">
      {rows.map((row, index) => (
        <li key={row.name}>
          <span className="nv-rank-n sj-mono">{index + 1}</span>
          <span className="nv-rank-name">{row.name}</span>
          <span className="nv-rank-bar">
            <span style={{ width: pct(row.value) }} className="needs" />
          </span>
          <span className="nv-rank-val sj-mono">{row.value}%</span>
        </li>
      ))}
      <li className="skip">
        <span className="nv-rank-n sj-mono">–</span>
        <span className="nv-rank-name">Not tried yet</span>
        <span className="nv-rank-bar none" />
        <span className="nv-rank-val sj-mono">never listed</span>
      </li>
    </ol>
  );
}

function Comeback() {
  return (
    <div className="nv-flow">
      <span className="nv-chip">
        <Mark right={false} /> Monday
      </span>
      <span className="nv-arrow" aria-hidden="true" />
      <span className="nv-chip soft">Same question, later run</span>
      <span className="nv-arrow" aria-hidden="true" />
      <span className="nv-chip">
        <Mark right /> Tuesday
      </span>
      <span className="nv-arrow" aria-hidden="true" />
      <span className="nv-chip ink">Score goes up</span>
    </div>
  );
}

function Days() {
  const days = [
    { name: 'Mon', date: 9, count: null as number | null, tag: 'Today' },
    { name: 'Tue', date: 10, count: 1 },
    { name: 'Wed', date: 11, count: 2 },
    { name: 'Thu', date: 12, count: 3 },
    { name: 'Fri', date: 13, count: 4, tag: 'Exam' },
  ];
  return (
    <ol className="nv-cal">
      {days.map((day) => (
        <li key={day.date} className={day.count === null ? 'today' : day.tag ? 'exam' : ''}>
          <span className="nv-cal-name">{day.name}</span>
          <span className="nv-cal-date">{day.date}</span>
          <span className="nv-cal-count sj-mono">{day.count === null ? 'not counted' : day.count}</span>
          {day.tag ? <span className="nv-cal-tag">{day.tag}</span> : null}
        </li>
      ))}
    </ol>
  );
}

function RunStrip({ guessed }: { guessed?: boolean }) {
  const cells = [
    ...Array.from({ length: 7 }, () => 'right'),
    'hint',
    'hint',
    'taught',
  ];
  return (
    <div className="nv-run">
      {cells.map((cell, index) => (
        <span key={index} className={`nv-runcell ${cell} ${guessed && index === 0 ? 'guessed' : ''}`} style={{ '--i': index } as CSSProperties} />
      ))}
    </div>
  );
}

function Answered() {
  return (
    <>
      <RunStrip />
      <div className="nv-keys">
        <span>
          <i className="nv-swatch right" /> 7 right first time
        </span>
        <span>
          <i className="nv-swatch hint" /> 2 after a hint
        </span>
        <span>
          <i className="nv-swatch taught" /> 1 taught
        </span>
      </div>
      <div className="nv-sum">
        <span className="sj-mono">Answered</span> <b>+10</b>
      </div>
    </>
  );
}

function Right() {
  return (
    <div className="nv-flow">
      <span className="nv-chip">
        <Mark right /> Right option
      </span>
      <span className="nv-arrow" aria-hidden="true" />
      <span className="nv-chip warn">“I guessed”</span>
      <span className="nv-arrow" aria-hidden="true" />
      <span className="nv-tally">
        <span>
          Answered <b>+1</b>
        </span>
        <span className="zero">
          Right first time <b>+0</b>
        </span>
      </span>
    </div>
  );
}

function Taught() {
  return (
    <div className="nv-flow">
      <span className="nv-chip">
        <Mark right={false} /> Try 1
      </span>
      <span className="nv-arrow" aria-hidden="true" />
      <span className="nv-chip soft">Hint</span>
      <span className="nv-arrow" aria-hidden="true" />
      <span className="nv-chip">
        <Mark right={false} /> Try 2
      </span>
      <span className="nv-arrow" aria-hidden="true" />
      <span className="nv-chip ink">Board: taught</span>
      <span className="nv-arrow" aria-hidden="true" />
      <span className="nv-chip soft">Comes back later</span>
    </div>
  );
}

function Streak() {
  const days = [
    { name: 'Mon', on: true },
    { name: 'Tue', on: true },
    { name: 'Wed', on: true },
    { name: 'Thu', on: false, note: 'morning' },
  ];
  return (
    <div className="nv-streak">
      <ol>
        {days.map((day) => (
          <li key={day.name} className={day.on ? 'on' : 'wait'}>
            <span className="nv-streak-pip">{day.on ? <IconCheck size={14} strokeWidth={2.6} /> : null}</span>
            <span>{day.name}</span>
            {day.note ? <small>{day.note}</small> : null}
          </li>
        ))}
      </ol>
      <span className="nv-streak-now">
        <IconFlame size={18} /> Still 3
      </span>
    </div>
  );
}

function Checked() {
  return (
    <>
      <ul className="nv-subjects">
        <li>
          <span>Mathematics check-up</span>
          <span className="nv-subjects-bar">
            <span style={{ width: '100%' }} />
          </span>
          <b className="done">Finished</b>
        </li>
        <li>
          <span>English check-up</span>
          <span className="nv-subjects-bar">
            <span style={{ width: '50%' }} className="half" />
          </span>
          <b>Half-way</b>
        </li>
      </ul>
      <div className="nv-sum">
        <span className="sj-mono">Subjects checked</span> <b>1</b>
      </div>
    </>
  );
}

export const VIZ: Record<MetricId, () => ReactNode> = {
  score: Score,
  started: Started,
  predicted: Predicted,
  checkup: Checkup,
  target: Target,
  gap: Gap,
  topic: Topic,
  status: Status,
  weakest: Weakest,
  comeback: Comeback,
  days: Days,
  answered: Answered,
  right: Right,
  taught: Taught,
  streak: Streak,
  checked: Checked,
};
