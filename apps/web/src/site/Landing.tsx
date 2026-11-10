/**
 * The front page for anyone not signed in (a signed-in student goes straight to /home).
 *
 * It leads with what makes Stack Prep different: a real lesson, playing on the coach's board
 * in the hero. Then a tour of the app, each part beside a picture of its own screen
 * (Mockups.tsx), everything else it does, the subjects, the plans, questions, and the way in.
 * Every claim is what the app does; the bank is "thousands of questions", never a count.
 */
import { Link } from 'react-router-dom';

import {
  IconArrowRight,
  IconBolt,
  IconBook,
  IconBookmark,
  IconCalendar,
  IconChart,
  IconCheck,
  IconClock,
  IconFlag,
  IconHelp,
  IconLayers,
  IconMic,
  IconTarget,
  IconVolume,
} from '../prep/icons.js';
import { FaqList, SITE_FAQ } from './Faq.js';
import { LessonPlayer } from './LessonPlayer.js';
import { AppShot, CheckupMock, CoachMock, PracticeMock, ProgressMock, TickList } from './Mockups.js';
import { PlanGrid } from './PlanGrid.js';
import { SIGN_UP, SiteShell, useSiteTitle } from './SiteShell.js';
import { useCatalogue, useSite } from './siteData.js';

export const TOUR = [
  {
    id: 'checkup',
    icon: IconTarget,
    tint: 'lime',
    eyebrow: 'Check-up',
    title: 'Know exactly where you stand',
    body: 'About 15 questions with no help and no time limit. They get harder or easier to match you, so you quickly get a score for every topic, and a predicted score for the exam.',
    ticks: ['A score for every topic on the syllabus', 'Your predicted score, out of 400 or as a percentage', 'A new check-up every 7 days shows how far you’ve come'],
    mock: <CheckupMock />,
  },
  {
    id: 'practice',
    icon: IconBolt,
    tint: 'pink',
    eyebrow: 'Practice',
    title: 'Practise what pulls your score down',
    body: 'Questions come from your weakest topics first. Say how sure you are, take a hint if you need one, and a question you get wrong comes back until you get it right.',
    ticks: ['Real past questions, each with its year', 'Only answers you got right on your own count', 'Choose your own topics and years, or revise your bookmarks'],
    mock: <PracticeMock />,
  },
  {
    id: 'coach',
    icon: IconMic,
    tint: 'yellow',
    eyebrow: 'Ask the coach',
    title: 'Stuck on a step? Just ask',
    body: 'During any lesson, ask about the step you don’t follow, by typing or by speaking. The coach answers from the checked working, writes on the board, and explains it another way.',
    ticks: ['Type or speak your question', 'Answers from the checked working, never made up', 'Every spoken word is also written on screen'],
    mock: <CoachMock />,
  },
  {
    id: 'mock',
    icon: IconClock,
    tint: 'blue',
    wide: true,
    eyebrow: 'Mock exams',
    title: 'Sit the real thing before the real thing',
    body: 'A JAMB-style computer-based test: Use of English and three subjects, 180 questions in two hours, full screen, with a question palette and a calculator when you need one.',
    ticks: ['The Real UTME layout and pace, or a shorter mock you set up', 'Your score in each subject, as a percentage or out of 400', 'Every question afterwards, with the right answer and why'],
    mock: (
      <AppShot
        src="/showcase/mock-room.jpg"
        phoneSrc="/showcase/mock-room-phone.jpg"
        label="Mock exam · the real screen"
        alt="The mock exam screen: the timer, a subject tab for each paper, the question with its options, and the question palette showing which are answered and flagged."
      />
    ),
  },
  {
    id: 'progress',
    icon: IconChart,
    tint: 'purple',
    eyebrow: 'Progress',
    title: 'Watch your score climb',
    body: 'Every run, check-up and mock adds up: your score in each subject and topic, how far you are from your target, a countdown to the exam and a streak to keep you going.',
    ticks: ['Topic by topic: Needs work, Getting there, Strong', 'A countdown to your exam date', 'Every number explained in Help & guides'],
    mock: <ProgressMock />,
  },
] as const;

const MORE = [
  { icon: IconBookmark, title: 'Bookmarks', body: 'Keep any question, then revise them all as one run.' },
  { icon: IconFlag, title: 'Report a question', body: 'Something looks wrong? Flag it. A person checks every report.' },
  { icon: IconCheck, title: 'Lesson check-ins', body: 'Say how each lesson landed; the ones to see again are kept for you.' },
  { icon: IconLayers, title: 'Your own runs', body: 'Pick the topics and the years, and how many questions.' },
  { icon: IconCalendar, title: 'Exam countdown', body: 'Set your exam date and target, and see the days count down.' },
  { icon: IconHelp, title: 'Every number explained', body: 'How each score is worked out, with a worked example.' },
  { icon: IconVolume, title: 'Lessons out loud', body: 'The coach talks you through it, with captions on screen.' },
  { icon: IconBook, title: 'Works on any phone', body: 'Nothing to install. Sign in and pick up on any device.' },
];

export function TourRows() {
  return (
    <div className="ld-tour">
      {TOUR.map(({ id, icon: Icon, tint, eyebrow, title, body, ticks, mock, ...rest }, index) => (
        <article
          key={id}
          id={id}
          className={`ld-row ${'wide' in rest && rest.wide ? 'wide' : index % 2 ? 'flip' : ''}`}
        >
          <div className="ld-row-text">
            <span className={`ld-badge ${tint}`}>
              <Icon size={18} /> {eyebrow}
            </span>
            <h3 className="sj-display">{title}</h3>
            <p>{body}</p>
            <TickList items={[...ticks]} />
          </div>
          <div className={`ld-row-art ${tint}`}>{mock}</div>
        </article>
      ))}
    </div>
  );
}

export function Landing() {
  useSiteTitle('');
  const site = useSite();
  const { catalogue } = useCatalogue();
  const subjects = site?.subjects ?? [];

  return (
    <SiteShell bare>
      <section className="ld-hero">
        <div className="ld-hero-sky" aria-hidden="true">
          <span className="a" />
          <span className="b" />
        </div>
        <div className="ld-hero-in">
          <div className="ld-hero-text">
            <span className="ld-kicker">
              <i /> UTME preparation
            </span>
            <h1 className="sj-display">
              A teacher for every question. <em>On your phone.</em>
            </h1>
            <p className="ld-lede">
              Real past questions, a score you can trust, and a coach who works every question through with you on the
              board, out loud.
            </p>
            <div className="ld-hero-actions">
              <Link to={SIGN_UP} className="sj-btn ld-cta">
                Start free <IconArrowRight size={18} />
              </Link>
              <a href="#watch" className="ld-ghost">
                Watch a lesson
              </a>
            </div>
          </div>
          <figure className="ld-hero-board">
            <div className="ld-board-frame">
              <div className="lp-bar" aria-hidden="true">
                <i />
                <i />
                <i />
              </div>
              <img
                src="/showcase/m84_12.jpg"
                decoding="async"
                alt="A lesson on the board: the coach works a number bases question through, step by step, with a drawing of the oranges and price tags."
                width={1440}
                height={900}
              />
            </div>
          </figure>
        </div>
      </section>

      <div className="ld-wrap">
        <section className="ld-strip" aria-label="What you get">
          {[
            { icon: IconBook, text: 'Thousands of real past questions' },
            { icon: IconVolume, text: 'A lesson, out loud, for every question' },
            { icon: IconMic, text: 'Ask the coach by typing or speaking' },
            { icon: IconTarget, text: 'A predicted score you can trust' },
          ].map(({ icon: Icon, text }) => (
            <span key={text}>
              <Icon size={18} />
              {text}
            </span>
          ))}
        </section>

        <section className="ld-section ld-watch" id="watch" aria-labelledby="ld-watch">
          <div className="ld-head center">
            <span className="ps-eyebrow">Watch a lesson</span>
            <h2 id="ld-watch" className="sj-display">
              Every question comes with a lesson like this
            </h2>
            <p className="ld-head-sub">
              Miss a question twice and the coach works it through on the board: written by hand, said out loud, with
              drawings that make it click. Press play, with your sound on.
            </p>
          </div>
          <LessonPlayer />
        </section>

        <section className="ld-section" aria-labelledby="ld-how">
          <div className="ld-head center">
            <span className="ps-eyebrow">How it works</span>
            <h2 id="ld-how" className="sj-display">
              Everything a good teacher does, for every question you meet
            </h2>
          </div>
          <TourRows />
        </section>

        <section className="ld-section ld-more" aria-labelledby="ld-more">
          <div className="ld-head">
            <span className="ps-eyebrow">And more</span>
            <h2 id="ld-more" className="sj-display">
              The small things that add up
            </h2>
          </div>
          <div className="ld-more-grid">
            {MORE.map(({ icon: Icon, title, body }, index) => (
              <article key={title}>
                <span className={`ps-letter t${index % 6}`} aria-hidden="true">
                  <Icon size={20} />
                </span>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="ld-section ld-subjects" aria-labelledby="ld-subjects">
          <div className="ld-subjects-text">
            <span className="ps-eyebrow">Subjects</span>
            <h2 id="ld-subjects" className="sj-display">
              Thousands of questions across {subjects.length || 10} subjects
            </h2>
            <p>
              Real UTME papers, sorted into the topics on the syllabus, each with a checked worked solution. Pick Use of
              English and your three subjects when you sign up; add more whenever you like.
            </p>
            <Link to={SIGN_UP} className="sj-btn ld-cta small">
              Choose your subjects <IconArrowRight size={16} />
            </Link>
          </div>
          <ul className="ld-subject-grid">
            {subjects.map((subject, index) => (
              <li key={subject.name}>
                <span className={`ps-letter t${index % 6}`} aria-hidden="true">
                  {subject.name.slice(0, 1)}
                </span>
                <strong>{subject.name}</strong>
              </li>
            ))}
          </ul>
        </section>

        {catalogue && catalogue.plans.length > 0 ? (
          <section className="ld-section" aria-labelledby="ld-pricing">
            <div className="ld-head row">
              <div>
                <span className="ps-eyebrow">Pricing</span>
                <h2 id="ld-pricing" className="sj-display">
                  Start free. Pay when you want more.
                </h2>
              </div>
              <Link to="/pricing" className="ps-textlink">
                Compare every plan <IconArrowRight size={16} />
              </Link>
            </div>
            <PlanGrid catalogue={catalogue} compact />
          </section>
        ) : null}

        <section className="ld-section ps-faq-teaser" aria-labelledby="ld-faq">
          <div className="ld-head">
            <span className="ps-eyebrow">Questions</span>
            <h2 id="ld-faq" className="sj-display">
              What people ask first
            </h2>
            <p className="ld-head-sub">Straight answers, written from how Stack Prep works.</p>
            <Link to="/faq" className="ps-textlink">
              Every question <IconArrowRight size={16} />
            </Link>
          </div>
          <FaqList items={SITE_FAQ.flatMap((group) => group.items).slice(0, 6)} />
        </section>
      </div>

      <FinalCall />
    </SiteShell>
  );
}

export function FinalCall({
  title = 'Find out where you stand today.',
  sub = 'Your first check-up is about 15 questions, with no time limit. Then the lessons begin.',
}: {
  title?: string;
  sub?: string;
}) {
  return (
    <section className="ld-final">
      <div className="ld-final-in">
        <div>
          <span className="ld-kicker">
            <i /> Free to start
          </span>
          <h2 className="sj-display">{title}</h2>
          <p>{sub}</p>
        </div>
        <Link to={SIGN_UP} className="sj-btn ld-cta">
          Start free <IconArrowRight size={18} />
        </Link>
      </div>
    </section>
  );
}
