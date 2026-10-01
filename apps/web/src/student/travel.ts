/**
 * A VALUE THAT TRAVELS (`kind: travel` in the lesson file, database/lesson_marks.py): the
 * answer to "where did this number come from?". The value rides a curved arrow from where it
 * was found (a doodle's part, a place on a diagram, a piece of an earlier line) into the line
 * that uses it.
 *
 * The board already draws every one of those arrows: piece to piece on the working (`from`),
 * across to a doodle (`to: {doodle}`) and across to a diagram (`to: {figure}`). So a travel is
 * turned into the arrow it rides before anything else sees it, and both styles draw that arrow
 * as they always have. The whiteboard style then sends a chip with the value along the drawn
 * arrow (Whiteboard.tsx, `TravelLayer`), which is all a travel adds.
 */

import type { LessonPoint, LessonTravelFrom } from "./api.js";

/** The part of an `at` that is meant: inside its `[[ ]]`, else all of it. */
export function meantPiece(at: string): string {
  const inner = /\[\[([^\]]+)\]\]/.exec(at);
  return (inner ? inner[1]! : at).trim();
}

/** A moment's marks as the board draws them: each travel as the arrow it rides. */
export function drawnMarks(points: LessonPoint[] | null | undefined): LessonPoint[] {
  if (!points) return [];
  if (!points.some((point) => point.kind === "travel")) return points;
  const out: LessonPoint[] = [];
  for (const point of points) {
    if (point.kind !== "travel") {
      out.push(point);
      continue;
    }
    const start = (point.from ?? null) as LessonTravelFrom | null;
    if (point.line == null || !point.at || !start) continue;
    const value = point.text?.trim() || meantPiece(point.at);
    const arrow: LessonPoint = { line: point.line, kind: "arrow", at: point.at, travel: value, on: point.on };
    if (point.text) arrow.text = point.text;
    if (start.doodle) {
      arrow.to = { doodle: start.doodle, part: start.part ?? null };
    } else if (start.figure != null && start.target != null) {
      arrow.to = { figure: start.figure, target: start.target };
    } else if (typeof start.line === "number") {
      arrow.from = { line: start.line, at: start.at ?? null };
    } else {
      continue;
    }
    out.push(arrow);
  }
  return out;
}
