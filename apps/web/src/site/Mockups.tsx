/**
 * Small pictures of the app's own screens, drawn with its design pieces, for the public site:
 * the check-up result, a practice question, the coach answering, a mock exam, and progress.
 * They show the app as it is (its words, its labels, its colours) with made-up numbers; they
 * are pictures, so nothing in them can be clicked.
 */
import { IconCheck, IconClock, IconMic, IconSend, IconSparkles } from '../prep/icons.js';
import { Ring, Track } from '../prep/ui.js';

function Frame({ label, children, tone = '' }: { label: string; children: React.ReactNode; tone?: string }) {
  return (
    <div className={`mk ${tone}`} aria-hidden="true">
      <div className="mk-bar">
        <i />
        <i />
        <i />
        <span>{label}</span>
      </div>
      <div className="mk-body">{children}</div>
    </div>
  );
}

const TOPICS = [
  { name: 'Quadratic equations', pct: 38, word: 'Needs work', tone: 'bad' },
  { name: 'Number bases', pct: 57, word: 'Getting there', tone: 'mid' },
  { name: 'Probability', pct: 64, word: 'Getting there', tone: 'mid' },
  { name: 'Indices and logarithms', pct: 86, word: 'Strong', tone: 'good' },
];

export function CheckupMock() {
  return (
    <Frame label="Check-up · Mathematics">
      <div className="mk-score">
        <Ring value={0.67} size={124} stroke={13}>
          <span className="mk-ring-n">
            67<small>%</small>
          </span>
        </Ring>
        <div>
          <span className="mk-eyebrow">Predicted score</span>
          <strong className="mk-big">268 / 400</strong>
          <span className="mk-sub">Your target 280 · 12 to go</span>
        </div>
      </div>
      <span className="mk-eyebrow">Topics to work on</span>
      <ul className="mk-topics">
        {TOPICS.map((topic) => (
          <li key={topic.name}>
            <span>{topic.name}</span>
            <span className="mk-track">
              <Track value={topic.pct} max={100} thin tone={topic.tone === 'bad' ? 'pink' : 'green'} />
            </span>
            <span className={`mk-word ${topic.tone}`}>
              {topic.pct}% · {topic.word}
            </span>
          </li>
        ))}
      </ul>
    </Frame>
  );
}

export function PracticeMock() {
  return (
    <Frame label="Practice · Number bases">
      <div className="mk-q-top">
        <span className="mk-pill">UTME 1987 · Q1</span>
        <span className="mk-pill ghost">Question 4 of 10</span>
      </div>
      <p className="mk-stem">Convert 241 in base five to a number in base eight.</p>
      <ol className="mk-options">
        {[
          ['A', '71'],
          ['B', '107'],
          ['C', '87'],
          ['D', '177'],
        ].map(([key, text]) => (
          <li key={key} className={key === 'B' ? 'picked' : undefined}>
            <b>{key}</b>
            {text}
          </li>
        ))}
      </ol>
      <div className="mk-sure">
        <span>How sure?</span>
        <span className="on">I knew it</span>
        <span>I think so</span>
        <span>I guessed</span>
      </div>
      <div className="mk-actions">
        <span className="mk-hint">
          <IconSparkles size={15} /> Hint
        </span>
        <span className="mk-go">Check answer</span>
      </div>
    </Frame>
  );
}

export function CoachMock() {
  return (
    <Frame label="The board · ask the coach" tone="paper">
      <div className="mk-chat">
        <p className="mk-me">Why do we divide by 8 and not by 5?</p>
        <div className="mk-them">
          <span className="mk-face" />
          <p>
            Good question. We’re going <em>into</em> base eight, so we keep dividing by 8. The remainders, read from the
            bottom up, are the base-eight digits.
          </p>
        </div>
        <p className="mk-written">
          71 ÷ 8 = 8 r <u>7</u>
          <br />8 ÷ 8 = 1 r <u>0</u>
          <br />1 ÷ 8 = 0 r <u>1</u> → 107₈
        </p>
      </div>
      <div className="mk-ask">
        <span>Ask about the working…</span>
        <IconMic size={16} />
        <IconSend size={16} />
      </div>
    </Frame>
  );
}

export function MockExamMock() {
  const answered = new Set([1, 2, 3, 4, 6, 7, 8, 9, 11, 12, 13, 15, 16, 17, 18, 19, 21, 22]);
  const flagged = new Set([5, 14]);
  return (
    <Frame label="Mock exam · Real UTME" tone="dark">
      <div className="mk-cbt-top">
        <div className="mk-cbt-tabs">
          <span className="on">English</span>
          <span>Maths</span>
          <span>Physics</span>
          <span>Chemistry</span>
        </div>
        <span className="mk-timer">
          <IconClock size={15} /> 1:42:18
        </span>
      </div>
      <div className="mk-cbt">
        <div className="mk-cbt-q">
          <span className="mk-eyebrow light">Question 23 of 60</span>
          <p>Choose the option nearest in meaning to the word in italics: the man was <em>adamant</em> about his decision.</p>
          <ol className="mk-options dark">
            {['firm', 'confused', 'happy', 'careless'].map((text, index) => (
              <li key={text} className={index === 0 ? 'picked' : undefined}>
                <b>{'ABCD'[index]}</b>
                {text}
              </li>
            ))}
          </ol>
        </div>
        <div className="mk-palette">
          {Array.from({ length: 30 }, (_, i) => i + 1).map((n) => (
            <span key={n} className={n === 23 ? 'now' : flagged.has(n) ? 'flag' : answered.has(n) ? 'done' : undefined}>
              {n}
            </span>
          ))}
        </div>
      </div>
    </Frame>
  );
}

export function ProgressMock() {
  const runs = [
    [40, 20],
    [55, 15],
    [50, 25],
    [70, 10],
    [75, 15],
    [85, 5],
  ];
  return (
    <Frame label="Progress">
      <div className="mk-prog-top">
        <div className="mk-chip streak">🔥 12-day streak</div>
        <div className="mk-chip">47 days to the exam</div>
      </div>
      <span className="mk-eyebrow">Every run at a glance</span>
      <div className="mk-runs">
        {runs.map(([right, taught], index) => (
          <span key={index} className="mk-run">
            <i className="taught" style={{ height: `${taught}%` }} />
            <i className="right" style={{ height: `${right}%` }} />
          </span>
        ))}
      </div>
      <div className="mk-legend">
        <span>
          <i className="right" /> Right first time
        </span>
        <span>
          <i className="taught" /> Taught on the board
        </span>
      </div>
      <div className="mk-subjects">
        {[
          ['Use of English', 72],
          ['Mathematics', 61],
          ['Physics', 54],
        ].map(([name, pct]) => (
          <div key={name}>
            <span>{name}</span>
            <strong>{pct}%</strong>
            <Track value={Number(pct)} max={100} thin tone="green" />
          </div>
        ))}
      </div>
    </Frame>
  );
}

export function TickList({ items }: { items: string[] }) {
  return (
    <ul className="ps-ticks">
      {items.map((item) => (
        <li key={item}>
          <IconCheck size={16} />
          {item}
        </li>
      ))}
    </ul>
  );
}
