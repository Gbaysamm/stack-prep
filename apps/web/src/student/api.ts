/**
 * The student side's typed client.
 *
 * Only the identity is held in the browser. Everything a student would be upset to lose —
 * the goal, the sitting, every answer — is written to the database as it happens, so closing
 * the tab loses nothing and reopening it finds the sitting where it stopped.
 */

import type { QuestionFigure } from '../Figures.js';

export interface SubjectOffer {
  subject_id: string;
  code: string;
  name: string;
  deliverable_questions: number;
  teachable_skills: number;
  /** JAMB topics with lessons: the count students see. "Skill" is never shown. */
  teachable_topics?: number;
  ready: boolean;
  blocked_reason: string | null;
  /** Every candidate of the exam sits it (UTME: Use of English). */
  compulsory: boolean;
}

export interface ExaminationOffer {
  examination_id: string;
  short_name: string;
  name: string;
  exam_body: string;
  /** Every subject is sat on one day (UTME): one date for the whole exam. False when each
   *  paper has its own date (WAEC, NECO), some possibly on the same day. */
  sits_together: boolean;
  /** How many subjects one candidate may enter; null when there is no limit. */
  max_subjects: number | null;
  compulsory_subject_codes: string[];
  subjects: SubjectOffer[];
}

export interface Goal {
  subject_id: string;
  subject_name: string;
  examination_id: string;
  examination_short_name: string;
  /** The date is the exam's one date, shared by all its subjects: changing it here changes all. */
  shared_date: boolean;
  target_score: number | null;
  exam_date: string | null;
  minutes_per_day: number | null;
  study_days: number[] | null;
  sessions_before_exam: number | null;
}

export interface GoalIn {
  target_score: number;
  exam_date: string;
  minutes_per_day: number;
  study_days: number[];
}

export interface Sitting {
  session_id: string;
  subject_id: string;
  subject_name: string;
  answered: number;
  finished: boolean;
}

export interface CheckupOption {
  option_key: string;
  body: string;
}

export interface CheckupQuestion {
  position: number;
  of: number;
  /** The DB topic, which is JAMB's section. Prefer `section_name` / `subtopic_name`. */
  topic_name: string;
  section_name?: string | null;
  /** JAMB's topic this question is on. */
  subtopic_name?: string | null;
  question_version_id: string;
  stem: string;
  instructions: string | null;
  passage_title: string | null;
  passage_body: string | null;
  options: CheckupOption[];
  figures?: QuestionFigure[];
}

export interface CheckupState {
  session_id: string;
  answered: number;
  length: number;
  finished: boolean;
  weights_source: string;
  question: CheckupQuestion | null;
}

/** One JAMB topic (the DB subtopic). `topic_name` is its JAMB section; so is `section_name`. */
export interface SubtopicReport {
  subtopic_id: string;
  name: string;
  topic_name: string;
  section_id?: string | null;
  section_name?: string | null;
  share: number;
  answered: number;
  correct: number;
  mastery: number | null;
  confidence: string;
}

export interface PlanLine {
  subtopic_id: string;
  name: string;
  /** JAMB's section (the DB topic); so is `section_name`. */
  topic_name: string;
  section_name?: string | null;
  share: number;
  mastery_now: number;
  mastery_projected: number;
  sessions: number;
  marks_gained: number;
  reason: string;
}

export interface ScoreProjection {
  score_now: number;
  score_low: number;
  score_high: number;
  score_projected: number;
  target_score: number | null;
  sessions_available: number;
  shortfall_note: string | null;
  unmeasured_share: number;
  plan: PlanLine[];
  caveat: string;
}

/** One DB topic, which is JAMB's SECTION: a heading over its topics, not a unit of work. */
export interface TopicReport {
  topic_id: string;
  name: string;
  answered: number;
  correct: number;
  mastery: number | null;
  confidence: string;
  highest_level_correct: number | null;
  lowest_level_wrong: number | null;
  slow: boolean;
}

export interface CheckupReport {
  session_id: string;
  subject_id: string;
  answered: number;
  finished: boolean;
  topics: TopicReport[];
  subtopics: SubtopicReport[];
  weights_source: string;
  projection: ScoreProjection | null;
  unassessed_topics: string[];
  priority_topics: string[];
  caveat: string;
}

export interface PracticeOption {
  option_key: string;
  body: string;
}

export interface PracticeQuestion {
  question_version_id: string;
  subtopic_name: string;
  topic_name: string;
  stem: string;
  instructions: string | null;
  passage_title: string | null;
  passage_body: string | null;
  options: PracticeOption[];
  hints_used: number;
  figures?: QuestionFigure[];
}

export interface Misconception {
  name: string;
  description: string;
  remediation_note: string | null;
}

export interface PracticeState {
  session_id: string;
  stage: 'asking' | 'hint' | 'explain' | 'finished';
  position: number;
  length: number;
  answered: number;
  correct_unaided: number;
  taught: number;
  question: PracticeQuestion | null;
  hint: string | null;
  solution_steps: string[] | null;
  correct_option_key: string | null;
  misconception: Misconception | null;
  closing_note: string | null;
}

/** One beat of a taught lesson: what goes up on the board, and what is said meanwhile. */
export interface LessonBeat {
  /** The reviewed step this teaches; one past the last for the answer; null for the opening. */
  board_index: number | null;
  write: string[];
  /** When each written item goes up, as a fraction of the way through `say`. */
  write_at: number[];
  say: string;
  voice_url: string;
  /** The moment that gives the answer, which the board marks. */
  answer: boolean;
  /** Marks drawn over earlier lines while this beat is said: circles, underlines, arrows. */
  point?: LessonPoint[] | null;
  /**
   * The sketch this beat brings onto the board: true (or 'sketch') for the first, 'sketch_b' or
   * 'sketch_c' for a later one. A sketch no beat brings in comes with the first.
   */
  show_sketch?: boolean | 'sketch' | 'sketch_b' | 'sketch_c';
  /** A small picture this beat draws beside a line (Doodle.tsx), if any. */
  doodle?: LessonDoodleRef | null;
  /** Or the one or two it brings in (doodles v2), and what the pen does to earlier ones. */
  doodles?: LessonDoodleRef[] | null;
  doodle_do?: LessonDoodleOp[] | null;
}

/**
 * A doodle a beat brings onto the board: a picture drawn by the pen beside a line.
 * `name` is a library doodle's ('lightbulb') or the lesson's own ('custom:2011_q42_roof', in
 * `NarratedLesson.doodles`); `near` is the moment whose line it sits by (default: this one's).
 */
export interface LessonDoodleRef {
  name: string;
  caption?: string | null;
  near?: number | null;
  /** Its handle in the lesson, which later beats' `doodle_do` name it by. */
  id?: string | null;
  /** small (about 70px), medium (120px, the default) or a scene (320x200). */
  size?: 'small' | 'medium' | 'scene' | null;
  /** A community of small figures drawn one by one: how many of `name`, or of each kind. */
  repeat?: number | { name: string; n: number }[] | null;
  layout?: 'row' | 'grid' | 'cluster' | null;
}

/** Something the pen does to a doodle already on the board (docs/plans/doodles-v2-contract.md). */
export interface LessonDoodleOp {
  id: string;
  op:
    | 'pulse'
    | 'circle'
    | 'highlight'
    | 'underline'
    | 'cross'
    | 'label'
    | 'arrow'
    | 'stage'
    | 'move'
    | 'fill'
    | 'grow'
    | 'shrink'
    | 'count'
    | 'group'
    | 'split';
  part?: string | null;
  n?: number | null;
  text?: string | null;
  /** A fill's level, 0 to 1. */
  to?: number | null;
  to_part?: string | null;
  to_id?: string | null;
  stage?: string | null;
  path?: string | null;
  fill?: string | null;
  by?: number | null;
}

/** A picture drawn for this question's lesson, in the board's art format (Doodle.tsx). */
export interface LessonDoodle {
  /** 'custom:YYYY_qNN_x'. */
  name: string;
  svg: string;
  alt_text?: string | null;
}

/**
 * A diagram drawn for the lesson from the question's own words, for a question with no printed
 * figure. The SVG's text, shown on the board as a picture (an <img> of a data: URL), never as
 * markup.
 */
export interface LessonSketch {
  name: 'sketch' | 'sketch_b' | 'sketch_c';
  svg: string;
  alt_text?: string | null;
  width?: number | null;
  height?: number | null;
}

/**
 * A teacher's mark on the board, pointing back at a line already written — or, for a question
 * with a diagram, at the diagram itself.
 *
 * A mark on the working names a moment (`line`) and, if only part of it, the piece (`at`).
 * An `arrow` or a `move` may also say where it comes FROM, another piece on this line or an
 * earlier one, and is then drawn piece to piece: the 2 in front of a log carried up to be its
 * power, a term taken across the equals sign, a value brought down from the line it was found
 * on. A mark on the diagram names the figure (`figure`) and a `target` in it instead of a line.
 */
export interface LessonPoint {
  /**
   * The moment pointed at: its index from 0, or counted back from this beat when negative.
   * Absent on a mark on the diagram.
   */
  line?: number | null;
  kind: LessonPointKind;
  /** A few words written beside the mark. */
  text?: string | null;
  /**
   * Part of the line to mark rather than all of it, as it reads on the board (spaces ignored).
   * Where the piece occurs more than once, the words around it pick it out and `[[ ]]` marks
   * the part meant: `6[[2]]` is the 2 just after the 6.
   */
  at?: string | null;
  /** Where an arrow or a move starts: a piece of this line or an earlier one. */
  from?: LessonPointFrom | null;
  /**
   * Which diagram a mark is on: one of the question's figures by its number from 0, or the
   * lesson's own sketch ('sketch', and 'sketch_b' for a second).
   */
  figure?: number | 'sketch' | 'sketch_b' | 'sketch_c' | null;
  /**
   * What on the figure is marked: a point by its label ('B'), a side by its two ends ('AB'),
   * an angle by three points with the vertex in the middle ('ABC'), the labels as a list where
   * one is longer than a letter (['P', "Q'"]), or a place in the drawing's own units ({x, y}).
   */
  target?: string | string[] | FigureSpot | null;
  /**
   * An arrow across between the working and a diagram: from a piece of the working (`line`,
   * `at`) to a point on a figure (`to.figure`, `to.target`), or from a figure mark to a piece
   * of the working (`to.line`, `to.at`).
   */
  to?: LessonPointTo | null;
  /**
   * A mark in the question's passage (comprehension, cloze): `target` is its words as they
   * read there, and `nth` which occurrence (from 1) where they occur more than once.
   */
  passage?: boolean | null;
  nth?: number | null;
  /**
   * Board-internal, never sent: a link the board found for itself (a quote on a line of the
   * working that is in the passage). Drawn in the passage only, paired with its line.
   */
  auto?: boolean;
}

/** Where an arrow across goes: a place on a diagram, or a piece of a line of the working. */
export interface LessonPointTo {
  figure?: number | 'sketch' | 'sketch_b' | 'sketch_c' | null;
  target?: string | string[] | FigureSpot | null;
  line?: number | null;
  at?: string | null;
  /** Or a place in the passage: `target` is its words, `nth` which occurrence. */
  passage?: boolean | null;
  nth?: number | null;
  /** Or a doodle on the board, by its id, and a part of its art. */
  doodle?: string | null;
  part?: string | null;
}

export type LessonPointKind =
  | 'circle'
  | 'underline'
  | 'arrow'
  | 'box'
  | 'highlight'
  | 'strike'
  | 'move'
  | 'arc'
  | 'label';

export interface LessonPointFrom {
  line: number;
  at?: string | null;
}

/** A place on a figure, in the units of its SVG's viewBox. */
export interface FigureSpot {
  x: number;
  y: number;
}

export interface NarratedLesson {
  /** "model": a teacher's narration. "steps": none could be made; the steps are read. */
  source: 'model' | 'steps';
  beats: LessonBeat[];
  /** The lesson's own diagrams, for a question that describes its figure in words. */
  sketches?: LessonSketch[];
  /** The pictures drawn for this lesson's board, which its beats' `doodle` name. */
  doodles?: LessonDoodle[];
  /** The right option's words: written into a cloze passage's gap at the answer. */
  answer_text?: string | null;
}

export interface TutorReply {
  reply: string;
  spoken: string;
  board: string[];
  /** 'model' when the coach answered; otherwise the reviewed steps stood in for it. */
  source: 'model' | 'fallback' | 'budget';
  asks_left: number;
}

export interface PracticeAnswerIn {
  question_version_id: string;
  selected_option_key: string;
  response_ms: number;
  confidence: 'sure' | 'unsure' | 'guessed' | null;
}

export interface Features {
  /** The coach speaks its explanation aloud. */
  coach_voice: boolean;
  /** The student may ask by speaking. Off until the legal review rules on recording a minor. */
  student_voice: boolean;
}

export interface StudentIdentity {
  student_id: string;
  display_name: string;
  external_ref: string;
  consent_recorded: boolean;
}

/** The message behind a failed response, unwrapped from FastAPI's `detail` when it is there. */
async function readError(response: Response): Promise<string> {
  let detail = await response.text();
  try {
    detail = (JSON.parse(detail) as { detail?: string }).detail ?? detail;
  } catch {
    /* the body was not JSON; show it as it came */
  }
  return detail;
}

/** Fired on the window whenever a goal is saved or removed, so a countdown drawn elsewhere on
 *  the page (the sidebar, the top bar) can fetch the new dates instead of showing the old. */
export const GOALS_CHANGED = 'sj:goals-changed';
function announceGoalsChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(GOALS_CHANGED));
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/v1${path}`, {
    headers: { 'content-type': 'application/json' },
    ...init,
  });
  if (!response.ok) {
    throw new Error(await readError(response));
  }
  return (await response.json()) as T;
}

export const api = {
  /** Stands in for signing in until ADR-0013 lands. The student row and its consent are real. */
  createStudent: (displayName?: string) =>
    call<StudentIdentity>('/dev/students', {
      method: 'POST',
      body: JSON.stringify(displayName ? { display_name: displayName } : {}),
    }),
  catalogue: () => call<ExaminationOffer[]>('/student/catalogue'),
  goals: (studentId: string) => call<Goal[]>(`/student/${studentId}/goals`),
  setGoal: (studentId: string, subjectId: string, goal: GoalIn) =>
    call<Goal>(`/student/${studentId}/goals/${subjectId}`, {
      method: 'PUT',
      body: JSON.stringify(goal),
    }).then((saved) => {
      announceGoalsChanged();
      return saved;
    }),
  /** Take a subject off the student's list. Its runs and answers are kept. */
  removeGoal: async (studentId: string, subjectId: string) => {
    const response = await fetch(`/v1/student/${studentId}/goals/${subjectId}`, { method: 'DELETE' });
    if (!response.ok) throw new Error(await readError(response));
    announceGoalsChanged();
  },
  /** What this deployment has switched on. Asked rather than assumed, so a client never
   *  draws a microphone the server would refuse. */
  features: () => call<Features>('/features'),
  /** The worked solution as a lesson, for the board. */
  practiceLesson: (sessionId: string, questionVersionId: string) =>
    call<NarratedLesson>(`/practice/${sessionId}/lesson/${questionVersionId}`),
  /** Start making the lesson on the first wrong answer, so the board opens on it ready. */
  practiceWarm: (sessionId: string, questionVersionId: string) =>
    call<{ beats: number }>(`/practice/${sessionId}/lesson/${questionVersionId}/warm`, {
      method: 'POST',
    }),
  sittings: (studentId: string) => call<Sitting[]>(`/student/${studentId}/sittings`),
  start: (studentId: string, subjectId: string) =>
    call<CheckupState>('/checkup/start', {
      method: 'POST',
      body: JSON.stringify({ student_id: studentId, subject_id: subjectId }),
    }),
  answer: (sessionId: string, questionVersionId: string, optionKey: string, responseMs: number) =>
    call<CheckupState>(`/checkup/${sessionId}/answer`, {
      method: 'POST',
      body: JSON.stringify({
        // Generated here so a retried submission is stored once, not twice.
        attempt_id: crypto.randomUUID(),
        question_version_id: questionVersionId,
        selected_option_key: optionKey,
        response_ms: responseMs,
      }),
    }),
  /** Where an already-open sitting is, for a client that has just reloaded. */
  current: (sessionId: string) => call<CheckupState>(`/checkup/${sessionId}`),
  report: (sessionId: string) => call<CheckupReport>(`/checkup/${sessionId}/report`),
  startPractice: (studentId: string, subjectId: string, length = 10) =>
    call<PracticeState>('/practice/start', {
      method: 'POST',
      body: JSON.stringify({ student_id: studentId, subject_id: subjectId, length }),
    }),
  practiceCurrent: (sessionId: string) => call<PracticeState>(`/practice/${sessionId}`),
  practiceAnswer: (sessionId: string, body: PracticeAnswerIn) =>
    call<PracticeState>(`/practice/${sessionId}/answer`, {
      method: 'POST',
      body: JSON.stringify({ attempt_id: crypto.randomUUID(), ...body }),
    }),
  practiceTaught: (sessionId: string) =>
    call<PracticeState>(`/practice/${sessionId}/taught`, { method: 'POST' }),
  /**
   * Ask the coach about the working on the board. Only the words and the step go up: the
   * server reads the question, the reviewed solution and the wrong answer for itself.
   */
  practiceAsk: (
    sessionId: string,
    questionVersionId: string,
    asked: string,
    stepIndex: number | null,
  ) =>
    call<TutorReply>(`/practice/${sessionId}/ask`, {
      method: 'POST',
      body: JSON.stringify({
        question_version_id: questionVersionId,
        asked,
        step_index: stepIndex,
      }),
    }),

  /**
   * Send a spoken question to be turned into words.
   *
   * The words come back for the student to read and send themselves; this never asks on
   * their behalf. Transcription mishears things, and a question nobody approved should not
   * reach the coach or the record of what was asked. The recording is not stored anywhere —
   * it is transcribed inside the request and dropped.
   */
  practiceListen: async (
    sessionId: string,
    questionVersionId: string,
    recording: Blob,
  ): Promise<string> => {
    const form = new FormData();
    form.append('question_version_id', questionVersionId);
    form.append('audio', recording, 'question.webm');
    const response = await fetch(`/v1/practice/${sessionId}/listen`, {
      method: 'POST',
      body: form,
    });
    if (!response.ok) throw new Error(await readError(response));
    return ((await response.json()) as { asked: string }).asked;
  },

  /**
   * The same ask, watched and heard rather than waited for.
   *
   * The coach answers in two channels: `onSay` for a line spoken aloud, `onBoard` for a line
   * written up. `onAudio` arrives later with the voice for a spoken line, by index, because
   * speech takes longer to make than words do — the text is always there first, so a muted
   * phone or a failed voice call is a quieter lesson rather than a missing one. `onReset`
   * means what was stored differs from what was streamed, and the lesson should be rebuilt.
   */
  practiceAskStreaming: async (
    sessionId: string,
    questionVersionId: string,
    asked: string,
    stepIndex: number | null,
    handlers: {
      onSay: (index: number, text: string) => void;
      onBoard: (after: number, text: string) => void;
      /** A sketch to put on the board: SVG the server has already reduced to safe shapes. */
      onDraw: (after: number, svg: string) => void;
      onVoice: (index: number, url: string | null) => void;
      onReset: () => void;
    },
  ): Promise<TutorReply> => {
    const response = await fetch(`/v1/practice/${sessionId}/ask/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        question_version_id: questionVersionId,
        asked,
        step_index: stepIndex,
      }),
    });
    if (!response.ok || !response.body) {
      throw new Error(await readError(response));
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffered = '';
    let settled: TutorReply | null = null;

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffered += decoder.decode(value, { stream: true });

      // Frames are separated by a blank line; anything after the last one is a partial
      // frame and stays in the buffer until the rest of it arrives.
      const frames = buffered.split('\n\n');
      buffered = frames.pop() ?? '';
      for (const frame of frames) {
        const rows = frame.split('\n');
        const name = rows.find((row) => row.startsWith('event: '))?.slice(7);
        const data = rows.find((row) => row.startsWith('data: '))?.slice(6);
        if (!name || !data) continue;
        const payload = JSON.parse(data) as {
          index?: number;
          after?: number;
          text?: string;
          url?: string | null;
          source?: string;
          asks_left?: number;
        };
        if (name === 'say' && payload.text !== undefined && payload.index !== undefined) {
          handlers.onSay(payload.index, payload.text);
        }
        if (name === 'board' && payload.text !== undefined) {
          handlers.onBoard(payload.after ?? -1, payload.text);
        }
        if (name === 'draw' && payload.text !== undefined) {
          handlers.onDraw(payload.after ?? -1, payload.text);
        }
        // `url` is null when this line has no voice — said explicitly, so the board does
        // not sit waiting on audio that is never coming.
        if (name === 'voice' && payload.index !== undefined) {
          handlers.onVoice(payload.index, payload.url ?? null);
        }
        if (name === 'reset') handlers.onReset();
        if (name === 'done') {
          settled = {
            reply: '',
            spoken: '',
            board: [],
            source: (payload.source ?? 'fallback') as TutorReply['source'],
            asks_left: payload.asks_left ?? 0,
          };
        }
      }
    }

    if (settled === null) throw new Error('the coach stopped writing before it finished');
    return settled;
  },
};
