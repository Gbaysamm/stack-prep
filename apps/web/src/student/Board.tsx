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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

import type { NarratedLesson, TutorReply } from './api.js';
import { Coach } from './Coach.js';
import { Figures, type QuestionFigure } from '../Figures.js';
import { Maths } from '../Maths.js';
import './theme.css';

const STEP_MS = 5200;

/** How long a line waits for its voice before the board writes it unheard. Long: a line
 *  written before its voice arrives is worse than a short wait the student is told about. */
const VOICE_WAIT_MS = 30000;

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
}

/** Resolve once a clip can start without stalling, or after `limitMs` whatever happens. */
function whenReady(clip: HTMLAudioElement | null, limitMs: number): Promise<void> {
  if (!clip || clip.readyState >= 3) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      clip.removeEventListener('canplay', done);
      clip.removeEventListener('error', done);
      window.clearTimeout(timer);
      resolve();
    };
    const timer = window.setTimeout(done, limitMs);
    clip.addEventListener('canplay', done);
    clip.addEventListener('error', done);
  });
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
  board: { kind: 'write' | 'draw'; text: string }[];
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

/**
 * How long a board line takes to be written.
 *
 * Paced off its length, because a hand crossing a board takes longer for a longer line. The
 * first version wrote everything in a flat seven hundred milliseconds, which was over before
 * a student had looked up.
 */
function writeMs(line: string): number {
  return Math.min(3200, 600 + line.length * 32);
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
  const [draft, setDraft] = useState('');
  const [turn, setTurn] = useState<(TutorReply & { asked: string }) | null>(null);
  const [waiting, setWaiting] = useState(false);
  //: Everything the board is already carrying: earlier questions and what was written under
  //: them. A teacher does not rub the board out between questions — they keep going down it,
  //: and a student looking back at what they asked ten minutes ago should still find it.
  const [written, setWritten] = useState<
    { kind: 'asked' | 'answered' | 'coach' | 'drawn'; text: string }[]
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
      })),
      {
        label: null,
        items: [answerLine],
        at: [0],
        say: answerLine,
        voice: null,
        step: null,
        answer: true,
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
  const listener = useRef<{ context: AudioContext; analyser: AnalyserNode } | null>(null);
  const wired = useRef<WeakSet<HTMLAudioElement>>(new WeakSet());
  const faceRef = useRef<SVGSVGElement>(null);
  const watching = useRef<number | null>(null);

  const mouth = useCallback((openness: number) => {
    faceRef.current?.style.setProperty('--mouth', openness.toFixed(3));
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
      audio.preload = 'auto';
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
    for (let ahead = 1; ahead <= VOICES_AHEAD; ahead += 1) prime(cursor.current + ahead);
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
  const askedKindRef = useRef<'asked' | 'answered'>('asked');
  const playedRef = useRef(0);
  const [askedKind, setAskedKind] = useState<'asked' | 'answered'>('asked');
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
    const spoken = script.current.slice(0, playedRef.current).filter((beat) => beat.said);
    const last = spoken[spoken.length - 1];
    return last !== undefined && last.said.trim().endsWith('?');
  }, []);

  /** Move the exchange on the board into the part of it that stays. */
  const keep = useCallback(() => {
    const lines: { kind: 'asked' | 'answered' | 'coach' | 'drawn'; text: string }[] = [];
    if (askedRef.current !== null) {
      lines.push({ kind: askedKindRef.current, text: askedRef.current });
    }
    for (const beat of script.current.slice(0, playedRef.current)) {
      for (const line of beat.board) {
        lines.push({ kind: line.kind === 'draw' ? 'drawn' : 'coach', text: line.text });
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
        beat.voice.src = '';
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
      setAskIssue('I could not reach the microphone. You can type instead.');
      return;
    }

    const pieces: Blob[] = [];
    const active = new MediaRecorder(stream);
    recorder.current = active;
    active.ondataavailable = (event) => pieces.push(event.data);
    active.onstop = () => {
      for (const track of stream.getTracks()) track.stop();
      setRecording(false);
      const recorded = new Blob(pieces, { type: active.mimeType || 'audio/webm' });
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
  const [replayed, setReplayed] = useState(0);
  const clips = useRef(new Map<number, HTMLAudioElement>());
  const narrating = useRef<number | null>(null);
  const clipFor = useCallback(
    (index: number): HTMLAudioElement | null => {
      const url = lines[index]?.voice;
      if (!url) return null;
      let clip = clips.current.get(index);
      if (!clip) {
        clip = new Audio(url);
        clip.preload = 'auto';
        clips.current.set(index, clip);
      }
      return clip;
    },
    [lines],
  );
  useEffect(() => {
    lines.forEach((_, index) => clipFor(index));
  }, [clipFor, lines]);

  useEffect(() => {
    if (paused || preparing || needsTap) return;
    let cancelled = false;
    const timers: number[] = [];
    const later = (run: () => void, ms: number) => timers.push(window.setTimeout(run, ms));
    // The next line goes up only when its voice can start. The wait is long on purpose: a
    // line's audio may still be being made, and a line written before its voice arrives is
    // the one thing the board must not do. A student waiting sees that the coach is getting
    // ready rather than a silent board filling up.
    const onward = (delay: number) =>
      later(() => {
        if (shown >= lines.length) return;
        const next = clipFor(shown);
        const slow = window.setTimeout(() => !cancelled && setGettingReady(true), 1200);
        timers.push(slow);
        void whenReady(next, VOICE_WAIT_MS).then(() => {
          window.clearTimeout(slow);
          if (cancelled) return;
          setGettingReady(false);
          advance();
        });
      }, delay);
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
    if (!entry || clip === null) {
      // No voice at all here: the board is read, not heard, so it writes as before.
      setQuestionUp(true);
      setItemsShown(entry?.items.length ?? 0);
      onward(STEP_MS);
      return stop;
    }

    // A new beat starts from its beginning; after a pause it carries on where it was.
    if (narrating.current !== index) {
      clip.currentTime = 0;
      setItemsShown(0);
    }
    narrating.current = index;
    const writeAll = () => setItemsShown(entry.items.length);
    // THE VOICE LEADS. Nothing is written until the teacher has started saying it: each item
    // waits for its own words, and never less than a short lead after the voice begins. Its
    // writing then takes the rest of the time its words take, so the hand follows the voice
    // and the line is finished as the sentence ends — never before the voice, never after.
    const pace = () => {
      const seconds = Number.isFinite(clip.duration) && clip.duration > 0 ? clip.duration : 2.5;
      const lead = Math.min(0.7, seconds * 0.15);
      const count = Math.max(1, entry.items.length);
      setHandMs(Math.max(450, ((seconds * 0.92 - lead) * 1000) / count));
      if (index === 0) later(() => setQuestionUp(true), 0);
      entry.items.forEach((_, item) => {
        const fraction = entry.at[item] ?? item / count;
        const due = (Math.max(fraction * seconds, lead) - clip.currentTime) * 1000;
        const show = () => setItemsShown((current) => Math.max(current, item + 1));
        if (due <= 0) show();
        else later(show, due);
      });
    };
    clip.onended = () => {
      unfollow();
      writeAll();
      // A breath, not a pause: the next beat's voice is already here.
      onward(250);
    };
    let retried = false;
    clip.onerror = () => {
      if (cancelled) return;
      // One more try before giving up on the voice: a line still being made on the server
      // can fail once and succeed a moment later.
      if (!retried) {
        retried = true;
        later(() => {
          clip.load();
          void clip.play().catch(() => undefined);
        }, 1500);
        return;
      }
      setQuestionUp(true);
      writeAll();
      onward(STEP_MS);
    };
    clip
      .play()
      .then(() => {
        if (cancelled) return;
        setVoiceBlocked(false);
        pace();
        const analyser = listen(clip);
        if (analyser) follow(analyser);
      })
      .catch((error: Error) => {
        if (cancelled || error.name === 'AbortError') return;
        if (error.name === 'NotAllowedError') {
          // The browser wants a tap before it will play sound. The lesson waits for it,
          // rather than writing itself out in silence.
          setNeedsTap(true);
          return;
        }
        setVoiceBlocked(true);
        setQuestionUp(true);
        writeAll();
        onward(STEP_MS);
      });
    return () => {
      stop();
      clip.onended = null;
      clip.onerror = null;
      clip.pause();
      unfollow();
    };
  }, [advance, clipFor, follow, lines, listen, needsTap, paused, preparing, replayed, shown, unfollow]);

  // Nothing left playing once the board is closed.
  useEffect(
    () => () => {
      for (const clip of clips.current.values()) clip.pause();
    },
    [],
  );

  // Keep the newest line in view: a long solution should scroll itself rather than write
  // below the fold and wait to be found. `played` is here as well as `shown`, because the
  // board fills from two directions — the reviewed steps and the coach's own hand — and a
  // line written below the fold looks to a student exactly like a line that was rubbed out.
  // Only lines already reached are on the board at all, so the bottom is the newest line and
  // not the empty room the unwritten steps used to hold, which scrolled the question away.
  useEffect(() => {
    inkRef.current?.scrollTo({ top: inkRef.current.scrollHeight, behavior: 'smooth' });
  }, [shown, played, asked]);

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
      keep();
      rewind();
      setAskedKind(answering ? 'answered' : 'asked');
      setAsked(question);
      setTurn(null);
      setDraft('');

      // The script is held in a ref as well as in state: the player reads it from the ref so
      // it always sees the newest beat, and the state copy is only what React renders.
      const publish = () => setBeats([...script.current]);
      const beatAt = (index: number): Beat => {
        script.current[index] ??= {
          said: '',
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
            beatAt(Math.max(0, after)).board.push({ kind: 'write', text });
            publish();
          },
          onDraw: (after, svg) => {
            setWaiting(false);
            setWriting(true);
            beatAt(Math.max(0, after)).board.push({ kind: 'draw', text: svg });
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
    [awaitingAnswer, draft, hush, keep, onAsk, play, rewind, stepIndex, waiting],
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
    ? 'That is the whole working. This one goes back in the pile — you will meet the same ground again, with a different question.'
    : needsTap
      ? 'Tap the button on the board to hear the lesson.'
      : preparing || gettingReady || shown === 0
        ? 'Getting the lesson ready…'
        : (lines[shown - 1]?.say ?? '');

  // A student has to be able to tell being answered from being handed the same step again,
  // so the card says which of the two just happened rather than sounding the same either way.
  const status = waiting
    ? 'Coach · reading your question'
    : speaking !== null
      ? 'Coach · speaking'
      : writing || played > 0
        ? 'Coach · explaining'
        : turn
          ? turn.source === 'model'
            ? 'Coach · said its piece'
            : 'Coach · cannot talk this through — here is the reviewed step'
          : paused
            ? 'Coach · paused — your place is kept'
            : finished
              ? 'Coach · finished'
              : `Coach · step ${shown} of ${lines.length}`;

  return (
    <div className="sp sp-coach">
      <div className="sp-cbar">
        <button className="sp-btn sm light" type="button" onClick={onDone}>
          Close
        </button>
        <div className="sp-lesson">
          <span>
            <small>{subtitle}</small>
            <strong>{title}</strong>
          </span>
        </div>
        <div className="sp-steps-mini">
          {lines.map((line, index) => (
            <i key={line.say + String(index)} className={index < shown ? 'on' : ''} />
          ))}
        </div>
      </div>

      <div className={`sp-board ${paused ? 'dim' : ''}`}>
        {needsTap ? (
          <button
            type="button"
            className="sp-btn sp-tap"
            onClick={() => {
              // The tap is what the browser needs; the lesson then carries on from here.
              setNeedsTap(false);
              setReplayed((count) => count + 1);
            }}
          >
            ▶ Tap to start the lesson
          </button>
        ) : null}
        <div className="sp-ink sp-textbook" ref={inkRef}>
          {questionUp ? (
            <>
              <span className="sp-hl show sp-question sp-question-in">
                <Maths text={question} />
              </span>
              <Figures figures={figures} compact />
            </>
          ) : null}
          {lines.slice(0, shown).map((line, index) => {
            const current = index === shown - 1;
            const items = current ? line.items.slice(0, itemsShown) : line.items;
            if (items.length === 0) return null;
            return (
              <span
                key={line.say + String(index)}
                className={`sp-hl show sp-written ${line.answer ? 'answer' : ''}`}
              >
                {items.map((item, piece) => (
                  <span
                    key={item + String(piece)}
                    className="sp-item sp-hand"
                    // Written out over the time its words take, not flashed up whole.
                    style={{ '--write-ms': `${current ? handMs : 0}ms` } as CSSProperties}
                  >
                    <Maths text={item} />
                  </span>
                ))}
              </span>
            );
          })}

          {/*
            Earlier questions and what was written under them. Kept, because a board is not
            wiped between questions — a student who asked something ten minutes ago should
            still be able to look back and find it.
          */}
          {written.map((line, index) =>
            line.kind === 'drawn' ? (
              <span key={`kept-${index}`} className="sp-hl show coach kept sp-drawing">
                <span className="n">coach</span>
                <span dangerouslySetInnerHTML={{ __html: line.text }} />
              </span>
            ) : line.kind !== 'coach' ? (
              <span key={`kept-${index}`} className="sp-hl show coach-asked">
                <span className="n">{line.kind}</span>
                {line.text}
              </span>
            ) : (
              <span key={`kept-${index}`} className="sp-hl show coach kept">
                <span className="n">coach</span>
                <Maths text={line.text} />
              </span>
            ),
          )}

          {/*
            What the coach is writing now, under the reviewed working and marked as the
            coach's own hand rather than the board's. The question they asked goes up first,
            the way a teacher writes the question down before answering it.
          */}
          {asked !== null ? (
            <span className="sp-hl show coach-asked">
              <span className="n">{askedKind}</span>
              {asked}
            </span>
          ) : null}
          {/*
            FLATTENED, AND EVERY LINE KEYED. Mapping beats to arrays of lines left the outer
            array unkeyed, so React rebuilt the whole run of board lines whenever a new beat
            arrived — which restarted the writing animation on every line already up, and
            each new line appeared to wipe the ones before it off the board.
          */}
          {beats.slice(0, played).flatMap((beat, index) =>
            beat.board.map((line, row) =>
              line.kind === 'draw' ? (
                <span key={`coach-${index}-${row}`} className="sp-hl show coach sp-drawing">
                  <span className="n">coach</span>
                  {/*
                    The server has already reduced this to a whitelist of shapes — no script,
                    no foreignObject, no URL of any kind — which is why it can be set as
                    markup here. The sanitising is done there because that is where it can be
                    tested, and it is the only place this markup is ever allowed in from.
                  */}
                  <span dangerouslySetInnerHTML={{ __html: line.text }} />
                </span>
              ) : (
                <span
                  key={`coach-${index}-${row}`}
                  className="sp-hl show coach"
                  // Long lines take longer to write, the way a hand does.
                  style={{ '--write-ms': `${writeMs(line.text)}ms` } as CSSProperties}
                >
                  <span className="n">coach</span>
                  <Maths text={line.text} />
                </span>
              ),
            ),
          )}
          {writing || speaking !== null ? <span className="sp-nib" aria-hidden="true" /> : null}
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
        <div className={`sp-tutorcard ${paused ? 'paused' : ''} ${voiceBlocked ? '' : 'slim'}`}>
          <Coach faceRef={faceRef} speaking={speaking !== null} listening={recording} />
          <div>
            <div className="who">
              <span className="dot" />
              {status}
            </div>
            {voiceBlocked && played > 0 ? (
              <div className="sp-spoken">
                {beats.slice(0, played).map((beat, index) =>
                  beat.said ? (
                    <p
                      key={`said-${index}`}
                      className={speaking === index ? 'saying now' : 'saying'}
                    >
                      <Maths text={beat.said} />
                    </p>
                  ) : null,
                )}
              </div>
            ) : played === 0 ? (
              <p>{waiting ? 'Let me look at that with you…' : <Maths text={caption} />}</p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="sp-dock">
        <form className="sp-ask" onSubmit={send}>
          <div className="row">
            <input
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                // A student typing a question is no longer reading the board, and a step that
                // scrolls past mid-sentence is the step they were about to ask about.
                if (event.target.value !== '') setPaused(true);
              }}
              onKeyDown={(event) => {
                // Submitted here rather than left to the form, because this box is mostly
                // used on a phone, where sending is the keyboard's own Go key and not a tap
                // on the button beside it.
                if (event.key === 'Enter') void send(event);
              }}
              placeholder={
                stepIndex === null
                  ? 'Ask the coach about the working…'
                  : `Ask about step ${stepIndex + 1}…`
              }
              aria-label="Ask the coach about this working"
              maxLength={ASK_MAX_CHARS}
              disabled={waiting}
            />
            {onListen ? (
              <button
                className={`sp-btn sm light sp-mic ${recording ? 'on' : ''}`}
                type="button"
                onClick={() => void (recording ? stopRecording() : startRecording())}
                disabled={waiting || listening}
                aria-label={recording ? 'Stop recording' : 'Ask by speaking'}
                title={recording ? 'Stop recording' : 'Ask by speaking'}
              >
                {listening ? '…' : recording ? '■' : '🎤'}
              </button>
            ) : null}
            <button
              className="sp-btn sm"
              type="submit"
              disabled={waiting || draft.trim() === ''}
            >
              {waiting ? '…' : 'Ask'}
            </button>
          </div>
          <span className="note">
            {askIssue
              ? askIssue
              : voiceBlocked
                ? 'I cannot play the voice here, so the lesson is written out instead.'
                : recording
                ? 'Listening… press stop when you have finished your question.'
                : listening
                  ? 'Writing down what you said…'
                  : turn && turn.asks_left <= LOW_ON_ASKS
                    ? `${turn.asks_left} more question${turn.asks_left === 1 ? '' : 's'} today.`
                    : 'Lost a step? Ask about it — the coach answers from this working.'}
          </span>
        </form>
        <div className="ctl">
          <button
            type="button"
            title="Replay this step"
            onClick={() => {
              resume();
              narrating.current = null;
              setReplayed((count) => count + 1);
            }}
            disabled={shown === 0}
          >
            ↺
          </button>
          <button
            type="button"
            title={paused ? 'Resume' : 'Pause'}
            onClick={() => {
              resume();
              setPaused((value) => !value);
            }}
            disabled={finished}
          >
            {paused ? '▶' : '❚❚'}
          </button>
          <button
            type="button"
            title="Next step"
            onClick={() => {
              resume();
              if (finished) onDone();
              else advance();
            }}
          >
            {finished ? '✓' : '→'}
          </button>
        </div>
      </div>
    </div>
  );
}
