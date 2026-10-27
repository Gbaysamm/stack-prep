/**
 * The student side's typed client.
 *
 * Only the identity is held in the browser. Everything a student would be upset to lose —
 * the goal, the sitting, every answer — is written to the database as it happens, so closing
 * the tab loses nothing and reopening it finds the sitting where it stopped.
 */
import { failure, reach } from '../lib/friendlyError.js';

import type { OptionFigure, QuestionFigure } from '../Figures.js';
import type { BoardVoice } from './boardPrefs.js';

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
  /** The option's drawing, when the option is a picture; `body` is then only its label. */
  figure?: OptionFigure | null;
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

/** Topic status labels (docs/student-scoring.md §2). */
export type TopicStatus = 'not_tried' | 'just_started' | 'needs_work' | 'getting_there' | 'strong';

/** One JAMB topic's score: right ÷ answered, over the latest answer to each question. */
export interface TopicScore {
  subtopic_id: string;
  name: string;
  section_id: string;
  section_name: string;
  /** Share of the exam; orders the plan, never enters a score. */
  share: number;
  answered: number;
  right: number;
  /** Whole percentage, null when nothing answered. */
  score: number | null;
  /** The topic's score after the first sitting that touched it. */
  started_score: number | null;
  status: TopicStatus;
}

export interface CheckupResult {
  session_id: string;
  finished_at: string;
  answered: number;
  right: number;
  score: number | null;
}

/** Every number shown for a subject (docs/student-scoring.md). All whole percentages. */
export interface SubjectScore {
  subject_id: string;
  /** Right ÷ answered, latest answer to each question, the whole subject. */
  score: number | null;
  answered: number;
  right: number;
  /** How many topics `score` averages. */
  topics_tried: number;
  /** The first check-up's result. */
  started_score: number | null;
  /** score − started_score */
  change: number | null;
  /** The latest check-up's result. */
  predicted: number | null;
  /** Oldest first. */
  checkups: CheckupResult[];
  /** ISO date. */
  next_checkup_due: string | null;
  checkup_due: boolean;
  topics: TopicScore[];
}

export interface TopicChange {
  subtopic_id: string;
  name: string;
  before: number | null;
  after: number | null;
  /** In this sitting. */
  answered: number;
  right: number;
}

/** What one sitting did to the scores. */
export interface ScoreChange {
  before: number | null;
  after: number | null;
  topics: TopicChange[];
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
  /** This sitting: right ÷ answered. */
  right: number;
  score: number | null;
  /** The check-up before this one. */
  previous_score: number | null;
  /** The subject as it stands now, from every counted answer. */
  standing: SubjectScore | null;
  unassessed_topics: string[];
  priority_topics: string[];
  caveat: string;
}

export interface PracticeOption {
  option_key: string;
  body: string;
  /** The option's drawing, when the option is a picture; `body` is then only its label. */
  figure?: OptionFigure | null;
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
  /** From an earlier sitting, not yet got right without help. */
  comeback?: boolean;
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
  /** Once finished: the score before and after the run, and each topic it touched. */
  score_change?: ScoreChange | null;
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
  /** The word its `write` (and the sketch it brings in) lands on, in the whiteboard style. */
  on?: LessonCue | null;
  /**
   * The heading of the section of the working this moment starts (`section:` in the lesson
   * file): a heading chip with room above it in the whiteboard style; the classic one ignores it.
   */
  section?: string | null;
  /** A talking mouth this moment brings in (Mouth.tsx), for oral English. */
  mouth?: LessonMouth | null;
  /** A live diagram this beat brings in (LiveDiagram.tsx, doodles-v2-contract.md section 8). */
  diagram?: LessonDiagram | null;
  /** What the pen does to diagrams already on the board. */
  diagram_do?: LessonDiagramOp[] | null;
}

/**
 * A talking mouth (docs/plans/doodles-v2-contract.md section 7): it says `word` in time with the
 * voice, holding `sound` (IPA) with the symbol written beside it; with `syllables` and `stress`
 * the stressed syllable grows as it is said. `view: side` is a cut-away of the tongue's place.
 */
export interface LessonMouth {
  id?: string | null;
  word: string;
  sound?: string | null;
  syllables?: string[] | null;
  /** Which syllable is stressed, from 1. */
  stress?: number | null;
  view?: 'front' | 'side' | null;
  /** The word of `say` that starts it (its `word` by default). */
  on?: LessonCue | null;
  caption?: string | null;
}

/**
 * The word of its moment's `say` an item lands on in the whiteboard style (`on:` in the
 * lesson file, database/lesson_cues.py): a word or a few in a row, and which time they are
 * said. The classic style ignores it.
 */
export interface LessonCue {
  word: string;
  nth: number;
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
  /** The word it is drawn on, in the whiteboard style. */
  on?: LessonCue | null;
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
    | 'split'
    /** A talking mouth says `word` (its own word without it). */
    | 'say';
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
  /** The word a talking mouth says (`say`), and the sound it holds as it does (IPA). */
  word?: string | null;
  sound?: string | null;
  /** The word it is done on, in the whiteboard style. */
  on?: LessonCue | null;
}

/** A picture drawn for this question's lesson, in the board's art format (Doodle.tsx). */
export interface LessonDoodle {
  /** 'custom:YYYY_qNN_x'. */
  name: string;
  svg: string;
  alt_text?: string | null;
}

/* ---- Live diagrams (docs/plans/doodles-v2-contract.md section 8; student/diagram/) ---- */

export type DiagramKind =
  | 'graph'
  | 'venn'
  | 'pie'
  | 'bar'
  | 'histogram'
  | 'numberline'
  | 'tree'
  | 'table'
  | 'ogive'
  | 'ladder';

/** The colours a diagram may use, each with its meaning (docs/lesson-style-guide.md 5). */
export type DiagramColour = 'blue' | 'green' | 'purple' | 'orange' | 'red' | 'pink' | 'yellow' | 'grey';

/** A graph's curve or line: a function of x, or points joined. */
export interface DiagramPlot {
  fn?: string | null;
  points?: [number, number][] | null;
  join?: 'smooth' | 'straight' | 'none' | null;
  domain?: [number, number] | null;
  label?: string | null;
  colour?: DiagramColour | null;
  later?: boolean | null;
}

/** A dot on a graph or a number line. */
export interface DiagramDot {
  x: number;
  y?: number | null;
  text?: string | null;
  open?: boolean | null;
  colour?: DiagramColour | null;
}

export interface DiagramSet {
  key: string;
  name: string;
  total?: number | string | null;
  colour?: DiagramColour | null;
  later?: boolean | null;
}

export interface DiagramSector {
  label: string;
  value?: number | null;
  angle?: number | null;
  text?: string | null;
  colour?: DiagramColour | null;
  later?: boolean | null;
}

export interface DiagramBar {
  label: string;
  value: number;
  colour?: DiagramColour | null;
  later?: boolean | null;
}

export interface DiagramBin {
  from: number;
  to: number;
  value: number;
  colour?: DiagramColour | null;
  later?: boolean | null;
}

export interface DiagramBranch {
  label: string;
  p?: string | number | null;
  then?: DiagramBranch[] | null;
  later?: boolean | null;
}

/** A live diagram: what the pen draws when it arrives, in teaching order (section 8). */
export interface LessonDiagram {
  id: string;
  kind: DiagramKind;
  caption?: string | null;
  size?: 'medium' | 'scene' | null;
  near?: number | null;
  on?: LessonCue | null;
  // Axes (graph, ogive, bar, histogram).
  x?: [number, number] | null;
  y?: [number, number] | null;
  step?: number | null;
  x_step?: number | null;
  y_step?: number | null;
  x_label?: string | null;
  y_label?: string | null;
  grid?: boolean | null;
  // graph
  plots?: DiagramPlot[] | null;
  /** graph and numberline: dots; ogive: [x, cumulative frequency] pairs. */
  points?: (DiagramDot | [number, number])[] | null;
  // venn
  universal?: { name: string; total?: number | string | null } | null;
  sets?: DiagramSet[] | null;
  counts?: Record<string, string | number> | null;
  // pie
  sectors?: DiagramSector[] | null;
  show?: 'value' | 'angle' | 'percent' | 'none' | null;
  // bar, histogram
  bars?: DiagramBar[] | null;
  bins?: DiagramBin[] | null;
  // numberline
  range?: [number, number] | null;
  // tree
  root?: string | null;
  levels?: string[] | null;
  branches?: DiagramBranch[] | null;
  // table
  columns?: string[] | null;
  rows?: (string | number | null)[][] | null;
  // ogive
  start?: [number, number] | null;
  later?: boolean | null;
  // ladder (section 9): base conversion, prime factors, LCM and HCF
  mode?: 'divisor' | 'factors' | 'lcm' | null;
  divisor?: number | null;
  number?: number | null;
  numbers?: number[] | null;
  find?: 'lcm' | 'hcf' | 'both' | null;
}

/** Something the pen does to a diagram already on the board (section 8). */
export interface LessonDiagramOp {
  id: string;
  op: string;
  part?: string | null;
  to_part?: string | null;
  text?: string | null;
  colour?: DiagramColour | null;
  /** This is the answer: drawn in green, with the ding. */
  answer?: boolean | null;
  x?: number | [number, number] | null;
  y?: number | null;
  from?: number | null;
  to?: number | null;
  from_open?: boolean | null;
  to_open?: boolean | null;
  open?: boolean | null;
  m?: number | null;
  c?: number | null;
  through?: [[number, number], [number, number]] | null;
  axis?: 'x' | 'y' | 'both' | null;
  into?: string | null;
  label?: string | null;
  /** A ladder's `step`: how many rows the pen writes (default 1). */
  n?: number | null;
  on?: LessonCue | null;
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
  /** The word it is drawn on, in the whiteboard style. */
  on?: LessonCue | null;
  /**
   * Board-internal, never sent: a link the board found for itself (a quote on a line of the
   * working that is in the passage). Drawn in the passage only, paired with its line.
   */
  auto?: boolean;
  /**
   * Board-internal, never sent: the arrow stands for a `travel`, and this is the value's words
   * (travel.ts), which the whiteboard style carries along it on a chip.
   */
  travel?: string;
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
  /** Or a live diagram on the board, by its id; `part` is then one of its parts. */
  diagram?: string | null;
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
  | 'label'
  /**
   * A value riding an arrow into a line, from a doodle, a diagram or another line: its `from`
   * is a `LessonTravelFrom`. The board draws it as an arrow (travel.ts), and the whiteboard
   * style sends a chip with the value along it.
   */
  | 'travel';

export interface LessonPointFrom {
  line: number;
  at?: string | null;
}

/**
 * Where a `travel` starts: a doodle on the board (`doodle`, `part`), a place on a diagram
 * (`figure`, `target`), or a piece of a line (`line`, `at`). Exactly one of the three.
 */
export interface LessonTravelFrom {
  line?: number | null;
  at?: string | null;
  doodle?: string | null;
  part?: string | null;
  figure?: number | 'sketch' | 'sketch_b' | 'sketch_c' | null;
  target?: string | string[] | FigureSpot | null;
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
  /** The free Kokoro voice can be asked for. Absent from an older server. */
  kokoro_voice?: boolean;
}

/**
 * A voice URL asking for the chosen voice. The studio voice is the server's default, so its
 * URLs are left as they were; where Kokoro is not offered the server answers with the studio
 * voice (or silence, if that is off too), so the board needs no fallback of its own.
 */
export function withVoice(url: string, voice: BoardVoice): string {
  return voice === 'kokoro' ? `${url}${url.includes('?') ? '&' : '?'}engine=kokoro` : url;
}

/** One spoken word of a beat and when it is said, in seconds from the clip's start. */
export interface VoiceWord {
  w: string;
  start: number;
  end: number;
}

export interface VoiceWords {
  engine: 'kokoro';
  duration: number;
  /** True when the times were shared out by length rather than read from the voice. */
  estimated: boolean;
  /** The line as spoken, so its mathematics is in words ("x squared"), not as written. */
  words: VoiceWord[];
}

/** One sound of a spoken line (IPA) and when it is said, in seconds from the clip's start. */
export interface VoicePhone {
  /** One British RP phoneme (diphthongs and affricates as one symbol); an older response may
   *  give other IPA, which the mouth maps to the nearest (mouthShapes.ts `rpPhoneme`). */
  p: string;
  start: number;
  end: number;
  /** The index in `words` of the word it is in (absent from older responses). */
  w?: number;
}

/** A beat's sounds, for the talking mouth: the voice's own (Kokoro) or estimated (studio). */
export interface VoicePhones {
  engine: 'kokoro' | 'studio';
  duration: number;
  estimated: boolean;
  /** The accent the phonemes are in: British RP (absent from older responses). */
  accent?: 'rp';
  words: VoiceWord[];
  phones: VoicePhone[];
}

/** A short word said slowly by the free voice, when the mouth is tapped. */
export interface MouthWord {
  engine: 'kokoro';
  word: string;
  duration: number;
  phones: VoicePhone[];
  /** The mp3, as a data URL. */
  audio: string;
}

export interface StudentIdentity {
  student_id: string;
  display_name: string;
  external_ref: string;
  consent_recorded: boolean;
}

/** Fired on the window whenever a goal is saved or removed, so a countdown drawn elsewhere on
 *  the page (the sidebar, the top bar) can fetch the new dates instead of showing the old. */
export const GOALS_CHANGED = 'sj:goals-changed';
function announceGoalsChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(GOALS_CHANGED));
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await reach(`/v1${path}`, {
    headers: { 'content-type': 'application/json' },
    ...init,
  });
  if (!response.ok) throw await failure(response);
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
    const response = await reach(`/v1/student/${studentId}/goals/${subjectId}`, { method: 'DELETE' });
    if (!response.ok) throw await failure(response);
    announceGoalsChanged();
  },
  /** What this deployment has switched on. Asked rather than assumed, so a client never
   *  draws a microphone the server would refuse. */
  features: () => call<Features>('/features'),
  /** The worked solution as a lesson, for the board. */
  practiceLesson: (sessionId: string, questionVersionId: string) =>
    call<NarratedLesson>(`/practice/${sessionId}/lesson/${questionVersionId}`),
  /** Start making the lesson on the first wrong answer, so the board opens on it ready. */
  practiceWarm: (sessionId: string, questionVersionId: string, voice: BoardVoice = 'studio') =>
    call<{ beats: number }>(
      withVoice(`/practice/${sessionId}/lesson/${questionVersionId}/warm`, voice),
      { method: 'POST' },
    ),
  /**
   * When each word of a lesson beat is said, from the beat's `voice_url` (with or without
   * `engine=`). Null when there are none: only the Kokoro voice keeps them.
   */
  lessonVoiceWords: async (voiceUrl: string): Promise<VoiceWords | null> => {
    const [path, query] = voiceUrl.split('?');
    const response = await fetch(`${path}/words${query ? `?${query}` : ''}`);
    return response.ok ? ((await response.json()) as VoiceWords) : null;
  },
  /** A beat's sounds and their times, for the talking mouth. Null when there are none yet. */
  lessonVoicePhones: async (voiceUrl: string): Promise<VoicePhones | null> => {
    const [path, query] = voiceUrl.split('?');
    const response = await fetch(`${path}/phones${query ? `?${query}` : ''}`);
    return response.ok ? ((await response.json()) as VoicePhones) : null;
  },
  /** A word said slowly by the free voice (never the paid one); null where it is not offered. */
  mouthSay: async (sessionId: string, word: string): Promise<MouthWord | null> => {
    const response = await fetch(
      `/v1/practice/${sessionId}/mouth/say?word=${encodeURIComponent(word)}`,
    );
    return response.ok ? ((await response.json()) as MouthWord) : null;
  },
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
    const response = await reach(`/v1/practice/${sessionId}/listen`, {
      method: 'POST',
      body: form,
    });
    if (!response.ok) throw await failure(response);
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
    const response = await reach(`/v1/practice/${sessionId}/ask/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        question_version_id: questionVersionId,
        asked,
        step_index: stepIndex,
      }),
    });
    if (!response.ok || !response.body) {
      throw await failure(response);
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
