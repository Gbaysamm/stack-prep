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
function Eq({ parts }: { parts: (readonly [label: string, value: ReactNode] | '×' | '=')[] }) {
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

function Predicted() {
  return (
    <>
      <Eq parts={[['Share', '10%'], '×', ['Mastery', '60%'], '=', ['Marks', '6']]} />
      <div className="nv-cells" aria-hidden="true">
        {Array.from({ length: 10 }, (_, index) => (
          <span key={index} className={index < 6 ? 'on' : ''} style={{ '--i': index } as CSSProperties} />
        ))}
        <span className="nv-cells-note">10 marks on this topic · you’d get 6</span>
      </div>
    </>
  );
}

function Range() {
  return (
    <>
      <Scale>
        <span className="nv-band" style={{ left: pct(40), width: pct(24) }} />
        <Dot at={40} tone="gray" label="40" below />
        <Dot at={64} tone="gray" label="64" below />
        <Dot at={52} tone="ink" label="52" />
      </Scale>
      <div className="nv-keys">
        <span>
          <b>±18</b> under 10 answers
        </span>
        <span className="on">
          <b>±12</b> 10 to 24
        </span>
        <span>
          <b>±8</b> 25 or more
        </span>
      </div>
    </>
  );
}

function Projected() {
  return (
    <Scale>
      <span className="nv-rise" style={{ left: pct(52), width: pct(16) }} />
      <Dot at={52} tone="gray" label="Now 52" />
      <Dot at={68} tone="green" label="Exam day 68" below />
    </Scale>
  );
}

function Target() {
  return (
    <Scale>
      <span className="nv-fill" style={{ width: pct(75) }} />
      <Flag at={75} label="Target 75" />
    </Scale>
  );
}

function Gap() {
  return (
    <>
      <Scale>
        <span className="nv-gap" style={{ left: pct(68), width: pct(7) }} />
        <Dot at={68} tone="green" label="Exam day 68" below />
        <Flag at={75} label="Target 75" />
      </Scale>
      <div className="nv-sum">
        <span className="sj-mono">75 − 68 =</span> <b className="nv-short">7 short</b>
      </div>
    </>
  );
}

function Plan() {
  return (
    <>
      <div className="nv-planrow">
        <span className="nv-planrow-name">A topic worth 8% of the paper</span>
        <span className="nv-growbar">
          <span className="was" style={{ width: pct(40) }} />
          <span className="gain" style={{ left: pct(40), width: pct(18) }} />
        </span>
        <span className="nv-planrow-nums sj-mono">
          40% → <b>58%</b>
        </span>
      </div>
      <Eq parts={[['Share', '0.08'], '×', ['Lift', '18'], '=', ['Marks', '≈1.4']]} />
    </>
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

function Sessions() {
  return (
    <>
      <Eq parts={[['Weeks', '6.6'], '×', ['Days/wk', '5'], '×', ['Per day', '1'], '=', ['Sessions', '32']]} />
      <p className="nv-note">46 days is 6.6 weeks. 60 minutes a day fits one 45-minute session. Rounded down.</p>
    </>
  );
}

function Mastery() {
  const steps = [
    { label: 'Start', value: 50, right: null as boolean | null },
    { label: 'Middle', value: 55, right: true },
    { label: 'Harder', value: 61, right: true },
    { label: 'Hardest', value: 59, right: false },
  ];
  return (
    <div className="nv-steps">
      {steps.map((step, index) => (
        <div key={step.label} className="nv-step" style={{ '--i': index } as CSSProperties}>
          <span className="nv-step-val sj-mono">{step.value}%</span>
          <span className="nv-step-bar">
            <span style={{ height: pct((step.value - 30) * 2.5) }} className={step.right === false ? 'down' : ''} />
          </span>
          <span className="nv-step-label">
            {step.right === null ? null : <Mark right={step.right} />}
            {step.label}
          </span>
        </div>
      ))}
    </div>
  );
}

function Bands() {
  const bands = [
    { name: 'Needs teaching', from: 0, to: 30, tone: 'teach' },
    { name: 'Shaky', from: 30, to: 50, tone: 'shaky' },
    { name: 'Holding', from: 50, to: 75, tone: 'holding' },
    { name: 'Strong', from: 75, to: 100, tone: 'strong' },
  ];
  return (
    <>
      <div className="nv-bands">
        {bands.map((band) => (
          <span key={band.name} className={`nv-bandseg ${band.tone}`} style={{ width: pct(band.to - band.from) }}>
            <span>{band.name}</span>
          </span>
        ))}
        <span className="nv-pin" style={{ left: pct(28) }}>
          Loci 28%
        </span>
        <span className="nv-pin" style={{ left: pct(62) }}>
          Polynomials 62%
        </span>
      </div>
      <div className="nv-keys">
        <span>
          <i className="nv-swatch none" /> Not checked: no answers yet, not a low score
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
            <span style={{ width: pct(row.value) }} className={row.value < 30 ? 'teach' : 'shaky'} />
          </span>
          <span className="nv-rank-val sj-mono">{row.value}%</span>
        </li>
      ))}
      <li className="skip">
        <span className="nv-rank-n sj-mono">–</span>
        <span className="nv-rank-name">Not reached</span>
        <span className="nv-rank-bar none" />
        <span className="nv-rank-val sj-mono">never listed</span>
      </li>
    </ol>
  );
}

function Checkup() {
  // Algebra's ladder: starts in the middle, up after a right answer, down after a wrong one.
  const path = [
    { level: 3, right: true },
    { level: 4, right: false },
    { level: 3, right: true },
    { level: 4, right: null as boolean | null },
  ];
  return (
    <div className="nv-ladder">
      <div className="nv-ladder-axis sj-mono">
        <span>Harder</span>
        <span>Easier</span>
      </div>
      <div className="nv-ladder-grid">
        {path.map((step, index) => (
          <div key={index} className="nv-ladder-col">
            {[5, 4, 3, 2, 1].map((level) => (
              <span key={level} className={`nv-rung ${level === step.level ? 'on' : ''}`}>
                {level === step.level ? step.right === null ? <b className="sj-mono">?</b> : <Mark right={step.right} /> : null}
              </span>
            ))}
            <span className="nv-ladder-q sj-mono">Q{index + 1}</span>
          </div>
        ))}
      </div>
    </div>
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
  predicted: Predicted,
  range: Range,
  projected: Projected,
  target: Target,
  gap: Gap,
  plan: Plan,
  days: Days,
  sessions: Sessions,
  mastery: Mastery,
  bands: Bands,
  weakest: Weakest,
  checkup: Checkup,
  answered: Answered,
  right: Right,
  taught: Taught,
  streak: Streak,
  checked: Checked,
};
