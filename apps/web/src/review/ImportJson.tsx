/**
 * Bring AI-written questions into an AI-generated set (routers/bank_import.py; the format and
 * the prompt for the outside AI: docs/questions/ai-question-format.md).
 *
 * Two steps in one panel: copy the prompt with the subject's subtopics (thinnest first, so the
 * outside AI writes where the bank is short, and only with real subtopic codes), then paste the
 * AI's JSON, check it, and import the questions that pass. Each comes in as "to check": a
 * reviewer re-solves and approves it before any student sees it.
 */
import { useEffect, useMemo, useState } from 'react';

import { friendly } from '../lib/friendlyError.js';
import { Drawer, plural } from './BankPages.js';
import { bank, type ImportResult, type SubtopicLine } from './bankApi.js';

const PROMPT = `You write multiple-choice questions for Nigerian students preparing for JAMB UTME.

Write {N} new questions for each subtopic listed at the end. Use only those subtopic codes, exactly as given. Never invent a subtopic or change a code.

Each question:
- tests that subtopic at JAMB level, in the style of real UTME questions, but is new (not copied from any past paper);
- has four options A to D, exactly one correct; the wrong options are plausible, each based on a real mistake students make;
- uses Nigerian English and Nigerian school conventions (carbon(IV) oxide, ₦ for money, SI units);
- has worked steps a student can follow without gaps, each step with its reason;
- has a reason for each wrong option ("why"), naming the slip only when that slip really gives that option;
- has a hint that points the way without giving the answer;
- has a level from 1 (recall) to 5 (multi-step).

If a question needs a diagram, either draw it as a simple SVG in "figure_svg" (with "figure_alt" describing it) or, if you cannot draw it accurately, describe it in "figure_needed". Never refer to a figure you have not given or described.

Check each answer yourself by solving the question again before you give it.

Reply with ONLY a JSON array, no other text, in exactly this shape:
[{"subtopic": "...", "stem": "...", "options": {"A": "...", "B": "...", "C": "...", "D": "..."}, "answer": "A", "steps": ["...", "..."], "hint": "...", "why": {"B": "...", "C": "...", "D": "..."}, "level": 2}]

Subtopics:`;

export function ImportJson({
  paperId,
  subjectId,
  onClose,
  onImported,
}: {
  paperId: string;
  subjectId: string;
  onClose: () => void;
  onImported: () => void;
}) {
  const [step, setStep] = useState<'prompt' | 'paste'>('prompt');
  const [subtopics, setSubtopics] = useState<SubtopicLine[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [perSubtopic, setPerSubtopic] = useState(5);
  const [copied, setCopied] = useState(false);
  const [text, setText] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState<'check' | 'import' | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    bank
      .subtopics(subjectId)
      .then((lines) => {
        const thinnest = [...lines].sort((a, b) => a.questions - b.questions);
        setSubtopics(thinnest);
        setPicked(new Set(thinnest.slice(0, 5).map((line) => line.code)));
      })
      .catch((error) => setProblem(friendly(error)));
  }, [subjectId]);

  const prompt = useMemo(() => {
    const lines = (subtopics ?? [])
      .filter((line) => picked.has(line.code))
      .map((line) => `${line.code}  ${line.name}.${line.covers ? ` Covers: ${line.covers}` : ''} (has ${plural(line.questions, 'question')})`);
    return `${PROMPT.replace('{N}', String(perSubtopic))}\n${lines.join('\n')}`;
  }, [subtopics, picked, perSubtopic]);

  const parsed = useMemo((): { questions: unknown[] } | { error: string } | null => {
    if (!text.trim()) return null;
    try {
      const found = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')) as unknown;
      const questions = Array.isArray(found) ? found : (found as { questions?: unknown[] })?.questions;
      if (!Array.isArray(questions) || questions.length === 0) return { error: 'Paste a JSON array of questions.' };
      return { questions };
    } catch {
      return { error: "That isn't valid JSON. Paste exactly what the AI gave, from [ to ]." };
    }
  }, [text]);

  const run = (apply: boolean) => {
    if (!parsed || 'error' in parsed) return;
    setBusy(apply ? 'import' : 'check');
    setProblem(null);
    bank
      .importQuestions(paperId, parsed.questions, apply)
      .then((found) => {
        setResult(found);
        if (apply && found.saved) onImported();
      })
      .catch((error) => setProblem(friendly(error)))
      .finally(() => setBusy(null));
  };

  return (
    <Drawer title="Import questions (JSON)" onClose={onClose}>
      <div className="bi">
        <div className="st-seg bi-steps" role="tablist">
          <button type="button" role="tab" aria-selected={step === 'prompt'} className={step === 'prompt' ? 'on' : undefined} onClick={() => setStep('prompt')}>
            1 · Prompt for the AI
          </button>
          <button type="button" role="tab" aria-selected={step === 'paste'} className={step === 'paste' ? 'on' : undefined} onClick={() => setStep('paste')}>
            2 · Paste its JSON
          </button>
        </div>

        {step === 'prompt' ? (
          <>
            <p className="st-muted">
              Pick the subtopics to write for (the thinnest are first), copy the prompt, and paste it into ChatGPT, Gemini or Claude.
            </p>
            <label className="bi-count">
              Questions per subtopic
              <input
                type="number"
                min={1}
                max={20}
                value={perSubtopic}
                onChange={(event) => setPerSubtopic(Math.max(1, Math.min(20, Number(event.target.value) || 1)))}
              />
            </label>
            <ul className="bi-subs">
              {(subtopics ?? []).map((line) => (
                <li key={line.code}>
                  <label>
                    <input
                      type="checkbox"
                      checked={picked.has(line.code)}
                      onChange={() =>
                        setPicked((now) => {
                          const next = new Set(now);
                          if (next.has(line.code)) next.delete(line.code);
                          else next.add(line.code);
                          return next;
                        })
                      }
                    />
                    <code>{line.code}</code>
                    <span className="bi-name">{line.name}</span>
                    <span className={line.questions < 5 ? 'bi-n thin' : 'bi-n'}>{line.questions}</span>
                  </label>
                </li>
              ))}
            </ul>
            <div className="bi-actions">
              <span className="st-muted">{plural(picked.size, 'subtopic')} picked</span>
              <button
                type="button"
                className="sj-btn"
                disabled={picked.size === 0}
                onClick={() => {
                  void navigator.clipboard.writeText(prompt).then(() => {
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 2000);
                  });
                }}
              >
                {copied ? 'Copied' : 'Copy the prompt'}
              </button>
              <button type="button" className="sj-btn ghost" onClick={() => setStep('paste')}>
                Next
              </button>
            </div>
          </>
        ) : (
          <>
            <textarea
              className="bi-paste"
              value={text}
              onChange={(event) => {
                setText(event.target.value);
                setResult(null);
              }}
              placeholder='Paste the AI&apos;s JSON here: [{"subtopic": "CHEM.1.a", "stem": "…", …}]'
              spellCheck={false}
            />
            {parsed && 'error' in parsed ? <p className="st-error">{parsed.error}</p> : null}
            {problem ? <p className="st-error">{problem}</p> : null}
            <div className="bi-actions">
              <span className="st-muted">
                {parsed && 'questions' in parsed ? plural(parsed.questions.length, 'question') : 'Nothing pasted yet'}
              </span>
              <button type="button" className="sj-btn ghost" disabled={!parsed || 'error' in parsed || busy !== null} onClick={() => run(false)}>
                {busy === 'check' ? 'Checking…' : 'Check'}
              </button>
              <button
                type="button"
                className="sj-btn"
                disabled={!result || result.passed === 0 || result.saved > 0 || busy !== null}
                onClick={() => run(true)}
              >
                {busy === 'import' ? 'Importing…' : result ? `Import ${plural(result.passed, 'question')}` : 'Import'}
              </button>
            </div>
            {result ? (
              <div className="bi-result">
                <p className="bi-sum">
                  {result.saved
                    ? `${plural(result.saved, 'question')} imported. They wait in this set as “to check” until a reviewer approves each one.`
                    : `${result.passed} of ${result.checked} pass. ${result.checked - result.passed ? 'Fix or drop the others and check again, or import the ones that pass.' : ''}`}
                </p>
                <ol className="bi-list">
                  {result.verdicts.map((verdict) => (
                    <li key={verdict.index} className={verdict.ok ? 'ok' : 'bad'}>
                      <span className="bi-mark">{verdict.ok ? '✓' : '✗'}</span>
                      <div>
                        <strong>{verdict.stem ?? `Question ${verdict.index + 1}`}</strong>
                        {verdict.subtopic ? <small>{verdict.subtopic}</small> : null}
                        {verdict.problems.map((line) => (
                          <p key={line} className="bi-problem">
                            {line}
                          </p>
                        ))}
                        {verdict.notes.map((line) => (
                          <p key={line} className="bi-note">
                            {line}
                          </p>
                        ))}
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
          </>
        )}
      </div>
    </Drawer>
  );
}
