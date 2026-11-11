/**
 * A weak subtopic's lesson, on the roadmap before its run again (founder, 11 Nov 2026).
 *
 * Until the written lesson bank exists, the lesson is the reviewed working of the questions the
 * student missed in the subtopic: each question, its right answer, and how it is reached. When
 * they have read it, the subtopic's next run is their real attempt at it, on new questions.
 */
import { Suspense, lazy, useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { request } from '../../lib/friendlyError.js';
import { Maths } from '../../Maths.js';
import { api, type NarratedLesson } from '../../student/api.js';
import { usePremium } from '../premium.js';
import { IconCheck } from '../icons.js';
import { FocusShell } from '../shell.js';
import { useLoad, usePageTitle, useStudent } from '../store.js';
import { Button, Skeleton, cx } from '../ui.js';
import './Lesson.css';

/** The board is a large module and only a lesson needs it, so it loads when first opened. */
const Board = lazy(() => import('../../student/Board.js').then((module) => ({ default: module.Board })));

interface LessonData {
  subtopic_id: string;
  subtopic_name: string;
  topic_name: string;
  subject_name: string;
  questions: {
    question_version_id: string;
    stem: string;
    options: { option_key: string; body: string; correct: boolean }[];
    steps: string[];
  }[];
}

export function Lesson() {
  usePageTitle('Lesson');
  const { subtopicId = '' } = useParams();
  const [search] = useSearchParams();
  const item = search.get('item');
  const student = useStudent();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const loaded = useLoad(
    () => request<LessonData>(`/v1/roadmap/${student.studentId}/lessons/${subtopicId}`),
    [student.studentId, subtopicId],
  );

  const finish = async () => {
    setSaving(true);
    try {
      await request<void>(`/v1/roadmap/${student.studentId}/lessons/${subtopicId}/done`, {
        method: 'POST',
        body: JSON.stringify({ item_id: item }),
      });
      navigate('/roadmap');
    } finally {
      setSaving(false);
    }
  };

  // The written lesson from the bank, played on the board; none yet means the missed
  // questions' working below.
  const [board, setBoard] = useState<NarratedLesson | 'none' | null>(null);
  const [canHear, setCanHear] = useState(false);
  const { voice: premiumVoice } = usePremium();
  useEffect(() => {
    request<NarratedLesson>(`/v1/roadmap/${student.studentId}/lessons/${subtopicId}/board`)
      .then(setBoard)
      .catch(() => setBoard('none'));
    api
      .features()
      .then((features) => setCanHear(features.coach_voice))
      .catch(() => setCanHear(false));
  }, [student.studentId, subtopicId]);

  const lesson = loaded.data;
  if (board && board !== 'none' && lesson) {
    return (
      <div className="sj ls-board">
        <Suspense fallback={null}>
          <Board
            title={lesson.subtopic_name}
            subtitle={`Lesson · ${lesson.subject_name}`}
            question={lesson.subtopic_name}
            questionLabel="Today's lesson"
            steps={board.beats.flatMap((beat) => beat.write)}
            loadLesson={canHear && premiumVoice ? () => Promise.resolve(board) : undefined}
            askLocked={<span className="sj-small sj-muted">Asking in lessons is coming next.</span>}
            answerLine="Now try it on new questions."
            onAsk={() => Promise.reject(new Error('Asking during a lesson is not open yet.'))}
            onDone={() => void finish()}
          />
        </Suspense>
      </div>
    );
  }
  return (
    <FocusShell title={lesson?.subtopic_name ?? 'Lesson'} exitTo="/roadmap">
      <main className="ls-page">
        {!lesson ? (
          loaded.error ? (
            <p className="ls-empty">{loaded.error}</p>
          ) : (
            <Skeleton height={320} radius={16} />
          )
        ) : (
          <>
            <header className="ls-head">
              <span className="sj-eyebrow">Lesson · {lesson.subject_name}</span>
              <h1 className="sj-display sj-h2">{lesson.subtopic_name}</h1>
              <p className="ls-lede">
                {lesson.questions.length
                  ? 'The ones you got wrong, and how to get them right.'
                  : 'Nothing to go over here yet.'}
              </p>
            </header>

            {lesson.questions.map((question, index) => (
              <article key={question.question_version_id} className="sj-card ls-card">
                <span className="ls-num sj-mono">{index + 1}</span>
                <div className="ls-stem">
                  <Maths text={question.stem} />
                </div>
                <ul className="ls-options">
                  {question.options.map((option) => (
                    <li key={option.option_key} className={cx(option.correct && 'right')}>
                      <span className="ls-key sj-mono">{option.correct ? <IconCheck size={14} /> : option.option_key}</span>
                      <Maths text={option.body} />
                    </li>
                  ))}
                </ul>
                {question.steps.length ? (
                  <div className="ls-working">
                    <span className="sj-eyebrow">The working</span>
                    <ol>
                      {question.steps.map((step, n) => (
                        <li key={n}>
                          <Maths text={step} />
                        </li>
                      ))}
                    </ol>
                  </div>
                ) : null}
              </article>
            ))}

            <div className="ls-foot">
              <Button tone="lime" size="lg" busy={saving} onClick={() => void finish()} icon={<IconCheck size={16} />}>
                Got it
              </Button>
            </div>
          </>
        )}
      </main>
    </FocusShell>
  );
}
