/**
 * The student's roadmap (apps/api/src/app/routers/roadmap.py): what Stack Prep has planned for
 * them, day by day, towards their target. Reading it builds or re-builds it on the server.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { friendly, request } from "../lib/friendlyError.js";
import { prefetchLesson } from "./lessonPackage.js";
import { useLoad } from "./store.js";

export type ItemKind =
  "run" | "mixed" | "mock" | "checkup" | "lesson" | "topic_test";
export type ItemState = "done" | "in_progress" | "missed" | "to_do";

export interface RoadmapItem {
  id: string;
  day: string;
  position: number;
  kind: ItemKind;
  subject_id: string | null;
  subject_name: string | null;
  subtopic_id: string | null;
  subtopic_name: string | null;
  length: number;
  reason: string;
  value: "high" | "medium" | "low" | null;
  state: ItemState;
  session_id: string | null;
  /** 0 (not levelled yet) to 5 (mastered); null for a check-up, mock or mixed run. */
  level: number | null;
}

export interface RoadmapSubject {
  subject_id: string;
  name: string;
  measured: boolean;
  score_now: number;
  target: number | null;
  expected: number;
  milestones: { week_end: string; score: number }[];
}

export type RoadmapStatus =
  | "on_track"
  | "stretch"
  | "out_of_reach"
  | "no_target"
  | "needs_checkups"
  | "exam_passed";

export interface Roadmap {
  built_for: string;
  reason: string;
  today: string;
  exam_date: string | null;
  study_days_left: number;
  runs_per_day: number;
  status: RoadmapStatus;
  advice: string | null;
  /** When the rest of the syllabus would not fit by exam day: the time a day that would. */
  pace_advice: string | null;
  total_now: number | null;
  total_expected: number | null;
  target_total: number | null;
  subjects: RoadmapSubject[];
  items: RoadmapItem[];
  record: {
    due: number;
    done: number;
    last_7_days_due: number;
    last_7_days_done: number;
    own_runs_in: number;
  };
}

export const roadmapApi = {
  read: (studentId: string) => request<Roadmap>(`/v1/roadmap/${studentId}`),
  start: (studentId: string, itemId: string) =>
    request<{ kind: ItemKind; session_id: string | null; path: string }>(
      `/v1/roadmap/${studentId}/items/${itemId}/start`,
      { method: "POST" },
    ),
};

export function useRoadmap(studentId: string) {
  const loaded = useLoad(() => roadmapApi.read(studentId), [studentId]);
  const roadmap = loaded.data;
  useEffect(() => {
    if (!roadmap) return;
    for (const subtopic of lessonsAhead(roadmap))
      prefetchLesson(studentId, subtopic);
  }, [roadmap, studentId]);
  return loaded;
}

/**
 * The lessons to have on the phone before the student reaches them: every lesson stop not yet
 * taken, and the lesson of the next run's subtopic while it is still weak (level 2 or below),
 * since a weak run is what puts a lesson on the path. Each is one download, kept.
 */
export function lessonsAhead(roadmap: Roadmap): string[] {
  const open = roadmap.items.filter(
    (item) => item.state !== "done" && item.subtopic_id,
  );
  const lessons = open.filter((item) => item.kind === "lesson").slice(0, 3);
  const nextRun = open.find(
    (item) => item.kind === "run" && item.state !== "missed",
  );
  const likely = nextRun && (nextRun.level ?? 0) <= 2 ? [nextRun] : [];
  return [
    ...new Set(
      [...lessons, ...likely].map((item) => item.subtopic_id as string),
    ),
  ];
}

/** Start a planned item and go to it. */
export function useStartItem(studentId: string) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const start = async (item: RoadmapItem) => {
    setBusy(item.id);
    setError(null);
    try {
      const started = await roadmapApi.start(studentId, item.id);
      navigate(started.path);
    } catch (problem) {
      setError(friendly(problem));
    } finally {
      setBusy(null);
    }
  };
  return { start, busy, error };
}

/** Today's items, and the one to do next (an open one first, then the first not done). */
export function today(roadmap: Roadmap) {
  const items = roadmap.items.filter((item) => item.day === roadmap.today);
  const next =
    items.find((item) => item.state === "in_progress") ??
    items.find((item) => item.state === "to_do") ??
    null;
  return { items, next };
}

/** One line for an item: what it is, in the fewest words. */
export function itemLabel(item: RoadmapItem): string {
  switch (item.kind) {
    case "run":
    case "lesson":
      return item.subtopic_name ?? `${item.subject_name} practice`;
    case "topic_test":
      return `${item.subtopic_name ?? "Topic"} test`;
    case "mixed":
      // Questions from the topics already covered, to keep them fresh.
      return `${item.subject_name ?? ""} review`.trim();
    case "checkup":
      return "Check-up";
    case "mock":
      return "Mock exam";
  }
}
