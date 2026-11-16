-- The project tracker (founder, 16 Nov 2026): one page, /tracker, that keeps the team on the same
-- page. A task goes To do, In progress, Done (built), Committed, Deployed; Waiting when blocked.
-- Anyone with the link reads it; an admin, or anyone with the edit key (TRACKER_EDIT_KEY), adds and moves
-- tasks, ticks their steps, and every change is kept in the task's history. Deployments are
-- recorded by the release itself, with the changes each one carried.

BEGIN;
SET LOCAL search_path = stackprep, public;

CREATE TABLE tracker_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (btrim(title) <> '' AND length(title) <= 200),
  area text NOT NULL DEFAULT 'General' CHECK (btrim(area) <> '' AND length(area) <= 60),
  status text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'doing', 'waiting', 'done', 'committed', 'deployed')),
  owner text CHECK (owner IS NULL OR length(owner) <= 80),
  note text CHECK (note IS NULL OR length(note) <= 4000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  done_at timestamptz,
  updated_by text
);
CREATE INDEX tracker_items_status ON tracker_items (status, updated_at DESC);

COMMENT ON TABLE tracker_items IS
  'Project tasks for the team, kept from the /tracker page.';

-- A task's checklist: small steps ticked off one by one.
CREATE TABLE tracker_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES tracker_items (id) ON DELETE CASCADE,
  text text NOT NULL CHECK (btrim(text) <> '' AND length(text) <= 300),
  done boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tracker_steps_item ON tracker_steps (item_id, position);

-- Every change to a task: who, when, what.
CREATE TABLE tracker_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES tracker_items (id) ON DELETE CASCADE,
  at timestamptz NOT NULL DEFAULT now(),
  by_name text,
  what text NOT NULL CHECK (length(what) <= 500)
);
CREATE INDEX tracker_activity_item ON tracker_activity (item_id, at DESC);

CREATE TABLE deployments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sha text NOT NULL CHECK (sha ~ '^[0-9a-f]{7,40}$'),
  target text NOT NULL CHECK (btrim(target) <> ''),
  deployed_at timestamptz NOT NULL DEFAULT now(),
  -- The commit subjects since the previous deployment to this target, newest first.
  changes jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(changes) = 'array')
);
CREATE INDEX deployments_when ON deployments (deployed_at DESC);

COMMENT ON TABLE deployments IS
  'Each release of this server, written by the release script, with the changes it carried.';

-- Where the project stood when the tracker started: every ask in docs/tracker.md, and the
-- work of 16 Nov 2026.
INSERT INTO tracker_items (area, status, title, note) VALUES
  ('Lessons', 'deployed', 'Lessons follow the Nigerian curriculum (WAEC, JAMB, school sources), explanatory, not complex', 'Sources map, writer brief, guide'),
  ('Lessons', 'deployed', 'Worked examples straight after each rule; rating, own questions, 1–2 problems after the lesson', 'After-lesson stage (rating, problems typed or photo, coach)'),
  ('Lessons', 'deployed', 'Coach conversation saved, shown again, used as context (lessons and missed questions)', 'Kept per student and lesson'),
  ('Lessons', 'deployed', 'A subtopic is several short lessons, each its own roadmap stop', 'Parts in DB, roadmap, loader'),
  ('Lessons', 'deployed', 'Lessons about 3 minutes (a guide, not a limit; 3–4 min fine), one main idea', 'All 10 subtopics rebuilt: 61 lessons'),
  ('Lessons', 'deployed', 'No gaps, no rushing: teach before use, examples as examples, stay at level, guided working', 'Rules in the guide; all lessons rewritten'),
  ('Lessons', 'deployed', 'The one test for every sentence; no repetition; each line one job; traps give the rule; precise recaps', 'All 61 lessons reviewed line by line'),
  ('Lessons', 'deployed', 'Whole spoken sentences; lists joined with "and"', 'Language pass on all lessons'),
  ('Lessons', 'deployed', 'Names before symbols; voice reads symbols letter by letter (Na = "N A"), ions, brackets', 'for_the_voice'),
  ('Lessons', 'deployed', 'Board lines start with a capital', 'Lessons and bank'),
  ('Lessons', 'deployed', 'Open like a teacher: no "lesson one of two", no saying things three times', 'Openings rewritten'),
  ('Lessons', 'deployed', 'Name the list, then teach each item with its picture as it is explained', 'Elements and compounds first; rule in guide'),
  ('Lessons', 'deployed', 'One thing said, then written; never the next line while the last is still being said', 'Moments split; board waits for a line''s words'),
  ('Lessons', 'deployed', 'Pictures pop in on their word, not drawn from scratch; caption not cut in half', 'show op, pop by fading, caption fades whole'),
  ('Lessons', 'deployed', 'No blinking section heading', 'One stable slot per moment'),
  ('Lessons', 'deployed', 'Marks land on their word; scroll to a marked earlier line', 'Mark timing from the voice'),
  ('Lessons', 'deployed', 'Lesson ends with its own line, not the missed-question closing', 'finishedLine'),
  ('Lessons', 'deployed', 'Biology drawings: realistic, correct, nothing misplaced', 'Plant cell fixed (wall offset, labels, circles)'),
  ('Lessons', 'todo', 'More subjects'' lessons (beyond Chemistry, the cell, indices)', NULL),
  ('Question bank', 'deployed', 'Fix fragment sentences in the bank too', 'Language pass, 102 files'),
  ('Question bank', 'deployed', 'Bank explanations must make sense like the lessons', 'Teaching pass, 102 files (1,944 lessons)'),
  ('Question bank', 'deployed', 'Go through the flags and fix where necessary', 'All 135 checked: 64 fixed, 78 not errors, no key wrong'),
  ('Question bank', 'doing', 'Remove the answer checks; fewer analogies and doodles; the six standards; line and marks on their words', 'Accounts, Biology, Physics 2018 reviewed (19 files)'),
  ('Question bank', 'todo', 'Elements, compounds and mixtures has only 3 questions (all check-up)', NULL),
  ('Reviewer tools', 'todo', 'More questions per subtopic (about 5,000 to give every subtopic 10; thin subjects: Biology, Chemistry, Physics, Economics, Government, Accounts, Commerce)', 'Generate outside Claude Code: an external AI pasting JSON, or the plan''s monthly API credit ($100 on Max, claimed in claude.ai Billing → API credits, key in Admin → AI for questions, cap $100)'),
  ('Reviewer tools', 'deployed', 'AI questions kept apart from the real bank, clearly labelled', '"AI-generated sets" section per subject with its badge; the set''s page says "AI-generated set"; never a fake year'),
  ('Reviewer tools', 'deployed', 'Upload questions by JSON; never an invented subtopic', 'Import JSON panel on AI sets: pick subtopics (thinnest first), copy the prompt, paste, Check (every fault listed), Import the ones that pass as "To check"; tested end to end'),
  ('Reviewer tools', 'deployed', '"Add with AI" not on past papers', 'Gone; AI sets have "Import JSON" instead'),
  ('Reviewer tools', 'deployed', 'Subject page: can''t rename or delete a year; design poor', 'Sections (past papers, own sets, AI sets); rename and remove as icons; cards two to a row on a phone; smaller header buttons'),
  ('Reviewer tools', 'deployed', 'Question detail page: poor UI/UX', 'Checks strip; question in its own box; each wrong option with its reason; "B is right" to confirm; numbered worked steps and a hint box (Edit to change); level and topic below'),
  ('Reviewer tools', 'deployed', 'Lessons managed from the reviewer side: status per topic, edit, generate', 'Lessons page: every topic and subtopic with its lessons (or "No lessons yet"); a lesson read as said and written; Edit the words with a check that keeps cues and marks; edits kept from the loader (migration 049)'),
  ('Reviewer tools', 'doing', 'Write lessons with AI; LaTeX never broken; correct answers; a moderately priced model', 'Trial: gpt-6.1-terra writes a lesson, checked for format, LaTeX (KaTeX), speech as spoken and the answer key; 3 Chemistry lessons passed'),
  ('Reviewer tools', 'waiting', 'Review the uploaded questions one by one next week', 'Re-solve, check key, options, wording, fit, figure'),
  ('Voice', 'deployed', 'Nigerian-accent voice: research YarnGPT, others; test Inworld; compare cost', 'Inworld (Emeka) added and made default'),
  ('Voice', 'deployed', 'Maths said properly ("2 comma 4", brackets)', 'for_the_voice'),
  ('Voice', 'todo', 'Lagos, Ibadan, garri pronunciation', NULL),
  ('Voice', 'waiting', 'Inworld credit', NULL),
  ('Board and app', 'deployed', 'Lesson in one download kept on the phone (weak networks)', 'Lesson package, cache'),
  ('Board and app', 'deployed', 'A refresh must not reload from scratch', 'Kept package played at once; fallback voice when Inworld refuses'),
  ('Board and app', 'deployed', 'No subtitle box; a timeline; dock on phone; buddy by the controls; no emphasis on Next', 'Board dock rebuilt'),
  ('Board and app', 'deployed', 'Loading screen redesigned', 'Pen-on-board loader'),
  ('Board and app', 'deployed', 'Whiteboard and Emeka by default', 'Prefs v3'),
  ('Roadmap', 'deployed', 'After a weak run: the lessons next, then the run again, each its own stop', 'Same-day insert and morning plan'),
  ('Roadmap', 'deployed', 'Run after all of a subtopic''s lessons, not after each', 'Lessons in order, one run after'),
  ('Roadmap', 'deployed', 'A weak run brought no lesson (subtopic out of questions)', 'Lessons come anyway; no run when none left'),
  ('Roadmap', 'deployed', 'A finished run vanished from the roadmap', '"Earlier" section above Today'),
  ('Roadmap', 'deployed', 'A lesson''s icon differs from a run''s', 'Play icon'),
  ('Roadmap', 'deployed', 'A subtopic''s lessons one after another (not scattered between other subjects), also across a day''s end', 'Planner keeps the subject holding the next lesson, whichever day'),
  ('Roadmap', 'deployed', 'More lessons and runs for a weak student take more time than they set: adjust the time', 'The day is planned in minutes (a lesson about 5, a run the student''s run time); the pace check asks for more time when the work no longer fits'),
  ('Roadmap', 'deployed', 'Still weak after the lessons and the run again: what then?', 'One round of lessons per subtopic; then "Still needs work" on the path, practised on, no loop of lessons'),
  ('Roadmap', 'deployed', 'Closing a half-watched lesson opened "after the lesson"', 'Close goes back to the roadmap; not counted'),
  ('Roadmap', 'deployed', 'Leaving anything in progress asks first (close button, closing the tab): lessons, runs, check-ups, after the lesson; Continue waits for the problem', 'Leave warning, confirm dialogs'),
  ('Roadmap', 'deployed', 'A lesson resumes where the student stopped', 'The step reached is kept on the phone per lesson version; the board opens there'),
  ('Roadmap', 'deployed', 'After-lesson page: poor UI; wrong answer or photo gets written feedback, not video', 'Redesigned: problem first with tappable options, feedback box, rating row, coach collapsed'),
  ('Speed', 'deployed', 'Every page slow; limit requests so the server copes with many users', 'Subject data cached 5 min; shared requests in the app (overview once a page, not 4–6)'),
  ('Speed', 'deployed', 'PC slow during runs', 'Voice warm-up off in development; fewer agents at once'),
  ('Speed', 'todo', 'Measure on a built app (development sends ~90 files a page)', NULL),
  ('Design', 'done', 'Practice page redesign', 'Cards per subject, history per subject (paged), one run at a time, topics to work on.'),
  ('Design', 'done', 'Check-up page redesign', 'Cards per subject: check-up score, last checked, target, weak topics; Report and Check again.'),
  ('Design', 'doing', 'Project tracker for the team', 'This page: checklist, task details, steps, history and deployments.'),
  ('Design', 'todo', 'Redesign the remaining pages and cut the text', 'Roadmap, dashboard, progress, and the rest of the student and reviewer pages.'),
  ('Roadmap', 'done', 'One run at a time', 'A new run starts only once the open one is finished or deleted, in any subject.'),
  ('Lessons', 'deployed', 'Deploy loads the subtopic lessons, as it loads the questions', NULL),
  ('Lessons', 'todo', 'Second, independent check of every AI-written problem', 'A blind re-solve must agree with the answer before a lesson is saved.'),
  ('Lessons', 'waiting', 'Listen to one AI-written lesson end to end', 'pH, oxidation numbers or electrolysis of brine (Chemistry).'),
  ('Lessons', 'todo', 'Switch on "Write a lesson" on the Lessons page', 'gpt-6.1-terra, about $0.05 a lesson.'),
  ('Lessons', 'todo', 'Draw the brine electrolysis cell', 'Marked PICTURE NEEDED; try gpt-image-2.6-sunburst once OpenAI has credit.'),
  ('Lessons', 'todo', 'Timing check of every lesson moment', 'Each board line and mark lands on its own word.'),
  ('Question bank', 'todo', 'Board lessons for imported AI questions', 'Until then they get the plainer live lesson.'),
  ('Outside', 'waiting', 'Add credit to the OpenAI account', 'The coach, live lessons and image generation stop without it.'),
  ('Outside', 'waiting', 'A lawyer to review the legal pages', NULL);

UPDATE tracker_items SET updated_by = 'Claude',
  done_at = CASE WHEN status IN ('done', 'committed', 'deployed') THEN now() END;
INSERT INTO tracker_activity (item_id, by_name, what)
SELECT id, 'Claude', 'Added from the project notes' FROM tracker_items;

COMMIT;
