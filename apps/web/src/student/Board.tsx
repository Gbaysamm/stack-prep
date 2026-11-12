/**
 * The coach's board: the worked solution written out a step at a time.
 *
 * It plays on its own — that is the point of a board rather than a page of text — and it can
 * be paused, replayed and stepped through. Nothing here is generated in the browser: the
 * steps are `solution_steps`, written when the question was imported, so what a student is
 * shown is the same text a reviewer can read and correct.
 *
 * The coach has a voice now, and it is not narration of the board — it is the other half of
 * the answer. What it SAYS is the explanation; what it WRITES is the summary, the way a
 * teacher talks for a minute and puts one line on the board. The card under the board is the
 * transcript of the talking, and every spoken line is in it whether or not the audio ever
 * arrives: a muted phone, a failed voice call or a student who cannot hear loses the sound
 * and keeps the lesson. The student can speak back too, where the deployment allows it: the
 * microphone is drawn only when the server says so, it records only while held, and what
 * comes back lands in the box for them to read before they send it.
 *
 * The board is no longer one-way: a student who loses a step can ask about it, and the coach
 * answers from these same steps. Asking pauses the writing, because a solution that keeps
 * marching on while you read the answer to your question is a solution you lose twice. What
 * comes back may be the tutor or may be the reviewed step again — the card says which, rather
 * than letting a student believe they were answered when they were not.
 *
 * Everything is typeset: the reviewed steps are written in LaTeX now, and so is the coach's
 * reply, and `Maths` renders both, because a student reading about $3x$ should see $3x$.
 *
 * Where the deployment has a voice, the working is TAUGHT rather than read out: the board
 * writes the reviewed step's own mathematics a piece at a time, and the teacher talks the
 * reasoning over it — each piece going up as the words it belongs to begin, the way a good
 * whiteboard teacher keeps hand and voice together. The words are shown under the board as
 * they are said. The lesson is made on the server when the student first gets the question
 * wrong, so the board opens on it ready. Without a voice, or when a browser will not play
 * one, the board writes the full reviewed steps on a reading clock, as it always did.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CSSProperties, MutableRefObject, ReactNode, RefObject } from "react";

import type {
  LessonCue,
  LessonDiagram,
  LessonDiagramOp,
  LessonDoodleOp,
  LessonDoodleRef,
  LessonMouth,
  LessonPoint,
  NarratedLesson,
  TutorReply,
} from "./api.js";
import { api, withVoice, type EarlierTurn } from "./api.js";
import { useBoardPrefs } from "./boardPrefs.js";
import { drawnMarks } from "./travel.js";
import { BoardStyleSwitch, SectionHeading, Sparkle, WhiteboardFx } from "./Whiteboard.js";
import { useBoardSfx } from "./boardSfx.js";
import { BoardTuningControls, useAnimationRate, useBoardTuning } from "./BoardTuning.js";
import { sharedAudioContext } from "./sfx.js";
import {
  cueSeconds,
  derivedCue,
  momentCues,
  setSpokenWords,
  spokenWordsFor,
  startCueClock,
  type CueKey,
  type SpokenWord,
} from "./wordClock.js";
import { Buddy } from "./Buddy.js";
import { Coach } from "./Coach.js";
import { DoodleLayer, type DoodleLink } from "./DoodleLayer.js";
import { DiagramLayer, type DiagramLink } from "./DiagramLayer.js";
import { FigurePanel, type Drawing, type DrawingKey } from "./FigureBoard.js";
import { PassagePanel, type PassageKind, type PassageMark } from "./PassagePanel.js";
import { findInPassage, foldPassage, gapOf, quotedPieces } from "./passage.js";
import {
  CHIP_HEIGHT,
  ChipLayout,
  FLIGHT_HOLD_MS,
  FLIGHT_LAND_MS,
  FLIGHT_SCROLL_MS,
  FLIGHT_TRAVEL_MS,
  arrowAlong,
  arrowHead,
  bezierAt,
  cornerRoute,
  cubicRoute,
  distances,
  drawCircle,
  drawHighlight,
  drawStrike,
  markDelays,
  markLands,
  planMarks,
  seeded,
  setDelays,
  stillMotion,
  through,
  unsteady,
  along,
  type Box,
  type MarkPlan,
  type Label,
  type Pt,
  type Route,
} from "./ink.js";
import type { QuestionFigure } from "../Figures.js";
import { Maths } from "../Maths.js";
import "../prep/prep.css";
import "../prep/board.css";

const STEP_MS = 5200;

/**
 * The board's timeline, for checking that the marks keep time with the voice: each moment, its
 * voice starting and ending, each line started and finished, each mark started and landed.
 * Kept only where a page has asked for it by setting `window.__pbTrace` to an array (the dev
 * harness does with ?trace=1); otherwise nothing is recorded.
 */
function trace(event: string, data: Record<string, unknown> = {}): void {
  const sink = (window as unknown as { __pbTrace?: unknown[] }).__pbTrace;
  if (Array.isArray(sink)) sink.push({ t: Math.round(performance.now()), event, ...data });
}

/** How long a line waits for its voice before the board writes it unheard. Long enough for a
 *  line the server has to make on the spot (a few seconds); past that the voice has failed,
 *  and the lesson is read along rather than waiting at every line. */
const VOICE_WAIT_MS = 15000;

/**
 * One piece of the lesson as the board plays it: what goes up, and what is said meanwhile.
 *
 * With a teacher's narration, `items` is the working the teacher writes — mostly its
 * mathematics — and `say` is the explanation spoken over it, shown under the board as it is
 * heard. Without one, `items` is the whole reviewed step and `say` is the same words.
 */
interface Entry {
  /** "step 3", "answer", or null for the opening, which is not a step. */
  label: string | null;
  items: string[];
  /** When each item goes up, as a fraction of the way through the voice. */
  at: number[];
  say: string;
  voice: string | null;
  /** Which reviewed step this is, for asking about it; null for the opening and the answer. */
  step: number | null;
  answer: boolean;
  /** Marks drawn back over earlier lines while this is said: circles, underlines, arrows. */
  point: LessonPoint[];
  /** The sketch this moment brings onto the board ('sketch', 'sketch_b', 'sketch_c'), if any. */
  showSketch?: string | null;
  /** The small picture this moment draws beside a line (DoodleLayer.tsx), if any. */
  doodle?: LessonDoodleRef | null;
  /** Or the one or two it brings in, and what the pen does to earlier ones (doodles v2). */
  doodles?: LessonDoodleRef[] | null;
  doodleDo?: LessonDoodleOp[] | null;
  /** A live diagram it brings in, and what the pen does to diagrams (DiagramLayer.tsx). */
  diagram?: LessonDiagram | null;
  diagramDo?: LessonDiagramOp[] | null;
  /** Whiteboard style: the word its write (and sketch) lands on (wordClock.ts). */
  on?: LessonCue | null;
  /** Whiteboard style: the voice's own word timings, where it has them. */
  words?: SpokenWord[] | null;
  /** Whiteboard style: the heading of the section of the working this moment starts. */
  section?: string | null;
  /** A talking mouth it brings in, for oral English (Mouth.tsx). */
  mouth?: LessonMouth | null;
}

/**
 * WHITEBOARD STYLE: the breath after a moment's voice ends before the next begins, longer after
 * a moment that writes a key result or brings in a picture, so it can land.
 */
function breathMs(entry: Entry): number {
  const key =
    entry.answer ||
    Boolean(entry.showSketch) ||
    Boolean(entry.doodle) ||
    Boolean(entry.doodles?.length) ||
    entry.point.some((point) => point.kind === "box");
  return key ? 1200 : 600;
}

/**
 * Resolve once a clip can start without stalling: true when it can, false when it failed or
 * `limitMs` ran out first.
 */
function whenReady(
  clip: HTMLAudioElement | null,
  limitMs: number,
): Promise<boolean> {
  if (!clip || clip.readyState >= 3) return Promise.resolve(true);
  if (clip.error) return Promise.resolve(false);
  return new Promise((resolve) => {
    const done = (ready: boolean) => () => {
      clip.removeEventListener("canplay", yes);
      clip.removeEventListener("error", no);
      window.clearTimeout(timer);
      resolve(ready);
    };
    const yes = done(true);
    const no = done(false);
    const timer = window.setTimeout(no, limitMs);
    clip.addEventListener("canplay", yes);
    clip.addEventListener("error", no);
  });
}

/** How long after a silent line goes up before its marks are drawn back over the board. */
const MARK_LEAD_MS = 900;

/** The turn from the board after a line is finished, before the marks go up on it. */
const MARK_AFTER_WRITE_MS = 260;

/** Marks for a line the hand never reported finishing go up after this long regardless. */
const MARK_SAFETY_MS = 9000;

/** How long a line is left up to be read when there is no voice to hear it by (Mouth.tsx says
 *  its words within the same time: change both together). */
function readingMs(said: string): number {
  return Math.min(9000, Math.max(2500, said.length * 55));
}

/**
 * One beat of the lesson: a sentence the coach says, and what it writes while saying it.
 *
 * A teacher does not write a line and then explain it, nor explain and then write. The two
 * happen at once, and a beat is that pairing — which is why the board waits for the voice
 * rather than filling up as fast as the words arrive.
 */
interface Beat {
  said: string;
  /** Lines of working, and sketches, in the order the coach put them up. */
  board: { kind: "write" | "draw"; text: string }[];
  /** Where this beat's voice can be heard, or null when it has none. */
  voiceUrl: string | null;
  /**
   * The audio, once fetching has begun. Started for the beat being said and the one after
   * it, and no further: every one of these is an open connection and a voice the server is
   * generating, and starting all six at once made each take four times as long as one — so
   * the sentence the student is waiting on arrived last.
   */
  voice: HTMLAudioElement | null;
  /** True once the voice has resolved either way. Until then the beat cannot play. */
  ready: boolean;
}

/**
 * How many beats ahead to start fetching the voice for.
 *
 * One was too few: the next sentence's audio only began being made when the current one
 * started playing, and it takes roughly as long to make as a short sentence takes to say, so
 * the board stopped between beats. All of them was too many: six streams at once, each
 * generating server-side, made every one take four times as long and the one being waited on
 * arrived last.
 */
const VOICES_AHEAD = 3;

/** How long a line's second try may take before that line is read along without its voice. */
const RETRY_WAIT_MS = 10000;

/**
 * How long a board line takes to be written.
 *
 * Paced off its length, because a hand crossing a board takes longer for a longer line. The
 * first version wrote everything in a flat seven hundred milliseconds, which was over before
 * a student had looked up. Counted on what the line puts on the board — its LaTeX without
 * the markup — so `\displaystyle\int` is one sign and not sixteen letters.
 */
function inkMs(line: string): number {
  return Math.min(2600, 450 + inkLength(line) * 42);
}

/**
 * How long the reveal of a lesson line takes: a hand's pace for its length, but never more
 * than most of the time its words take to say — the voice leads, and the line is finished
 * before the next one is due.
 */
function strokeMs(line: string, handMs: number): number {
  return Math.round(Math.max(380, Math.min(handMs * 0.85, inkMs(line))));
}

/** How long the hand may take over a line when there is no voice to keep time with. */
const READ_HAND_MS = 2600;

/** Roughly how many characters a line puts on the board: its LaTeX without the markup. */
function inkLength(line: string): number {
  return line
    .replace(/\\[a-zA-Z]+|[{}$^_&\\]/g, "")
    .replace(/\s+/g, " ").length;
}

/**
 * The top of the part of the board a line can be seen in: the top of the board, or on a phone
 * the bottom of the figure pinned over the working, which covers what scrolls under it.
 */
function pinnedEdge(ink: HTMLElement, view: DOMRect): number {
  const panel = ink.querySelector<HTMLElement>(".pb-side, .pb-figpanel");
  if (!panel || window.getComputedStyle(panel).position !== "sticky") return view.top;
  const box = panel.getBoundingClientRect();
  // Beside the working, not over it: it covers nothing the lines are written in.
  if (box.width < view.width * 0.6) return view.top;
  return Math.max(view.top, Math.min(box.bottom, view.bottom));
}

/** The room left between the line being written and the top of the coach card. */
const FOLLOW_GAP = 16;


/** How long to hold a beat that has no audio, so a silent lesson still reads at a pace. */
function silentBeatMs(said: string): number {
  return Math.min(7000, 700 + said.length * 45);
}

/**
 * Matches the server's own cap, so a question that would be refused is stopped at the box
 * rather than after the student has finished typing it.
 */
const ASK_MAX_CHARS = 400;

/** Below this, the day's remaining questions are said out loud instead of running out silently. */
const LOW_ON_ASKS = 3;

export function Board({
  title,
  subtitle,
  question,
  figures,
  passage,
  answerText,
  steps,
  answerLine,
  loadLesson,
  onDone,
  onAsk,
  onListen,
  askLocked,
  noAsk = false,
  questionLabel = "The question",
  loadEarlier,
}: {
  /** What the student asked the coach about this before, shown again (founder, 12 Nov 2026). */
  loadEarlier?: () => Promise<EarlierTurn[]>;
  /** No ask box and nothing in its place: the controls stand alone (the public showcase). */
  noAsk?: boolean;
  /** The label over what is written at the top: a topic lesson says so, not "The question". */
  questionLabel?: string;
  /**
   * Fetch the lesson: the reviewed working as a teacher teaches it, with what to write and
   * what to say for each step. Undefined where the deployment has no voice, and the board
   * then writes the reviewed steps out on a reading clock, as it always did.
   */
  loadLesson?: () => Promise<NarratedLesson>;
  title: string;
  subtitle: string;
  /**
   * The diagram printed with the question, kept on the board under it. Most geometry steps
   * point into the figure — "the angle at P", "the chord QR" — and a student cannot follow
   * them with the picture left behind on the question screen.
   */
  figures?: QuestionFigure[];
  /**
   * The question itself, written at the top of the board.
   *
   * A board that starts with the working is a board with no context: the student has just
   * been moved off the question screen, and the first thing they see is step one of
   * something. A teacher writes the question up before working it.
   *
   * The passage is not written here: it is several paragraphs, and would bury the working.
   * It has a place of its own beside the working (`passage`, below).
   */
  question: string;
  /**
   * The passage the question is set on (comprehension, cloze, words in context), kept on the
   * board beside the working — in a sheet pinned over it on a phone — and marked by the lesson
   * as the working is (PassagePanel.tsx). A quote on a line of the working that comes from the
   * passage is found there and lit with its line, with no marks written for it at all.
   */
  passage?: { title: string | null; body: string } | null;
  /**
   * The right option's words, for a cloze passage: written into the question's gap at the
   * moment of the answer. The lesson's own `answer_text` is used first.
   */
  answerText?: string | null;
  steps: string[];
  /** Shown last, in green: what the answer actually was. */
  answerLine: string;
  onDone: () => void;
  /**
   * Turn a recording into words, when this deployment allows it at all. Undefined means the
   * mic is off here and no button is drawn — a client never offers what the server refuses.
   */
  onListen?: (recording: Blob) => Promise<string>;
  /**
   * Shown instead of the ask box where asking the coach is not open to this student
   * (a free account once the limits are on): the board still writes the whole working.
   */
  askLocked?: ReactNode;
  /**
   * `stepIndex` is null once the board has finished writing and the whole working is up.
   * `onWrite` is handed each piece as it arrives and `onReplace` the settled text, so the
   * board shows what the server stored rather than whatever the stream left behind.
   */
  onAsk: (
    asked: string,
    stepIndex: number | null,
    handlers: {
      /** A sentence the coach says. `index` is which beat of the lesson it is. */
      onSay: (index: number, text: string) => void;
      /** A line it writes; `after` is the beat it is written during. */
      onBoard: (after: number, text: string) => void;
      /** A sketch it draws, as SVG the server has already reduced to safe shapes. */
      onDraw: (after: number, svg: string) => void;
      /** Where to hear a beat, or null when it has no voice. */
      onVoice: (index: number, url: string | null) => void;
      onReset: () => void;
    },
  ) => Promise<TutorReply>;
}) {
  const [shown, setShown] = useState(0);
  const [paused, setPaused] = useState(false);
  // WHITEBOARD STYLE (boardPrefs.ts): sound effects, items landing on their words, a breath
  // between moments and a speed. The classic style plays at 1x and ignores every cue.
  const whiteboard = useBoardPrefs().style === "whiteboard";
  //: Which voice says the lesson: the studio one, or the free Kokoro one made on our server.
  const voice = useBoardPrefs().voice;
  const tuning = useBoardTuning();
  const speed = whiteboard ? tuning.speed : 1;
  //: Which of the moment being said's cues (`on:`) its voice has reached; `all` once it is past.
  const [cued, setCued] = useState<{ index: number; all: boolean; keys: ReadonlySet<CueKey> }>(
    () => ({ index: -1, all: false, keys: new Set() }),
  );
  const [draft, setDraft] = useState("");
  //: On a phone the ask box is a floating chat, opened from its button (founder, 12 Nov 2026).
  const [askOpen, setAskOpen] = useState(false);
  //: The kept conversation about this question, and whether its panel is open.
  const [earlier, setEarlier] = useState<EarlierTurn[]>([]);
  const [earlierOpen, setEarlierOpen] = useState(false);
  // Once, when the board opens: the caller's function may be a new one on every render.
  const earlierLoader = useRef(loadEarlier);
  useEffect(() => {
    const load = earlierLoader.current;
    if (!load) return;
    let live = true;
    load()
      .then((turns) => live && setEarlier(turns))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  //: The words of what the coach says, under the board: off unless the student turns them on.
  const [captions, setCaptions] = useState(() => {
    try {
      return localStorage.getItem("sp.board.captions") === "1";
    } catch {
      return false;
    }
  });
  const toggleCaptions = () =>
    setCaptions((on) => {
      try {
        localStorage.setItem("sp.board.captions", on ? "0" : "1");
      } catch {
        // Private window: the choice lasts this lesson.
      }
      return !on;
    });
  const [turn, setTurn] = useState<(TutorReply & { asked: string }) | null>(
    null,
  );
  const [waiting, setWaiting] = useState(false);
  //: Everything the board is already carrying: earlier questions and what was written under
  //: them. A teacher does not rub the board out between questions — they keep going down it,
  //: and a student looking back at what they asked ten minutes ago should still find it.
  const [written, setWritten] = useState<
    { kind: "asked" | "answered" | "coach" | "drawn"; text: string }[]
  >([]);
  //: The question being answered right now, and the lesson as a run of beats under it.
  const [asked, setAsked] = useState<string | null>(null);
  const [beats, setBeats] = useState<Beat[]>([]);
  //: How many beats have been played. Nothing is on the board past this, which is what makes
  //: the writing and the talking happen together rather than one after the other.
  const [played, setPlayed] = useState(0);
  const [writing, setWriting] = useState(false);
  //: Which beat is being said right now, so the caption can follow the voice.
  const [speaking, setSpeaking] = useState<number | null>(null);
  //: Set once the voice has failed to play at all. Said out loud to the student, because a
  //: silent lesson they were expecting to hear reads as a broken screen rather than a
  //: quieter one, and the first thing they will do is ask it again.
  const [voiceBlocked, setVoiceBlocked] = useState(false);
  const [askIssue, setAskIssue] = useState<string | null>(null);
  // The lesson, fetched once when the board opens. Usually already made: it was started when
  // the student first got the question wrong.
  const [lesson, setLesson] = useState<NarratedLesson | null>(null);
  const [preparing, setPreparing] = useState(Boolean(loadLesson));
  const loadOnce = useRef(loadLesson);
  useEffect(() => {
    const load = loadOnce.current;
    if (!load) return;
    let cancelled = false;
    load()
      .then((ready) => {
        if (!cancelled) setLesson(ready);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setPreparing(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const folded = useMemo(() => (passage?.body ? foldPassage(passage.body) : null), [passage]);
  const lines: Entry[] = useMemo(() => {
    const entries = teach();
    if (!folded) return entries;
    // THE QUOTES FOUND FOR THEMSELVES. A line of working that quotes the passage is linked to
    // where the words are, with no mark written for it: lit in the passage as the line is
    // written, and paired with it. Not where the moment already marks the passage itself.
    return entries.map((entry, index) => {
      if (entry.point.some((point) => point.passage || point.to?.passage)) return entry;
      const found = quotedPieces(entry.items.join(" "))
        .filter((piece) => findInPassage(folded, piece, 1, true) !== null)
        .slice(0, 2);
      if (found.length === 0) return entry;
      return {
        ...entry,
        point: [
          ...found.map((piece) => ({
            line: index,
            kind: "highlight" as const,
            at: piece,
            to: { passage: true, target: piece },
            auto: true,
          })),
          ...entry.point,
        ],
      };
    });
  }, [answerLine, folded, lesson, steps, voice]);
  /** The lesson as moments, before the passage is looked at. */
  function teach(): Entry[] {
    if (lesson && lesson.beats.length > 0) {
      return lesson.beats.map((beat) => {
        const answer = beat.answer || beat.board_index === steps.length;
        // A written lesson writes its own answer line; a narration's closing borrows ours.
        const bare = answer && beat.write.length === 0;
        // NOT WRITTEN TWICE (founder, 12 Nov 2026): a line that only restates the question
        // already in the box above is not written again; it is still said.
        const kept = beat.write
          .map((item, n) => [item, beat.write_at[n] ?? 0] as const)
          .filter(([item]) => !restates(item, question));
        return {
          label: null,
          items: bare ? [answerLine] : kept.map(([item]) => item),
          at: bare ? [0] : kept.map(([, at]) => at),
          say: beat.say,
          voice: withVoice(beat.voice_url, voice),
          step: beat.board_index !== null && !answer ? beat.board_index : null,
          answer,
          // A `travel` is drawn as the arrow it rides (travel.ts). A mark with no word of its
          // own is cued on what it points at, where that is said (wordClock.ts, `derivedCue`).
          point: drawnMarks(beat.point).map((point) =>
            point.on || point.line == null ? point : { ...point, on: derivedCue(point.at, beat.say) },
          ),
          showSketch:
            beat.show_sketch === true
              ? "sketch"
              : typeof beat.show_sketch === "string"
                ? beat.show_sketch
                : null,
          doodle: beat.doodle ?? null,
          doodles: beat.doodles ?? null,
          doodleDo: beat.doodle_do ?? null,
          diagram: beat.diagram ?? null,
          diagramDo: beat.diagram_do ?? null,
          on: beat.on ?? null,
          words: (beat as { words?: SpokenWord[] | null }).words ?? null,
          section: beat.section ?? null,
          mouth: beat.mouth ?? null,
        };
      });
    }
    return [
      ...steps.map((text, index) => ({
        label: null,
        items: [text],
        at: [0],
        say: text,
        voice: null,
        step: index,
        answer: false,
        point: [],
      })),
      {
        label: null,
        items: [answerLine],
        at: [0],
        say: answerLine,
        voice: null,
        step: null,
        answer: true,
        point: [],
      },
    ];
  }
  const inkRef = useRef<HTMLDivElement>(null);

  // The lesson is played rather than displayed. `script` is what has arrived, `cursor` is
  // where the playing has got to, and a beat only goes up when its voice is ready to start —
  // so a line is written at the moment it is being talked about.
  //
  // Playback is best-effort throughout. A browser that refuses to autoplay, a voice call that
  // failed, a deployment with no speech at all: the beat is held for a readable moment
  // instead, and the lesson still plays through. Nothing here can leave a student stuck.
  const script = useRef<Beat[]>([]);
  const cursor = useRef(0);
  const playing = useRef(false);
  const player = useRef<HTMLAudioElement | null>(null);
  const holding = useRef<number | null>(null);

  // Reading the sound as it plays, so the mouth can follow it.
  //
  // One AudioContext and one analyser for the whole board, because a browser allows only a
  // handful and a lesson makes a clip per sentence. `createMediaElementSource` may be called
  // once per element, so which elements have been wired is remembered — calling it twice
  // throws and would take the voice down with it.
  const listener = useRef<{
    context: AudioContext;
    analyser: AnalyserNode;
  } | null>(null);
  const wired = useRef<WeakSet<HTMLAudioElement>>(new WeakSet());
  const faceRef = useRef<SVGSVGElement>(null);
  const watching = useRef<number | null>(null);

  const mouth = useCallback((openness: number) => {
    faceRef.current?.style.setProperty("--mouth", openness.toFixed(3));
  }, []);

  /** Route a clip through the analyser, so its loudness can be read while it plays. */
  const listen = useCallback((audio: HTMLAudioElement) => {
    try {
      if (listener.current === null) {
        // The page's one context, which the whiteboard's sound effects play through too.
        const context = sharedAudioContext();
        if (!context) throw new Error("No Web Audio here");
        const analyser = context.createAnalyser();
        // Small window: the mouth should follow syllables, not the shape of a whole word.
        analyser.fftSize = 256;
        analyser.connect(context.destination);
        listener.current = { context, analyser };
      }
      const { context, analyser } = listener.current;
      void context.resume();
      if (!wired.current.has(audio)) {
        context.createMediaElementSource(audio).connect(analyser);
        wired.current.add(audio);
      }
      return analyser;
    } catch {
      // No Web Audio here, or this element cannot be routed. The lesson is unaffected: the
      // sound still plays through the element itself and the mouth simply does not move.
      return null;
    }
  }, []);

  /** Follow the sound until it stops, writing how open the mouth should be. */
  const follow = useCallback(
    (analyser: AnalyserNode) => {
      const samples = new Uint8Array(analyser.frequencyBinCount);
      let smoothed = 0;
      const tick = () => {
        analyser.getByteTimeDomainData(samples);
        // Root mean square around the centre line: how far the waveform is moving, which is
        // loudness. Silence sits at 128 and says nothing.
        let sum = 0;
        for (const sample of samples) {
          const offset = (sample - 128) / 128;
          sum += offset * offset;
        }
        const loudness = Math.sqrt(sum / samples.length);
        // Speech rarely passes a quarter of full scale, so it is stretched to fill the mouth,
        // then eased so a single loud frame does not snap it wide open.
        const target = Math.min(1, loudness * 4);
        smoothed += (target - smoothed) * 0.45;
        mouth(Math.max(0.08, smoothed));
        watching.current = requestAnimationFrame(tick);
      };
      tick();
    },
    [mouth],
  );

  const unfollow = useCallback(() => {
    if (watching.current !== null) cancelAnimationFrame(watching.current);
    watching.current = null;
    mouth(0.08);
  }, [mouth]);

  /** Begin fetching a beat's voice, if it has one and is not already on its way. */
  const prime = useCallback((index: number): HTMLAudioElement | null => {
    const beat = script.current[index];
    if (!beat || beat.voiceUrl === null) return null;
    if (beat.voice === null) {
      const audio = new Audio(beat.voiceUrl);
      audio.preload = "auto";
      beat.voice = audio;
    }
    return beat.voice;
  }, []);

  const play = useCallback(() => {
    if (playing.current) return;
    const beat = script.current[cursor.current];
    // Not arrived, or its voice is still being made. Waiting here is the point: it is what
    // keeps the board level with the talking instead of running ahead of it.
    if (!beat || !beat.ready) return;

    playing.current = true;
    // The beat goes on the board as the sentence starts, not after it finishes.
    setPlayed(cursor.current + 1);
    setSpeaking(cursor.current);

    const onward = () => {
      playing.current = false;
      unfollow();
      cursor.current += 1;
      setSpeaking(null);
      play();
    };

    const audio = prime(cursor.current);
    // Keep a few beats ahead. Priming only the next one meant its voice did not start being
    // made until this one began, and generating it takes about as long as a short sentence
    // takes to say — so the lesson stalled between every beat. Priming all of them instead
    // starved the one being waited on. Three is enough to stay ahead and few enough that
    // they are not fighting for the same connections.
    for (let ahead = 1; ahead <= VOICES_AHEAD; ahead += 1)
      prime(cursor.current + ahead);
    if (audio === null) {
      holding.current = window.setTimeout(onward, silentBeatMs(beat.said));
      return;
    }
    player.current = audio;

    // WHEN THE VOICE WILL NOT PLAY. A browser refusing to autoplay, a decode failure, no
    // output device. The first version of this called `onward` straight away, and because
    // the next beat then failed the same way, the whole lesson flashed past in milliseconds:
    // no voice, and nothing legibly written, because there was no "during" to write in.
    // A beat that cannot be heard is held for as long as it would have taken to say.
    const unplayable = () => {
      setVoiceBlocked(true);
      holding.current = window.setTimeout(onward, silentBeatMs(beat.said));
    };

    audio.onended = onward;
    audio.onerror = unplayable;
    void audio
      .play()
      .then(() => {
        const analyser = listen(audio);
        if (analyser) follow(analyser);
      })
      .catch(unplayable);
  }, [follow, listen, prime, unfollow]);

  const hush = useCallback(() => {
    unfollow();
    if (player.current) {
      // Same reason as in `rewind`: stopping a sound must not be mistaken for it failing.
      player.current.onended = null;
      player.current.onerror = null;
      player.current.pause();
    }
    player.current = null;
    if (holding.current !== null) window.clearTimeout(holding.current);
    holding.current = null;
    playing.current = false;
    setSpeaking(null);
  }, []);

  // Mirrors of the two pieces of state `keep` needs, so it can read what is on the board
  // without being rebuilt every time either of them changes.
  const askedRef = useRef<string | null>(null);
  const askedKindRef = useRef<"asked" | "answered">("asked");
  const playedRef = useRef(0);
  const [askedKind, setAskedKind] = useState<"asked" | "answered">("asked");
  useEffect(() => {
    askedRef.current = asked;
  }, [asked]);
  useEffect(() => {
    askedKindRef.current = askedKind;
  }, [askedKind]);
  useEffect(() => {
    playedRef.current = played;
  }, [played]);

  /**
   * Did the coach finish by asking the student something?
   *
   * It usually does — almost every answer ends with a check — so what the student types next
   * is more often an answer than a question, and the board should not call it "asked".
   */
  const awaitingAnswer = useCallback(() => {
    const spoken = script.current
      .slice(0, playedRef.current)
      .filter((beat) => beat.said);
    const last = spoken[spoken.length - 1];
    return last !== undefined && last.said.trim().endsWith("?");
  }, []);

  /** Move the exchange on the board into the part of it that stays. */
  const keep = useCallback(() => {
    const lines: {
      kind: "asked" | "answered" | "coach" | "drawn";
      text: string;
    }[] = [];
    if (askedRef.current !== null) {
      lines.push({ kind: askedKindRef.current, text: askedRef.current });
    }
    for (const beat of script.current.slice(0, playedRef.current)) {
      for (const line of beat.board) {
        lines.push({
          kind: line.kind === "draw" ? "drawn" : "coach",
          text: line.text,
        });
      }
    }
    if (lines.length) setWritten((sofar) => [...sofar, ...lines]);
  }, []);

  const rewind = useCallback(() => {
    hush();
    // Every beat may have audio still downloading. Pointing each at nothing stops the
    // fetch, so a student who asks a second question is not still pulling down the first
    // answer's voice over their data.
    //
    // THE HANDLERS COME OFF FIRST. Aborting a download fires `error` on the element, and if
    // the player is still listening it reads its own tidying up as the voice having failed —
    // which is how a working lesson came to tell a student it could not be played aloud.
    for (const beat of script.current) {
      if (beat.voice) {
        beat.voice.onended = null;
        beat.voice.onerror = null;
        beat.voice.src = "";
        beat.voice.load();
      }
    }
    script.current = [];
    cursor.current = 0;
    setBeats([]);
    setPlayed(0);
  }, [hush]);

  // Leaving the board stops the voice; nothing should still be talking on the next question.
  useEffect(() => hush, [hush]);

  // Recording the student's question. The stream is stopped the moment the recorder does,
  // so the microphone indicator goes out with it rather than staying lit after a question.
  const [recording, setRecording] = useState(false);
  const [listening, setListening] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);

  const stopRecording = useCallback(() => {
    recorder.current?.stop();
    recorder.current = null;
    setRecording(false);
  }, []);

  const startRecording = useCallback(async () => {
    if (!onListen) return;
    // BARGE-IN. The coach stops the moment the student starts, which is what a teacher does
    // when a hand goes up — and it is not only manners: the microphone is in the same room
    // as the speaker, so a coach still talking is a coach talking into the recording, and
    // its own words come back in the transcript as though the student had said them.
    hush();
    setPaused(true);
    setAskIssue(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setAskIssue("I could not reach the microphone. You can type instead.");
      return;
    }

    const pieces: Blob[] = [];
    const active = new MediaRecorder(stream);
    recorder.current = active;
    active.ondataavailable = (event) => pieces.push(event.data);
    active.onstop = () => {
      for (const track of stream.getTracks()) track.stop();
      setRecording(false);
      const recorded = new Blob(pieces, {
        type: active.mimeType || "audio/webm",
      });
      if (recorded.size === 0) return;
      setListening(true);
      onListen(recorded)
        // Into the box, never straight to the coach: they read what was heard and send it
        // themselves, because transcription mishears and this is their question.
        .then((heard) => {
          setDraft(heard);
          setPaused(true);
        })
        .catch((error: Error) => setAskIssue(error.message))
        .finally(() => setListening(false));
    };
    active.start();
    setRecording(true);
  }, [hush, onListen]);

  // Leaving the board must not leave a microphone open.
  useEffect(() => () => recorder.current?.stop(), []);

  const advance = useCallback(() => {
    setShown((current) => Math.min(current + 1, lines.length));
  }, [lines.length]);

  // The lesson's voice: one clip per beat, all fetched as soon as the lesson arrives. They were
  // made on the server while the student was on their second try, so this is reading, not
  // waiting. Kept apart from the coach's reply player, which answers questions.
  const [itemsShown, setItemsShown] = useState(0);
  //: How long the line being written takes to write out. Set from its voice once it plays.
  const [handMs, setHandMs] = useState(900);
  //: The question goes up as the teacher starts to read it, not before. Shown at once only
  //: where there is no voice to wait for.
  const [questionUp, setQuestionUp] = useState(!loadLesson);
  //: Waiting on a line's voice for more than a moment: said, so the pause reads as the coach
  //: getting ready rather than a board that has stalled.
  const [gettingReady, setGettingReady] = useState(false);
  //: The browser will not play sound until the student taps. The lesson waits for the tap.
  const [needsTap, setNeedsTap] = useState(false);
  //: The voice failed for this lesson. It is read along instead, at reading pace, rather than
  //: every line waiting in turn for a voice that is not coming.
  const [silent, setSilent] = useState(false);
  const [replayed, setReplayed] = useState(0);
  //: Which line's marks are up: the circles and arrows a beat draws back over earlier lines.
  //: Set a moment after its voice starts, so the mark lands on the words that point at it.
  const [pointing, setPointing] = useState<number | null>(null);
  //: The beat whose marks are due, once the line they belong to is on its way.
  const [wantPoint, setWantPoint] = useState<number | null>(null);
  //: When the marks of the beat pointing start, fitted to the time it has (ink.ts, `planMarks`).
  const [markPlan, setMarkPlan] = useState<(MarkPlan & { index: number }) | null>(null);
  //: When a beat read along without a voice ends (performance.now), for its marks to fit in.
  const readUntil = useRef<{ index: number; at: number } | null>(null);
  //: Bumped each time the hand starts or finishes a line, so the wait below looks again.
  const [writtenTick, setWrittenTick] = useState(0);
  //: The lesson's own voice is sounding, so the coach's face shows it is talking.
  const [voicing, setVoicing] = useState(false);
  const clips = useRef(new Map<number, HTMLAudioElement>());
  //: A clip the narration effect let go of, still sounding until the next run claims it (the
  //: same beat carrying on) or, just after, it is paused (the beat changed, or a real pause).
  const handoff = useRef<HTMLAudioElement | null>(null);
  //: A moment's clip, if it has been fetched: the talking mouth keeps time with it (Mouth.tsx).
  const clipAt = useCallback((index: number) => clips.current.get(index) ?? null, []);
  const narrating = useRef<number | null>(null);
  //: Beats whose voice could not be had even after a second try: read along for those alone.
  const failedBeats = useRef(new Set<number>());
  //: Voice failures in a row. One slow line is not a broken voice; three in a row are.
  const misses = useRef(0);
  const clipFor = useCallback(
    (index: number, fresh = false): HTMLAudioElement | null => {
      const url = lines[index]?.voice;
      if (!url) return null;
      let clip = clips.current.get(index);
      if (!clip || fresh) {
        clip?.pause();
        // A second try asks again rather than replaying the browser's cached failure.
        clip = new Audio(fresh && !url.startsWith("blob:") ? `${url}${url.includes("?") ? "&" : "?"}try=${Date.now()}` : url);
        clip.preload = "auto";
        clips.current.set(index, clip);
      }
      return clip;
    },
    [lines],
  );
  // Only the beat being said and the next two are fetched. Asking for every beat at once made
  // the server voice a dozen lines together, and the slowest of them timed out.
  useEffect(() => {
    for (let index = Math.max(0, shown - 1); index < Math.min(lines.length, shown + 2); index += 1) {
      clipFor(index);
    }
  }, [clipFor, lines, shown]);
  // WHITEBOARD: the voice's own word timings, for the same few beats, where it keeps them (the
  // Kokoro voice; the studio voice has none and its cues are estimated, wordClock.ts).
  const wordsAsked = useRef(new Set<string>());
  useEffect(() => {
    if (!whiteboard) return;
    for (let index = Math.max(0, shown - 1); index < Math.min(lines.length, shown + 2); index += 1) {
      const url = lines[index]?.voice;
      if (!url || !url.includes("engine=kokoro") || wordsAsked.current.has(url)) continue;
      wordsAsked.current.add(url);
      void api
        .lessonVoiceWords(url)
        .then((timed) => {
          if (timed?.words.length) setSpokenWords(url, timed.words);
        })
        .catch(() => undefined);
    }
  }, [lines, shown, whiteboard]);
  const missed = (index: number) => {
    failedBeats.current.add(index);
    misses.current += 1;
    if (misses.current >= 3) setSilent(true);
  };

  // WHITEBOARD: a new moment's line starts unwritten before the board is painted, rather than
  // flashing up for a frame with the last moment's count (the effect below resets it after
  // paint), which shows when its write waits for a word.
  useLayoutEffect(() => {
    if (whiteboard && shown > 0) setItemsShown(0);
  }, [shown, whiteboard]);
  useEffect(() => {
    if (shown > 0) trace("moment", { index: shown - 1 });
  }, [shown]);

  useEffect(() => {
    if (paused || preparing || needsTap) return;
    let cancelled = false;
    const timers: number[] = [];
    const later = (run: () => void, ms: number) =>
      timers.push(window.setTimeout(run, ms));
    // The next line goes up only when its voice can start. The wait is long on purpose: a
    // line's audio may still be being made, and a line written before its voice arrives is
    // the one thing the board must not do. A student waiting sees that the coach is getting
    // ready rather than a silent board filling up.
    const onward = (delay: number) =>
      later(() => {
        if (shown >= lines.length) return;
        if (silent) {
          advance();
          return;
        }
        const next = clipFor(shown);
        const slow = window.setTimeout(
          () => !cancelled && setGettingReady(true),
          1200,
        );
        timers.push(slow);
        const beat = shown;
        void whenReady(next, VOICE_WAIT_MS)
          .then((ready) =>
            ready || cancelled ? ready : whenReady(clipFor(beat, true), RETRY_WAIT_MS),
          )
          .then((ready) => {
            window.clearTimeout(slow);
            if (cancelled) return;
            setGettingReady(false);
            // This beat alone is read along; the voice is tried again on the next one.
            if (!ready) missed(beat);
            advance();
          });
      }, delay);
    // The voice has failed: the line goes up and stays long enough to be read.
    const readAlong = (entry: Entry | undefined, at: number) => {
      setQuestionUp(true);
      setHandMs(READ_HAND_MS);
      setItemsShown(entry?.items.length ?? 0);
      // No voice to time words by: every cue is due at once.
      setCued({ index: at, all: true, keys: new Set() });
      later(() => setWantPoint(at), MARK_LEAD_MS);
      const ms = entry ? readingMs(entry.say) : STEP_MS;
      readUntil.current = { index: at, at: performance.now() + ms };
      onward(ms);
    };
    const stop = () => {
      cancelled = true;
      timers.forEach((timer) => window.clearTimeout(timer));
    };

    if (shown === 0) {
      onward(200);
      return stop;
    }
    const index = shown - 1;
    const entry = lines[index];
    const clip = clipFor(index);
    if (entry && clip !== null && (silent || clip.error || failedBeats.current.has(index))) {
      readAlong(entry, index);
      return stop;
    }
    if (!entry || clip === null) {
      // No voice at all here: the board is read, not heard, so it writes as before.
      setQuestionUp(true);
      setHandMs(READ_HAND_MS);
      setItemsShown(entry?.items.length ?? 0);
      setCued({ index, all: true, keys: new Set() });
      later(() => setWantPoint(index), MARK_LEAD_MS);
      readUntil.current = { index, at: performance.now() + STEP_MS };
      onward(STEP_MS);
      return stop;
    }

    // A new beat starts from its beginning; after a pause it carries on where it was.
    if (narrating.current !== index) {
      clip.currentTime = 0;
      setItemsShown(0);
      setPointing(null);
      setWantPoint(null);
      setCued({ index, all: false, keys: new Set() });
    }
    narrating.current = index;
    const writeAll = () => setItemsShown(entry.items.length);
    // The whiteboard's pace: the voice at the student's speed (pitch kept), and every timing
    // below, which is in the clip's seconds, stretched to match. The classic style is 1x.
    const rate = speed;
    if (whiteboard || clip.playbackRate !== 1) {
      clip.playbackRate = rate;
      clip.preservesPitch = true;
    }
    const allCued = () => setCued({ index, all: true, keys: new Set() });
    // Paused (or slowed) in the breath after the voice had finished: the breath is taken again,
    // rather than the moment being said a second time.
    if (whiteboard && clip.ended && clip.currentTime > 0) {
      writeAll();
      allCued();
      onward(breathMs(entry) / rate);
      return stop;
    }
    let stopClock: (() => void) | null = null;
    // THE VOICE LEADS. Nothing is written until the teacher has started saying it: each item
    // waits for its own words, and never less than a short lead after the voice begins. Its
    // writing then takes the rest of the time its words take, so the hand follows the voice
    // and the line is finished as the sentence ends — never before the voice, never after.
    const pace = () => {
      const seconds =
        Number.isFinite(clip.duration) && clip.duration > 0
          ? clip.duration
          : 2.5;
      const lead = Math.min(0.7, seconds * 0.15);
      const count = Math.max(1, entry.items.length);
      // WHITEBOARD: each cued item at its word, read off the voice frame by frame
      // (wordClock.ts). A mark is started early by the time it takes to land, so that it is
      // drawn — a carried piece set down — on the word, not begun on it.
      const cues = whiteboard
        ? momentCues(entry).map(({ key, cue }) => {
            const said = cueSeconds(cue, entry.say, seconds, entry.words ?? spokenWordsFor(entry.voice));
            const point = key.startsWith("point:") ? entry.point[Number(key.slice(6))] : undefined;
            const turn = point ? markLands(point, index) : 0;
            return { key, at: Math.max(0, (said ?? 0) - turn), said: said ?? 0 };
          })
        : [];
      const writeAt = cues.find((one) => one.key === "write")?.said ?? null;
      setHandMs(
        Math.max(450, ((seconds * 0.92 - Math.max(lead, writeAt ?? 0)) * 1000) / count / rate),
      );
      if (index === 0) later(() => setQuestionUp(true), 0);
      // The marks are due as the line goes up: they go up once the hand is on its way to it,
      // so a piece carried into it lands as the pen reaches it (below).
      later(() => setWantPoint(index), Math.max(0, ((lead - clip.currentTime) * 1000) / rate));
      entry.items.forEach((_, item) => {
        // A cued write's first piece goes up on its word (below), and the rest not before it.
        if (writeAt !== null && item === 0) return;
        const fraction = entry.at[item] ?? item / count;
        const due =
          ((Math.max(fraction * seconds, lead, writeAt ?? 0) - clip.currentTime) * 1000) / rate;
        const show = () =>
          setItemsShown((current) => Math.max(current, item + 1));
        if (due <= 0) show();
        else later(show, due);
      });
      if (cues.length) {
        stopClock?.();
        stopClock = startCueClock(clip, cues, (keys) => {
          if (cancelled) return;
          if (keys.includes("write")) setItemsShown((current) => Math.max(current, 1));
          setCued((was) =>
            was.index === index
              ? { index, all: was.all, keys: new Set([...was.keys, ...keys]) }
              : { index, all: false, keys: new Set(keys) },
          );
        });
      }
    };
    clip.onended = () => {
      trace("voice-end", { index });
      unfollow();
      setVoicing(false);
      writeAll();
      if (whiteboard) allCued();
      // A breath, not a pause: the next beat's voice is already here. In the whiteboard style
      // a longer one, and longer still after a key result or a picture, so it can land.
      onward(whiteboard ? breathMs(entry) / rate : 250);
    };
    clip.onerror = () => {
      if (cancelled) return;
      missed(index);
      readAlong(entry, index);
    };
    // The same beat's voice, still sounding from the run before: it carries straight on.
    if (handoff.current === clip) handoff.current = null;
    clip
      .play()
      .then(() => {
        if (cancelled) return;
        setVoiceBlocked(false);
        setVoicing(true);
        trace("voice-start", { index, at: clip.currentTime, dur: clip.duration });
        misses.current = 0;
        pace();
        const analyser = listen(clip);
        if (analyser) follow(analyser);
      })
      .catch((error: Error) => {
        if (cancelled || error.name === "AbortError") return;
        if (error.name === "NotAllowedError") {
          // The browser wants a tap before it will play sound. The lesson waits for it,
          // rather than writing itself out in silence.
          setNeedsTap(true);
          return;
        }
        missed(index);
        readAlong(entry, index);
      });
    return () => {
      stop();
      stopClock?.();
      clip.onended = null;
      clip.onerror = null;
      // Not paused at once. This effect also runs again when something it reads changes only
      // its identity; pausing and resuming then is heard as the voice stopping mid-line. The
      // next run claims the clip if it is the same beat, still to be heard; if nothing claims
      // it (the beat changed, the lesson was paused, the board closed), it is paused here.
      handoff.current = clip;
      queueMicrotask(() => {
        if (handoff.current !== clip) return;
        handoff.current = null;
        clip.pause();
      });
      unfollow();
      setVoicing(false);
    };
  }, [
    advance,
    clipFor,
    follow,
    lines,
    listen,
    needsTap,
    paused,
    preparing,
    replayed,
    shown,
    silent,
    speed,
    unfollow,
    whiteboard,
  ]);

  // Make the sound effects' audio engine as the board opens, not as the first voice starts:
  // creating it can block the page for a second, and mid-line that is heard as the voice
  // stopping and starting again.
  useEffect(() => {
    sharedAudioContext();
  }, []);

  // Nothing left playing once the board is closed.
  useEffect(
    () => () => {
      for (const clip of clips.current.values()) clip.pause();
    },
    [],
  );

  // Which line of the working the question is about. Null once the board has moved past the
  // steps onto the answer line, or before it has written anything.
  const stepIndex = shown > 0 ? (lines[shown - 1]?.step ?? null) : null;

  const send = useCallback(
    async (event: { preventDefault: () => void }) => {
      event.preventDefault();
      const question = draft.trim();
      if (!question || waiting) return;
      setWaiting(true);
      setAskIssue(null);
      // The working stops while they are being answered, and their place is kept.
      setPaused(true);
      // The question goes up first and the last answer comes down: a board holds one
      // conversation at a time, and leaving the old answer under a new question reads as
      // though it answered this one.
      // Move what is on the board into the permanent part of it, then start below. The
      // board grows down the page across a whole sitting rather than being cleared each
      // time, which is what made an earlier answer look like it had been rubbed out.
      // Worked out before `keep` clears the board: whether the coach's last word was a
      // question decides whether what they have just typed is an answer to it.
      const answering = awaitingAnswer();
      // They will want to watch the answer being written, wherever they had scrolled to.
      following.current = true;
      keep();
      rewind();
      setAskedKind(answering ? "answered" : "asked");
      setAsked(question);
      setTurn(null);
      setDraft("");

      // The script is held in a ref as well as in state: the player reads it from the ref so
      // it always sees the newest beat, and the state copy is only what React renders.
      const publish = () => setBeats([...script.current]);
      const beatAt = (index: number): Beat => {
        script.current[index] ??= {
          said: "",
          board: [],
          voiceUrl: null,
          voice: null,
          ready: false,
        };
        return script.current[index];
      };

      try {
        const reply = await onAsk(question, stepIndex, {
          onSay: (index, text) => {
            setWaiting(false);
            setWriting(true);
            beatAt(index).said = text;
            publish();
          },
          onBoard: (after, text) => {
            setWaiting(false);
            setWriting(true);
            // A board line written before anything was said belongs to a beat of its own.
            beatAt(Math.max(0, after)).board.push({ kind: "write", text });
            publish();
          },
          onDraw: (after, svg) => {
            setWaiting(false);
            setWriting(true);
            beatAt(Math.max(0, after)).board.push({ kind: "draw", text: svg });
            publish();
          },
          onVoice: (index, url) => {
            const beat = beatAt(index);
            beat.voiceUrl = url === null ? null : withVoice(url, voice);
            beat.ready = true;
            publish();
            // This beat can go up now — and if the player was waiting on it, the whole
            // lesson moves on from here.
            play();
          },
          onReset: () => rewind(),
        });
        setTurn({ ...reply, asked: question });
      } catch (error) {
        setAskIssue((error as Error).message);
        setAsked(null);
        rewind();
      } finally {
        setWaiting(false);
        setWriting(false);
      }
    },
    [
      awaitingAnswer,
      draft,
      hush,
      keep,
      onAsk,
      play,
      rewind,
      stepIndex,
      waiting,
    ],
  );

  // Reading an answer and watching the next step appear are different things, so the reply
  // stays up until the student moves the board themselves.
  const resume = useCallback(() => {
    setTurn(null);
    setAskIssue(null);
    keep();
    setAsked(null);
    setVoiceBlocked(false);
    rewind();
  }, [keep, rewind]);

  const finished = shown >= lines.length;
  /** Go to any step of the lesson, from the timeline or Back: the board shows everything up
   *  to it, written, and the step is said from its start. The step already on is said again. */
  const seek = (target: number) => {
    const to = Math.max(1, Math.min(lines.length, target));
    resume();
    following.current = true;
    narrating.current = null;
    setPaused(false);
    if (to === shown) setReplayed((count) => count + 1);
    else setShown(to);
    // Once the board has redrawn: the step gone to sits just above the dock, the writing
    // before it above that. Going back, that line was already seen, so the usual follow (which
    // only reaches for new writing) would leave the board scrolled where it was.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const ink = inkRef.current;
        const written = sheetRef.current?.querySelectorAll<HTMLElement>(".pb-line");
        const line = written?.[written.length - 1];
        if (!ink || !line) return;
        newest.current = line;
        const floor = ink.getBoundingClientRect().bottom - coachRoom.current - FOLLOW_GAP;
        ink.scrollTo({ top: Math.max(0, ink.scrollTop + line.getBoundingClientRect().bottom - floor) });
      }),
    );
  };
  const caption = finished
    ? "That is the whole working. This one goes back in the pile — you will meet the same ground again, with a different question."
    : needsTap
      ? "Tap the button on the board to hear the lesson."
      : preparing || gettingReady || shown === 0
        ? "Getting the lesson ready…"
        : (lines[shown - 1]?.say ?? "");

  // A student has to be able to tell being answered from being handed the same step again,
  // so the card says which of the two just happened rather than sounding the same either way.
  const status = waiting
    ? "Coach · reading your question"
    : speaking !== null
      ? "Coach · speaking"
      : writing || played > 0
        ? "Coach · explaining"
        : turn
          ? turn.source === "model"
            ? "Coach · said its piece"
            : "Coach · cannot talk this through — here is the reviewed step"
          : paused
            ? "Coach · paused — your place is kept"
            : finished
              ? "Coach · finished"
              : silent
                ? `Coach · no voice right now, read along · step ${shown} of ${lines.length}`
                : `Coach · step ${shown} of ${lines.length}`;

  // THE MARKS KEEP TIME WITH THE WRITING. A beat's marks are due as its line goes up, and go
  // up once the hand is on its way to the line (or has written it): a piece carried down into
  // the line flies as the line is written and lands as the pen reaches the piece it becomes; a
  // highlight under words not yet written, or a word crossed out before it exists, still waits
  // for the words, which would otherwise read as the board knowing the answer before the
  // teacher does. When each starts is planned then, once, to fit the time the beat has left
  // (ink.ts, `planMarks`). If the hand never reports (a line it could not measure), the marks
  // go up anyway after a generous wait.
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    const bump = () => setWrittenTick((value) => value + 1);
    sheet.addEventListener(WRITTEN_EVENT, bump);
    sheet.addEventListener(WRITING_EVENT, bump);
    return () => {
      sheet.removeEventListener(WRITTEN_EVENT, bump);
      sheet.removeEventListener(WRITING_EVENT, bump);
    };
  }, []);
  /** The plan for beat `index`'s marks, made as they go up: in the board's own seconds (the
   *  voice's, which the speed control stretches along with every animation). */
  const planFor = useCallback(
    (sheet: HTMLElement, index: number): MarkPlan | null => {
      const entry = lines[index];
      if (!entry?.point.length) return null;
      const row = lineAt(sheet, index);
      const items = row ? Array.from(row.querySelectorAll<HTMLElement>(".pb-item")) : [];
      const timing = items.map((item) => penTiming(sheet, item, null));
      // Hand time is real time; the plan is in the voice's time, which runs `speed` times as fast.
      const seconds = (ms: number) => (ms / 1000) * speed;
      const written = seconds(Math.max(0, ...timing.map((one) => one?.done ?? 0)));
      const carries = entry.point.map(
        (point) =>
          point.line != null &&
          point.figure == null &&
          (point.line < 0 ? index + point.line : point.line) === index &&
          (point.kind === "move" || point.kind === "arrow") &&
          Boolean(point.from),
      );
      const reach = entry.point.map((point, k): number | null => {
        if (!carries[k] || !row || written <= 0) return null;
        const box = inkBox(row, point.at ?? null);
        if (!box) return null;
        const x = (box.left + box.right) / 2;
        const y = (box.top + box.bottom) / 2;
        const item =
          items.find((one) => {
            const r = one.getBoundingClientRect();
            return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
          }) ?? items[items.length - 1];
        const when = item ? penTiming(sheet, item, box) : null;
        return when ? seconds(when.reach) : null;
      });
      // A mark that is not a piece carried in waits for the line, unless a carried piece comes
      // after it in the lesson's order (that one must land as its line is written).
      const after = entry.point.map(
        (point, k) =>
          written > 0 &&
          point.line != null &&
          !carries[k] &&
          ((point.line < 0 ? index + point.line : point.line) === index ||
            !carries.slice(k + 1).some(Boolean)),
      );
      // The time the beat has: what is left of its voice and half the breath after it.
      const clip = clips.current.get(index);
      const breath = whiteboard ? breathMs(entry) / 1000 : 0.25 * speed;
      const read = readUntil.current?.index === index ? readUntil.current.at : null;
      const voiced =
        clip && Number.isFinite(clip.duration) && clip.duration > 0 && (!clip.paused || clip.ended);
      const end =
        clip && voiced
          ? Math.max(0, clip.duration - clip.currentTime) + breath / 2
          : read !== null
            ? seconds(Math.max(0, read - performance.now()))
            : null;
      return planMarks(entry.point, index, { reach, after, written, end });
    },
    [lines, speed, whiteboard],
  );
  useEffect(() => {
    if (wantPoint === null || pointing === wantPoint || paused) return;
    const sheet = sheetRef.current;
    const entry = lines[wantPoint];
    const row = sheet?.querySelector(`[data-line="${wantPoint}"]`);
    const items = row ? Array.from(row.querySelectorAll<HTMLElement>(".pb-item")) : [];
    const all = !entry || items.length >= entry.items.length;
    const done = all && items.every((item) => item.dataset.written !== undefined);
    // On its way: every piece of the line is up, and the hand is writing it or has it next.
    const coming =
      all && sheet !== null && items.length > 0 && items.every((item) => penTiming(sheet, item, null) !== null);
    const at = wantPoint;
    const timer = window.setTimeout(
      () => {
        const plan = sheet ? planFor(sheet, at) : null;
        trace("marks-up", { index: at, plan });
        setMarkPlan(plan ? { ...plan, index: at } : null);
        setPointing(at);
      },
      done ? MARK_AFTER_WRITE_MS : coming ? 0 : MARK_SAFETY_MS,
    );
    return () => window.clearTimeout(timer);
  }, [wantPoint, pointing, writtenTick, itemsShown, lines, paused, planFor]);

  // THE DIAGRAMS COME IN DRAWN. Each is brought in at a moment — a printed figure with the
  // first, a sketch at the moment that says `show_sketch` (a sketch no moment names comes in
  // with the first sketch) — and drawn stroke by stroke over the time that moment's words take
  // (FigureBoard.tsx, `useDrawIn`). The marks of that moment and later wait until it is drawn.
  const drawStarts = useMemo(() => {
    const starts = new Map<string, number>();
    (figures ?? []).forEach((_, index) => starts.set(String(index), 0));
    const names = (lesson?.sketches ?? []).map((sketch) => sketch.name);
    const first = Math.max(0, lines.findIndex((line) => Boolean(line.showSketch)));
    for (const name of names) {
      const at = lines.findIndex((line) => line.showSketch === name);
      starts.set(name, at >= 0 ? at : first);
    }
    return starts;
  }, [figures, lesson, lines]);
  const [drawnKeys, setDrawnKeys] = useState<ReadonlySet<string>>(() => new Set());
  const markDrawn = useCallback((key: string | number) => {
    setDrawnKeys((was) => (was.has(String(key)) ? was : new Set([...was, String(key)])));
  }, []);
  /** Drawing one in takes about as long as the words of the moment that brings it in. */
  const drawMsAt = useCallback(
    (index: number) => Math.min(10000, Math.max(2600, (lines[index]?.say.length ?? 60) * 62)),
    [lines],
  );
  // Marks wait from the first moment whose diagram is on the board but not yet drawn.
  const drawGate = useMemo(() => {
    const waiting = Array.from(drawStarts)
      .filter(([key, at]) => at <= shown - 1 && !drawnKeys.has(key))
      .map(([, at]) => at);
    return waiting.length ? Math.min(...waiting) : null;
  }, [drawStarts, drawnKeys, shown]);
  // Never held for good: a diagram that cannot be drawn lets its marks go all the same.
  const drawTimers = useRef(new Map<string, number>());
  useEffect(() => {
    for (const [key, at] of drawStarts)
      if (at <= shown - 1 && !drawnKeys.has(key) && !drawTimers.current.has(key))
        drawTimers.current.set(key, window.setTimeout(() => markDrawn(key), drawMsAt(at) + 8000));
  }, [drawMsAt, drawStarts, drawnKeys, markDrawn, shown]);
  useEffect(() => {
    const timers = drawTimers.current;
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, []);

  // THE MARKS. A beat may point back at a line already written — circle a term, underline
  // it, draw an arrow to where a line came from — the way a teacher turns to the board and
  // points. Once drawn, a mark stays, as solid as when it went up: a teacher does not rub out
  // the circle round the value they just used, and a student scrolling back should find every
  // arrow and underline the lesson made, not a board that forgets. The current beat's marks
  // wait for their line to be written (above); every earlier beat's stay as they were.
  /** Whiteboard style: whether the cued item `key` of moment `index` has had its word said. */
  const cueDue = useCallback(
    (index: number, key: CueKey) =>
      index < shown - 1 || (cued.index === index && (cued.all || cued.keys.has(key))),
    [cued, shown],
  );
  const markSets: MarkSet[] = useMemo(() => {
    const current = shown - 1;
    const sets: MarkSet[] = [];
    lines.forEach((line, index) => {
      if (!line.point.length || index > current) return;
      // The moment being said plays its marks to its plan; one a moment cued to a word starts
      // on it. An earlier moment's marks are all due now: any still on their way when the
      // moment ended are hurried to where they go (`useFlights`, `Carried`), never left to
      // trail into the moments after.
      const timed: Pick<MarkSet, "live" | "delays" | "pace"> =
        index === current
          ? {
              live: true,
              delays:
                markPlan?.index === index
                  ? markPlan.delays
                  : markDelays(line.point, index).map((delay, k) => (line.point[k]?.on ? 0 : delay)),
              pace: markPlan?.index === index ? markPlan.pace : 1,
            }
          : { live: false, delays: line.point.map(() => 0), pace: 1 };
      // WHITEBOARD: a cued mark goes up on its word (and on the line being written, once it is
      // written); the others with the moment's marks as always. One held back keeps its place
      // as a mark drawn nowhere, so every mark keeps its key and its turn.
      if (whiteboard && index === current && line.point.some((point) => point.on)) {
        if (drawGate !== null && index >= drawGate) return;
        const points = line.point.map((point, k): LessonPoint => {
          const target = point.line == null ? null : point.line < 0 ? index + point.line : point.line;
          const due = point.on
            ? cueDue(index, `point:${k}`) && (target !== index || pointing === index)
            : pointing === index;
          return due ? point : { kind: point.kind, line: null, from: point.from };
        });
        if (points.every((point, k) => point !== line.point[k])) return;
        sets.push({ index, points, state: "live", ...timed });
        return;
      }
      if (index === current && pointing !== index) return;
      if (drawGate !== null && index >= drawGate) return;
      sets.push({ index, points: line.point, state: "live", ...timed });
    });
    return sets;
  }, [cueDue, drawGate, lines, markPlan, pointing, shown, whiteboard]);

  // THE WORKING AND THE PICTURE, PAIRED. Every mark on a diagram belongs with a line of the
  // working (see `pairLinks`); the figure's copy of the marks draws an arrow across (`to`) as a
  // circle round the point it lands on.
  const links = useMemo(
    () => pairLinks(markSets, (index) => (lines[index]?.items.length ?? 0) > 0),
    [lines, markSets],
  );
  //: The pairs with a diagram, for the figure panel (the passage's go to the passage, and a
  //: doodle's to the doodle).
  const figureLinks = useMemo(
    () =>
      links.filter(
        (link): link is LinkPair & { figure: DrawingKey } =>
          link.figure !== "passage" && link.figure !== "doodle",
      ),
    [links],
  );
  //: The pairs with a doodle (DoodleLayer.tsx), with what each points at.
  const doodleLinks = useMemo(
    () =>
      links.flatMap((link): DoodleLink[] => {
        if (link.figure !== "doodle") return [];
        const k = Number(link.key.split("-")[1]);
        const point = markSets.find((set) => set.index === link.set)?.points[k];
        const doodle = point?.to?.doodle;
        return doodle
          ? [{ key: link.key, number: link.number, set: link.set, doodle, part: point.to?.part ?? null, kind: point.kind }]
          : [];
      }),
    [links, markSets],
  );
  //: The pairs with a live diagram's part (DiagramLayer.tsx).
  const diagramLinks = useMemo(
    () =>
      links.flatMap((link): DiagramLink[] => {
        if (link.figure !== "doodle") return [];
        const k = Number(link.key.split("-")[1]);
        const point = markSets.find((set) => set.index === link.set)?.points[k];
        const diagram = point?.to?.diagram;
        return diagram
          ? [{ key: link.key, number: link.number, set: link.set, diagram, part: point.to?.part ?? null, kind: point.kind }]
          : [];
      }),
    [links, markSets],
  );
  const figureSets = useMemo(() => figureCopy(markSets), [markSets]);
  // THE PASSAGE'S COPY of the marks: those drawn in it, and the places the working links to.
  const passageMarks = useMemo(() => passageCopy(markSets, links), [links, markSets]);
  const hasPassage = Boolean(passage?.body);
  const gap = useMemo(() => (hasPassage ? gapOf(question) : null), [hasPassage, question]);
  // The answer is up once its moment's line is written: a cloze gap is filled in then.
  const answerAt = lines.findIndex((line) => line.answer);
  const answerUp =
    answerAt >= 0 && (shown - 1 > answerAt || (shown - 1 === answerAt && pointing === answerAt));
  //: The pair lit by a hover or a tap, both its ends and the line between.
  const [litPair, setLitPair] = useState<number | null>(null);
  //: The pairs whose line across runs clear of everything, so their numbered dots stand down.
  const [joined, setJoined] = useState<ReadonlySet<string>>(() => new Set());
  const deskRef = useRef<HTMLDivElement>(null);
  //: The column a doodle scene takes on a wide screen, where there is no figure or passage.
  const [scenePanel, setScenePanel] = useState<HTMLElement | null>(null);
  const layoutRef = useRef<BoardLayout | null>(null);
  const litTimer = useRef(0);
  const lightPair = useCallback((number: number | null, tapped = false) => {
    window.clearTimeout(litTimer.current);
    setLitPair(number);
    if (tapped && number !== null)
      litTimer.current = window.setTimeout(() => setLitPair(null), 2600);
  }, []);
  /** The pair a line of the working belongs to, for a hover or a tap on the line itself. */
  const pairOfLine = useCallback(
    (target: EventTarget | null): number | null => {
      const row = target instanceof Element ? target.closest<HTMLElement>("[data-line]") : null;
      const index = row ? Number(row.dataset.line) : NaN;
      return links.find((link) => link.line === index)?.number ?? null;
    },
    [links],
  );

  // FOLLOWING THE HAND. The line being written is always in view, above the coach card that
  // floats over the bottom of the board. The board used to scroll to its bottom once a step
  // had gone up — by which time the line was being written underneath the card, and a line
  // written where it cannot be seen looks to a student exactly like a line that was never
  // written. Now it moves as each piece STARTS, to the piece itself: that is not always the
  // bottom, because earlier questions kept under the working sit below the lesson line.
  //
  // The card's real height is measured, because it grows with the caption, and the board
  // keeps that much room (and a little air) under the line being written.
  //
  // A student who scrolls up to reread is left there: the board follows only while they are
  // at the bottom, and picks up again when they come back down.
  const stageRef = useRef<HTMLDivElement>(null);
  const coachRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  //: How far the coach card reaches up from the bottom of the board, in pixels.
  const coachRoom = useRef(76);
  const following = useRef(true);
  //: The newest thing written, which the board keeps in view.
  const newest = useRef<HTMLElement | null>(null);
  const followed = useRef(new WeakSet<Element>());

  /** Scroll just far enough that `target` sits whole above the coach card. */
  const keepInView = useCallback((target: HTMLElement | null) => {
    const ink = inkRef.current;
    if (!ink || !target || !target.isConnected) return;
    const view = ink.getBoundingClientRect();
    const box = target.getBoundingClientRect();
    const ceiling = pinnedEdge(ink, view) + 12;
    const floor = view.bottom - coachRoom.current - FOLLOW_GAP;
    let by = box.bottom > floor ? box.bottom - floor : 0;
    // Taller than the room there is: its top stays in view, where the writing starts.
    if (box.top - by < ceiling) by = box.top - ceiling;
    if (Math.abs(by) < 2) return;
    ink.scrollTo({
      top: ink.scrollTop + by,
      behavior: stillMotion() ? "auto" : "smooth",
    });
  }, []);

  /** Is `target` where the student can see it, clear of the coach card? */
  const inSight = useCallback((target: HTMLElement) => {
    const ink = inkRef.current;
    if (!ink) return false;
    const view = ink.getBoundingClientRect();
    const box = target.getBoundingClientRect();
    return (
      box.bottom <= view.bottom - coachRoom.current + 2 &&
      box.top >= pinnedEdge(ink, view)
    );
  }, []);

  /** The part of the board in sight, for a piece flying down it to stay in view. */
  const viewBand = useCallback((): ViewBand | null => {
    const ink = inkRef.current;
    if (!ink) return null;
    const view = ink.getBoundingClientRect();
    return { ink, top: pinnedEdge(ink, view), bottom: view.bottom - coachRoom.current };
  }, []);

  /** The marker writes only where the board is following, or the line is in sight anyway. */
  const penCanSee = useCallback(
    (target: HTMLElement) => following.current || inSight(target),
    [inSight],
  );

  // Whatever has just started being written: the question, a lesson line, the student's own
  // question, a line of the coach's answer.
  const inkTick = `${shown}.${itemsShown}.${played}.${beats.length}.${questionUp}.${
    asked ?? ""
  }.${written.length}`;
  useLayoutEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    const marked = sheet.querySelectorAll<HTMLElement>(
      "[data-ink], [data-follow]",
    );
    const latest = marked[marked.length - 1];
    if (!latest || followed.current.has(latest)) return;
    // Everything marked now counts as seen, so a line that went up alongside a newer one (the
    // question, with the first line) is not mistaken for new writing once the newer is done.
    marked.forEach((element) => followed.current.add(element));
    // The whole line it belongs to — the answer's green card, not just the words in it.
    newest.current = latest.closest<HTMLElement>(".pb-line, .pb-coachline") ?? latest;
    if (following.current) keepInView(newest.current);
  }, [inkTick, keepInView]);

  // THE MARKED LINE IN SIGHT (founder, 12 Nov 2026). When the moment marks an earlier line that
  // has scrolled out of view, the board scrolls back to it as the mark goes up, holds it there
  // while it is drawn, then follows the writing again.
  const shownMarked = useRef<string>("");
  useEffect(() => {
    const ink = inkRef.current;
    const sheet = sheetRef.current;
    const current = shown - 1;
    if (!ink || !sheet || current < 0) return;
    const live = markSets.find((set) => set.index === current && set.state === "live");
    const earlier = (live?.points ?? [])
      .map((point) => (point.line == null ? null : point.line < 0 ? current + point.line : point.line))
      .filter((line): line is number => line !== null && line < current);
    if (!earlier.length) return;
    const key = `${current}:${earlier.join(",")}`;
    if (shownMarked.current === key) return;
    shownMarked.current = key;
    const target = lineAt(sheet, Math.min(...earlier));
    if (!target || inSight(target)) return;
    const view = ink.getBoundingClientRect();
    const box = target.getBoundingClientRect();
    ink.scrollTo({
      top: ink.scrollTop + box.top - view.top - view.height * 0.25,
      behavior: stillMotion() ? "auto" : "smooth",
    });
    const back = window.setTimeout(() => {
      if (following.current) keepInView(newest.current);
    }, 2600 / speed);
    return () => window.clearTimeout(back);
  }, [markSets, shown, inSight, keepInView, speed]);

  // Whether the student has moved the board themselves. Only their own scrolling counts —
  // the board's smooth scrolling fires the same events and must not switch itself off.
  useEffect(() => {
    const ink = inkRef.current;
    if (!ink) return;
    let touched = -Infinity;
    const touch = () => {
      touched = performance.now();
    };
    const keys = (event: KeyboardEvent) => {
      if (
        ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(
          event.key,
        ) &&
        !(event.target instanceof HTMLInputElement)
      )
        touch();
    };
    const scrolled = () => {
      if (performance.now() - touched > 900) return;
      const nearBottom =
        ink.scrollHeight - ink.scrollTop - ink.clientHeight < 96;
      following.current =
        nearBottom || (newest.current !== null && inSight(newest.current));
    };
    ink.addEventListener("wheel", touch, { passive: true });
    ink.addEventListener("touchmove", touch, { passive: true });
    ink.addEventListener("pointerdown", touch);
    ink.addEventListener("scroll", scrolled, { passive: true });
    window.addEventListener("keydown", keys);
    return () => {
      ink.removeEventListener("wheel", touch);
      ink.removeEventListener("touchmove", touch);
      ink.removeEventListener("pointerdown", touch);
      ink.removeEventListener("scroll", scrolled);
      window.removeEventListener("keydown", keys);
    };
  }, [inSight]);

  // The room the card takes, measured whenever it (or the board) changes size. A card that
  // grows over the line being written moves the board up with it; so does a line that grows
  // once its maths or figure has finished laying out.
  useEffect(() => {
    const coach = coachRef.current;
    const stage = stageRef.current;
    if (!coach || !stage || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const bottom = (inkRef.current ?? stage).getBoundingClientRect().bottom;
      const room = Math.max(
        0,
        Math.round(bottom - coach.getBoundingClientRect().top),
      );
      coachRoom.current = room;
      stage.style.setProperty("--coach-h", `${coach.offsetHeight}px`);
      stage.style.setProperty("--stage-h", `${stage.clientHeight}px`);
      stage.style.setProperty("--coach-room", `${room}px`);
      if (following.current) keepInView(newest.current);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(coach);
    observer.observe(stage);
    if (sheetRef.current) observer.observe(sheetRef.current);
    return () => observer.disconnect();
  }, [keepInView]);

  // WHITEBOARD: ONE THING LANDS AT A TIME. A moment's doodle actions wait until its marks have
  // been drawn, rather than going up with them; a cued doodle or action waits for its word.
  const [actionsDue, setActionsDue] = useState<number | null>(null);
  useEffect(() => {
    if (!whiteboard || paused || pointing === null) return;
    // Its marks as they are played (`planMarks`), which may be quicker than their natural turns.
    const delays =
      markPlan?.index === pointing
        ? markPlan.delays
        : markDelays(lines[pointing]?.point ?? [], pointing);
    const marksMs = delays.length ? (Math.max(...delays) + 0.6) * 1000 : 0;
    const at = pointing;
    const timer = window.setTimeout(() => setActionsDue(at), marksMs / speed);
    return () => window.clearTimeout(timer);
  }, [lines, markPlan, paused, pointing, speed, whiteboard]);
  const doodleHold = useCallback(
    (moment: number, what: "doodle" | "do", k: number): boolean | null => {
      if (!whiteboard || moment !== shown - 1) return null;
      const entry = lines[moment];
      if (!entry) return null;
      if (what === "doodle") {
        const ref = [entry.doodle, ...(entry.doodles ?? [])].filter(Boolean)[k];
        return ref?.on ? !cueDue(moment, `doodle:${k}`) : null;
      }
      if (entry.doodleDo?.[k]?.on) return !cueDue(moment, `do:${k}`);
      return pointing === moment && actionsDue === moment ? false : true;
    },
    [actionsDue, cueDue, lines, pointing, shown, whiteboard],
  );
  //: The same for a live diagram: on its word, and its actions after the marks or on theirs.
  const diagramHold = useCallback(
    (moment: number, what: "diagram" | "do", k: number): boolean | null => {
      if (!whiteboard || moment !== shown - 1) return null;
      const entry = lines[moment];
      if (!entry) return null;
      if (what === "diagram") return entry.diagram?.on ? !cueDue(moment, "diagram") : null;
      if (entry.diagramDo?.[k]?.on) return !cueDue(moment, `dia:${k}`);
      return pointing === moment && actionsDue === moment ? false : true;
    },
    [actionsDue, cueDue, lines, pointing, shown, whiteboard],
  );
  // The voice's speed stretches the board's animations with it (BoardTuning.tsx).
  const stageNow = useCallback(() => stageRef.current, []);
  useAnimationRate(stageNow, speed, whiteboard);
  // The sound effects (boardSfx.ts, sfx.ts).
  const doodleDueNow = useCallback(
    (k: number) => {
      const index = shown - 1;
      const entry = lines[index];
      if (!entry) return false;
      const near = (() => {
        const ref = [entry.doodle, ...(entry.doodles ?? [])].filter(Boolean)[k];
        return typeof ref?.near === "number" ? ref.near : index;
      })();
      if (near === index && itemsShown === 0 && entry.items.length) return false;
      return doodleHold(index, "doodle", k) !== true;
    },
    [doodleHold, itemsShown, lines, shown],
  );
  const actionDueNow = useCallback(
    (k: number) => {
      const index = shown - 1;
      const rule = doodleHold(index, "do", k);
      return rule === null ? pointing === index : !rule;
    },
    [doodleHold, pointing, shown],
  );

  const talking = speaking !== null || voicing;
  // THE DESK'S DIAGRAMS: the question's printed figures, up with the question, and the
  // sketches the lesson draws from the question's words, each brought in at the moment the
  // lesson first turns to it (`show_sketch`), or with the first moment where none says.
  const drawings: Drawing[] = useMemo(
    () => [
      ...(figures ?? []).map((figure, index) => ({
        key: index,
        figure,
        shown: questionUp,
        drawMs: drawMsAt(0),
      })),
      ...(lesson?.sketches ?? []).map((sketch) => ({
        key: sketch.name,
        figure: {
          url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sketch.svg)}`,
          alt_text: sketch.alt_text ?? "A sketch of the question",
          width: sketch.width ?? null,
          height: sketch.height ?? null,
        },
        markup: sketch.svg,
        shown:
          shown - 1 >= (drawStarts.get(sketch.name) ?? 0) &&
          // Whiteboard: brought in on its moment's word, where the moment has one.
          (!whiteboard ||
            !lines[drawStarts.get(sketch.name) ?? 0]?.on ||
            !lines[drawStarts.get(sketch.name) ?? 0]?.showSketch ||
            cueDue(drawStarts.get(sketch.name) ?? 0, "sketch")),
        drawMs: drawMsAt(drawStarts.get(sketch.name) ?? 0),
      })),
    ],
    [cueDue, drawMsAt, drawStarts, figures, lesson, lines, questionUp, shown, whiteboard],
  );
  const hasFigure = drawings.length > 0;
  useBoardSfx({
    active: whiteboard,
    paused: paused || needsTap,
    speed,
    moments: lines,
    shown,
    itemsShown,
    marks: markSets,
    doodleDue: doodleDueNow,
    actionDue: actionDueNow,
    picturesUp: drawings.filter((drawing) => drawing.shown).length,
    answerAt: lines.findIndex((line) => line.answer),
  });
  //: A column beside the working (a pinned sheet on a phone): the figures, the passage, or both.
  const hasSide = hasFigure || hasPassage;
  //: With neither, a doodle scene takes that column on a wide screen (DoodleLayer.tsx).
  const sceneSide =
    !hasSide &&
    (lesson?.beats ?? []).some((beat) =>
      [beat.doodle, ...(beat.doodles ?? [])].some((doodle) => doodle?.size === "scene") ||
      // A live diagram takes it too (DiagramLayer.tsx), and a talking mouth (Mouth.tsx), the
      // picture an oral English lesson is about.
      Boolean(beat.diagram) ||
      Boolean(beat.mouth?.word),
    );
  // The marker puts itself down for each line and lifts off when it is done, so it is only
  // held back while the board is waiting for a tap or has stepped back for the student.
  const penActive = !needsTap && !(paused && asked === null && !waiting);
  // Only the lesson dims while the student types: the coach's answer to them is what they
  // are reading, and it stays at full strength.
  const dim = paused && asked === null && !waiting;
  const progress = lines.length ? Math.min(1, shown / lines.length) : 0;
  const showCaption = played === 0;
  const showTranscript = voiceBlocked && played > 0;
  // THE BOARD AND THE VOICE, NOTHING ELSE (founder, 12 Nov 2026). While the lesson is heard,
  // the sentence is not also written under the board: the student listens and watches the
  // writing, and a caption pulls their eyes off it. The box comes back where it is needed:
  // no voice (read along), the voice blocked, getting ready, a tap to start, or the coach
  // answering a question.
  const heard = lines.some((line) => line.voice) && !silent && !voiceBlocked;
  // Not even reading along where there is no voice (founder, 12 Nov 2026): the words under the
  // board only when the student turns them on (the CC button), kept for next time.
  const coachShown =
    captions || waiting || turn !== null || played > 0 || needsTap || preparing || gettingReady || finished;
  const nextLabel = finished ? "Done" : "Next step";

  return (
    <div
      className={`sj pb ${talking ? "is-talking" : ""} ${hasSide || sceneSide ? "has-fig" : ""} ${
        hasPassage ? "has-passage" : ""
      }${whiteboard ? " wb" : ""}`}
    >
      <header className="pb-bar">
        <div className="pb-col pb-bar-in">
          <button
            className="sj-btn ghost sm pb-close"
            type="button"
            aria-label="Close the board"
            onClick={onDone}
          >
            <IconClose />
            <span>Close</span>
          </button>
          <div className="pb-what">
            <span className="sj-eyebrow pb-what-sub">{subtitle}</span>
            <strong className="pb-what-title">{title}</strong>
          </div>
          <BoardStyleSwitch />
          <span
            className="pb-count sj-mono"
            aria-label={
              finished
                ? "Every step is on the board"
                : `Step ${shown} of ${lines.length}`
            }
          >
            {finished ? (
              <>
                <IconCheck size={14} /> Done
              </>
            ) : (
              <>
                <b>{Math.max(0, shown)}</b>
                <span>/</span>
                {lines.length}
              </>
            )}
          </span>
        </div>
        <div
          className="pb-progress"
          role="progressbar"
          aria-label="How much of the working is on the board"
          aria-valuemin={0}
          aria-valuemax={lines.length}
          aria-valuenow={shown}
        >
          <span style={{ width: `${progress * 100}%` }} />
        </div>
      </header>

      <main className="pb-stage" ref={stageRef}>
        {needsTap ? (
          <div className="pb-tap">
            <button
              type="button"
              className="sj-btn lg"
              onClick={() => {
                // The tap is what the browser needs; the lesson then carries on from here.
                setNeedsTap(false);
                setReplayed((count) => count + 1);
              }}
            >
              <IconPlay size={18} />
              Tap to start the lesson
            </button>
          </div>
        ) : null}

        <div className="pb-ink" ref={inkRef}>
          {/*
            With a figure, the working and the figure share a desk: the figure beside the lines
            on a wide screen, pinned over them on a phone (FigureBoard.tsx). The sheet the lines
            are written on, and every mark and the pen measured against it, is the same either
            way.
          */}
          <div className={hasSide || sceneSide ? "pb-col pb-desk" : "pb-plain"} ref={deskRef}>
          {sceneSide ? <aside className="dd-scenepanel" ref={setScenePanel} aria-label="Pictures" /> : null}
          {hasPassage && passage ? (
            // The passage, and any figure with it, in one column beside the working.
            <aside className="pb-side">
              {hasFigure ? (
                <FigurePanel
                  drawings={drawings}
                  sets={figureSets}
                  links={figureLinks}
                  lit={litPair}
                  joined={joined}
                  onLit={lightPair}
                  paused={paused}
                  onDrawn={markDrawn}
                />
              ) : null}
              <PassagePanel
                title={passage.title}
                body={passage.body}
                marks={passageMarks}
                gap={gap}
                answerText={lesson?.answer_text ?? answerText ?? null}
                answerUp={answerUp}
                lit={litPair}
                onLit={lightPair}
              />
            </aside>
          ) : hasFigure ? (
            <FigurePanel
              drawings={drawings}
              sets={figureSets}
              links={figureLinks}
              lit={litPair}
              joined={joined}
              onLit={lightPair}
              paused={paused}
              onDrawn={markDrawn}
            />
          ) : null}
          <div
            className={`${hasSide || sceneSide ? "" : "pb-col "}pb-sheet sp-textbook ${dim ? "dim" : ""}`}
            ref={sheetRef}
            onMouseOver={
              links.length
                ? (event) => {
                    const number = pairOfLine(event.target);
                    if (number !== litPair) lightPair(number);
                  }
                : undefined
            }
            onMouseLeave={links.length ? () => lightPair(null) : undefined}
            onClick={
              links.length
                ? (event) => {
                    const number = pairOfLine(event.target);
                    if (number !== null) lightPair(number, true);
                  }
                : undefined
            }
          >
            {questionUp && question.trim() ? (
              <section className="pb-question" aria-label={questionLabel}>
                <span className="sj-eyebrow">{questionLabel}</span>
                <div
                  className="pb-question-text pb-stroke"
                  data-ink=""
                  style={{ "--stroke": "1100ms" } as CSSProperties}
                >
                  <Maths text={question} />
                </div>
              </section>
            ) : null}

            <div className="pb-lesson">
              {lines.slice(0, shown).map((line, index) => {
                const current = index === shown - 1;
                const items = current
                  ? line.items.slice(0, itemsShown)
                  : line.items;
                // Whiteboard: a moment that starts a section puts its heading up first.
                const heading =
                  whiteboard && line.section ? (
                    <SectionHeading key={`section-${index}`} text={line.section} />
                  ) : null;
                if (items.length === 0) return heading;
                // The line of a lit pair lights with its marks: one explanation, lit together.
                const litHere =
                  litPair !== null && links.some((link) => link.line === index && link.number === litPair);
                const lineDiv = (
                  <div
                    key={line.say + String(index)}
                    data-line={index}
                    className={`pb-line ${line.answer ? "answer" : ""}${
                      litHere && litPair !== null ? ` lit pair-${(litPair - 1) % PAIR_COLOURS}` : ""
                    }`}
                  >
                    {line.answer ? (
                      <span className="pb-answer-tag sj-mono">Answer</span>
                    ) : null}
                    {line.answer && whiteboard ? (
                      <>
                        <Sparkle className="a" />
                        <Sparkle className="b" />
                      </>
                    ) : null}
                    {items.map((item, piece) => (
                      <div
                        key={item + String(piece)}
                        className={current ? "pb-item pb-stroke" : "pb-item"}
                        data-ink={current ? "" : undefined}
                        // Written left to right as its words begin, at a hand's pace for its
                        // length, and always finished within the time its words take.
                        style={
                          current
                            ? ({
                                "--stroke": `${strokeMs(item, handMs)}ms`,
                              } as CSSProperties)
                            : undefined
                        }
                      >
                        <Maths text={item} />
                      </div>
                    ))}
                  </div>
                );
                return heading ? [heading, lineDiv] : lineDiv;
              })}
            </div>

            {/*
              Earlier questions and what was written under them. Kept, because a board is not
              wiped between questions — a student who asked something ten minutes ago should
              still be able to look back and find it.
            */}
            {written.map((line, index) =>
              line.kind === "drawn" ? (
                <div
                  key={`kept-${index}`}
                  className="pb-coachline kept drawing"
                >
                  <span className="pb-tag sj-mono">coach</span>
                  <span dangerouslySetInnerHTML={{ __html: line.text }} />
                </div>
              ) : line.kind !== "coach" ? (
                <div key={`kept-${index}`} className="pb-asked kept">
                  <span className="pb-tag sj-mono">{line.kind}</span>
                  <span>{line.text}</span>
                </div>
              ) : (
                <div key={`kept-${index}`} className="pb-coachline kept">
                  <span className="pb-tag sj-mono">coach</span>
                  <div className="pb-item">
                    <Maths text={line.text} />
                  </div>
                </div>
              ),
            )}

            {/*
              What the coach is writing now, under the reviewed working and marked as the
              coach's own hand rather than the board's. The question they asked goes up first,
              the way a teacher writes the question down before answering it.
            */}
            {asked !== null ? (
              <div className="pb-asked" data-follow="">
                <span className="pb-tag sj-mono">{askedKind}</span>
                <span>{asked}</span>
              </div>
            ) : null}
            {/*
              FLATTENED, AND EVERY LINE KEYED. Mapping beats to arrays of lines left the outer
              array unkeyed, so React rebuilt the whole run of board lines whenever a new beat
              arrived — which restarted the writing animation on every line already up, and
              each new line appeared to wipe the ones before it off the board.
            */}
            {beats.slice(0, played).flatMap((beat, index) =>
              beat.board.map((line, row) =>
                line.kind === "draw" ? (
                  <div
                    key={`coach-${index}-${row}`}
                    className="pb-coachline drawing"
                  >
                    <span className="pb-tag sj-mono">coach</span>
                    {/*
                      The server has already reduced this to a whitelist of shapes — no script,
                      no foreignObject, no URL of any kind — which is why it can be set as
                      markup here. The sanitising is done there because that is where it can be
                      tested, and it is the only place this markup is ever allowed in from.
                    */}
                    <span dangerouslySetInnerHTML={{ __html: line.text }} />
                  </div>
                ) : (
                  <div key={`coach-${index}-${row}`} className="pb-coachline">
                    <span className="pb-tag sj-mono">coach</span>
                    <div
                      className="pb-item pb-stroke"
                      data-ink=""
                      // Long lines take longer to write, the way a hand does — up to a point.
                      style={
                        {
                          "--stroke": `${Math.min(1800, inkMs(line.text))}ms`,
                        } as CSSProperties
                      }
                    >
                      <Maths text={line.text} />
                    </div>
                  </div>
                ),
              ),
            )}

            <Marks
              sheetRef={sheetRef}
              sets={markSets}
              paused={paused}
              speed={speed}
              band={viewBand}
              links={links}
              lit={litPair}
              joined={joined}
              onLit={lightPair}
              layoutRef={layoutRef}
            />
            <DoodleLayer
              sheetRef={sheetRef}
              moments={lines}
              shown={shown}
              itemsShown={itemsShown}
              pointing={pointing}
              doodles={lesson?.doodles}
              paused={paused}
              links={doodleLinks}
              lit={litPair}
              onLit={lightPair}
              panel={sceneSide ? scenePanel : null}
              hold={whiteboard ? doodleHold : undefined}
              clipAt={clipAt}
            />
            <DiagramLayer
              sheetRef={sheetRef}
              moments={lines}
              shown={shown}
              itemsShown={itemsShown}
              pointing={pointing}
              paused={paused}
              speed={speed}
              links={diagramLinks}
              lit={litPair}
              onLit={lightPair}
              panel={sceneSide ? scenePanel : null}
              hold={whiteboard ? diagramHold : undefined}
            />
            <Pen
              sheetRef={sheetRef}
              active={penActive}
              tick={inkTick}
              canSee={penCanSee}
            />
            {whiteboard ? <WhiteboardFx stageRef={stageRef} paused={paused || needsTap} sets={markSets} /> : null}
          </div>
          {hasSide && figureLinks.length + links.filter((link) => link.figure === "passage").length ? (
            <Links
              deskRef={deskRef}
              sheetRef={sheetRef}
              links={links.filter((link) => link.figure !== "doodle")}
              lit={litPair}
              layoutRef={layoutRef}
              onLit={lightPair}
              onJoined={setJoined}
              band={viewBand}
            />
          ) : null}
          </div>
        </div>

        {/*
          THE COACH, NOT A TRANSCRIPT. This used to carry every sentence the coach had said,
          which grew over the board and hid the working underneath it — the thing the student
          is meant to be looking at. The voice says the words; this only says who is talking
          and whether they are talking now.

          THE CAPTION COMES BACK WHEN THE VOICE CANNOT. A lesson that exists only as sound is
          a lesson lost to a muted phone, a failed call or a student who cannot hear it, so
          where there is no audio the sentence is written out instead.
        */}
        {/* Measured for the room it takes over the board: the coach's box when it is up, else
            just the buddy (the box is gone while the lesson is heard). */}
        <div className="pb-coachdock" ref={coachRef}>
          <div className="pb-col">
            {coachShown ? (
            <div
              className={`pb-coach ${paused ? "paused" : ""} ${
                talking ? "talking" : ""
              } ${showCaption || showTranscript ? "" : "slim"} ${
                showCaption && !showTranscript ? "subtitle" : ""
              }`}
              aria-live="polite"
            >
              <span className="pb-avatar">
                <Coach
                  faceRef={faceRef}
                  speaking={talking}
                  listening={recording}
                />
              </span>
              <div className="pb-coach-body">
                <div className="pb-who sj-mono">
                  <span className="pb-dot" />
                  {status}
                </div>
                {showTranscript ? (
                  <div className="pb-spoken">
                    {beats.slice(0, played).map((beat, index) =>
                      beat.said ? (
                        <p
                          key={`said-${index}`}
                          className={speaking === index ? "now" : ""}
                        >
                          <Maths text={beat.said} />
                        </p>
                      ) : null,
                    )}
                  </div>
                ) : showCaption ? (
                  <p className="pb-caption">
                    {waiting ? (
                      "Let me look at that with you…"
                    ) : (
                      <Maths text={caption} />
                    )}
                  </p>
                ) : null}
              </div>
            </div>
            ) : null}

          </div>
        </div>
      </main>

      <footer className="pb-dock">
        {earlier.length ? (
          <div className="pb-col pb-earlier">
            <button
              type="button"
              className="pb-earlier-toggle"
              aria-expanded={earlierOpen}
              onClick={() => setEarlierOpen((open) => !open)}
            >
              {earlierOpen ? "Hide" : "Show"} your earlier questions ({earlier.length})
            </button>
            {earlierOpen ? (
              <div className="pb-earlier-list">
                {earlier.map((turn, index) => (
                  <div key={index} className="pb-earlier-turn">
                    <p className="pb-earlier-me">{turn.asked}</p>
                    <div className="pb-earlier-coach">
                      {turn.lines.map((line, n) => (
                        <p key={n} className={line.channel}>
                          <Maths text={line.text} />
                        </p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        {lines.length > 1 ? (
          <Timeline
            lines={lines}
            shown={shown}
            onSeek={seek}
          />
        ) : null}
        <div className={`pb-col pb-dock-in ${noAsk ? "no-ask" : ""}`}>
          <div className="pb-ctl" role="group" aria-label="Lesson controls">
            <button
              type="button"
              title="Previous step"
              aria-label="Previous step"
              onClick={() => seek(shown - 1)}
              disabled={shown <= 1}
            >
              <IconBack />
            </button>
            <button
              type="button"
              title={paused ? "Resume" : "Pause"}
              aria-label={paused ? "Resume" : "Pause"}
              aria-pressed={paused}
              onClick={() => {
                resume();
                setPaused((value) => !value);
              }}
              disabled={finished}
            >
              {paused ? <IconPlay /> : <IconPause />}
            </button>
            <button
              type="button"
              className={`next ${finished ? "done" : ""}`}
              title={nextLabel}
              aria-label={nextLabel}
              onClick={() => {
                resume();
                following.current = true;
                if (finished) onDone();
                else advance();
              }}
            >
              {finished ? <IconCheck /> : <IconNext />}
            </button>
            {whiteboard ? <BoardTuningControls {...tuning} /> : null}
            <button
              type="button"
              className={`pb-cc sj-mono ${captions ? "on" : ""}`}
              title={captions ? "Hide the words" : heard ? "Show the words" : "No sound: show the words"}
              aria-label={captions ? "Hide the words" : "Show the words"}
              aria-pressed={captions}
              onClick={toggleCaptions}
            >
              CC
            </button>
            {/* A PHONE: asking opens from here, not a box always under the board. */}
            {noAsk || askLocked ? null : (
              <button
                type="button"
                className="pb-askbtn"
                title="Ask the coach"
                aria-label="Ask the coach"
                aria-expanded={askOpen}
                onClick={() => {
                  setAskOpen((open) => !open);
                  setPaused(true);
                }}
              >
                <IconAsk />
              </button>
            )}
          </div>


          {noAsk ? null : askLocked ? (
            <div className="pb-ask pb-ask-locked">{askLocked}</div>
          ) : (
          <form
            className={`pb-ask ${askOpen ? "open" : ""}`}
            onSubmit={(event) => {
              setAskOpen(false);
              void send(event);
            }}
          >
            <button
              type="button"
              className="pb-ask-close"
              aria-label="Close"
              onClick={() => setAskOpen(false)}
            >
              <IconClose />
            </button>
            <div className={`pb-askbox ${recording ? "recording" : ""}`}>
              <input
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value);
                  // A student typing a question is no longer reading the board, and a step
                  // that scrolls past mid-sentence is the step they were about to ask about.
                  if (event.target.value !== "") setPaused(true);
                }}
                onKeyDown={(event) => {
                  // Submitted here rather than left to the form, because this box is mostly
                  // used on a phone, where sending is the keyboard's own Go key and not a tap
                  // on the button beside it.
                  if (event.key === "Enter") {
                    setAskOpen(false);
                    void send(event);
                  }
                }}
                placeholder={
                  stepIndex === null
                    ? "Ask about the working…"
                    : `Ask about step ${stepIndex + 1}…`
                }
                aria-label="Ask the coach about this working"
                maxLength={ASK_MAX_CHARS}
                disabled={waiting}
                enterKeyHint="send"
              />
              {onListen ? (
                <button
                  className={`pb-mic ${recording ? "on" : ""}`}
                  type="button"
                  onClick={() =>
                    void (recording ? stopRecording() : startRecording())
                  }
                  disabled={waiting || listening}
                  aria-label={recording ? "Stop recording" : "Ask by speaking"}
                  aria-pressed={recording}
                  title={recording ? "Stop recording" : "Ask by speaking"}
                >
                  {listening ? (
                    <span className="pb-busy" aria-hidden="true" />
                  ) : recording ? (
                    <IconStop />
                  ) : (
                    <IconMic />
                  )}
                </button>
              ) : null}
              <button
                className="pb-send"
                type="submit"
                disabled={waiting || draft.trim() === ""}
                aria-label="Ask the coach"
                title="Ask the coach"
              >
                {waiting ? (
                  <span className="pb-busy" aria-hidden="true" />
                ) : (
                  <IconSend />
                )}
              </button>
            </div>
            <span className={`pb-note ${askIssue ? "issue" : ""}`}>
              {askIssue
                ? askIssue
                : voiceBlocked
                  ? "I cannot play the voice here, so the lesson is written out instead."
                  : recording
                    ? "Listening… press stop when you have finished your question."
                    : listening
                      ? "Writing down what you said…"
                      : turn && turn.asks_left <= LOW_ON_ASKS
                        ? `${turn.asks_left} more question${turn.asks_left === 1 ? "" : "s"} today.`
                        : "Lost a step? Ask about it — the coach answers from this working."}
            </span>
          </form>
          )}
          {/* The coach's buddy, at the right of the dock (founder, 12 Nov 2026: not over the board),
              reacting to the lesson as it goes (Buddy.tsx). */}
          <Buddy
            moment={shown > 0 ? lines[shown - 1] : undefined}
            index={shown - 1}
            marked={pointing !== null && pointing === shown - 1}
            finished={finished}
            paused={paused}
          />
        </div>
      </footer>
    </div>
  );
}

/* ---- Marks: circles, underlines, arrows, highlights and crossings-out over the board ----- */

type MarkState = "live" | "past" | "gone";

interface MarkSet {
  /** The line (entry) whose beat draws these marks. */
  index: number;
  points: LessonPoint[];
  state: MarkState;
  /** Its beat is the one being said: its marks play out in full. An earlier beat's are hurried
   *  to the end of any that are still under way. */
  live?: boolean;
  /** When each mark starts, in seconds after it goes up (ink.ts, `planMarks`). */
  delays?: number[];
  /** How fast its moving pieces go, as a share of their natural time. */
  pace?: number;
}

interface Shape {
  key: string;
  kind: LessonPoint["kind"];
  state: MarkState;
  d: string;
  /** A highlighter's breadth, where the mark is one. */
  width?: number;
  head: string | null;
  label: Label | null;
  /**
   * Seconds after its moment's marks start that this one is drawn: a moment's marks go up one
   * after another, in the order the lesson lists them, so the eye can follow each in turn.
   */
  delay?: number;
  /** A piece being carried to where it goes, for a `move`. */
  ghost?: Ghost;
  /** A move made in an earlier beat than the newest: its trace drawn a little thinner. */
  older?: boolean;
  /** For a piece brought from far above: a highlighter flash over where it came from. */
  flash?: { d: string; width: number };
  /** For a piece carried from far above: its flight, played once (see `useFlights`). */
  flight?: Flight;
  /** Its moment is over: whatever of it is still moving is finished quickly. */
  hurry?: boolean;
}

/** A piece carried from far up the board: what flies, from where, to where, and how. */
interface Flight {
  glyphs: Glyph[];
  from: Box;
  to: Box;
  route: Route;
  /** The highlighter over the piece where it was written, lit as it lifts off. */
  flash?: { d: string; width: number };
  /** How fast it goes, as a share of its natural time (`FLIGHT_SCROLL_MS` and on, ink.ts). */
  pace: number;
}

/**
 * More rows than this between a piece and where it goes, and it is not carried the whole way:
 * a curve around even one row of writing reads as a bracket. Only a piece carried from the row
 * just above travels the whole way; anything further comes in on a short hook, with a chip
 * saying where it came from and a flash on the source.
 */
const FAR_ROWS = 0;

/** How many lines of the working are on the board between two moments' lines. */
function linesBetween(sheet: HTMLElement, a: number, b: number): number {
  let count = 0;
  for (let at = Math.min(a, b) + 1; at < Math.max(a, b); at += 1) if (lineAt(sheet, at)) count += 1;
  return count;
}

/**
 * The way a piece flies from far up the board down to where it goes: out to the right of the
 * two pieces and down, so it is not dragged through the writing between. Drawn only while it
 * flies; what stays is the short hook into the piece.
 */
function flightRoute(from: Box, to: Box, maxX: number): Route {
  const a: Pt = [(from.left + from.right) / 2, (from.top + from.bottom) / 2];
  const b: Pt = [(to.left + to.right) / 2, (to.top + to.bottom) / 2];
  const bow = Math.min(maxX - 8, Math.max(from.right, to.right) + 70);
  return cubicRoute(a, [bow, a[1] + (b[1] - a[1]) * 0.15], [bow, b[1] - (b[1] - a[1]) * 0.3], b);
}

/**
 * The words for a piece brought from far above: the mark's own words and the piece it came
 * from — "given · 72 above" — so the student can find it on the board.
 */
function fromWords(text: string | null, at: string | null | undefined): string {
  const inner = at ? (/\[\[([\s\S]+?)\]\]/.exec(at)?.[1] ?? at) : "";
  const piece = inner
    .replace(/∘/g, "°")
    .replace(/\s+/g, " ")
    // The signs round a piece pick it out on its line; they are not what it is called.
    .replace(/^[\s=+×÷,:;]+|[\s=+×÷,:;]+$/g, "");
  const where = piece ? `${piece} above` : "from above";
  return text ? `${text} · ${where}` : where;
}

/**
 * A short hooked arrow into a piece from the gap over its row: along the gap from the right
 * of the piece (the left where the right has no room) and down onto it.
 */
function stubRoute(
  to: Box,
  writing: Box[],
  layout: ChipLayout,
  minX: number,
  maxX: number,
  rnd: () => number,
): { route: Route } {
  const tx = (to.left + to.right) / 2;
  const cy = (to.top + to.bottom) / 2;
  const row = writing.filter((o) => o.top < cy && o.bottom > cy);
  const top = Math.min(to.top, ...row.map((o) => o.top));
  const above = Math.max(top - 40, ...writing.filter((o) => o.bottom <= top + 1).map((o) => o.bottom));
  const gy = Math.max((above + top) / 2, top - 16);
  const tip: Pt = [tx, to.top - 3];
  const reach = 46;
  const clear = (x: number) => !layout.trailWithin({ left: Math.min(x, tx) + 4, top: gy - 4, right: Math.max(x, tx) - 4, bottom: gy + 4 });
  const right = tx + reach <= maxX && clear(tx + reach);
  const left = tx - reach >= minX && clear(tx - reach);
  const sx = right || !left ? Math.min(maxX, tx + reach) : tx - reach;
  const start: Pt = [sx, gy - 2];
  const route = cubicRoute(start, [tx + (sx - tx) * 0.25, gy - 3], [tx, gy], tip);
  return { route: unsteady(route, rnd, 0.5) };
}

/** A run of a piece's glyphs, in the font it is set in, placed on the sheet. */
interface Glyph {
  text: string;
  left: number;
  top: number;
  height: number;
  font: string;
}

/** A `move`: the piece's glyphs, where they start and land, and the way between. */
interface Ghost {
  glyphs: Glyph[];
  from: Box;
  to: Box;
  route: Route;
  /** How long the lift, the journey and the landing take, in milliseconds. */
  lift: number;
  travel: number;
  land: number;
}

/** How long a moving piece is lifted, carried and set down: the carry scales with the way, and
 *  the whole with its moment's pace (`planMarks`, ink.ts). */
function moveTimes(route: Route, pace = 1): { lift: number; travel: number; land: number } {
  const lengths = distances(route);
  const way = lengths[lengths.length - 1] ?? 0;
  const travel = Math.min(1500, Math.max(650, way * 2.2));
  return {
    lift: Math.round(320 * pace),
    travel: Math.round(travel * pace),
    land: Math.round(700 * pace),
  };
}

/**
 * One character of board text as it is matched: spaces gone, every minus the same minus, and
 * — so a mark finds its words in a plain English sentence as well as in maths — case, the
 * punctuation around words and the `*` a lesson marks its target word with ignored.
 */
function fold(char: string): string {
  if (/[\s​-‍⁠﻿]/.test(char)) return "";
  if (char === "−" || char === "–") return "-";
  if (/[.,;:!?'"`*‘’“”…]/.test(char)) return "";
  const lower = char.toLowerCase();
  return lower.length === 1 ? lower : char;
}

/** The text of a line (leaving out KaTeX's hidden copy), one node at a time. */
function textNodes(root: Element): Text[] {
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (node.parentElement?.closest(".katex-mathml")) continue;
    if (node.data.trim() === "") continue;
    nodes.push(node);
  }
  return nodes;
}

function union(rects: DOMRect[]): Box | null {
  let box: Box | null = null;
  for (const r of rects) {
    if (r.width < 0.5 || r.height < 0.5) continue;
    box = box
      ? {
          left: Math.min(box.left, r.left),
          top: Math.min(box.top, r.top),
          right: Math.max(box.right, r.right),
          bottom: Math.max(box.bottom, r.bottom),
        }
      : { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  }
  return box;
}

/**
 * Where the ink of an element sits on the screen — the glyphs, not the block around them, so
 * a circle hugs the words — or where one piece of it sits when `at` names it.
 */
function inkBox(root: Element, at?: string | null): Box | null {
  return union(inkRects(root, at));
}

/**
 * The same, row by row: one box for each line of text the ink runs across, so a highlight
 * or a crossing-out over words that wrap follows the words rather than filling the block.
 */
function inkRows(root: Element, at?: string | null): Box[] {
  const rows: Box[] = [];
  const rects = inkRects(root, at)
    .filter((r) => r.width >= 0.5 && r.height >= 0.5)
    .sort((a, b) => a.top - b.top || a.left - b.left);
  for (const r of rects) {
    const middle = (r.top + r.bottom) / 2;
    const row = rows.find(
      (box) => middle > box.top && middle < box.bottom,
    );
    if (row) {
      row.left = Math.min(row.left, r.left);
      row.right = Math.max(row.right, r.right);
      row.top = Math.min(row.top, r.top);
      row.bottom = Math.max(row.bottom, r.bottom);
    } else rows.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
  }
  return rows;
}

/**
 * What a mark's `at` looks for, folded the way the board's text is. Where the piece occurs
 * more than once, the words around it pick it out and `[[ ]]` marks the part meant — `6[[2]]`
 * finds "62" and marks only its 2 — so the whole is searched for and only the inside kept.
 */
function piece(at: string): { needle: string; skip: number; take: number } {
  const folded = (text: string) => Array.from(text).map(fold).join("");
  const parts = /^([\s\S]*?)\[\[([\s\S]+?)\]\]([\s\S]*)$/.exec(at);
  if (!parts) {
    const needle = folded(at);
    return { needle, skip: 0, take: needle.length };
  }
  const before = folded(parts[1] ?? "");
  const inside = folded(parts[2] ?? "");
  return { needle: before + inside + folded(parts[3] ?? ""), skip: before.length, take: inside.length };
}

/**
 * Whether a text node is the small row KaTeX sets over a plain base: the index numbers of
 * `\overset{3}{1}\overset{2}{0}…`, written over the digits as a student writes them before
 * expanding a number in its base. Read in the page's order they would come between the digits
 * ("1 3 0 2 …"), so a mark's `at` leaves them out and names the number as it reads. A large
 * operator's limits (a sum's) are kept.
 */
function indexRow(node: Text): boolean {
  const limits = node.parentElement?.closest(".op-limits");
  if (!limits || limits.querySelector(".op-symbol")) return false;
  const stack = limits.querySelector(":scope > .vlist-t > .vlist-r > .vlist");
  if (!stack) return false;
  const layers = Array.from(stack.children);
  const base = layers.findIndex((layer) => layer.querySelector(".mop") && !layer.querySelector(".mtight"));
  const at = layers.findIndex((layer) => layer.contains(node));
  return base >= 0 && at > base;
}

/** A piece's box grown to take in the index numbers written over it (`\overset`). */
function withIndexRow(root: Element, box: Box): Box {
  const range = document.createRange();
  let out = box;
  for (const node of textNodes(root)) {
    if (!indexRow(node)) continue;
    range.selectNodeContents(node);
    const r = range.getBoundingClientRect();
    const middle = (r.left + r.right) / 2;
    if (r.width < 0.5 || middle < box.left || middle > box.right || r.top >= box.top) continue;
    out = { left: Math.min(out.left, r.left), top: Math.min(out.top, r.top), right: Math.max(out.right, r.right), bottom: out.bottom };
  }
  return out;
}

/** One run of a piece's characters inside a single text node. */
interface Run {
  node: Text;
  start: number;
  end: number;
}

/** The runs of text a mark covers: the whole line, or the piece `at` names (the whole line if
 * it cannot be found, so a mark whose words were edited away still lands somewhere sensible). */
function inkRanges(root: Element, at?: string | null): Run[] {
  const nodes = textNodes(root);
  const whole = () => nodes.map((node) => ({ node, start: 0, end: node.data.length }));
  const wanted = at ? piece(at) : null;
  if (!wanted || !wanted.needle) return whole();
  let compact = "";
  const where: { node: Text; offset: number }[] = [];
  for (const node of nodes) {
    // The index numbers over a number's digits are not read: `at: '1011'` finds 1011₂.
    if (indexRow(node)) continue;
    for (let offset = 0; offset < node.data.length; offset += 1) {
      const char = fold(node.data.charAt(offset));
      if (!char) continue;
      compact += char;
      where.push({ node, offset });
    }
  }
  const found = compact.indexOf(wanted.needle);
  const first = found < 0 ? undefined : where[found + wanted.skip];
  if (!first) return whole();
  const runs: Run[] = [];
  let run: Run = { node: first.node, start: first.offset, end: first.offset + 1 };
  for (let i = found + wanted.skip + 1; i < found + wanted.skip + wanted.take; i += 1) {
    const next = where[i];
    if (!next) break;
    if (next.node !== run.node) {
      runs.push(run);
      run = { node: next.node, start: next.offset, end: next.offset + 1 };
    } else run.end = next.offset + 1;
  }
  runs.push(run);
  return runs;
}

/** The glyph boxes behind `inkBox`, kept to the part of a sideways-scrolling line on screen. */
function inkRects(root: Element, at?: string | null): DOMRect[] {
  const range = document.createRange();
  const rects: DOMRect[] = [];
  for (const run of inkRanges(root, at)) {
    range.setStart(run.node, run.start);
    range.setEnd(run.node, run.end);
    rects.push(...Array.from(range.getClientRects()));
  }
  // A long line scrolls sideways inside itself: keep the mark to the part that is on screen.
  const frame = root.getBoundingClientRect();
  return rects
    .map((r) => {
      const left = Math.max(r.left, frame.left);
      const right = Math.min(r.right, frame.right);
      return new DOMRect(left, r.top, Math.max(0, right - left), r.height);
    })
    .filter((r) => r.width > 0);
}

/**
 * A piece's own glyphs, each run with the font it is set in, relative to the sheet: what a
 * `move` lifts off the board and carries. Copied as text in the same face, size and place —
 * not as KaTeX's markup, whose layout depends on the boxes around it and falls apart when a
 * fragment of it is taken out on its own.
 */
function inkGlyphs(root: Element, at: string | null | undefined, base: DOMRect): Glyph[] {
  const range = document.createRange();
  const glyphs: Glyph[] = [];
  for (const run of inkRanges(root, at)) {
    range.setStart(run.node, run.start);
    range.setEnd(run.node, run.end);
    const rect = range.getBoundingClientRect();
    const parent = run.node.parentElement;
    if (!parent || rect.width < 0.5) continue;
    const style = window.getComputedStyle(parent);
    glyphs.push({
      text: run.node.data.slice(run.start, run.end),
      left: rect.left - base.left,
      top: rect.top - base.top,
      height: rect.height,
      font: `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`,
    });
  }
  return glyphs;
}

function relative(box: Box, base: DOMRect): Box {
  return {
    left: box.left - base.left,
    top: box.top - base.top,
    right: box.right - base.left,
    bottom: box.bottom - base.top,
  };
}

function lineAt(sheet: HTMLElement, index: number): HTMLElement | null {
  return sheet.querySelector<HTMLElement>(`[data-line="${index}"]`);
}

/** The newest line on the board at or before `index`: where a beat's arrows start from. */
function lineFrom(sheet: HTMLElement, index: number): HTMLElement | null {
  for (let at = index; at >= 0; at -= 1) {
    const found = lineAt(sheet, at);
    if (found) return found;
  }
  return null;
}

function drawUnderline(box: Box, rnd: () => number): string {
  const x0 = box.left - 3;
  const x1 = box.right + 6;
  const y = box.bottom + 3;
  const points: Pt[] = [];
  for (let i = 0; i < 5; i += 1) {
    const t = i / 4;
    points.push([x0 + (x1 - x0) * t, y + (rnd() - 0.5) * 2.4 - t * 1.6]);
  }
  return through(points);
}

function drawBox(box: Box, rnd: () => number): string {
  const j = () => (rnd() - 0.5) * 3;
  const l = box.left - 7;
  const r = box.right + 7;
  const t = box.top - 5;
  const b = box.bottom + 5;
  const corner = (x: number, y: number): Pt => [x + j(), y + j()];
  const c0 = corner(l, t);
  const c1 = corner(r, t);
  const c2 = corner(r, b);
  const c3 = corner(l, b);
  const f = (p: Pt) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
  const mid = (a: Pt, z: Pt): Pt => [(a[0] + z[0]) / 2 + j(), (a[1] + z[1]) / 2 + j()];
  const end: Pt = [c0[0] + 10, c0[1] - 1.5];
  return `M${f(c0)} Q${f(mid(c0, c1))} ${f(c1)} Q${f(mid(c1, c2))} ${f(c2)} Q${f(mid(c2, c3))} ${f(c3)} Q${f(mid(c3, c0))} ${f(c0)} L${f(end)}`;
}

/** Where a piece-to-piece arrow goes, and (for its words) where it runs round the writing. */
interface Way {
  route: Route;
  /** The x of the furthest-out run of the route round the writing, or null when it goes
   * straight across. */
  lane: number | null;
  /** Half way along that run, for words beside it. */
  middle: number;
}

/** Boxes that share any height merged into one band, in the order `down` travels past them. */
function bands(boxes: Box[], down: boolean): Box[] {
  const sorted = [...boxes].sort((a, b) => a.top - b.top);
  const out: Box[] = [];
  for (const b of sorted) {
    const last = out[out.length - 1];
    if (last && b.top < last.bottom - 1) {
      last.left = Math.min(last.left, b.left);
      last.right = Math.max(last.right, b.right);
      last.bottom = Math.max(last.bottom, b.bottom);
    } else out.push({ ...b });
  }
  return down ? out : out.reverse();
}

function routeLength(corners: Pt[]): number {
  let length = 0;
  for (let i = 1; i < corners.length; i += 1)
    length += Math.hypot(corners[i]![0] - corners[i - 1]![0], corners[i]![1] - corners[i - 1]![1]);
  return length;
}

/**
 * THE WAY FROM ONE PIECE TO ANOTHER, kept off the working it annotates and off the words of
 * the marks already on it.
 *
 * On the same row — the 2 in front of a log going up to be its power — it is a small hop over
 * the words, leaving the top of one piece and landing on the top of the other, no higher than
 * the room under the line above allows (and under the row instead where there is no room over
 * it). Between a row and the row just under it, or past rows that are wholly to one side of
 * the way down, it goes straight through the gap. Only where writing between the two rows
 * really stands in the way does it go round it: into the gap under the first row, along it to
 * just past the end of the rows between, down beside them — stepping in again past rows that
 * are shorter, so it hugs the writing rather than running down the far margin — and back along
 * the gap over the last row to the piece. Round the right-hand end or the left-hand start of
 * the rows, whichever way is shorter; every corner rounded, as a hand takes it.
 */
function pieceRoute(
  from: Box,
  to: Box,
  obstacles: Box[],
  minX: number,
  maxX: number,
  rnd: () => number,
  /** Whether a trace already on the board runs through the box: a way round the writing
   * keeps a little apart from one that went that way before, rather than drawn over it. */
  taken: (box: Box) => boolean = () => false,
): Way {
  const cx = (b: Box) => (b.left + b.right) / 2;
  const cy = (b: Box) => (b.top + b.bottom) / 2;
  const fx = cx(from);
  const tx = cx(to);
  const sameRow =
    (cy(from) > to.top && cy(from) < to.bottom) || (cy(to) > from.top && cy(to) < from.bottom);
  if (sameRow) {
    const lo = Math.min(from.left, to.left) - 4;
    const hi = Math.max(from.right, to.right) + 4;
    const top = Math.min(from.top, to.top);
    const bottom = Math.max(from.bottom, to.bottom);
    const across = obstacles.filter((o) => o.left < hi && o.right > lo);
    const ceiling = Math.max(top - 60, ...across.filter((o) => o.bottom <= top + 2).map((o) => o.bottom));
    const floor = Math.min(bottom + 60, ...across.filter((o) => o.top >= bottom - 2).map((o) => o.top));
    const roomAbove = top - ceiling;
    const roomBelow = floor - bottom;
    const above = roomAbove >= 14 || roomAbove >= roomBelow;
    const room = above ? roomAbove : roomBelow;
    const rise = Math.max(7, Math.min(Math.abs(tx - fx) * 0.32, 30, room - 5));
    // A cubic whose two handles are level reaches three quarters of the way to them.
    const pull = rise / 0.75;
    const start: Pt = above ? [fx, from.top - 2] : [fx, from.bottom + 2];
    const tip: Pt = above ? [tx, to.top - 2] : [tx, to.bottom + 2];
    const edge = above ? Math.min(start[1], tip[1]) - pull : Math.max(start[1], tip[1]) + pull;
    const lean = (tx - fx) * 0.08;
    const route = cubicRoute(start, [fx + lean, edge], [tx - lean, edge], tip);
    return { route: unsteady(route, rnd, 0.6), lane: null, middle: above ? top - rise : bottom + rise };
  }
  const down = cy(to) > cy(from);
  const between = obstacles.filter((o) => {
    const m = cy(o);
    return down ? m > from.bottom && m < to.top : m < from.top && m > to.bottom;
  });
  const start: Pt = down ? [fx, from.bottom + 2] : [fx, from.top - 2];
  const tip: Pt = down ? [tx, to.top - 3] : [tx, to.bottom + 3];
  const direct = (): Way => {
    const gap = tip[1] - start[1];
    const route = cubicRoute(start, [fx, start[1] + gap * 0.85], [tx, tip[1] - gap * 0.85], tip);
    return { route: unsteady(route, rnd, 0.8), lane: null, middle: (start[1] + tip[1]) / 2 };
  };
  // Writing between the rows that is all to one side of the way down is not in the way.
  const lo = Math.min(fx, tx) - 10;
  const hi = Math.max(fx, tx) + 10;
  if (!between.some((o) => o.left < hi && o.right > lo)) return direct();
  // The edges of the rows the two pieces sit in, so the run along a gap clears the whole row
  // (a fraction's denominator under a piece in its numerator, say), not just the piece.
  const rowOf = (b: Box) => obstacles.filter((o) => o.top < cy(b) && o.bottom > cy(b));
  const fromRow = rowOf(from);
  const toRow = rowOf(to);
  const fromEdge = down
    ? Math.max(from.bottom, ...fromRow.map((o) => o.bottom))
    : Math.min(from.top, ...fromRow.map((o) => o.top));
  const toEdge = down
    ? Math.min(to.top, ...toRow.map((o) => o.top))
    : Math.max(to.bottom, ...toRow.map((o) => o.bottom));
  const rows = bands(between, down);
  const near = (b: Box) => (down ? b.top : b.bottom);
  const far = (b: Box) => (down ? b.bottom : b.top);
  const gy1 = (fromEdge + near(rows[0]!)) / 2;
  const gy2 = (far(rows[rows.length - 1]!) + toEdge) / 2;

  // Round one end of the rows: `sign` 1 past their right-hand ends, -1 before their starts.
  const round = (sign: 1 | -1): { corners: Pt[]; lane: number; middle: number } | null => {
    const out = (x: number, y: number) => (sign > 0 ? Math.max(x, y) : Math.min(x, y));
    const edges = rows.map((b) => (sign > 0 ? b.right + 16 : b.left - 16));
    // Out as far as the furthest row still to come, in again past it: a single bulge, so the
    // way never weaves in and out between rows of different lengths.
    const before: number[] = [];
    edges.forEach((e, i) => before.push(i ? out(before[i - 1]!, e) : e));
    const after: number[] = new Array(edges.length);
    for (let i = edges.length - 1; i >= 0; i -= 1)
      after[i] = i < edges.length - 1 ? out(after[i + 1]!, edges[i]!) : edges[i]!;
    const lanes = edges.map((_, i) => (sign > 0 ? Math.min(before[i]!, after[i]!) : Math.max(before[i]!, after[i]!)));
    // Steps of less than a couple of letters are not worth a corner: keep to the outer line.
    const runs: { x: number; first: number; last: number }[] = [];
    lanes.forEach((x, i) => {
      const run = runs[runs.length - 1];
      if (run && Math.abs(run.x - x) < 28) {
        run.x = out(run.x, x);
        run.last = i;
      } else runs.push({ x, first: i, last: i });
    });
    for (const run of runs) {
      const top = Math.min(near(rows[run.first]!), far(rows[run.last]!));
      const bottom = Math.max(near(rows[run.first]!), far(rows[run.last]!));
      for (let step = 0; step < 4 && taken({ left: run.x - 4, top, right: run.x + 4, bottom }); step += 1)
        run.x += sign * 9;
    }
    if (runs.some((run) => run.x < minX + 4 || run.x > maxX - 4)) return null;
    const corners: Pt[] = [start, [fx, gy1], [runs[0]!.x, gy1]];
    for (let r = 0; r < runs.length - 1; r += 1) {
      const leave = rows[runs[r]!.last]!;
      const enter = rows[runs[r + 1]!.first]!;
      const gy = (far(leave) + near(enter)) / 2;
      corners.push([runs[r]!.x, gy], [runs[r + 1]!.x, gy]);
    }
    corners.push([runs[runs.length - 1]!.x, gy2], [tx, gy2], tip);
    const outer = runs.reduce((best, run) => (sign * run.x > sign * best.x ? run : best));
    const middle = (near(rows[outer.first]!) + far(rows[outer.last]!)) / 2;
    return { corners, lane: outer.x, middle };
  };
  const right = round(1);
  const left = round(-1);
  const best =
    right && left
      ? routeLength(right.corners) <= routeLength(left.corners) * 1.1
        ? right
        : left
      : (right ?? left);
  if (!best) return direct();
  const route = cornerRoute(best.corners, 12);
  return { route: unsteady(route, rnd, 0.9), lane: best.lane, middle: best.middle };
}

function measureMarks(sheet: HTMLElement, sets: MarkSet[], links: LinkPair[] = []): Measured {
  const base = sheet.getBoundingClientRect();
  const width = sheet.clientWidth;
  // The sheet's own side gutters are usable: arrows may bow into them but not past them.
  const minX = 6;
  const maxX = width - 6;
  const shapes: Shape[] = [];
  // Every row of writing on the board. The question's panel, the answer's card and the
  // coach's lines count as blocks.
  const writing: Box[] = [];
  sheet.querySelectorAll<HTMLElement>("[data-line]").forEach((element) => {
    for (const row of inkRows(element)) writing.push(relative(row, base));
  });
  sheet
    // A doodle (DoodleLayer.tsx) counts as writing: a mark's words and routes keep off it.
    .querySelectorAll<HTMLElement>(".pb-question, .pb-line.answer, .pb-coachline, .pb-asked, .dd-spot")
    .forEach((element) => writing.push(relative(element.getBoundingClientRect(), base)));
  const lowest = Math.max(0, ...writing.map((b) => b.bottom));
  // Chips stay within the writing: below it the coach card floats over the board.
  const layout = new ChipLayout({ left: 2, top: 0, right: width - 2, bottom: lowest + 4 });
  layout.text.push(...writing);
  // What a piece-to-piece route goes round: the writing, and the words of every mark so far.
  const obstacles = () => [...layout.text, ...layout.chips];
  // The newest beat's marks are drawn at full weight; the traces of moves before it a little
  // thinner, still whole, so the latest step stands out on a busy board.
  const newest = Math.max(-1, ...sets.map((set) => set.index));
  const dots: PairDot[] = [];
  const anchors = new Map<string, Pt>();
  const dotted = new Map<number, Pt>();
  const dotBoxes = new Map<number, Box>();
  let stagger = 0;
  let hurry = false;
  const push = (shape: Shape) => {
    shapes.push({ ...shape, delay: stagger, hurry });
  };
  // In the order the lesson made them, so a chip that went up early keeps its place when later
  // marks join it, and every later chip and route finds its way round the ones before.
  for (const set of [...sets].sort((a, b) => a.index - b.index)) {
    // Each mark in a moment waits its turn in the moment's plan; a move goes at its pace.
    const delays = setDelays(set);
    const pace = set.pace ?? 1;
    hurry = set.live === false;
    const older = set.index !== newest;
    // This moment's pairs with a diagram: a numbered dot after the end of the line each pairs
    // with (one to a line, placed before the moment's words take the room), and where the
    // line across starts — the piece named, else the dot.
    for (const link of links.filter((pair) => pair.set === set.index)) {
      const line = lineAt(sheet, link.line);
      if (!line) continue;
      if (!dotted.has(link.number)) {
        const rows = inkRows(line).map((row) => relative(row, base));
        const last = rows[rows.length - 1];
        if (!last) continue;
        const spot = layout.placeBox(
          DOT_SIZE,
          DOT_SIZE,
          [[last.right + 10, (last.top + last.bottom) / 2]],
          [last.right + 10, (last.top + last.bottom) / 2],
        );
        const centre: Pt = spot ? [spot.left + DOT_SIZE / 2, spot.top + DOT_SIZE / 2] : [last.right + 10 + DOT_SIZE / 2, (last.top + last.bottom) / 2];
        dotted.set(link.number, centre);
        if (spot) dotBoxes.set(link.number, spot);
        dots.push({ number: link.number, line: link.line, x: centre[0], y: centre[1], keys: [] });
      }
      const dot = dots.find((one) => one.number === link.number);
      dot?.keys.push(link.key);
      const found = link.piece && (!link.hint || pieceIn(line, link.piece)) ? inkBox(line, link.piece) : null;
      const piece = found ? relative(found, base) : null;
      anchors.set(
        link.key,
        piece ? [piece.right + 3, (piece.top + piece.bottom) / 2] : dotted.get(link.number)!,
      );
    }
    set.points.forEach((point, k) => {
      stagger = delays[k] ?? 0;
      // A mark on the diagram is drawn over the figure (FigureBoard.tsx), and a mark in the
      // passage in the passage (PassagePanel.tsx), not here; nor is a quote's own link.
      if (point.figure != null || point.line == null || point.passage || point.auto) return;
      // An arrow across to a diagram, or into the passage: a line under the piece it starts
      // from, the arrow's words by where it lands (a diagram) or beside the piece (a passage).
      const intoPassage = point.to?.passage === true && point.kind === "arrow";
      const across = point.to?.figure != null || intoPassage;
      const target = point.line < 0 ? set.index + point.line : point.line;
      if (target < 0 || target > set.index) return;
      const line = lineAt(sheet, target);
      if (!line) return;
      const whole = inkBox(line);
      const found = point.at ? inkBox(line, point.at) : whole;
      if (!found || !whole) return;
      // A ring or a box round a number goes round its index numbers too, not through them.
      const ringed = point.kind === "circle" || point.kind === "box" ? withIndexRow(line, found) : found;
      const box = relative(ringed, base);
      const lineBox = relative(whole, base);
      const rnd = seeded(set.index * 131 + k * 17 + target * 7 + 3);
      const key = `${set.index}-${k}`;
      const text = point.text?.trim() || null;
      /** The end of the row of writing the piece sits in, at the row's middle: where the
       * board beside a mark is clear. */
      const rowEnd = (rows: Box[]): Pt => {
        const last = rows[rows.length - 1] ?? box;
        const middle = (last.top + last.bottom) / 2;
        const end =
          inkRows(line)
            .map((row) => relative(row, base))
            .find((row) => middle > row.top && middle < row.bottom)?.right ?? last.right;
        return [Math.max(end, last.right) + 12, middle];
      };
      const chip = (options: Label[], anchor: Pt | null, words = text): Label | null =>
        words ? layout.place(words, options.map((o) => ({ ...o, text: words })), anchor) : null;
      const at = (p: Pt, side: Label["side"] = "right"): Label => ({ x: p[0], y: p[1], side, text: "" });
      // Words for a mark inside a run of text — an underlined word, a highlighted clue, a
      // crossed-out option: after the end of its row, where the board is clear, else just
      // above or below the mark.
      const inline = (rows: Box[]): Label | null => {
        const first = rows[0] ?? box;
        const last = rows[rows.length - 1] ?? box;
        const end = rowEnd(rows);
        const cx = (first.left + first.right) / 2;
        return chip(
          [at(end), at([cx, first.top - 2], "above"), at([cx, last.bottom + 2 + CHIP_HEIGHT], "above")],
          end,
        );
      };

      if (point.kind === "circle" || point.kind === "box") {
        const d = point.kind === "circle" ? drawCircle(box, rnd) : drawBox(box, rnd);
        const ry = Math.max(13, (box.bottom - box.top) / 2 + 6);
        const rx =
          point.kind === "circle" ? Math.max(ry + 5, (box.right - box.left) / 2 + 10) : (box.right - box.left) / 2 + 8;
        const cx = (box.left + box.right) / 2;
        const cy = (box.top + box.bottom) / 2;
        // The loop itself is kept clear of other marks' words.
        layout.text.push({ left: cx - rx - 2, top: cy - ry - 3, right: cx + rx + 4, bottom: cy + ry + 3 });
        // Beside the loop at its shoulder, else after the row, else over or under it.
        const end = rowEnd([box]);
        const label = chip(
          [
            at([cx + rx + 6, box.top - 2]),
            at(end),
            at([cx, cy - ry - 3], "above"),
            at([cx, cy + ry + 3 + CHIP_HEIGHT], "above"),
          ],
          end,
        );
        push({ key, kind: point.kind, state: set.state, d, head: null, label });
        return;
      }
      if (point.kind === "highlight" || point.kind === "strike") {
        const rows = inkRows(line, point.at).map((row) => relative(row, base));
        if (rows.length === 0) rows.push(box);
        const label = inline(rows);
        if (point.kind === "highlight") {
          const { d, width } = drawHighlight(rows, rnd);
          push({ key, kind: "highlight", state: set.state, d, width, head: null, label });
        } else {
          push({
            key,
            kind: "strike",
            state: set.state,
            d: drawStrike(rows, rnd),
            head: null,
            label,
          });
        }
        return;
      }
      if (point.kind === "underline" || across) {
        const d = drawUnderline(box, rnd);
        layout.text.push({ left: box.left - 4, top: box.bottom, right: box.right + 7, bottom: box.bottom + 6 });
        push({
          key,
          kind: across ? "arrow" : "underline",
          state: set.state,
          d,
          head: null,
          // An arrow across has its words on the diagram, by the point it lands on.
          label:
            across && !intoPassage ? null : inline(inkRows(line, point.at).map((row) => relative(row, base))),
        });
        return;
      }

      // PIECE TO PIECE: an arrow or a move from one piece of working to another — on the same
      // line, or from a line above — along a route that goes round the writing in between.
      if (point.kind === "arrow" || point.kind === "move") {
        const start = point.from;
        if (start) {
          const fromIndex = start.line < 0 ? set.index + start.line : start.line;
          const fromLine = fromIndex >= 0 && fromIndex <= set.index ? lineAt(sheet, fromIndex) : null;
          const fromFound = fromLine ? inkBox(fromLine, start.at) : null;
          if (!fromLine || !fromFound) return;
          const from = relative(fromFound, base);
          const moving = point.kind === "move";
          // FROM FAR ABOVE: a piece brought down from more than a couple of rows up is not
          // carried the whole way — a route that long runs down the page past everything in
          // between. Its source flashes, a short hooked arrow comes into the piece from the gap
          // above it, and the words say where it came from.
          if (linesBetween(sheet, fromIndex, target) > FAR_ROWS) {
            const stub = stubRoute(box, writing, layout, minX, maxX, rnd);
            layout.addTrail(stub.route);
            const { d, head } = arrowAlong(stub.route, moving ? 8 : 9);
            const end = rowEnd([box]);
            const words = fromWords(text, start.at);
            const label = chip([at(end), at([stub.route[0]![0] + 6, stub.route[0]![1]])], end, words);
            const rows = inkRows(fromLine, start.at).map((row) => relative(row, base));
            const lit = rows.length ? drawHighlight(rows, rnd) : undefined;
            // A move plays its flight (see `useFlights`): the piece lifted off where it was
            // written and carried down, the board following it. Where the student has asked
            // for less movement, and for an arrow, the source only lights up.
            // An earlier moment's flight is kept, for one still under way to be hurried down
            // (`useFlights`); one that had not set off by then is simply put where it goes.
            const flight: Flight | undefined =
              moving && !stillMotion()
                ? {
                    glyphs: inkGlyphs(fromLine, start.at, base),
                    from,
                    to: box,
                    route: flightRoute(from, box, maxX),
                    flash: lit,
                    pace,
                  }
                : undefined;
            const flash = !flight && set.index === newest ? lit : undefined;
            push({ key, kind: point.kind, state: set.state, d, head, label, older: moving && older, flash, flight });
            return;
          }
          const way = pieceRoute(from, box, obstacles(), minX, maxX, rnd, (b) => layout.trailWithin(b));
          layout.addTrail(way.route);
          const { d, head } = arrowAlong(way.route, moving ? 8 : 10);
          const ghost: Ghost | undefined =
            moving && !stillMotion()
              ? {
                  glyphs: inkGlyphs(fromLine, start.at, base),
                  from,
                  to: box,
                  route: way.route,
                  ...moveTimes(way.route, pace),
                }
              : undefined;
          // Words after the end of the row the piece lands in, where the board is clear; else
          // beside the run round the writing, where the route has one.
          const end = rowEnd([box]);
          const options = [at(end)];
          if (way.lane !== null)
            options.push(
              way.lane > box.right ? at([way.lane + 8, way.middle]) : at([way.lane - 8, way.middle], "left"),
            );
          const label = chip(options, end);
          push({ key, kind: point.kind, state: set.state, d, head, label, ghost, older: moving && older });
          return;
        }
        // A move with nowhere to come from has nothing to carry.
        if (point.kind === "move") return;
      }

      // An arrow, from the line this beat wrote back to the one it came from.
      if (target === set.index) return;
      const fromLine = lineFrom(sheet, set.index);
      const fromInk = fromLine ? inkBox(fromLine) : null;
      if (!fromInk) return;
      const from = relative(fromInk, base);
      const fromY = (from.top + from.bottom) / 2;
      // The writing between the two lines: an arrow bowing out to the right goes round all of
      // it, not through the ends of the longer lines in between.
      const between = writing.filter((o) => {
        const m = (o.top + o.bottom) / 2;
        return m > Math.min(box.bottom, from.bottom) && m < Math.max(box.top, from.top);
      });
      // A whole line, or the end of one, is reached from the right-hand side, where the board
      // is clear; the start of a line from the left margin; a piece in the middle of a line
      // from underneath.
      const atEnd = !point.at || Math.abs(box.right - lineBox.right) < 8;
      const atStart = !atEnd && Math.abs(box.left - lineBox.left) < 8;
      let start: Pt;
      let tip: Pt;
      let c1: Pt;
      let c2: Pt;
      if (atStart) {
        start = [from.left - 6, fromY];
        tip = [box.left - 6, (box.top + box.bottom) / 2];
        const bow = Math.max(minX, Math.min(from.left, box.left) - 34);
        c1 = [bow, start[1]];
        c2 = [bow, tip[1]];
      } else if (atEnd) {
        const right = Math.max(from.right, box.right);
        let bow = right + Math.min(90, Math.max(30, Math.abs(fromY - box.top) * 0.3));
        if (bow <= maxX) {
          start = [from.right + 10, fromY];
          tip = [box.right + 9, (box.top + box.bottom) / 2];
        } else {
          // No room on the right: bow out into the left margin instead.
          const left = Math.min(from.left, box.left);
          bow = Math.max(minX, left - 34);
          start = [from.left - 6, fromY];
          tip = [box.left - 6, (box.top + box.bottom) / 2];
        }
        bow = Math.min(maxX, bow);
        c1 = [bow, start[1]];
        c2 = [bow, tip[1]];
      } else {
        start = [Math.min(maxX - 4, from.right + 10), fromY];
        tip = [(box.left + box.right) / 2, box.bottom + 5];
        c1 = [Math.min(maxX, Math.max(start[0], box.right) + 36), start[1]];
        c2 = [Math.min(maxX, tip[0] + 22), tip[1] + 40];
      }
      // Bowed out to the right, it is widened until it runs clear of the writing between, as
      // far as the gutter allows.
      if (!atStart && c1[0] >= start[0]) {
        const crosses = () => {
          for (let i = 2; i <= 30; i += 1) {
            const [x, y] = bezierAt(start, c1, c2, tip, i / 32);
            if (between.some((o) => x > o.left - 3 && x < o.right + 3 && y > o.top - 3 && y < o.bottom + 3))
              return true;
          }
          return false;
        };
        for (let n = 0; n < 40 && crosses() && Math.max(c1[0], c2[0]) < maxX; n += 1) {
          c1 = [Math.min(maxX, c1[0] + 12), c1[1]];
          c2 = [Math.min(maxX, c2[0] + 12), c2[1]];
        }
      }
      const wob = (p: Pt): Pt => [p[0] + (rnd() - 0.5) * 6, p[1] + (rnd() - 0.5) * 6];
      c1 = wob(c1);
      c2 = wob(c2);
      const f = (n: number) => n.toFixed(1);
      const d = `M${f(start[0])} ${f(start[1])} C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(tip[0])} ${f(tip[1])}`;
      const trail: Pt[] = [];
      for (let i = 0; i <= 32; i += 1) trail.push(bezierAt(start, c1, c2, tip, i / 32));
      layout.addTrail(trail);
      const mid = bezierAt(start, c1, c2, tip, 0.5);
      // Beside the bow of the arrow; for one round the start of the lines, at the line it
      // starts from, where the margin has no room.
      const label = atStart
        ? chip([at([from.right + 34, fromY])], [from.right + 12, fromY])
        : chip([at([mid[0] + 8, mid[1]]), at([mid[0] - 8, mid[1]], "left")], [mid[0] + 8, mid[1]]);
      push({
        key,
        kind: "arrow",
        state: set.state,
        d,
        head: arrowHead(tip, bezierAt(start, c1, c2, tip, 0.9)),
        label,
      });
    });
  }
  return { shapes, dots, anchors, layout: { boxes: [...layout.text, ...layout.chips], trails: layout.trailPoints(), dots: dotBoxes } };
}

/**
 * When a mark's strokes start and how long they take, as CSS variables its animations read:
 * `--delay`, its turn among its moment's marks, and for a move, `--draw`, the carry — the
 * trace is drawn behind the moving piece, keeping pace with it, and its head and words come
 * once the piece has landed.
 */
function markTiming(shape: Shape): CSSProperties {
  const delay = shape.delay ?? 0;
  if (!shape.ghost) return { "--delay": `${delay}s` } as CSSProperties;
  return {
    "--delay": `${delay + shape.ghost.lift / 1000}s`,
    "--draw": `${shape.ghost.travel}ms`,
  } as CSSProperties;
}

/**
 * A MOVE: the piece lifted off the board, carried along its route and set down on the piece it
 * becomes — the 2 in front of the log rising, crossing over and settling as the log's power,
 * growing or shrinking on the way to the size it lands at. A copy travels; the writing it was
 * copied from stays where it was, as it does on paper.
 *
 * Played once, when the mark first goes up. The board is measured again whenever it changes
 * size, but the piece has long since landed by then, and replaying it would say the step was
 * being taken again.
 */
function Carried({ shape, ghost }: { shape: Shape; ghost: Ghost }) {
  const ref = useRef<HTMLDivElement>(null);
  const played = useRef(false);
  const carry = useRef<Animation | null>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || played.current || typeof element.animate !== "function") return;
    played.current = true;
    const { from, to, route, lift, travel, land } = ghost;
    const fromCentre: Pt = [(from.left + from.right) / 2, (from.top + from.bottom) / 2];
    const toCentre: Pt = [(to.left + to.right) / 2, (to.top + to.bottom) / 2];
    const first = route[0] ?? fromCentre;
    const last = route[route.length - 1] ?? toCentre;
    // The route runs edge to edge (top of one piece to top of the other); the piece's middle
    // rides that far off it, the offset shifting from the one end's to the other's.
    const startOff: Pt = [fromCentre[0] - first[0], fromCentre[1] - first[1]];
    const endOff: Pt = [toCentre[0] - last[0], toCentre[1] - last[1]];
    const grow = Math.max(
      0.45,
      Math.min(2.2, (to.bottom - to.top) / Math.max(1, from.bottom - from.top)),
    );
    const lengths = distances(route);
    const total = lengths[lengths.length - 1] ?? 0;
    const all = lift + travel + land;
    const frames: Keyframe[] = [
      { offset: 0, opacity: 0, transform: "translate(0px, 0px) scale(1)" },
      { offset: (lift * 0.45) / all, opacity: 1, transform: "translate(0px, -4px) scale(1.08)" },
      { offset: lift / all, opacity: 1, transform: "translate(0px, -4px) scale(1.08)" },
    ];
    const steps = 24;
    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps;
      // Eased: picks up, carries, slows to set down.
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const at = along(route, lengths, e * total);
      const x = at[0] + startOff[0] + (endOff[0] - startOff[0]) * e - fromCentre[0];
      const y = at[1] + startOff[1] + (endOff[1] - startOff[1]) * e - fromCentre[1];
      const lifted = Math.sin(Math.PI * t) * 3 + (1 - t) * 4;
      const scale = (1 + (grow - 1) * e) * (1 + 0.08 * (1 - e));
      frames.push({
        offset: (lift + travel * t) / all,
        opacity: 1,
        transform: `translate(${x.toFixed(1)}px, ${(y - lifted).toFixed(1)}px) scale(${scale.toFixed(3)})`,
      });
    }
    const landed = `translate(${(toCentre[0] - fromCentre[0]).toFixed(1)}px, ${(
      toCentre[1] - fromCentre[1]
    ).toFixed(1)}px) scale(${grow.toFixed(3)})`;
    frames.push({ offset: (lift + travel + land * 0.35) / all, opacity: 1, transform: landed });
    frames.push({ offset: 1, opacity: 0, transform: landed });
    carry.current = element.animate(frames, {
      duration: all,
      delay: (shape.delay ?? 0) * 1000,
      fill: "both",
      easing: "linear",
    });
  }, [ghost, shape.delay]);
  // Its moment is over: a piece that had not set off is put where it goes, and one on its way
  // is set down within a moment, rather than landing while the coach talks about the next step.
  useEffect(() => {
    const running = carry.current;
    if (!shape.hurry || !running || running.playState === "finished") return;
    const timing = running.effect?.getComputedTiming();
    const now = Number(running.currentTime ?? 0);
    const begins = Number(timing?.delay ?? 0);
    const ends = Number(timing?.endTime ?? 0);
    if (now < begins) running.finish();
    else if (ends - now > 280) running.currentTime = ends - 280;
  }, [shape.hurry]);
  const { from } = ghost;
  return (
    <div
      ref={ref}
      className="pb-carried"
      style={{
        left: from.left,
        top: from.top,
        width: from.right - from.left,
        height: from.bottom - from.top,
      }}
    >
      {ghost.glyphs.map((glyph, i) => (
        <span
          key={i}
          style={{
            left: glyph.left - from.left,
            top: glyph.top - from.top,
            height: glyph.height,
            // After the shorthand, which would otherwise set it back to normal.
            font: glyph.font,
            lineHeight: `${glyph.height}px`,
          }}
        >
          {glyph.text}
        </span>
      ))}
    </div>
  );
}

/* ---- The working and the picture, paired ------------------------------------------------ */

/**
 * A MARK ON A DIAGRAM AND THE LINE IT GOES WITH. Every mark on a figure or sketch belongs with
 * a line of the working: the line written at its moment (the nearest earlier one where its
 * moment writes nothing), or the piece its `to` names; and an arrow across from the working
 * (`to: {figure, target}`) belongs with the piece it starts from. Each such line gets a number,
 * in the order the lesson reaches it, and the pair is shown by a line drawn across from the
 * working to the mark — kept where it runs clear of everything, and where it cannot, drawn as
 * the mark goes up and then let go, leaving the same numbered dot at both ends. A hover or a
 * tap on either dot, the line or the mark lights both ends and draws the line again.
 */
interface LinkPair {
  /** The mark's key (`<moment>-<place in its list>`), the same on the working and the diagram. */
  key: string;
  /** The line's number, from 1: every mark paired with the same line shares it. */
  number: number;
  /** The moment whose marks these are. */
  set: number;
  /** The line of the working it goes with. */
  line: number;
  /** A piece of that line: the one named, or the mark's own words if the line has them. */
  piece: string | null;
  /** Whether `piece` is only the mark's words, to be used only if the line has them. */
  hint: boolean;
  /** The diagram the mark is on, the passage, or a doodle (DoodleLayer.tsx). */
  figure: DrawingKey | "passage" | "doodle";
  /** An arrowhead at the diagram's end (an arrow across from the working)… */
  toFigure: boolean;
  /** …or at the working's end (an arrow across from the diagram). */
  toWork: boolean;
  /** When in its moment the mark goes up, in seconds. */
  delay: number;
}

/** The numbered dot at the working's end of a pair. */
interface PairDot {
  number: number;
  line: number;
  x: number;
  y: number;
  /** The marks that share it. */
  keys: string[];
}

/** Where everything on the working is (the sheet's coordinates), for a line across to keep off. */
interface BoardLayout {
  boxes: Box[];
  trails: Pt[][];
  /** Each pair's dot, which its own line across may start from. */
  dots: Map<number, Box>;
}

interface Measured {
  shapes: Shape[];
  dots: PairDot[];
  /** Where each pair's line across starts on the working. */
  anchors: Map<string, Pt>;
  layout: BoardLayout;
}

/** A pair's dot: small, round, its number in it. */
const DOT_SIZE = 18;
/** How many colours the pairs cycle through (board.css, `.pair-N`). */
const PAIR_COLOURS = 5;

function pairLinks(sets: MarkSet[], writes: (index: number) => boolean): LinkPair[] {
  const out: LinkPair[] = [];
  const numbers = new Map<number, number>();
  const back = (index: number) => {
    for (let at = index; at >= 0; at -= 1) if (writes(at)) return at;
    return -1;
  };
  for (const set of [...sets].sort((a, b) => a.index - b.index)) {
    const delays = setDelays(set);
    const moment = (line: number) => (line < 0 ? set.index + line : line);
    set.points.forEach((point, k) => {
      let figure: DrawingKey | "passage" | "doodle";
      let line: number;
      let piece: string | null = null;
      let hint = false;
      let toFigure = false;
      let toWork = false;
      if (point.passage) {
        // A mark in the passage goes with the line written at its moment, as a diagram's does.
        figure = "passage";
        line = back(set.index);
        piece = point.text?.trim() || null;
        hint = true;
      } else if (point.to?.passage && point.line != null) {
        figure = "passage";
        line = back(moment(point.line));
        piece = point.at?.trim() || null;
        toFigure = true;
      } else if (point.figure != null) {
        figure = point.figure;
        if (point.to?.line != null) {
          line = back(moment(point.to.line));
          piece = point.to.at?.trim() || null;
          toWork = true;
        } else {
          line = back(set.index);
          piece = point.text?.trim() || null;
          hint = true;
        }
      } else if (point.to?.figure != null && point.line != null) {
        figure = point.to.figure;
        line = back(moment(point.line));
        piece = point.at?.trim() || null;
        toFigure = true;
      } else if ((point.to?.doodle || point.to?.diagram) && point.line != null) {
        // A board line linked to a doodle, or to a part of one.
        figure = "doodle";
        line = back(moment(point.line));
        piece = point.at?.trim() || null;
      } else return;
      if (line < 0) return;
      if (!numbers.has(line)) numbers.set(line, numbers.size + 1);
      out.push({
        key: `${set.index}-${k}`,
        number: numbers.get(line)!,
        set: set.index,
        line,
        piece,
        hint,
        figure,
        toFigure,
        toWork,
        delay: delays[k] ?? 0,
      });
    });
  }
  return out;
}

/**
 * The marks as the diagram draws them: an arrow across from the working becomes, on the
 * diagram, a circle round the point it lands on, with the arrow's words beside it.
 */
function figureCopy(sets: MarkSet[]): MarkSet[] {
  return sets.map((set) =>
    set.points.some((point) => point.figure == null && point.to?.figure != null)
      ? {
          ...set,
          points: set.points.map((point) =>
            point.figure == null && point.to?.figure != null
              ? { kind: "circle" as const, figure: point.to.figure, target: point.to.target, text: point.text }
              : point,
          ),
        }
      : set,
  );
}

const PASSAGE_KINDS = new Set<string>(["highlight", "underline", "circle", "strike", "label"]);

/**
 * The marks as the passage draws them: its own marks as they are, and for a mark on the working
 * that links into the passage, the words it links to — highlighted, or underlined, circled or
 * struck as the working's mark is — with the pair's number.
 */
function passageCopy(sets: MarkSet[], links: LinkPair[]): PassageMark[] {
  const numbers = new Map(
    links.filter((link) => link.figure === "passage").map((link) => [link.key, link.number]),
  );
  const out: PassageMark[] = [];
  for (const set of [...sets].sort((a, b) => a.index - b.index)) {
    const delays = setDelays(set);
    set.points.forEach((point, k) => {
      const key = `${set.index}-${k}`;
      const base = { key, delay: delays[k] ?? 0, number: numbers.get(key) ?? null };
      if (point.passage && typeof point.target === "string") {
        out.push({
          ...base,
          kind: PASSAGE_KINDS.has(point.kind) ? (point.kind as PassageKind) : "highlight",
          target: point.target,
          nth: point.nth ?? 1,
          text: point.text?.trim() || null,
        });
      } else if (point.to?.passage && typeof point.to.target === "string" && point.line != null) {
        const same = point.kind === "underline" || point.kind === "circle" || point.kind === "strike";
        out.push({
          ...base,
          kind: same ? (point.kind as PassageKind) : "highlight",
          target: point.to.target,
          nth: point.to.nth ?? 1,
          text: null,
          loose: point.auto === true,
        });
      }
    });
  }
  return out;
}

/** Whether a line has the piece in it (a mark's words are only a guess at one). */
function pieceIn(root: Element, at: string): boolean {
  const wanted = piece(at).needle;
  if (!wanted) return false;
  return textNodes(root)
    .map((node) => Array.from(node.data).map(fold).join(""))
    .join("")
    .includes(wanted);
}

/** One line across, as drawn over the desk. */
interface Across {
  key: string;
  number: number;
  d: string;
  head: string | null;
  /** It runs clear of the writing, the words and the other traces, so it stays. */
  clean: boolean;
  /** Its mark has just gone up: it is drawn now (and let go again unless it is clean). */
  fresh: boolean;
  delay: number;
}

/** How long a line across that cannot stay is held once drawn, before it is let go. */
const ACROSS_HOLD_MS = 2800;

/**
 * THE LINES ACROSS, from the working to the diagram, over both. On a wide screen the figure
 * stands beside the lines, and each line goes from its piece (or its dot) across the gap to
 * the mark; on a phone the figure is pinned over the working, and it goes up to the panel's
 * bottom edge under the mark. Measured again as the board scrolls (the figure stays put while
 * the lines move), and each checked against everything on the working: one that would cross
 * writing, words or another trace is only drawn when its mark goes up, or while the pair is
 * lit, and its numbered dots say what goes with what the rest of the time.
 */
function Links({
  deskRef,
  sheetRef,
  links,
  lit,
  layoutRef,
  onLit,
  onJoined,
  band,
}: {
  deskRef: RefObject<HTMLDivElement>;
  sheetRef: RefObject<HTMLDivElement>;
  links: LinkPair[];
  lit: number | null;
  layoutRef: MutableRefObject<BoardLayout | null>;
  onLit: (number: number | null, tapped?: boolean) => void;
  onJoined: (keys: ReadonlySet<string>) => void;
  /** The part of the board in sight: a line across is only drawn from a line the student sees. */
  band: () => ViewBand | null;
}) {
  const [across, setAcross] = useState<Across[]>([]);
  const seen = useRef(new Map<string, number>());
  const joinedNow = useRef<ReadonlySet<string>>(new Set());
  useEffect(() => {
    const now = performance.now();
    for (const link of links) if (!seen.current.has(link.key)) seen.current.set(link.key, now);
  }, [links]);

  const measure = useCallback(() => {
    const desk = deskRef.current;
    const sheet = sheetRef.current;
    if (!desk || !sheet) return;
    const base = desk.getBoundingClientRect();
    const paper = sheet.getBoundingClientRect();
    const panel =
      desk.querySelector<HTMLElement>(".pb-side") ?? desk.querySelector<HTMLElement>(".pb-figpanel");
    const shelf = panel?.getBoundingClientRect();
    if (!panel || !shelf) return;
    const beside = shelf.left >= paper.right - 4;
    const shut = panel.classList.contains("shut");
    const ox = paper.left - base.left;
    const oy = paper.top - base.top;
    const layout = layoutRef.current;
    const shift = (b: Box): Box => ({ left: b.left + ox, top: b.top + oy, right: b.right + ox, bottom: b.bottom + oy });
    const boxes = (layout?.boxes ?? []).map(shift);
    const trails = (layout?.trails ?? []).map((trail) => trail.map(([x, y]) => [x + ox, y + oy] as Pt));
    const figureBox: Box = {
      left: shelf.left - base.left,
      top: shelf.top - base.top,
      right: shelf.right - base.left,
      bottom: shelf.bottom - base.top,
    };
    const now = performance.now();
    const drawn: Pt[][] = [];
    const sight = band();
    // The drawings themselves: a line across may reach into one only for its last stretch, to
    // point at its mark; running across a drawing's lines and labels would read as part of it.
    const pictures = Array.from(desk.querySelectorAll(".pb-figure img, .pp-scroll")).map((image) => {
      const r = image.getBoundingClientRect();
      return { left: r.left - base.left, top: r.top - base.top, right: r.right - base.left, bottom: r.bottom - base.top };
    });
    const out: Across[] = [];
    const still = stillMotion();
    for (const link of links) {
      const start = sheet.querySelector(`[data-link-work="${link.key}"]`)?.getBoundingClientRect();
      const end = desk.querySelector<HTMLElement>(`[data-link-fig="${link.key}"]`);
      if (!start) continue;
      if (sight && (start.top < sight.top || start.top > sight.bottom)) continue;
      const a: Pt = [start.left - base.left, start.top - base.top];
      let b: Pt;
      let route: Route;
      let shown = end && !shut && end.offsetParent !== null ? end.getBoundingClientRect() : null;
      // A place in the passage scrolled out of its window, or folded away, is not a place to go.
      const scroller = end?.closest(".pp-scroll");
      if (shown && scroller) {
        const view = scroller.getBoundingClientRect();
        if (view.height < 4 || shown.top < view.top || shown.top > view.bottom) shown = null;
      }
      if (beside) {
        if (!shown) continue;
        const point: Pt = [shown.left - base.left, shown.top - base.top];
        // Stop just short of the mark, so the line points at it rather than covering it.
        const dx = point[0] - a[0];
        const dy = point[1] - a[1];
        const length = Math.hypot(dx, dy) || 1;
        b = [point[0] - (dx / length) * 10, point[1] - (dy / length) * 10];
        const reach = Math.max(40, (b[0] - a[0]) * 0.45);
        route = cubicRoute(a, [a[0] + reach, a[1]], [b[0] - reach * 0.7, b[1]], b);
      } else {
        // Up to the bottom edge of the pinned panel, under the mark (or its middle, folded).
        const x = shown ? shown.left - base.left : (figureBox.left + figureBox.right) / 2;
        b = [Math.min(figureBox.right - 18, Math.max(figureBox.left + 18, x)), figureBox.bottom + 3];
        if (a[1] < b[1] + 24) continue;
        route = cubicRoute(a, [a[0] + 36, a[1] - 8], [b[0], b[1] + Math.max(40, (a[1] - b[1]) * 0.5)], b);
      }
      const own = layout?.dots.get(link.number);
      const ownBox = own ? shift(own) : null;
      const clear = (p: Pt) => {
        if (Math.hypot(p[0] - a[0], p[1] - a[1]) < 12) return true;
        if (p[0] > figureBox.left && p[0] < figureBox.right && p[1] > figureBox.top && p[1] < figureBox.bottom) return true;
        const inside = (o: Box, pad: number) =>
          p[0] > o.left - pad && p[0] < o.right + pad && p[1] > o.top - pad && p[1] < o.bottom + pad;
        if (boxes.some((o) => o !== ownBox && !(ownBox && o.left === ownBox.left && o.top === ownBox.top) && inside(o, 2)))
          return false;
        const near = (q: Pt, r: number) => Math.hypot(p[0] - q[0], p[1] - q[1]) < r;
        if (trails.some((trail) => trail.some((q) => near(q, 3)))) return false;
        if (drawn.some((trail) => trail.some((q) => near(q, 4)))) return false;
        return true;
      };
      const lengths = distances(route);
      const total = lengths[lengths.length - 1] ?? 0;
      const inPicture = (p: Pt) =>
        pictures.some((o) => p[0] > o.left && p[0] < o.right && p[1] > o.top && p[1] < o.bottom);
      const clean =
        route.every(clear) && route.every((p, i) => total - (lengths[i] ?? 0) < 34 || !inPicture(p));
      if (clean) drawn.push(route);
      const first = seen.current.get(link.key) ?? 0;
      const fresh = !still && now - first < link.delay * 1000 + ACROSS_HOLD_MS;
      // One that would cross writing, words, a trace or the picture is not drawn at all (its
      // numbered dots say what goes with what), unless the student lights the pair.
      if (!clean && lit !== link.number) continue;
      const sparse = route.filter((_, i) => i % 3 === 0 || i === route.length - 1);
      const tip = link.toWork ? route[0]! : route[route.length - 1]!;
      const back = link.toWork ? route[Math.min(4, route.length - 1)]! : route[Math.max(0, route.length - 5)]!;
      out.push({
        key: link.key,
        number: link.number,
        d: through(sparse),
        head: link.toFigure || link.toWork ? arrowHead(tip, back, 8) : null,
        clean,
        fresh,
        delay: link.delay,
      });
    }
    setAcross(out);
    const keys = new Set(out.filter((line) => line.clean).map((line) => line.key));
    const was = joinedNow.current;
    if (keys.size !== was.size || Array.from(keys).some((key) => !was.has(key))) {
      joinedNow.current = keys;
      onJoined(keys);
    }
  }, [band, deskRef, layoutRef, links, lit, onJoined, sheetRef]);

  useEffect(() => {
    const desk = deskRef.current;
    const ink = desk?.closest<HTMLElement>(".pb-ink");
    let frame = 0;
    const again = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    again();
    // The figure loads, the marks settle, a fresh line's hold runs out: looked at again often.
    const timer = window.setInterval(again, 400);
    ink?.addEventListener("scroll", again, { passive: true });
    // The passage scrolls by itself, and its marks with it.
    desk?.addEventListener("scroll", again, { capture: true, passive: true });
    window.addEventListener("resize", again);
    return () => {
      cancelAnimationFrame(frame);
      window.clearInterval(timer);
      ink?.removeEventListener("scroll", again);
      desk?.removeEventListener("scroll", again, { capture: true });
      window.removeEventListener("resize", again);
    };
  }, [deskRef, measure]);

  if (across.length === 0) return null;
  return (
    <svg className="pb-links" aria-hidden="true">
      {across.map((line) => {
        const state =
          lit === line.number ? "lit" : line.clean ? (line.fresh ? "draw" : "kept") : "pass";
        return (
          <g
            key={line.key}
            className={`pb-link pair-${(line.number - 1) % PAIR_COLOURS} ${state}`}
            style={{ "--delay": `${line.delay}s` } as CSSProperties}
            onMouseEnter={() => onLit(line.number)}
            onMouseLeave={() => onLit(null)}
            onClick={() => onLit(line.number, true)}
          >
            <path className="pb-link-hit" d={line.d} />
            <path className="pb-link-line" d={line.d} pathLength={1} />
            {line.head ? <path className="pb-link-head" d={line.head} pathLength={1} /> : null}
          </g>
        );
      })}
    </svg>
  );
}

/** The part of the board in view: its scroller, and the band between whatever is pinned over
 * the top of it and the coach card over the bottom, in screen pixels. */
interface ViewBand {
  ink: HTMLElement;
  top: number;
  bottom: number;
}

/** One frame of a flight, as it is drawn. */
interface FlightFrame {
  /** The source lit up. */
  lit: boolean;
  /** The piece, moved from where it was written; null before it lifts. */
  ghost: { x: number; y: number; scale: number; opacity: number } | null;
  /** How much of the way it has gone has been drawn behind it (0 to 1), and how solidly. */
  trail: number;
  fade: number;
}


/** Add keys to a set kept in state, leaving it alone (the same object) if they are all in. */
function adding(keys: string[]) {
  return (was: Set<string>) => {
    if (keys.every((key) => was.has(key))) return was;
    const now = new Set(was);
    for (const key of keys) now.add(key);
    return now;
  };
}

/** Where a flight is: waiting its turn, then along its own (natural) time. */
interface FlightState {
  /** Of the board's time (the voice's seconds, in ms), how long it has been up. */
  elapsed: number;
  /** Its natural time since it set off, in ms (`FLIGHT_SCROLL_MS` and on). */
  t: number;
  /** How much faster than its pace it goes: more than 1 once its moment is over. */
  rush: number;
  done: boolean;
  /** Where the board was when it set off, and how far up it goes to show the source. */
  from?: number;
  up?: number;
  /** Whether it moves the board: only one flight at a time does. */
  scrolls?: boolean;
  traced?: number;
}

/** A flight still under way when its moment ends lands within about this long. */
const FLIGHT_RUSH_MS = 300;

/**
 * FLIGHTS: a piece carried from far up the board (see `FLIGHT_SCROLL_MS` in ink.ts), played
 * once, when its mark goes up. At its turn in its moment's plan (each waits its delay) and at
 * the plan's pace, on a clock that runs with the speed control and stops while the lesson is
 * paused — the piece stops mid-air and the board where it is. The board scrolls up just far
 * enough to show where the piece was written (not at all if it is in view, or while another
 * flight has the board), lights it, lifts a copy off, and carries it down to where it goes, the
 * board following it back to where it was. Its trail is drawn behind it and gone once it lands;
 * what stays is the short hook into the piece and the words saying where it came from.
 *
 * NEVER LATE. Once its moment is over (`Shape.hurry`), a flight that had not set off is put
 * straight where it goes, and one still in the air finishes within `FLIGHT_RUSH_MS`: a piece
 * never lands while the coach is already talking about the step after.
 *
 * Returns the frame of each flight under way, and which have landed (their hook and words are
 * drawn from then on).
 */
function useFlights(
  shapes: Shape[],
  paused: boolean,
  speed: number,
  sheetRef: RefObject<HTMLDivElement>,
  band: () => ViewBand | null,
): { frames: Map<string, FlightFrame>; landed: Set<string> } {
  const [frames, setFrames] = useState<Map<string, FlightFrame>>(() => new Map());
  const [landed, setLanded] = useState<Set<string>>(() => new Set());
  const flights = useRef(new Map<string, FlightState>());
  const live = useRef({ shapes, paused, band, speed });
  live.current = { shapes, paused, band, speed };

  // Each new flight is noted; one no longer on the board (a replay) is forgotten, so it plays
  // again if it comes back — and the board it had moved is put back.
  useEffect(() => {
    const now = new Set(shapes.filter((shape) => shape.flight).map((shape) => shape.key));
    let changed = false;
    for (const [key, state] of Array.from(flights.current))
      if (!now.has(key)) {
        if (state.scrolls && !state.done && state.from !== undefined) {
          const ink = live.current.band()?.ink;
          if (ink) ink.scrollTop = state.from;
        }
        flights.current.delete(key);
        changed = true;
      }
    for (const shape of shapes)
      if (shape.flight && !flights.current.has(shape.key))
        // One first seen after its moment is over does not fly at all.
        flights.current.set(shape.key, { elapsed: 0, t: 0, rush: 1, done: Boolean(shape.hurry) });
    if (changed)
      setLanded((was) => {
        const kept = new Set(Array.from(was).filter((key) => now.has(key)));
        return kept.size === was.size ? was : kept;
      });
  }, [shapes]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let drawn = false;
    const tick = (now: number) => {
      const { shapes: current, paused: held, band: view, speed: rate } = live.current;
      // Real time, not a frame's worth: on a slow phone frames come far apart, and a flight
      // timed by frames would fall behind the voice. (A tab left in the background sends no
      // frames at all; on its return a flight jumps on by at most a second.)
      const step = held ? 0 : Math.min(1000, now - last) * rate;
      last = now;
      const next = new Map<string, FlightFrame>();
      const down: string[] = [];
      const sheet = sheetRef.current;
      const owner = Array.from(flights.current.values()).some((one) => one.scrolls && !one.done);
      for (const shape of current) {
        const flight = shape.flight;
        const state = flights.current.get(shape.key);
        if (!flight || !state || !sheet) continue;
        if (state.done) {
          down.push(shape.key);
          continue;
        }
        const delay = (shape.delay ?? 0) * 1000;
        const pace = Math.max(0.1, flight.pace);
        if (state.elapsed < delay) {
          // Its moment ended before its turn came: put where it goes.
          if (shape.hurry) {
            state.done = true;
            down.push(shape.key);
            continue;
          }
          state.elapsed += step;
          if (state.elapsed < delay) continue;
          state.t = (state.elapsed - delay) / pace;
        } else {
          state.elapsed += step;
          state.t += (step / pace) * state.rush;
        }
        const seen = view();
        // Where the board was, and how far up it must go to show where the piece was written.
        if (state.from === undefined) {
          state.from = seen ? seen.ink.scrollTop : 0;
          state.up = state.from;
          if (seen && !owner) {
            const top = sheet.getBoundingClientRect().top + flight.from.top;
            if (top < seen.top + 12) state.up = Math.max(0, state.from - (seen.top + 28 - top));
          }
          state.scrolls = state.up !== state.from;
          if (!state.traced) {
            state.traced = 1;
            trace("flight-start", { key: shape.key, pace: flight.pace, scrolls: state.scrolls });
          }
        }
        const from = state.from;
        const up = state.up ?? from;
        const scrolling = state.scrolls ? FLIGHT_SCROLL_MS : 0;
        const lift = scrolling + FLIGHT_HOLD_MS;
        const arrive = lift + FLIGHT_TRAVEL_MS;
        const end = arrive + FLIGHT_LAND_MS;
        // Its moment is over and it is still in the air: it lands within FLIGHT_RUSH_MS.
        if (shape.hurry && state.rush === 1) {
          const left = ((end - state.t) * pace) / Math.max(0.1, rate);
          if (left > FLIGHT_RUSH_MS) state.rush = left / FLIGHT_RUSH_MS;
        }
        const t = state.t;
        if (t >= arrive) {
          down.push(shape.key);
          if (state.traced === 1) {
            state.traced = 2;
            trace("flight-land", { key: shape.key });
          }
        }
        if (t >= end) {
          state.done = true;
          if (state.scrolls && seen && Math.abs(seen.ink.scrollTop - from) > 1) seen.ink.scrollTop = from;
          continue;
        }
        // The board, if this flight has it: up to the source, held there, then down with the
        // piece.
        if (state.scrolls) {
          const scroll =
            t < scrolling
              ? from + (up - from) * ease(t / scrolling)
              : t < lift
                ? up
                : t < arrive
                  ? up + (from - up) * ease((t - lift) / FLIGHT_TRAVEL_MS)
                  : from;
          if (seen && Math.abs(seen.ink.scrollTop - scroll) > 0.5) seen.ink.scrollTop = scroll;
        }
        // The piece: lifted off, carried, set down.
        const { route } = flight;
        const lengths = distances(route);
        const total = lengths[lengths.length - 1] ?? 0;
        const a = route[0]!;
        const h0 = Math.max(1, flight.from.bottom - flight.from.top);
        const grow = Math.max(0.45, Math.min(2.2, (flight.to.bottom - flight.to.top) / h0));
        let ghost: FlightFrame["ghost"] = null;
        let trail = 0;
        let fade = 1;
        if (t >= scrolling) {
          if (t < lift) {
            const held2 = (t - scrolling) / FLIGHT_HOLD_MS;
            ghost = { x: 0, y: -5 * held2, scale: 1 + 0.08 * held2, opacity: Math.min(1, held2 * 2) };
          } else if (t < arrive) {
            const e = ease((t - lift) / FLIGHT_TRAVEL_MS);
            const at = along(route, lengths, e * total);
            trail = e;
            ghost = {
              x: at[0] - a[0],
              y: at[1] - a[1] - 5 * (1 - e),
              scale: (1 + (grow - 1) * e) * (1 + 0.08 * (1 - e)),
              opacity: 1,
            };
          } else {
            const e = (t - arrive) / FLIGHT_LAND_MS;
            const b = route[route.length - 1]!;
            trail = 1;
            fade = 1 - e;
            ghost = { x: b[0] - a[0], y: b[1] - a[1], scale: grow, opacity: Math.max(0, 1 - e * 1.6) };
          }
        }
        next.set(shape.key, { lit: t >= scrolling, ghost, trail, fade });
      }
      if (down.length) setLanded(adding(down));
      if (next.size || drawn) {
        setFrames(next);
        drawn = next.size > 0;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [sheetRef]);

  return { frames, landed };
}

/**
 * The teacher's marks over the board, drawn by hand.
 *
 * An SVG laid over the sheet the working is written on, in the sheet's own coordinates — so
 * scrolling the board carries the marks with the lines. Measured from where the lines really
 * are, and measured again whenever the sheet changes size (a new line, a phone turned
 * sideways, a font arriving late).
 */
function Marks({
  sheetRef,
  sets,
  paused,
  speed,
  band,
  links,
  lit,
  joined,
  onLit,
  layoutRef,
}: {
  sheetRef: RefObject<HTMLDivElement>;
  sets: MarkSet[];
  /** The lesson is paused: a piece in flight stops where it is, and every mark being drawn. */
  paused: boolean;
  /** How fast the board goes (BoardTuning.tsx): flights keep pace with the voice. */
  speed: number;
  /** The part of the board the student can see, for a flight to keep its piece in view. */
  band: () => ViewBand | null;
  /** The working's pairs with the diagram (see `pairLinks`). */
  links: LinkPair[];
  /** The pair lit by a hover or a tap. */
  lit: number | null;
  /** The marks whose line across is drawn, so their dot stands down. */
  joined: ReadonlySet<string>;
  onLit: (number: number | null, tapped?: boolean) => void;
  /** Where everything on the working is, for the lines across to keep off. */
  layoutRef: MutableRefObject<BoardLayout | null>;
}) {
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [dots, setDots] = useState<PairDot[]>([]);
  const [anchors, setAnchors] = useState<Map<string, Pt>>(() => new Map());
  const traced = useRef(new Set<string>());
  const measure = useCallback(() => {
    const sheet = sheetRef.current;
    if (!sheet || sets.length === 0) {
      setShapes((now) => (now.length ? [] : now));
      setDots((now) => (now.length ? [] : now));
      layoutRef.current = null;
      return;
    }
    const measured = measureMarks(sheet, sets, links);
    for (const shape of measured.shapes)
      if (!traced.current.has(shape.key)) {
        traced.current.add(shape.key);
        trace("mark", {
          key: shape.key,
          kind: shape.kind,
          delay: shape.delay ?? 0,
          flight: Boolean(shape.flight),
          ghost: shape.ghost ? [shape.ghost.lift, shape.ghost.travel, shape.ghost.land] : null,
        });
      }
    setShapes(measured.shapes);
    setDots(measured.dots);
    setAnchors(measured.anchors);
    layoutRef.current = measured.layout;
  }, [layoutRef, links, sets, sheetRef]);

  useLayoutEffect(measure, [measure]);
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    let frame = 0;
    const again = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(again);
    observer?.observe(sheet);
    window.addEventListener("resize", again);
    // A line that scrolls sideways inside itself moves the marks on it.
    sheet.addEventListener("scroll", again, true);
    void document.fonts?.ready.then(again);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", again);
      sheet.removeEventListener("scroll", again, true);
    };
  }, [measure, sheetRef]);

  const { frames, landed } = useFlights(shapes, paused, speed, sheetRef, band);
  // Paused, every mark stops where it is — one being drawn, a piece being carried — and goes
  // on from there. (Only those this stopped are started again: playing a finished one would
  // draw it over from the start.)
  const rootRef = useRef<HTMLDivElement>(null);
  const stopped = useRef(new Set<Animation>());
  useEffect(() => {
    const root = rootRef.current;
    if (paused) {
      if (!root || typeof root.getAnimations !== "function") return;
      for (const running of root.getAnimations({ subtree: true }))
        if (running.playState === "running") {
          running.pause();
          stopped.current.add(running);
        }
    } else if (stopped.current.size) {
      stopped.current.forEach((held) => {
        if (held.playState === "paused") held.play();
      });
      stopped.current.clear();
    }
  });
  if (shapes.length === 0 && dots.length === 0) return null;
  // A piece still on its way: the hook it will land on, and its words, wait for it.
  const waiting = (shape: Shape) => Boolean(shape.flight) && !landed.has(shape.key);
  const timing = (shape: Shape): CSSProperties =>
    shape.flight ? ({ "--delay": "0s" } as CSSProperties) : markTiming(shape);
  const highlights = shapes.filter((shape) => shape.kind === "highlight");
  const flashes = shapes.filter((shape) => shape.flash);
  const flying = shapes.filter((shape) => shape.flight && frames.has(shape.key));
  return (
    <div className="pb-marks" aria-hidden="true" ref={rootRef}>
      {/*
        Highlights on a layer of their own, multiplied into the board: the yellow goes behind
        the words, which stay black, the way a highlighter pen works on paper.
      */}
      {highlights.length || flashes.length || flying.length ? (
        <svg className="pb-marks-svg under">
          {flying.map((shape) =>
            frames.get(shape.key)!.lit && shape.flight!.flash ? (
              <g key={`lit-${shape.key}`} className="pb-flash">
                <path d={shape.flight!.flash.d} style={{ strokeWidth: shape.flight!.flash.width }} />
              </g>
            ) : null,
          )}
          {/* Where a piece brought from far above came from, lit up briefly as it goes. */}
          {flashes.map((shape) => (
            <g key={`flash-${shape.key}`} className="pb-flash" style={markTiming(shape)}>
              <path d={shape.flash!.d} style={{ strokeWidth: shape.flash!.width }} />
            </g>
          ))}
          {highlights.map((shape) => (
            <g
              key={shape.key}
              className={`pb-mark highlight ${shape.state}`}
              style={markTiming(shape)}
            >
              <path
                className="pb-mark-line"
                d={shape.d}
                pathLength={1}
                style={{ strokeWidth: shape.width }}
              />
            </g>
          ))}
        </svg>
      ) : null}
      <svg className="pb-marks-svg">
        {flying.map((shape) => {
          const frame = frames.get(shape.key)!;
          return frame.trail > 0 ? (
            <path
              key={`trail-${shape.key}`}
              className="pb-flight-trail"
              d={through(shape.flight!.route.filter((_, i, all) => i % 3 === 0 || i === all.length - 1))}
              pathLength={1}
              style={{ strokeDashoffset: 1 - frame.trail, opacity: frame.fade }}
            />
          ) : null;
        })}
        {shapes.filter((shape) => shape.kind !== "highlight" && !waiting(shape)).map((shape) => (
          <g
            key={shape.key}
            className={`pb-mark ${shape.kind} ${shape.state}${shape.older ? " older" : ""}`}
            style={timing(shape)}
          >
            <path className="pb-mark-line" d={shape.d} pathLength={1} />
            {shape.head ? (
              <path className="pb-mark-head" d={shape.head} pathLength={1} />
            ) : null}
          </g>
        ))}
      </svg>
      {shapes.map((shape) =>
        shape.ghost ? <Carried key={`ghost-${shape.key}`} shape={shape} ghost={shape.ghost} /> : null,
      )}
      {flying.map((shape) => {
        const frame = frames.get(shape.key)!;
        const { from, glyphs } = shape.flight!;
        return frame.ghost ? (
          <div
            key={`flight-${shape.key}`}
            className="pb-carried flying"
            style={{
              left: from.left,
              top: from.top,
              width: from.right - from.left,
              height: from.bottom - from.top,
              opacity: frame.ghost.opacity,
              transform: `translate(${frame.ghost.x.toFixed(1)}px, ${frame.ghost.y.toFixed(1)}px) scale(${frame.ghost.scale.toFixed(3)})`,
            }}
          >
            {glyphs.map((glyph, i) => (
              <span
                key={i}
                style={{
                  left: glyph.left - from.left,
                  top: glyph.top - from.top,
                  height: glyph.height,
                  font: glyph.font,
                  lineHeight: `${glyph.height}px`,
                }}
              >
                {glyph.text}
              </span>
            ))}
          </div>
        ) : null;
      })}
      {Array.from(anchors).map(([key, [x, y]]) => (
        <span key={`anchor-${key}`} className="pb-link-anchor" data-link-work={key} style={{ left: x, top: y }} />
      ))}
      {dots.map((dot) => (
        <span
          key={`dot-${dot.number}`}
          className={`pb-pairdot pair-${(dot.number - 1) % PAIR_COLOURS}${lit === dot.number ? " lit" : ""}${
            dot.keys.every((key) => joined.has(key)) ? " joined" : ""
          }`}
          style={{ left: dot.x, top: dot.y }}
          onMouseEnter={() => onLit(dot.number)}
          onMouseLeave={() => onLit(null)}
          onClick={(event) => {
            event.stopPropagation();
            onLit(dot.number, true);
          }}
        >
          {dot.number}
        </span>
      ))}
      {shapes.map((shape) =>
        shape.label && !waiting(shape) ? (
          <span
            key={`label-${shape.key}`}
            className={`pb-mark-label ${shape.kind} ${shape.state} ${shape.label.side}`}
            style={{ left: shape.label.x, top: shape.label.y, ...timing(shape) }}
          >
            {shape.label.text}
          </span>
        ) : null,
      )}
    </div>
  );
}

/**
 * THE HAND. A whiteboard marker that writes each line out, so the eye is taken to the newest
 * line and the line reads as written rather than uncovered.
 *
 * WHY THIS IS NOT A WIPE ANY MORE. The line used to be revealed by one linear mask sweeping
 * left to right with a soft edge, and the marker rode that edge. Students saw it for what it
 * was: the words already there, fading in from the left, with a pen sliding along in front.
 * Nobody writes like that. A hand forms one letter, then the next; it hesitates between words
 * and after a comma; it goes back to the margin for the next row. So the line is now read
 * into the pieces a hand would make — every letter of the prose, every atom of the maths
 * (a fraction's numerator, then its bar, then its denominator; a power after its base; a
 * table cell by cell, row by row) — and each piece appears as the nib crosses it, with a
 * hard edge exactly at the nib and nothing ahead of it.
 *
 * HOW IT IS SHOWN WITHOUT TOUCHING THE WORDS. The text belongs to React and to KaTeX, and the
 * marks overlay measures it, so none of it is split into spans. The pieces are measured once
 * when the line starts (Range rectangles for letters, the boxes KaTeX already draws for
 * maths), and the line is shown through a clip path — the rows already finished, the row
 * being written up to the last finished piece, and the piece under the nib up to the nib.
 * Changing one clip path and three transforms a frame is all the work there is: no layout
 * is read while a line is being written.
 *
 * THE CLOCK IS THE VOICE'S. Each line still takes what the lesson gives it — the marker's
 * wait to reach the line and the `--stroke` its words allow — so the writing finishes as the
 * sentence does. Within that time the hand has its own rhythm: letters by their width, each
 * word a little quicker or slower than the last, a breath at a space and a longer one after
 * a full stop. The clock stops when the student pauses or starts asking something, and the
 * nib and the ink stop with it, mid-word, and carry on from there.
 *
 * THE MARKER. Held the way a right-handed teacher holds one: the barrel leaning up and away
 * to the right of the nib, so the hand never covers what has just been written. It bobs up
 * and down as it forms each letter, lifts a little between words (its shadow on the board
 * drifting away from it), and at the end of a line lifts off and goes back to the margin
 * where the next line will start, and waits there. It travels to every line; it never jumps.
 *
 * Lines are marked `data-ink` while they are being written, and each is written once. A line
 * the student cannot see (they have scrolled up to reread) is still written, without the
 * marker; and when a student would rather nothing moved, lines go up whole and there is no
 * marker at all.
 */
function Pen({
  sheetRef,
  active,
  tick,
  canSee,
}: {
  sheetRef: RefObject<HTMLDivElement>;
  /** False while the lesson is paused for the student: the hand stops where it is. */
  active: boolean;
  /** Changes whenever something may have been written, so the pen looks again. */
  tick: string;
  /** Whether a line is (or is about to be scrolled) where the student can see it. */
  canSee: (line: HTMLElement) => boolean;
}) {
  const penRef = useRef<HTMLDivElement>(null);
  const rigRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<HTMLDivElement>(null);
  const seen = useRef(new WeakSet<Element>());
  const hand = useRef<Hand>({
    clock: 0,
    queue: [],
    job: null,
    tip: null,
    lift: 1,
    back: null,
    idle: 0,
    replan: false,
    stamp: -1,
  });
  const held = useRef(!active);
  const canSeeRef = useRef(canSee);
  //: Starts the frame loop if it has stopped. Set by the loop's own effect.
  const wake = useRef<() => void>(() => undefined);

  useEffect(() => {
    canSeeRef.current = canSee;
  }, [canSee]);

  useEffect(() => {
    held.current = !active;
    if (active) wake.current();
  }, [active]);

  // THE FRAME LOOP. Runs only while there is something to move: a line being written, the
  // marker going back to the margin, or the wait before it is put away. It stops while the
  // lesson is paused, and the clock with it.
  useEffect(() => {
    const sheet = sheetRef.current;
    const pen = penRef.current;
    const rig = rigRef.current;
    const body = bodyRef.current;
    const shadow = shadowRef.current;
    if (!sheet || !pen || !rig || !body || !shadow) return;
    const state = hand.current;
    let frame = 0;
    let last = 0;

    const draw = (at: Pt, lift: number, tilt: number, show: Show) => {
      state.tip = at;
      state.lift = lift;
      pen.style.transform = `translate3d(${at[0].toFixed(1)}px, ${at[1].toFixed(1)}px, 0)`;
      const lean = (PEN_ANGLE + tilt).toFixed(2);
      body.style.transform = `translate(${(lift * 5).toFixed(2)}px, ${(-lift * 10).toFixed(
        2,
      )}px) rotate(${lean}deg)`;
      // The shadow stays on the board: it meets the nib when the nib is down and slides away
      // from it as the marker comes off the board.
      shadow.style.transform = `translate(${(2 + lift * 13).toFixed(2)}px, ${(
        3 +
        lift * 6
      ).toFixed(2)}px) rotate(${lean}deg)`;
      shadow.style.opacity = (0.85 - lift * 0.45).toFixed(2);
      const flag = show === true ? "1" : show === false ? "0" : show;
      if (rig.dataset.show !== flag) rig.dataset.show = flag;
      // Whether it is writing a line: a diagram being drawn waits for the hand (FigureBoard.tsx).
      const writing = state.job ? "1" : "0";
      if (rig.dataset.writing !== writing) rig.dataset.writing = writing;
    };

    // Timed by the page's clock rather than the frame's stamp: the two agree in a browser, but
    // where frames come more slowly than time passes, the writing must still keep to time.
    const step = () => {
      const now = performance.now();
      frame = 0;
      const dt = last ? Math.max(0, now - last) : 0;
      last = now;
      if (held.current) {
        last = 0;
        state.stamp = -1;
        return;
      }
      state.clock += dt;
      state.stamp = now;
      if (state.replan && state.job?.script) {
        state.replan = false;
        const fresh = readScript(state.job.line, sheet);
        if (fresh) {
          const scale = fresh.total / state.job.script.total;
          state.job.units *= scale;
          state.job.rate *= scale;
          state.job.script = fresh;
        }
      }
      if (advance(state, sheet, dt, canSeeRef.current, draw)) {
        frame = requestAnimationFrame(step);
      } else {
        last = 0;
        state.stamp = -1;
      }
    };

    wake.current = () => {
      if (frame || held.current) return;
      last = 0;
      frame = requestAnimationFrame(step);
    };

    // A font arriving, the column changing width or a table being shrunk to fit moves the
    // letters under the nib: the line being written is measured again on the next frame.
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => {
        state.replan = true;
      });
      observer.observe(sheet);
    }
    wake.current();
    return () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      wake.current = () => undefined;
      observer?.disconnect();
    };
  }, [sheetRef]);

  // NEW LINES. Everything newly marked is queued in the order it sits on the board, and is
  // hidden at once, before it is painted, so no line is ever seen whole and then written.
  useLayoutEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    const inks = sheet.querySelectorAll<HTMLElement>("[data-ink]");
    const fresh: HTMLElement[] = [];
    // All of them, not just the newest: the question goes up with the first line, and must
    // not be written over again later when it is the last line still marked.
    inks.forEach((line) => {
      if (seen.current.has(line)) return;
      seen.current.add(line);
      fresh.push(line);
    });
    if (fresh.length === 0) return;
    if (stillMotion() || !canClipPath()) {
      // No hand: the lines stand at once, and count as written for the marks that wait on them.
      fresh.forEach(written);
      return;
    }
    const state = hand.current;
    hands.set(sheet, state);
    const lengths = fresh.map((line) => {
      const stroke =
        Number.parseFloat(window.getComputedStyle(line).getPropertyValue("--stroke")) || 600;
      line.style.animation = "none";
      line.style.clipPath = NOTHING;
      return stroke;
    });
    // Lines that go up together share the time the old wipe gave them side by side, stretched
    // a little: one hand writes them one after the other, and a board that went up all at once
    // on a silent read-along should still be written at a hand's pace.
    const wants = lengths.map((stroke) => STROKE_DELAY_MS + stroke);
    const sum = wants.reduce((a, b) => a + b, 0);
    const room = Math.min(sum, Math.max(...wants, TOGETHER_MS));
    // Now, not the last frame: frames can come further apart than the lines do.
    const queued =
      state.stamp >= 0 && !held.current
        ? state.clock + Math.max(0, performance.now() - state.stamp)
        : state.clock;
    let due = queued;
    fresh.forEach((line, index) => {
      due += (room * wants[index]!) / sum;
      state.queue.push({
        line,
        stroke: lengths[index]!,
        due,
        queued,
        script: null,
        from: [0, 0],
        fromLift: 1,
        approach: 0,
        walked: 0,
        units: 0,
        rate: 0,
        shown: false,
      });
    });
    hurry(state);
    wake.current();
  }, [sheetRef, tick]);

  return (
    <div ref={penRef} className={`pb-pen ${active ? "on" : ""}`} aria-hidden="true">
      <div className="pb-pen-rig" ref={rigRef} data-show="0">
        <div className="pb-pen-shadow" ref={shadowRef}>
          <svg viewBox="-9 -84 18 86" width="18" height="86">
            <path d="M-1.6 0h3.2l3.4-13.5h1.5v-50a3.5 3.5 0 0 0-3.5-3.5h-7a3.5 3.5 0 0 0-3.5 3.5v50h1.5z" />
            <rect x="-7.4" y="-82" width="14.8" height="19" rx="3.8" />
          </svg>
        </div>
        <div className="pb-pen-body" ref={bodyRef}>
          {/*
            A whiteboard marker drawn upright about its nib (0, 0) and leaned by the hand:
            a felt chisel nib, the grey cone that holds it, a white barrel with a band in the
            brand's purple, and the cap posted on the end in the ink's own colour — the way a
            teacher holds one, cap on the back so it is not lost.
          */}
          <svg viewBox="-9 -84 18 86" width="18" height="86">
            <defs>
              <linearGradient id="pb-pen-barrel" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0" stopColor="#d9d4e4" />
                <stop offset="0.28" stopColor="#ffffff" />
                <stop offset="0.62" stopColor="#f1eef7" />
                <stop offset="1" stopColor="#bdb5cd" />
              </linearGradient>
              <linearGradient id="pb-pen-capshade" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0" stopColor="#3a3448" />
                <stop offset="0.35" stopColor="#1b1726" />
                <stop offset="1" stopColor="#0d0a14" />
              </linearGradient>
            </defs>
            <path className="pb-pen-nib" d="M-1.6 0h3.2l1.6-6.4h-6.4z" />
            <path className="pb-pen-nibtip" d="M-1.6 0h1.3l.9-6.4h-.6z" />
            <path className="pb-pen-cone" d="M-3.2-6.2h6.4l2.2-7.6h-10.8z" />
            <rect x="-6.5" y="-66.5" width="13" height="53.2" rx="3" fill="url(#pb-pen-barrel)" />
            <rect className="pb-pen-band" x="-6.5" y="-47" width="13" height="15" />
            <rect className="pb-pen-stripe" x="-6.5" y="-33.6" width="13" height="1.6" />
            <rect className="pb-pen-shine" x="-4.4" y="-64" width="1.8" height="48" rx="0.9" />
            <rect x="-7.4" y="-82" width="14.8" height="19" rx="3.8" fill="url(#pb-pen-capshade)" />
            <rect className="pb-pen-clip" x="4.6" y="-80.5" width="3.6" height="15" rx="1.4" />
          </svg>
        </div>
      </div>
    </div>
  );
}

/**
 * How far the marker is turned from upright, clockwise. Past a right angle, so the barrel runs
 * down and to the right of the nib, towards the hand that holds it — the way a pen sits in a
 * right-handed writer's fingers — and it never covers what has just been written to its left.
 */
const PEN_ANGLE = 135;

/** How long the marker takes to get to the start of a new line, before the writing begins. */
const STROKE_DELAY_MS = 180;

/** Lines that go up together are written one after another within about this long. */
const TOGETHER_MS = 3400;

/** Never less than this to write a line, however late it is: below it the letters blur. */
const HURRIED_MS = 320;

/** The lift and the trip back to the margin once a line is written. */
const RETURN_MS = 520;

/** How long the marker waits at the margin before it is put away. */
const REST_MS = 1400;

/** Whether the marker is shown: yes, no, or faded back while it waits at the margin. */
type Show = boolean | "wait";

/**
 * A line is written: say so on the line, and tell the board, whose marks for it are waiting.
 * A teacher writes the line, then turns and points at it — never the other way round.
 */
function written(line: HTMLElement): void {
  trace("line-written", { line: line.closest("[data-line]")?.getAttribute("data-line") });
  line.dataset.written = "";
  line.closest(".pb-sheet")?.dispatchEvent(new Event(WRITTEN_EVENT));
}

/** Sent on the sheet each time the hand finishes a line, and each time it starts one. */
const WRITTEN_EVENT = "pb-written";
const WRITING_EVENT = "pb-writing";

/** The hand writing on each sheet, for the marks to keep time with (`penTiming`). */
const hands = new WeakMap<HTMLElement, Hand>();

/**
 * When the hand will reach a piece of a line, and finish the line, in ms of real time from now:
 * `item` is the line's element and `box` (on the screen) the piece, or null for the line's end.
 * Read off the line being written, piece by piece as the hand will write it; a line still
 * waiting its turn is estimated from its share of the line. Null when the hand does not have
 * the line at all; nothing to wait for once it is written.
 */
function penTiming(
  sheet: HTMLElement,
  item: HTMLElement,
  box: Box | null,
): { reach: number; done: number } | null {
  if (item.dataset.written !== undefined) return { reach: 0, done: 0 };
  const hand = hands.get(sheet);
  if (!hand) return null;
  const frame = item.getBoundingClientRect();
  // How far along the line a piece is, as a share of its writing (a line not read yet: by
  // where the piece sits across it).
  const share = (script: Script | null): number => {
    if (!box) return 1;
    if (script) {
      let reach = 0;
      for (const segment of script.segments) {
        if (!segment.ink) continue;
        const piece = script.pieces[segment.piece];
        if (!piece) continue;
        const x = frame.left + (piece.x0 + piece.x1) / 2;
        const y = frame.top + (piece.y0 + piece.y1) / 2;
        if (x >= box.left - 2 && x <= box.right + 2 && y >= box.top - 2 && y <= box.bottom + 2)
          reach = Math.max(reach, segment.u1);
      }
      if (reach > 0) return reach / Math.max(1e-6, script.total);
    }
    return Math.min(1, Math.max(0, (box.right - frame.left) / Math.max(1, frame.width)));
  };
  const job = hand.job;
  let wait = 0;
  if (job?.script) {
    const walk = Math.max(0, job.approach - job.walked);
    const rest = walk + Math.max(0, job.script.total - job.units) / Math.max(job.rate, 1e-6);
    if (job.line === item) {
      const units = share(job.script) * job.script.total;
      return { reach: walk + Math.max(0, units - job.units) / Math.max(job.rate, 1e-6), done: rest };
    }
    wait += rest;
  }
  for (const queued of hand.queue) {
    // The trip to it, and its writing at the hand's pace for it.
    const takes = STROKE_DELAY_MS + queued.stroke;
    if (queued.line === item)
      return { reach: wait + STROKE_DELAY_MS + share(null) * queued.stroke, done: wait + takes };
    wait += takes;
  }
  return null;
}

/** A clip path that shows nothing: a line queued but not yet reached. */
const NOTHING = 'path("M0 0Z")';

function canClipPath(): boolean {
  return typeof CSS !== "undefined" && typeof CSS.supports === "function"
    ? CSS.supports("clip-path", NOTHING)
    : false;
}

/** One piece of writing: a letter, a mathematical atom, or one part of a fraction. */
interface Piece {
  /** Its box, in pixels from the line's top-left corner. */
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  /** Which row of the line it is on, once the line wraps. */
  row: number;
  /** The fraction it is a part of, or -1: parts are shown by their own boxes until the last. */
  group: number;
  /** The last part of its fraction, after which the whole fraction counts as written. */
  closes: boolean;
  /** Where the whole fraction ends, once it is written. */
  groupX1: number;
  /** A letter of prose (formed at x-height), or anything else (formed about its middle). */
  prose: boolean;
  /** A fraction bar: one straight stroke, no letter-forming. */
  bar: boolean;
  /** The character, for prose: a comma or full stop makes the hand stop after it. */
  char: string;
}

/** Part of the hand's path through a line, in units of writing time. */
type Segment =
  | {
      ink: true;
      piece: number;
      u0: number;
      u1: number;
      from: Pt;
      to: Pt;
      /** How many up-and-down strokes form the piece, and how far each one goes. */
      strokes: number;
      reach: number;
    }
  | {
      ink: false;
      /** The piece the hand is on its way to. */
      piece: number;
      u0: number;
      u1: number;
      from: Pt;
      to: Pt;
      /** How far off the board it comes on the way: 0 a slide, 1 a full lift. */
      lift: number;
      /** A trip back to the start of the next row. */
      back: boolean;
    };

/** A line, read into the hand's path through it. */
interface Script {
  pieces: Piece[];
  segments: Segment[];
  /** Where each row's band starts and ends, from the top of the line: rows + 1 edges. */
  edges: number[];
  /** Far enough to the right to take in everything on the line. */
  right: number;
  /** Room left round the writing for what spills past its boxes: tall signs, descenders. */
  pad: number;
  /** The line's top-left corner on the sheet. */
  origin: Pt;
  /** All the writing time, in units. */
  total: number;
  /** Where the next line's writing will start: under this one, at its margin. */
  margin: Pt;
}

interface Job {
  line: HTMLElement;
  stroke: number;
  /** When, on the hand's clock, the line should be finished, and when it went up. */
  due: number;
  queued: number;
  script: Script | null;
  from: Pt;
  fromLift: number;
  /** The trip to the line: how long it takes and how far along it the hand is. */
  approach: number;
  walked: number;
  /** How far through the line's writing time the hand is, and how fast it is going. */
  units: number;
  rate: number;
  /** Whether the marker is shown for this line. */
  shown: boolean;
}

interface Hand {
  /** Milliseconds of writing: stops while the lesson is paused. */
  clock: number;
  queue: Job[];
  job: Job | null;
  /** Where the nib is on the sheet, and how far off the board. */
  tip: Pt | null;
  lift: number;
  /** The trip back to the margin after a line, if one is under way. */
  back: { from: Pt; to: Pt; fromLift: number; start: number; shown: boolean } | null;
  /** When the hand last finished something, for putting the marker away. */
  idle: number;
  replan: boolean;
  /** When the clock was last moved on, or -1 while it is stopped. */
  stamp: number;
}

const ease = (q: number) => 0.5 - Math.cos(Math.PI * Math.min(1, Math.max(0, q))) / 2;
const mix = (a: Pt, b: Pt, q: number): Pt => [a[0] + (b[0] - a[0]) * q, a[1] + (b[1] - a[1]) * q];

/**
 * One frame of the hand: carry on writing, start the next line, go back to the margin or
 * wait. Returns whether there is anything left to move.
 */
function advance(
  state: Hand,
  sheet: HTMLElement,
  dt: number,
  canSee: (line: HTMLElement) => boolean,
  draw: (at: Pt, lift: number, tilt: number, show: Show) => void,
): boolean {
  let spare = dt;
  for (let guard = 0; guard < 8; guard += 1) {
    let job = state.job;
    if (job && !job.line.isConnected) {
      state.job = null;
      job = null;
    }
    if (!job) {
      const next = state.queue.shift();
      if (!next) break;
      if (!next.line.isConnected) continue;
      if (!begin(state, next, sheet, canSee)) continue;
      sheet.dispatchEvent(new Event(WRITING_EVENT));
      trace("line-start", {
        line: next.line.closest("[data-line]")?.getAttribute("data-line"),
        ms: Math.round(next.approach + next.script!.total / next.rate),
      });
      // Only the part of this frame since the line went up is spent on it.
      spare = Math.min(spare, Math.max(0, state.clock - next.queued));
      state.job = next;
      state.back = null;
      job = next;
    }
    const script = job.script!;
    // On the way to the line.
    if (job.walked < job.approach) {
      const use = Math.min(spare, job.approach - job.walked);
      job.walked += use;
      spare -= use;
      if (job.walked < job.approach) {
        const q = job.walked / job.approach;
        const first = script.segments[0]!;
        const to = onSheet(script, first.from);
        const at = mix(job.from, to, ease(q));
        at[1] -= Math.sin(Math.PI * q) * 10 * job.fromLift;
        const lift = Math.max(job.fromLift * (1 - ease(q)), Math.sin(Math.PI * q) * 0.5) * (1 - q * q);
        draw(at, lift, -2 * Math.sin(Math.PI * q), job.shown);
        return true;
      }
    }
    // Writing.
    job.units += spare * job.rate;
    spare = 0;
    if (job.units >= script.total) {
      // Finished: the whole line stands, and the hand goes back to the margin.
      spare = (job.units - script.total) / Math.max(job.rate, 1e-6);
      job.line.style.clipPath = "";
      written(job.line);
      const end = script.segments[script.segments.length - 1]!;
      const from = onSheet(script, end.to);
      state.back = {
        from,
        to: onSheet(script, script.margin),
        fromLift: 0,
        start: state.clock - spare,
        shown: job.shown,
      };
      state.idle = state.clock - spare;
      state.job = null;
      continue;
    }
    const found = locate(script.segments, job.units);
    const seg = script.segments[found]!;
    const q = (job.units - seg.u0) / Math.max(seg.u1 - seg.u0, 1e-6);
    const clip = clipFor(script, found, q);
    if (job.line.style.clipPath !== clip) job.line.style.clipPath = clip;
    if (seg.ink) {
      // Forming the piece: along it at the pace of the writing, up and down as the letter is
      // made, the marker rocking a degree or two with each stroke.
      const along = mix(seg.from, seg.to, q);
      const wave = Math.sin(2 * Math.PI * seg.strokes * q);
      along[1] -= wave * seg.reach;
      draw(onSheet(script, along), 0, 1.6 * Math.sin(2 * Math.PI * seg.strokes * q + 0.9), job.shown);
    } else {
      // Between pieces: a small hop over a space, a full lift back to the start of a row.
      const e = ease(q);
      const along = mix(seg.from, seg.to, e);
      const arc = Math.sin(Math.PI * q);
      along[1] -= arc * seg.lift * (seg.back ? 6 : 3);
      draw(onSheet(script, along), arc * seg.lift, seg.back ? -3 * arc : -0.8 * arc, job.shown);
    }
    return true;
  }
  // Nothing being written: back to the margin, then waiting there, then put away.
  const back = state.back;
  if (back) {
    const q = (state.clock - back.start) / RETURN_MS;
    const lifted = Math.min(1, q * 2.4);
    const at = mix(back.from, back.to, ease(q));
    // A gentle breathing while it waits, so it reads as held, not parked.
    const since = Math.max(0, state.clock - back.start - RETURN_MS);
    at[1] += Math.sin(since / 380) * 0.8 * Math.min(1, since / 400);
    const resting = state.clock - state.idle > REST_MS;
    // Once it is there it steps back a little, half there, so that while it waits it does not
    // stand in front of the line just written.
    draw(
      at,
      lifted,
      -2.5 * Math.sin(Math.PI * Math.min(1, q)),
      !back.shown || resting ? false : q >= 1 ? "wait" : true,
    );
    return !resting;
  }
  if (state.tip) draw(state.tip, state.lift, 0, false);
  return false;
}

/** Put the line's pieces in place and work out how long the hand has for it. */
function begin(
  state: Hand,
  job: Job,
  sheet: HTMLElement,
  canSee: (line: HTMLElement) => boolean,
): boolean {
  const script = readScript(job.line, sheet);
  if (!script) {
    job.line.style.clipPath = "";
    written(job.line);
    return false;
  }
  job.script = script;
  const first = onSheet(script, script.segments[0]!.from);
  // The first line comes in from below and to the right, lifted, where the writing hand is.
  const from: Pt = state.tip ?? [first[0] + 70, first[1] + 60];
  const distance = Math.hypot(first[0] - from[0], first[1] - from[1]);
  job.from = from;
  job.fromLift = state.tip ? state.lift : 1;
  job.approach = Math.min(420, Math.max(STROKE_DELAY_MS, 140 + distance * 0.35));
  // Write at the hand's pace for the line when there is time; hurry when the voice is ahead.
  const left = job.due - state.clock - job.approach;
  const write = Math.min(job.stroke, Math.max(Math.min(job.stroke, HURRIED_MS), left));
  job.rate = script.total / write;
  job.shown = canSee(job.line);
  return true;
}

/**
 * The voice has moved on while the hand is still on an earlier line: that line is finished
 * faster, so the one the voice is on is written while it is being said rather than after.
 */
function hurry(state: Hand): void {
  const job = state.job;
  const next = state.queue[0];
  if (!job?.script || !next) return;
  const remaining = job.script.total - job.units;
  const walk = Math.max(0, job.approach - job.walked);
  const finish = state.clock + walk + remaining / job.rate;
  const latest = next.due - STROKE_DELAY_MS - Math.min(next.stroke, HURRIED_MS * 2);
  if (finish <= latest) return;
  const room = Math.max(HURRIED_MS * 0.6, latest - state.clock - walk);
  job.rate = Math.max(job.rate, remaining / room);
}

/** A point on the line, on the sheet. */
function onSheet(script: Script, at: Pt): Pt {
  return [script.origin[0] + at[0], script.origin[1] + at[1]];
}

/** The segment the hand is in, `units` into the line. */
function locate(segments: Segment[], units: number): number {
  let low = 0;
  let high = segments.length - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (segments[middle]!.u0 <= units) low = middle;
    else high = middle - 1;
  }
  return low;
}

const box = (x0: number, y0: number, x1: number, y1: number) =>
  x1 - x0 < 0.05 || y1 - y0 < 0.05
    ? ""
    : `M${x0.toFixed(1)} ${y0.toFixed(1)}H${x1.toFixed(1)}V${y1.toFixed(1)}H${x0.toFixed(1)}Z`;

/**
 * What of the line shows, `q` of the way through segment `at`: every row before this one,
 * this row up to the last piece finished, the parts of a fraction under way, and the piece
 * under the nib up to the nib — with a hard edge there, the way ink has one.
 */
function clipFor(script: Script, at: number, q: number): string {
  const seg = script.segments[at]!;
  const pieces = script.pieces;
  const now = pieces[seg.piece]!;
  const { edges, pad, right } = script;
  const top = edges[now.row]!;
  const bottom = edges[now.row + 1]!;
  let d = now.row > 0 ? box(-pad, -pad, right, top) : "";
  let done = -Infinity;
  for (let index = seg.piece - 1; index >= 0; index -= 1) {
    const piece = pieces[index]!;
    if (piece.row !== now.row) break;
    if (piece.group >= 0 && piece.group === now.group) {
      d += box(piece.x0 - 2, piece.y0 - 2, piece.x1 + 2, piece.y1 + 2);
      continue;
    }
    done = Math.max(done, piece.group >= 0 ? piece.groupX1 : piece.x1);
  }
  if (done > -Infinity) d += box(-pad, top, done + 1, bottom);
  if (seg.ink) {
    const edge = now.x0 + (now.x1 - now.x0) * q;
    d +=
      now.group >= 0
        ? box(now.x0 - 2, now.y0 - 2, edge, now.y1 + 2)
        : box(Math.min(now.x0 - 1, done > -Infinity ? done + 1 : now.x0), top, edge, bottom);
  }
  return `path("${d || "M0 0Z"}")`;
}

const ATOMS = ["mord", "mbin", "mrel", "mopen", "mclose", "mpunct", "minner", "mop", "mfrac", "msupsub", "mtable"];
const isAtom = (element: Element) => ATOMS.some((name) => element.classList.contains(name));
const PAUSES: Record<string, number> = { ",": 1.1, ";": 1.3, ":": 1.3, ".": 1.7, "?": 1.7, "!": 1.7 };

/**
 * Read a line into the pieces a hand would write it in, and the path through them.
 *
 * Measured from the page as it stands, once, when the line starts (and again if the page
 * changes size under it). Prose is read letter by letter from its text; KaTeX is read by the
 * atoms it has already laid out, going inside an atom only where a hand would lift — the
 * parts of a fraction, the cells of a table, a power after its base.
 */
function readScript(line: HTMLElement, sheet: HTMLElement): Script | null {
  const frame = line.getBoundingClientRect();
  const base = sheet.getBoundingClientRect();
  if (frame.width < 1 || frame.height < 1) return null;
  const em = Number.parseFloat(window.getComputedStyle(line).fontSize) || 20;
  const pieces: Piece[] = [];
  let groups = 0;
  const range = document.createRange();

  const add = (rect: DOMRect, extra: Partial<Piece> = {}) => {
    if (rect.width < 0.5 || rect.height < 0.5) return;
    pieces.push({
      x0: rect.left - frame.left,
      x1: rect.right - frame.left,
      y0: rect.top - frame.top,
      y1: rect.bottom - frame.top,
      row: 0,
      group: -1,
      closes: false,
      groupX1: 0,
      prose: false,
      bar: false,
      char: "",
      ...extra,
    });
  };

  // A fraction: numerator, bar, denominator, each where KaTeX stacked it.
  const fraction = (element: Element): boolean => {
    const stack = element.querySelector(":scope > .vlist-t > .vlist-r > .vlist");
    if (!stack) return false;
    const parts: { rect: DOMRect; bar: boolean }[] = [];
    for (const layer of Array.from(stack.children)) {
      const content = Array.from(layer.children).find((child) => !child.classList.contains("pstrut"));
      if (!content) continue;
      const rect = content.getBoundingClientRect();
      if (rect.width < 0.5) continue;
      parts.push({ rect, bar: content.classList.contains("frac-line") });
    }
    if (parts.length < 2) return false;
    parts.sort((a, b) => a.rect.top - b.rect.top);
    const group = groups;
    groups += 1;
    const end = element.getBoundingClientRect().right - frame.left;
    parts.forEach((part, index) =>
      add(part.rect, {
        group,
        closes: index === parts.length - 1,
        groupX1: end,
        bar: part.bar,
      }),
    );
    return true;
  };

  // A table or an array: cell by cell along each row, the rows top to bottom.
  const table = (element: Element): boolean => {
    const cells: DOMRect[] = [];
    for (const column of Array.from(element.children)) {
      const stack = column.querySelector(":scope > .vlist-t > .vlist-r > .vlist");
      if (!stack) continue;
      for (const layer of Array.from(stack.children)) {
        const content = Array.from(layer.children).find((child) => !child.classList.contains("pstrut"));
        const rect = content?.getBoundingClientRect();
        if (rect && rect.width >= 0.5) cells.push(rect);
      }
    }
    if (cells.length === 0) return false;
    cells.sort((a, b) => a.top + a.bottom - (b.top + b.bottom));
    const rows: DOMRect[][] = [];
    for (const cell of cells) {
      const row = rows[rows.length - 1];
      const middle = (cell.top + cell.bottom) / 2;
      if (row && middle < row[0]!.bottom) row.push(cell);
      else rows.push([cell]);
    }
    for (const row of rows) {
      row.sort((a, b) => a.left - b.left);
      row.forEach((cell) => add(cell));
    }
    return true;
  };

  // A number with its index numbers over its digits (`\overset{3}{1}\overset{2}{0}…_{2}`):
  // the digits first, left to right, and its base, then the index row above them, as a student
  // writes the number down and then numbers its places. One group, so the index row stays
  // hidden until the pen comes back along it.
  const limitsOf = (element: Element): { base: DOMRect; over: DOMRect[] } | null => {
    const limits = element.querySelector(":scope > .op-limits, :scope > .mord > .op-limits");
    if (!limits || limits.querySelector(".op-symbol")) return null;
    const stack = limits.querySelector(":scope > .vlist-t > .vlist-r > .vlist");
    if (!stack) return null;
    const layers = Array.from(stack.children);
    const at = layers.findIndex((layer) => layer.querySelector(".mop") && !layer.querySelector(".mtight"));
    if (at < 0 || at === layers.length - 1) return null;
    const content = (layer: Element) =>
      Array.from(layer.children)
        .find((child) => !child.classList.contains("pstrut"))
        ?.getBoundingClientRect();
    const base = content(layers[at]!);
    const over = layers
      .slice(at + 1)
      .map(content)
      .filter((rect): rect is DOMRect => Boolean(rect && rect.width >= 0.5));
    return base && base.width >= 0.5 && over.length ? { base, over } : null;
  };
  const indexed = (run: Element[]) => {
    const found = run.map((element) => ({ element, limits: limitsOf(element)! }));
    const bases: DOMRect[] = [];
    const overs: DOMRect[] = [];
    for (const { element, limits } of found) {
      // The digit's box starts under its index, so writing the digit shows none of the index.
      const under = Math.max(...limits.over.map((rect) => rect.bottom));
      const top = Math.min(Math.max(limits.base.top, under), limits.base.bottom - 1);
      bases.push(new DOMRect(limits.base.left, top, limits.base.width, limits.base.bottom - top));
      const tail = element.querySelector(":scope > .msupsub")?.getBoundingClientRect();
      if (tail) {
        const from = Math.min(Math.max(tail.top, under), tail.bottom - 1);
        bases.push(new DOMRect(tail.left, from, tail.width, tail.bottom - from));
      }
      overs.push(...limits.over);
    }
    const group = groups;
    groups += 1;
    const end = Math.max(...run.map((element) => element.getBoundingClientRect().right)) - frame.left;
    const all = [...bases, ...overs].filter((rect) => rect.width >= 0.5 && rect.height >= 0.5);
    all.forEach((rect, index) => add(rect, { group, closes: index === all.length - 1, groupX1: end }));
  };
  const atoms = (children: Element[]) => {
    for (let i = 0; i < children.length; ) {
      const run: Element[] = [];
      let j = i;
      while (j < children.length) {
        const child = children[j]!;
        if (limitsOf(child)) run.push(child);
        else if (!(run.length && child.classList.contains("mspace"))) break;
        j += 1;
      }
      if (run.length) {
        indexed(run);
        i = j;
      } else {
        atom(children[i]!);
        i += 1;
      }
    }
  };

  const atom = (element: Element) => {
    if (element.classList.contains("strut") || element.classList.contains("mspace")) return;
    const rect = element.getBoundingClientRect();
    if (rect.width < 0.5) return;
    if (element.classList.contains("mfrac") && fraction(element)) return;
    if (element.classList.contains("mtable") && table(element)) return;
    const inside = Array.from(element.children).filter(
      (child) => !child.classList.contains("strut") && child.getBoundingClientRect().width >= 0.5,
    );
    if (inside.length > 0 && inside.every(isAtom)) {
      inside.forEach(atom);
      return;
    }
    add(rect);
  };

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? "";
      let at = 0;
      for (const char of text) {
        const end = at + char.length;
        if (char.trim() !== "") {
          range.setStart(node, at);
          range.setEnd(node, end);
          const rect = Array.from(range.getClientRects()).find((r) => r.width >= 0.5);
          if (rect) add(rect, { prose: true, char });
        }
        at = end;
      }
      return;
    }
    if (!(node instanceof Element)) return;
    if (node.classList.contains("katex")) {
      const html = node.querySelector(".katex-html");
      for (const part of Array.from(html?.children ?? [])) {
        if (part.classList.contains("base")) atoms(Array.from(part.children));
        else add(part.getBoundingClientRect());
      }
      return;
    }
    if (node instanceof SVGElement || node instanceof HTMLImageElement) {
      add(node.getBoundingClientRect());
      return;
    }
    node.childNodes.forEach(walk);
  };
  walk(line);
  range.detach();
  if (pieces.length === 0) return null;

  // THE ROWS. A piece starts a new row when it is wholly below the row so far, or when the
  // writing has gone back left and down — a wrap. A fraction's parts go back left and down
  // on purpose, so they never start one.
  const rows: { top: number; bottom: number }[] = [];
  let lastRight = -Infinity;
  for (const piece of pieces) {
    const row = rows[rows.length - 1];
    const middle = (piece.y0 + piece.y1) / 2;
    const fresh =
      !row ||
      (piece.group < 0 &&
        (piece.y0 >= row.bottom - 1 ||
          (piece.x0 < lastRight - em * 0.5 && middle > row.bottom - (row.bottom - row.top) * 0.25)));
    if (fresh) rows.push({ top: piece.y0, bottom: piece.y1 });
    else {
      row.top = Math.min(row.top, piece.y0);
      row.bottom = Math.max(row.bottom, piece.y1);
    }
    piece.row = rows.length - 1;
    if (piece.group < 0 || piece.closes) lastRight = piece.group < 0 ? piece.x1 : piece.groupX1;
  }
  const pad = em;
  const edges = [-pad];
  for (let index = 1; index < rows.length; index += 1) {
    edges.push((rows[index - 1]!.bottom + rows[index]!.top) / 2);
  }
  edges.push(frame.height + pad);

  // THE PATH, and how long each part of it takes, in units: a letter about as many as its
  // width in ems, a mathematical sign a little more (it has more strokes to it), a word's
  // letters all a touch quicker or slower than the last word's.
  const random = seeded(
    Array.from(line.textContent ?? "").reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) | 0, 7),
  );
  let pace = 0.9 + random() * 0.28;
  const segments: Segment[] = [];
  let units = 0;
  const penAt = (piece: Piece, side: "from" | "to"): Pt => {
    const x = side === "from" ? piece.x0 : piece.x1;
    const h = piece.y1 - piece.y0;
    const y = piece.bar
      ? (piece.y0 + piece.y1) / 2
      : piece.prose
        ? piece.y0 + h * 0.6
        : piece.y0 + h * 0.55;
    return [x, y];
  };
  pieces.forEach((piece, index) => {
    const before = pieces[index - 1];
    if (before) {
      const from = penAt(before, "to");
      const to = penAt(piece, "from");
      const dx = to[0] - from[0];
      const dy = to[1] - from[1];
      const back = piece.row !== before.row;
      const pause = before.prose ? (PAUSES[before.char] ?? 0) : 0;
      const hop = back || pause > 0 || dx > em * 0.12 || dx < -1 || Math.abs(dy) > em * 0.3;
      if (hop) {
        const distance = Math.hypot(dx, dy) / em;
        const cost = back
          ? Math.min(3.4, 1.3 + distance * 0.18)
          : Math.min(1.4, 0.22 + distance * 0.4) + pause;
        segments.push({
          ink: false,
          piece: index,
          u0: units,
          u1: units + cost,
          from,
          to,
          lift: back ? 1 : Math.min(0.8, 0.25 + distance * 0.3 + pause * 0.2),
          back,
        });
        units += cost;
        // A new word, a new pace.
        if (back || dx > em * 0.2) pace = 0.88 + random() * 0.3;
      }
    }
    const width = (piece.x1 - piece.x0) / em;
    const height = piece.y1 - piece.y0;
    const cost = pace * (piece.bar ? 0.2 + width * 0.45 : piece.prose ? 0.3 + width : 0.4 + width * 1.1);
    segments.push({
      ink: true,
      piece: index,
      u0: units,
      u1: units + cost,
      from: penAt(piece, "from"),
      to: penAt(piece, "to"),
      strokes: piece.bar ? 0 : Math.max(1, Math.min(4, Math.round(width / 0.3))),
      reach: piece.bar ? 0 : Math.min(height * 0.15, em * 0.14),
    });
    units += cost;
  });

  const firstOfLast = pieces.find((piece) => piece.row === rows.length - 1) ?? pieces[0]!;
  const lowest = rows[rows.length - 1]!.bottom;
  return {
    pieces,
    segments,
    edges,
    right: Math.max(frame.width, ...pieces.map((piece) => piece.x1)) + pad,
    pad,
    origin: [frame.left - base.left, frame.top - base.top],
    total: units,
    margin: [Math.min(pieces[0]!.x0, firstOfLast.x0), lowest + em * 1.5],
  };
}

/* ---- Icons: the app's outline family (24 grid, 1.9 stroke, round caps) -------------------- */

function icon(paths: ReactNode) {
  return function Icon({ size = 20 }: { size?: number }) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {paths}
      </svg>
    );
  };
}

const IconClose = icon(
  <>
    <path d="M6 6l12 12" />
    <path d="M18 6 6 18" />
  </>,
);
const IconBack = icon(
  <>
    <path d="M19 12H5" />
    <path d="m11 6-6 6 6 6" />
  </>,
);
const IconPlay = icon(
  <path d="M7 4.8v14.4a1 1 0 0 0 1.5.9l11.2-7.2a1 1 0 0 0 0-1.7L8.5 3.9A1 1 0 0 0 7 4.8Z" fill="currentColor" />,
);
const IconPause = icon(
  <>
    <rect x="6" y="4.5" width="4" height="15" rx="1.2" fill="currentColor" />
    <rect x="14" y="4.5" width="4" height="15" rx="1.2" fill="currentColor" />
  </>,
);
const IconNext = icon(
  <>
    <path d="M5 12h14" />
    <path d="m13 6 6 6-6 6" />
  </>,
);
const IconCheck = icon(<path d="m5 12.5 4.5 4.5L19 7.5" />);

/** The words of a line as compared: no maths markup, case, spaces or punctuation. */
function plainWords(text: string): string {
  return text
    .replace(/\\ce\{([^}]*)\}/g, "$1")
    .replace(/[$\\{}]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

/** Does this line only restate the question in the box (the same words, or nearly all of
 *  them)? Then it is not written a second time. */
export function restates(line: string, question: string): boolean {
  const said = plainWords(line);
  const asked = plainWords(question);
  if (!said || !asked) return false;
  if (said === asked) return true;
  return said.length >= 20 && asked.includes(said) && said.length >= 0.8 * asked.length;
}
const IconAsk = icon(
  <path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.2A8 8 0 1 1 20 12Z" />,
);

/**
 * THE LESSON'S TIMELINE (founder, 12 Nov 2026: "no place to move the video to a specific point
 * in time"). One mark where each section starts (Welcome, Objectives, each term, Recap). Drag or
 * tap along it: while it is held it says where it will land; let go and the lesson goes there.
 * The arrow keys step through it, Home and End go to the ends.
 */
function Timeline({
  lines,
  shown,
  onSeek,
}: {
  lines: Entry[];
  shown: number;
  onSeek: (step: number) => void;
}) {
  const [held, setHeld] = useState<number | null>(null);
  const total = lines.length;
  const at = held ?? Math.max(1, shown);
  const share = (step: number) => (total > 1 ? ((step - 1) / (total - 1)) * 100 : 0);
  const sections = lines.flatMap((line, index) =>
    line.section ? [{ step: index + 1, name: line.section }] : [],
  );
  const sectionOf = (step: number) =>
    [...sections].reverse().find((section) => section.step <= step)?.name ?? null;
  const name = sectionOf(at);
  const commit = (step: number) => {
    setHeld(null);
    if (step !== shown) onSeek(step);
  };
  return (
    <div className="pb-col pb-timeline">
      <div className="pb-tl-head">
        <span className={`pb-tl-where ${held !== null ? "held" : ""}`}>{name ?? "Lesson"}</span>
        <span className="pb-tl-count sj-mono">
          {at} / {total}
        </span>
      </div>
      <div className="pb-tl-track">
        <span className="pb-tl-fill" style={{ width: `${share(Math.max(1, shown))}%` }} />
        {sections.map((section) => (
          <span
            key={section.step}
            className={`pb-tl-mark ${section.step <= shown ? "past" : ""}`}
            style={{ left: `${share(section.step)}%` }}
            title={section.name}
          />
        ))}
        {held !== null ? (
          <>
            <span className="pb-tl-ghost" style={{ left: `${share(held)}%` }} />
            <span className="pb-tl-bubble" style={{ left: `${share(held)}%` }}>
              {name ?? "Lesson"} · {held}
            </span>
          </>
        ) : null}
        <input
          type="range"
          min={1}
          max={total}
          step={1}
          value={at}
          aria-label="Go to a point in the lesson"
          aria-valuetext={`${name ? `${name}, ` : ""}step ${at} of ${total}`}
          onChange={(event) => {
            const step = Number(event.target.value);
            // A drag or a held key: show where it would land. A click, or a key let go,
            // lands there (below).
            setHeld(step);
          }}
          onPointerUp={(event) => commit(Number((event.target as HTMLInputElement).value))}
          onKeyUp={(event) => commit(Number((event.target as HTMLInputElement).value))}
          onBlur={() => setHeld(null)}
        />
      </div>
    </div>
  );
}
const IconMic = icon(
  <>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
    <path d="M12 17.5V21" />
  </>,
);
const IconStop = icon(<rect x="6.5" y="6.5" width="11" height="11" rx="2" fill="currentColor" />);
const IconSend = icon(
  <>
    <path d="M12 19V5" />
    <path d="m5.5 11.5 6.5-6.5 6.5 6.5" />
  </>,
);
