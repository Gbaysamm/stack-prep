/**
 * The student side's typed client.
 *
 * Only the identity is held in the browser. Everything a student would be upset to lose —
 * the goal, the sitting, every answer — is written to the database as it happens, so closing
 * the tab loses nothing and reopening it finds the sitting where it stopped.
 */

export interface SubjectOffer {
  subject_id: string;
  code: string;
  name: string;
  deliverable_questions: number;
  teachable_skills: number;
  ready: boolean;
  blocked_reason: string | null;
}

export interface ExaminationOffer {
  examination_id: string;
  short_name: string;
  name: string;
  exam_body: string;
  subjects: SubjectOffer[];
}

export interface Goal {
  subject_id: string;
  subject_name: string;
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
  topic_name: string;
  question_version_id: string;
  stem: string;
  instructions: string | null;
  passage_title: string | null;
  passage_body: string | null;
  options: CheckupOption[];
}

export interface CheckupState {
  session_id: string;
  answered: number;
  length: number;
  finished: boolean;
  weights_source: string;
  question: CheckupQuestion | null;
}

export interface SubtopicReport {
  subtopic_id: string;
  name: string;
  topic_name: string;
  share: number;
  answered: number;
  correct: number;
  mastery: number | null;
  confidence: string;
}

export interface PlanLine {
  subtopic_id: string;
  name: string;
  topic_name: string;
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
    }),
  /** What this deployment has switched on. Asked rather than assumed, so a client never
   *  draws a microphone the server would refuse. */
  features: () => call<Features>('/features'),
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
