/**
 * /watch/:lessonId: a real lesson on the coach's board, for anyone, signed in or not. The home
 * page plays it in a frame (?embed=1), where it fills the frame as it fills a student's screen.
 *
 * The lessons are files in public/showcase/, made by scripts/showcase_lessons.py with the free
 * voice and each word's timing, so the board writes in step with what it says. The board is
 * shown in the whiteboard style (written by hand) without touching a student's own choice
 * (boardPrefs.ts `forceBoardPrefs`). Asking the coach needs an account, so the ask box offers
 * the way in instead.
 *
 * Nothing plays until the visitor presses Play: a lesson never runs, or talks, in the
 * background. That press is also the browser's permission to play sound, so the board starts
 * with the voice and never has to ask for a second tap.
 */
import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import type { QuestionFigure } from '../Figures.js';
import { IconArrowRight, IconPlay } from '../prep/icons.js';
import type {
  LessonBeat,
  LessonDiagram,
  LessonDiagramOp,
  LessonDoodle,
  LessonDoodleOp,
  LessonDoodleRef,
  LessonPoint,
  LessonCue,
  LessonSketch,
  NarratedLesson,
  VoiceWord,
} from '../student/api.js';
import { forceBoardPrefs } from '../student/boardPrefs.js';
import { setSpokenWords } from '../student/wordClock.js';
import { SHOWCASE, SIGN_UP } from './showcase.js';
import '../prep/prep.css';
import './site.css';

interface Moment {
  say: string;
  write?: string;
  answer?: boolean;
  point?: LessonPoint[];
  show_sketch?: boolean | 'sketch' | 'sketch_b' | 'sketch_c';
  doodle?: LessonDoodleRef;
  doodles?: LessonDoodleRef[];
  doodle_do?: LessonDoodleOp[];
  diagram?: LessonDiagram;
  diagram_do?: LessonDiagramOp[];
  on?: LessonCue;
  section?: string;
  voice: string;
  words: VoiceWord[];
}

interface Showcase {
  year: number;
  title: string;
  subject: string;
  label: string;
  answer: string;
  stem: string;
  moments: Moment[];
  figures?: QuestionFigure[];
  sketches?: LessonSketch[];
  doodles?: LessonDoodle[];
  passage?: { title: string | null; body: string };
  answer_text?: string;
}

/**
 * The board is the heavy part (its drawing, handwriting and maths), so the poster comes up
 * without it and it loads behind the poster; by the time Play is pressed it is here.
 */
const loadBoard = () => import('../student/Board.js');
const Board = lazy(() => loadBoard().then((module) => ({ default: module.Board })));

/**
 * Every clip of the lesson, fetched in order while the poster shows, and kept in memory: the
 * board then plays each step's voice at once, with no wait on the network between steps.
 * A clip not in yet is played from its address as before.
 */
const clips = new Map<string, string>();
function fetchVoices(lesson: Showcase): void {
  void (async () => {
    for (const moment of lesson.moments) {
      if (clips.has(moment.voice)) continue;
      try {
        const response = await fetch(moment.voice);
        if (!response.ok) continue;
        clips.set(moment.voice, URL.createObjectURL(await response.blob()));
      } catch {
        return; // Offline: the board plays from the addresses instead.
      }
    }
  })();
}

function narrated(lesson: Showcase): NarratedLesson {
  return {
    source: 'model',
    beats: lesson.moments.map((moment): LessonBeat => {
      const voice = clips.get(moment.voice) ?? moment.voice;
      setSpokenWords(voice, moment.words);
      return {
        board_index: null,
        write: moment.write ? [moment.write] : [],
        write_at: moment.write ? [0] : [],
        say: moment.say,
        voice_url: voice,
        answer: Boolean(moment.answer),
        point: moment.point ?? null,
        show_sketch: moment.show_sketch ?? false,
        doodle: moment.doodle ?? null,
        doodles: moment.doodles ?? null,
        doodle_do: moment.doodle_do ?? null,
        diagram: moment.diagram ?? null,
        diagram_do: moment.diagram_do ?? null,
        on: moment.on ?? null,
        section: moment.section ?? null,
        mouth: null,
      };
    }),
    sketches: lesson.sketches,
    doodles: lesson.doodles,
    answer_text: lesson.answer_text ?? null,
  };
}

export function WatchPage() {
  const { lessonId = SHOWCASE[0].id } = useParams();
  const [params] = useSearchParams();
  const embed = params.get('embed') === '1';
  const navigate = useNavigate();
  const [lesson, setLesson] = useState<Showcase | null>(null);
  const [missing, setMissing] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [run, setRun] = useState(0);

  useEffect(() => {
    forceBoardPrefs({ style: 'whiteboard', voice: 'studio' });
    document.title = 'Watch a lesson · Stack Prep';
  }, []);
  useEffect(() => {
    setLesson(null);
    setPlaying(false);
    setMissing(false);
    fetch(`/showcase/${lessonId}.json`)
      .then((response) => (response.ok ? (response.json() as Promise<Showcase>) : Promise.reject()))
      .then((loaded) => {
        setLesson(loaded);
        void loadBoard();
        fetchVoices(loaded);
      })
      .catch(() => setMissing(true));
  }, [lessonId]);

  // In the home page's frame: say when the poster is up, so the page shows the frame then.
  useEffect(() => {
    if (embed && lesson) window.parent.postMessage({ type: 'sp-watch-ready', lesson: lessonId }, window.location.origin);
  }, [embed, lesson, lessonId]);

  const signUp = (
    <span className="wt-ask">
      Ask the coach about any step, by typing or speaking.{' '}
      <Link to={SIGN_UP} target={embed ? '_top' : undefined}>
        Start free to ask <IconArrowRight size={14} />
      </Link>
    </span>
  );

  if (missing) {
    return (
      <div className="sj wt-start">
        <p>We couldn’t find that lesson.</p>
        <Link to="/" className="sj-btn">
          Stack Prep home
        </Link>
      </div>
    );
  }
  if (!lesson || !playing) {
    return (
      <div className={`sj wt-poster ${embed ? 'embed' : ''}`}>
        <img src={`/showcase/${lessonId}.jpg`} alt="" className="wt-frame" />
        <button
          type="button"
          className="wt-play"
          disabled={!lesson}
          aria-label={lesson ? `Play the lesson: ${lesson.title}` : 'Loading the lesson'}
          onClick={() => setPlaying(true)}
        >
          <IconPlay size={44} />
        </button>
        <div className="wt-caption">
          <span className="wt-kicker">
            {lesson ? `${lesson.subject} · UTME ${lesson.year} · a real lesson` : 'A real lesson'}
          </span>
          <strong className="sj-display">{lesson?.title ?? 'Loading the lesson…'}</strong>
          <span className="wt-hint">Press play, with your sound on: the coach explains every step out loud.</span>
        </div>
      </div>
    );
  }
  return (
    <div className="sj wt-board">
      <Suspense fallback={<div className="sj wt-start" />}>
      <Board
        key={run}
        title={lesson.title}
        subtitle={`${lesson.subject} · UTME ${lesson.year} · worked through`}
        question={lesson.stem}
        figures={lesson.figures}
        passage={lesson.passage ?? null}
        answerText={lesson.answer_text ?? null}
        steps={[]}
        answerLine={`The answer is ${lesson.answer}.`}
        loadLesson={() => Promise.resolve(narrated(lesson))}
        onDone={() => (embed ? (setPlaying(false), setRun((n) => n + 1)) : navigate('/'))}
        askLocked={signUp}
        onAsk={() => Promise.reject(new Error('Sign up to ask the coach.'))}
      />
      </Suspense>
    </div>
  );
}
