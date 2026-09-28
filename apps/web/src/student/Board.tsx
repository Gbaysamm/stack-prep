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
import type { CSSProperties, ReactNode, RefObject } from "react";

import type { LessonPoint, NarratedLesson, TutorReply } from "./api.js";
import { Coach } from "./Coach.js";
import { Figures, type QuestionFigure } from "../Figures.js";
import { Maths } from "../Maths.js";
import "../prep/prep.css";
import "../prep/board.css";

const STEP_MS = 5200;

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

/** How long a line is left up to be read when there is no voice to hear it by. */
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

/** The room left between the line being written and the top of the coach card. */
const FOLLOW_GAP = 16;

function stillMotion(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

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
  steps,
  answerLine,
  loadLesson,
  onDone,
  onAsk,
  onListen,
}: {
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
   * The PASSAGE is deliberately not here. A comprehension passage is several paragraphs and
   * writing it out would bury the working under it; the question about it is the part that
   * needs to stay in front of the student.
   */
  question: string;
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
  const [draft, setDraft] = useState("");
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

  const lines: Entry[] = useMemo(() => {
    if (lesson && lesson.beats.length > 0) {
      return lesson.beats.map((beat) => {
        const answer = beat.answer || beat.board_index === steps.length;
        // A written lesson writes its own answer line; a narration's closing borrows ours.
        const bare = answer && beat.write.length === 0;
        return {
          label: null,
          items: bare ? [answerLine] : beat.write,
          at: bare ? [0] : beat.write_at,
          say: beat.say,
          voice: beat.voice_url,
          step: beat.board_index !== null && !answer ? beat.board_index : null,
          answer,
          point: beat.point ?? [],
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
  }, [answerLine, lesson, steps]);
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
        const context = new AudioContext();
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
  //: The beat whose marks are due, once the line they belong to has been written out.
  const [wantPoint, setWantPoint] = useState<number | null>(null);
  //: Bumped each time the hand finishes a line, so the wait below looks again.
  const [writtenTick, setWrittenTick] = useState(0);
  //: The lesson's own voice is sounding, so the coach's face shows it is talking.
  const [voicing, setVoicing] = useState(false);
  const clips = useRef(new Map<number, HTMLAudioElement>());
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
        clip = new Audio(fresh ? `${url}${url.includes("?") ? "&" : "?"}try=${Date.now()}` : url);
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
  const missed = (index: number) => {
    failedBeats.current.add(index);
    misses.current += 1;
    if (misses.current >= 3) setSilent(true);
  };

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
      later(() => setWantPoint(at), MARK_LEAD_MS);
      onward(entry ? readingMs(entry.say) : STEP_MS);
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
      later(() => setWantPoint(index), MARK_LEAD_MS);
      onward(STEP_MS);
      return stop;
    }

    // A new beat starts from its beginning; after a pause it carries on where it was.
    if (narrating.current !== index) {
      clip.currentTime = 0;
      setItemsShown(0);
      setPointing(null);
      setWantPoint(null);
    }
    narrating.current = index;
    const writeAll = () => setItemsShown(entry.items.length);
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
      setHandMs(Math.max(450, ((seconds * 0.92 - lead) * 1000) / count));
      if (index === 0) later(() => setQuestionUp(true), 0);
      // The marks go up once the line they start from has been written: the teacher writes,
      // then turns and points back at where it came from.
      later(
        () => setWantPoint(index),
        Math.max(0, (lead + 0.75 - clip.currentTime) * 1000),
      );
      entry.items.forEach((_, item) => {
        const fraction = entry.at[item] ?? item / count;
        const due =
          (Math.max(fraction * seconds, lead) - clip.currentTime) * 1000;
        const show = () =>
          setItemsShown((current) => Math.max(current, item + 1));
        if (due <= 0) show();
        else later(show, due);
      });
    };
    clip.onended = () => {
      unfollow();
      setVoicing(false);
      writeAll();
      // A breath, not a pause: the next beat's voice is already here.
      onward(250);
    };
    clip.onerror = () => {
      if (cancelled) return;
      missed(index);
      readAlong(entry, index);
    };
    clip
      .play()
      .then(() => {
        if (cancelled) return;
        setVoiceBlocked(false);
        setVoicing(true);
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
      clip.onended = null;
      clip.onerror = null;
      clip.pause();
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
    unfollow,
  ]);

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
            beat.voiceUrl = url;
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

  // THE MARKS WAIT FOR THE WRITING. A beat's marks are due a moment after its voice starts, but
  // they go up only once every piece of its line is on the board and the hand has finished it:
  // a highlight under words not yet written, or a word crossed out before it exists, reads as
  // the board knowing the answer before the teacher does. If the hand never reports (a line it
  // could not measure), the marks go up anyway after a generous wait.
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    const bump = () => setWrittenTick((value) => value + 1);
    sheet.addEventListener(WRITTEN_EVENT, bump);
    return () => sheet.removeEventListener(WRITTEN_EVENT, bump);
  }, []);
  useEffect(() => {
    if (wantPoint === null || pointing === wantPoint) return;
    const entry = lines[wantPoint];
    const row = sheetRef.current?.querySelector(`[data-line="${wantPoint}"]`);
    const items = row ? Array.from(row.querySelectorAll<HTMLElement>(".pb-item")) : [];
    const done =
      !entry ||
      (items.length >= entry.items.length &&
        items.every((item) => item.dataset.written !== undefined));
    const timer = window.setTimeout(
      () => setPointing(wantPoint),
      done ? MARK_AFTER_WRITE_MS : MARK_SAFETY_MS,
    );
    return () => window.clearTimeout(timer);
  }, [wantPoint, pointing, writtenTick, itemsShown, lines]);

  // THE MARKS. A beat may point back at a line already written — circle a term, underline
  // it, draw an arrow to where a line came from — the way a teacher turns to the board and
  // points. The current beat's marks are drawn in full; the last beat's stay, faded, until
  // the next beat that points at something; older ones are rubbed out so the board does not
  // fill with arrows. None show while the coach is answering a question: they belong to the
  // lesson, not the answer.
  const markSets: MarkSet[] = useMemo(() => {
    const current = shown - 1;
    let past = -1;
    for (let index = current - 1; index >= 0; index -= 1) {
      if (lines[index]?.point.length) {
        past = index;
        break;
      }
    }
    const sets: MarkSet[] = [];
    lines.forEach((line, index) => {
      if (!line.point.length || index > current) return;
      let state: MarkState;
      if (asked !== null) state = "gone";
      else if (index === current) {
        if (pointing !== index) return;
        state = "live";
      } else state = index === past ? "past" : "gone";
      sets.push({ index, points: line.point, state });
    });
    return sets;
  }, [asked, lines, pointing, shown]);

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
    const ceiling = view.top + 12;
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
      box.bottom <= view.bottom - coachRoom.current + 2 && box.top >= view.top
    );
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
      stage.style.setProperty("--coach-room", `${room}px`);
      if (following.current) keepInView(newest.current);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(coach);
    observer.observe(stage);
    if (sheetRef.current) observer.observe(sheetRef.current);
    return () => observer.disconnect();
  }, [keepInView]);

  const talking = speaking !== null || voicing;
  // The marker puts itself down for each line and lifts off when it is done, so it is only
  // held back while the board is waiting for a tap or has stepped back for the student.
  const penActive = !needsTap && !(paused && asked === null && !waiting);
  // Only the lesson dims while the student types: the coach's answer to them is what they
  // are reading, and it stays at full strength.
  const dim = paused && asked === null && !waiting;
  const progress = lines.length ? Math.min(1, shown / lines.length) : 0;
  const showCaption = played === 0;
  const showTranscript = voiceBlocked && played > 0;
  const nextLabel = finished ? "Done" : "Next step";

  return (
    <div className={`sj pb ${talking ? "is-talking" : ""}`}>
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
          <div
            className={`pb-col pb-sheet sp-textbook ${dim ? "dim" : ""}`}
            ref={sheetRef}
          >
            {questionUp ? (
              <section className="pb-question" aria-label="The question">
                <span className="sj-eyebrow">The question</span>
                <div
                  className="pb-question-text pb-stroke"
                  data-ink=""
                  style={{ "--stroke": "1100ms" } as CSSProperties}
                >
                  <Maths text={question} />
                </div>
                <Figures figures={figures} compact />
              </section>
            ) : null}

            <div className="pb-lesson">
              {lines.slice(0, shown).map((line, index) => {
                const current = index === shown - 1;
                const items = current
                  ? line.items.slice(0, itemsShown)
                  : line.items;
                if (items.length === 0) return null;
                return (
                  <div
                    key={line.say + String(index)}
                    data-line={index}
                    className={`pb-line ${line.answer ? "answer" : ""}`}
                  >
                    {line.answer ? (
                      <span className="pb-answer-tag sj-mono">Answer</span>
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

            <Marks sheetRef={sheetRef} sets={markSets} />
            <Pen
              sheetRef={sheetRef}
              active={penActive}
              tick={inkTick}
              canSee={penCanSee}
            />
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
        <div className="pb-coachdock">
          <div className="pb-col">
            <div
              ref={coachRef}
              className={`pb-coach ${paused ? "paused" : ""} ${
                talking ? "talking" : ""
              } ${showCaption || showTranscript ? "" : "slim"}`}
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
          </div>
        </div>
      </main>

      <footer className="pb-dock">
        <div className="pb-col pb-dock-in">
          <div className="pb-ctl" role="group" aria-label="Lesson controls">
            <button
              type="button"
              title="Replay this step"
              aria-label="Replay this step"
              onClick={() => {
                resume();
                following.current = true;
                narrating.current = null;
                setReplayed((count) => count + 1);
              }}
              disabled={shown === 0}
            >
              <IconReplay />
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
          </div>

          <form className="pb-ask" onSubmit={send}>
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
                  if (event.key === "Enter") void send(event);
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
}

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
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
}

/** A mark's few words: beside it on the right, on the left, or centred above it. */
interface Label {
  x: number;
  y: number;
  side: "right" | "left" | "above";
  text: string;
}

/** A small seeded generator, so a mark wobbles the same way every time it is redrawn. */
function seeded(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Pt = [number, number];

/** A smooth open curve through the points (Catmull–Rom, as cubic Béziers). */
function through(points: Pt[]): string {
  const f = (n: number) => n.toFixed(1);
  const first = points[0];
  if (!first) return "";
  let d = `M${f(first[0])} ${f(first[1])}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p0 = points[i - 1] ?? p1;
    const p3 = points[i + 2] ?? p2;
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d;
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

/** The glyph boxes behind `inkBox`, kept to the part of a sideways-scrolling line on screen. */
function inkRects(root: Element, at?: string | null): DOMRect[] {
  const nodes = textNodes(root);
  const range = document.createRange();
  const rects: DOMRect[] = [];
  const whole = () => {
    for (const node of nodes) {
      range.selectNodeContents(node);
      rects.push(...Array.from(range.getClientRects()));
    }
  };
  const needle = at ? Array.from(at).map(fold).join("") : "";
  if (!needle) whole();
  else {
    let compact = "";
    const where: { node: Text; offset: number }[] = [];
    for (const node of nodes) {
      for (let offset = 0; offset < node.data.length; offset += 1) {
        const char = fold(node.data.charAt(offset));
        if (!char) continue;
        compact += char;
        where.push({ node, offset });
      }
    }
    const found = compact.indexOf(needle);
    const first = found < 0 ? undefined : where[found];
    if (!first) whole();
    else {
      // One range per run of characters inside the same text node.
      let start = first;
      let last = first;
      const flush = () => {
        range.setStart(start.node, start.offset);
        range.setEnd(last.node, last.offset + 1);
        rects.push(...Array.from(range.getClientRects()));
      };
      for (let i = found + 1; i < found + needle.length; i += 1) {
        const next = where[i];
        if (!next) break;
        if (next.node !== last.node) {
          flush();
          start = next;
        }
        last = next;
      }
      flush();
    }
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

function drawCircle(box: Box, rnd: () => number): string {
  const cx = (box.left + box.right) / 2;
  const cy = (box.top + box.bottom) / 2;
  const ry = Math.max(13, (box.bottom - box.top) / 2 + 6);
  // Never taller than it is wide: round a single figure, not bracket it.
  const rx = Math.max(ry + 5, (box.right - box.left) / 2 + 10);
  const start = -2.35 + (rnd() - 0.5) * 0.3;
  // A hand does not close a circle exactly: it goes a little past where it began.
  const sweep = Math.PI * 2 + 0.5;
  const points: Pt[] = [];
  const count = 22;
  for (let i = 0; i < count; i += 1) {
    const t = i / (count - 1);
    const angle = start + sweep * t;
    const wobble = 1 + (rnd() - 0.5) * 0.06;
    const grow = 1 + 0.08 * t;
    points.push([
      cx + Math.cos(angle) * rx * grow * wobble,
      cy + Math.sin(angle) * ry * grow * wobble,
    ]);
  }
  return through(points);
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

/**
 * A highlighter pass along each row: a broad flat stroke, a touch uneven top and bottom and
 * not quite level, the way a chisel marker goes across words.
 */
function drawHighlight(rows: Box[], rnd: () => number): { d: string; width: number } {
  let d = "";
  let width = 0;
  for (const row of rows) {
    const height = row.bottom - row.top;
    width = Math.max(width, height * 0.82);
    const x0 = row.left - 3 + (rnd() - 0.5) * 2;
    const x1 = row.right + 3 + (rnd() - 0.5) * 3;
    const y = (row.top + row.bottom) / 2 + height * 0.04;
    const tilt = (rnd() - 0.5) * 2.2;
    const points: Pt[] = [];
    const count = Math.max(3, Math.round((x1 - x0) / 60) + 2);
    for (let i = 0; i < count; i += 1) {
      const t = i / (count - 1);
      points.push([x0 + (x1 - x0) * t, y + tilt * (t - 0.5) + (rnd() - 0.5) * 1.4]);
    }
    d += (d ? " " : "") + through(points);
  }
  return { d, width };
}

/** A crossing-out: one quick line through each row, rising a little, overshooting the ends. */
function drawStrike(rows: Box[], rnd: () => number): string {
  let d = "";
  for (const row of rows) {
    const height = row.bottom - row.top;
    const y = (row.top + row.bottom) / 2 + height * 0.06;
    const x0 = row.left - 5;
    const x1 = row.right + 6;
    const rise = Math.min(5, (x1 - x0) * 0.03) + rnd() * 1.5;
    const points: Pt[] = [];
    for (let i = 0; i < 4; i += 1) {
      const t = i / 3;
      points.push([x0 + (x1 - x0) * t, y + rise * (0.5 - t) + (rnd() - 0.5) * 1.6]);
    }
    d += (d ? " " : "") + through(points);
  }
  return d;
}

function arrowHead(tip: Pt, from: Pt): string {
  const angle = Math.atan2(tip[1] - from[1], tip[0] - from[0]);
  const size = 10;
  const a1 = angle + Math.PI - 0.5;
  const a2 = angle + Math.PI + 0.5;
  const f = (n: number) => n.toFixed(1);
  return `M${f(tip[0] + Math.cos(a1) * size)} ${f(tip[1] + Math.sin(a1) * size)} L${f(tip[0])} ${f(tip[1])} L${f(tip[0] + Math.cos(a2) * size)} ${f(tip[1] + Math.sin(a2) * size)}`;
}

function bezierAt(p0: Pt, c1: Pt, c2: Pt, p3: Pt, t: number): Pt {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const e = t * t * t;
  return [
    a * p0[0] + b * c1[0] + c * c2[0] + e * p3[0],
    a * p0[1] + b * c1[1] + c * c2[1] + e * p3[1],
  ];
}

/** About how wide a label's chip is: 13px semibold, and its padding. */
function labelWidth(text: string): number {
  return Math.min(text.length * 7.4 + 22, 260);
}

/** Room a label needs beside its mark before it is put on the other side instead. */
const LABEL_ROOM = 150;

function measureMarks(sheet: HTMLElement, sets: MarkSet[]): Shape[] {
  const base = sheet.getBoundingClientRect();
  const width = sheet.clientWidth;
  // The sheet's own side gutters are usable: arrows may bow into them but not past them.
  const minX = 6;
  const maxX = width - 6;
  const shapes: Shape[] = [];
  // Where labels already sit, so a second one on the same line does not land on the first.
  const placed: Box[] = [];
  const labelBox = (label: Label): Box => {
    const w = labelWidth(label.text);
    const left =
      label.side === "right" ? label.x : label.side === "left" ? label.x - w : label.x - w / 2;
    const top = label.side === "above" ? label.y - 22 : label.y - 11;
    return { left, top, right: left + w, bottom: top + 22 };
  };
  const clashes = (label: Label) => {
    const a = labelBox(label);
    return placed.some(
      (b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top,
    );
  };
  const push = (shape: Shape) => {
    if (shape.label && shape.state !== "gone") placed.push(labelBox(shape.label));
    shapes.push(shape);
  };
  // The mark being made now gets first choice of where its words go.
  const order: Record<MarkState, number> = { live: 0, past: 1, gone: 2 };
  for (const set of [...sets].sort((a, b) => order[a.state] - order[b.state])) {
    set.points.forEach((point, k) => {
      const target = point.line < 0 ? set.index + point.line : point.line;
      if (target < 0 || target > set.index) return;
      const line = lineAt(sheet, target);
      if (!line) return;
      const whole = inkBox(line);
      const found = point.at ? inkBox(line, point.at) : whole;
      if (!found || !whole) return;
      const box = relative(found, base);
      const lineBox = relative(whole, base);
      const rnd = seeded(set.index * 131 + k * 17 + target * 7 + 3);
      const key = `${set.index}-${k}`;
      const text = point.text?.trim() || null;
      // Right of the mark where there is room, else left of it, never off the board.
      const beside = (right: number, left: number, y: number): Label | null =>
        text
          ? right + LABEL_ROOM <= width
            ? { x: right, y, side: "right", text }
            : left - LABEL_ROOM >= 0
              ? { x: left, y, side: "left", text }
              : null
          : null;
      // Words for a mark inside a run of text — an underlined word, a highlighted clue, a
      // crossed-out option: after the end of its row, where the board is clear, else just
      // above the mark. Beside the mark itself they sat on top of the next words.
      const inline = (rows: Box[]): Label | null => {
        const first = rows[0];
        const last = rows[rows.length - 1];
        if (!text || !first || !last) return null;
        const w = labelWidth(text);
        const middle = (last.top + last.bottom) / 2;
        const rowEnd =
          inkRows(line)
            .map((row) => relative(row, base))
            .find((row) => middle > row.top && middle < row.bottom)?.right ?? last.right;
        const options: Label[] = [];
        if (rowEnd + 12 + w <= width) options.push({ x: rowEnd + 12, y: middle, side: "right", text });
        const cx = Math.min(
          Math.max((first.left + first.right) / 2, w / 2 + 2),
          width - w / 2 - 2,
        );
        options.push({ x: cx, y: first.top - 2, side: "above", text });
        return options.find((option) => !clashes(option)) ?? options[options.length - 1]!;
      };

      if (point.kind === "circle" || point.kind === "box") {
        const d = point.kind === "circle" ? drawCircle(box, rnd) : drawBox(box, rnd);
        const rx = (box.right - box.left) / 2 + 12;
        const cx = (box.left + box.right) / 2;
        // Beside the circle at its shoulder; on a narrow board, sat on top of it instead.
        const label: Label | null =
          text && cx + rx + 4 + LABEL_ROOM > width
            ? { x: Math.min(Math.max(cx, 70), width - 70), y: box.top - 8, side: "above", text }
            : beside(cx + rx + 4, cx - rx - 4, box.top - 2);
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
      if (point.kind === "underline") {
        const d = drawUnderline(box, rnd);
        push({
          key,
          kind: "underline",
          state: set.state,
          d,
          head: null,
          label: inline(inkRows(line, point.at).map((row) => relative(row, base))),
        });
        return;
      }

      // An arrow, from the line this beat wrote back to the one it came from.
      if (target === set.index) return;
      const fromLine = lineFrom(sheet, set.index);
      const fromInk = fromLine ? inkBox(fromLine) : null;
      if (!fromInk) return;
      const from = relative(fromInk, base);
      const fromY = (from.top + from.bottom) / 2;
      // A whole line, or the end of one, is reached from the right-hand side, where the board
      // is clear; the start of a line from the left margin; a piece in the middle of a line
      // from underneath.
      const atEnd = !point.at || Math.abs(box.right - lineBox.right) < 8;
      const atStart = !atEnd && Math.abs(box.left - lineBox.left) < 8;
      let start: Pt;
      let tip: Pt;
      let c1: Pt;
      let c2: Pt;
      let label: Label | null = null;
      if (atStart) {
        start = [from.left - 6, fromY];
        tip = [box.left - 6, (box.top + box.bottom) / 2];
        const bow = Math.max(minX, Math.min(from.left, box.left) - 34);
        c1 = [bow, start[1]];
        c2 = [bow, tip[1]];
        // The words go at the line the arrow starts from, where the margin has no room.
        label = beside(from.right + 34, -1, fromY);
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
      const wob = (p: Pt): Pt => [p[0] + (rnd() - 0.5) * 6, p[1] + (rnd() - 0.5) * 6];
      c1 = wob(c1);
      c2 = wob(c2);
      const f = (n: number) => n.toFixed(1);
      const d = `M${f(start[0])} ${f(start[1])} C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(tip[0])} ${f(tip[1])}`;
      const mid = bezierAt(start, c1, c2, tip, 0.5);
      if (!atStart) label = beside(mid[0] + 8, mid[0] - 8, mid[1]);
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
  return shapes;
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
}: {
  sheetRef: RefObject<HTMLDivElement>;
  sets: MarkSet[];
}) {
  const [shapes, setShapes] = useState<Shape[]>([]);
  const measure = useCallback(() => {
    const sheet = sheetRef.current;
    if (!sheet || sets.length === 0) {
      setShapes((now) => (now.length ? [] : now));
      return;
    }
    setShapes(measureMarks(sheet, sets));
  }, [sets, sheetRef]);

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

  if (shapes.length === 0) return null;
  const highlights = shapes.filter((shape) => shape.kind === "highlight");
  return (
    <div className="pb-marks" aria-hidden="true">
      {/*
        Highlights on a layer of their own, multiplied into the board: the yellow goes behind
        the words, which stay black, the way a highlighter pen works on paper.
      */}
      {highlights.length ? (
        <svg className="pb-marks-svg under">
          {highlights.map((shape) => (
            <g key={shape.key} className={`pb-mark highlight ${shape.state}`}>
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
        {shapes.filter((shape) => shape.kind !== "highlight").map((shape) => (
          <g key={shape.key} className={`pb-mark ${shape.kind} ${shape.state}`}>
            <path className="pb-mark-line" d={shape.d} pathLength={1} />
            {shape.head ? (
              <path className="pb-mark-head" d={shape.head} pathLength={1} />
            ) : null}
          </g>
        ))}
      </svg>
      {shapes.map((shape) =>
        shape.label ? (
          <span
            key={`label-${shape.key}`}
            className={`pb-mark-label ${shape.kind} ${shape.state} ${shape.label.side}`}
            style={{ left: shape.label.x, top: shape.label.y }}
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
  line.dataset.written = "";
  line.closest(".pb-sheet")?.dispatchEvent(new Event(WRITTEN_EVENT));
}

/** Sent on the sheet each time the hand finishes a line. */
const WRITTEN_EVENT = "pb-written";

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
        if (part.classList.contains("base")) Array.from(part.children).forEach(atom);
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
const IconReplay = icon(
  <>
    <path d="M3 12a9 9 0 1 0 3-6.7" />
    <path d="M3 4v5h5" />
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
