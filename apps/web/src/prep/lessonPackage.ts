/**
 * A bank lesson in ONE download, kept on the phone (founder, 12 Nov 2026: a lesson that loads
 * its voice line by line stops dead on a weak network, and the student leaves).
 *
 * The server sends the whole lesson as one file: the board, every line's voice and the voice's
 * word timings (apps/api/src/app/lesson_package.py). This fetches it with a progress count,
 * keeps it in the browser's Cache Storage, and unpacks it into a lesson the board plays with
 * no network at all: each clip becomes a blob: URL in memory.
 *
 * Opening a lesson the phone already has asks the server only "is this still current?"
 * (If-None-Match, a few bytes). With no network, the kept copy plays as it is.
 *
 * The roadmap fetches the next lessons ahead (`prefetchLesson`), during the run before them,
 * so the lesson is usually on the phone before the student reaches it.
 */
import type { NarratedLesson } from "../student/api.js";
import { readBoardPrefs } from "../student/boardPrefs.js";
import { setSpokenWords, type SpokenWord } from "../student/wordClock.js";

const CACHE = "sp-lessons-v1";
const MAGIC = "SPL1";

export type LessonVoice = "studio" | "kokoro" | "none";

export interface LessonPackage {
  version: string;
  /** The voice the clips are in; 'none' when the student's plan has no voice. */
  engine: LessonVoice;
  /** The subtopic's and its subject's names. */
  title: string;
  subject: string;
  /** Which of the subtopic's lessons this is, how many it has, and what this one covers. */
  part: number;
  parts: number;
  partTitle: string | null;
  lesson: NarratedLesson;
  /** True when every line that should have a voice has one. */
  voiced: boolean;
}

interface Header {
  version: string;
  engine: LessonVoice;
  title: string;
  subject: string;
  part?: number;
  parts?: number;
  part_title?: string | null;
  lesson: NarratedLesson;
  clips: ({
    offset: number;
    length: number;
    words: SpokenWord[] | null;
  } | null)[];
}

function packageUrl(
  studentId: string,
  subtopicId: string,
  voice: LessonVoice,
  part = 1,
): string {
  return `/v1/roadmap/${studentId}/lessons/${subtopicId}/package?engine=${voice}&part=${part}`;
}

/** The voice the student chose on the board. The server answers with the board alone where
 *  their plan has no voice, so the phone always asks the same way and keeps one copy. */
export function lessonVoice(): LessonVoice {
  return readBoardPrefs().voice;
}

async function openCache(): Promise<Cache | null> {
  try {
    return "caches" in window ? await caches.open(CACHE) : null;
  } catch {
    return null; // A private window, or storage turned off: the lesson still plays from memory.
  }
}

/** The response's bytes, counting them in as they arrive. */
async function readAll(
  response: Response,
  onProgress?: (share: number) => void,
): Promise<ArrayBuffer> {
  const total = Number(response.headers.get("content-length") ?? 0);
  if (!response.body || !total || !onProgress) return response.arrayBuffer();
  const reader = response.body.getReader();
  const parts: Uint8Array[] = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    got += value.length;
    onProgress(Math.min(1, got / total));
  }
  const all = new Uint8Array(got);
  let at = 0;
  for (const part of parts) {
    all.set(part, at);
    at += part.length;
  }
  return all.buffer;
}

/** Each lesson's clips are unpacked once per page: the same blob URLs when opened again. */
const unpacked = new Map<string, LessonPackage>();

export function unpack(bytes: ArrayBuffer): LessonPackage {
  const view = new DataView(bytes);
  const magic = new TextDecoder().decode(new Uint8Array(bytes, 0, 4));
  if (magic !== MAGIC) throw new Error("Not a lesson file.");
  const size = view.getUint32(4);
  const header = JSON.parse(
    new TextDecoder().decode(new Uint8Array(bytes, 8, size)),
  ) as Header;
  const known = unpacked.get(header.version);
  if (known) return known;
  const start = 8 + size;
  let voiced = true;
  const beats = header.lesson.beats.map((beat, index) => {
    const clip = header.clips[index];
    if (!clip) {
      if (header.engine !== "none" && beat.say.trim()) voiced = false;
      return { ...beat, voice_url: "" }; // Read at the board's silent pace.
    }
    const url = URL.createObjectURL(
      new Blob([new Uint8Array(bytes, start + clip.offset, clip.length)], {
        type: "audio/mpeg",
      }),
    );
    if (clip.words?.length) setSpokenWords(url, clip.words);
    return { ...beat, voice_url: url };
  });
  const lesson: LessonPackage = {
    version: header.version,
    engine: header.engine,
    title: header.title,
    subject: header.subject,
    part: header.part ?? 1,
    parts: header.parts ?? 1,
    partTitle: header.part_title ?? null,
    lesson: { ...header.lesson, beats },
    voiced,
  };
  unpacked.set(header.version, lesson);
  return lesson;
}

const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));

/**
 * The lesson, from the phone when it has the current one, else downloaded (tried three times,
 * waiting longer each time). `onProgress` hears 0..1 while it downloads.
 */
export async function getLessonPackage(
  studentId: string,
  subtopicId: string,
  voice: LessonVoice,
  onProgress?: (share: number) => void,
  part = 1,
): Promise<LessonPackage> {
  const url = packageUrl(studentId, subtopicId, voice, part);
  const cache = await openCache();
  const kept = cache
    ? await cache.match(url).catch(() => undefined)
    : undefined;
  let lastError: unknown = null;
  for (const pause of [0, 1500, 4000]) {
    if (pause) await wait(pause);
    let response: Response;
    try {
      response = await fetch(url, {
        credentials: "same-origin",
        headers: kept?.headers.get("etag")
          ? { "If-None-Match": kept.headers.get("etag")! }
          : {},
      });
    } catch (failed) {
      // No network: the kept copy plays as it is.
      if (kept) return unpack(await kept.arrayBuffer());
      lastError = failed;
      continue;
    }
    if (response.status === 304 && kept)
      return unpack(await kept.clone().arrayBuffer());
    if (response.status === 404) throw new LessonMissing();
    if (!response.ok) {
      if (kept) return unpack(await kept.arrayBuffer());
      lastError = new Error(`The lesson did not load (${response.status}).`);
      if (response.status < 500) break;
      continue;
    }
    try {
      const bytes = await readAll(response, onProgress);
      const lesson = unpack(bytes);
      if (cache && response.headers.get("x-lesson-complete") === "1") {
        const headers = new Headers({
          "content-type": "application/octet-stream",
        });
        const etag = response.headers.get("etag");
        if (etag) headers.set("etag", etag);
        await cache
          .put(url, new Response(bytes, { headers }))
          .catch(() => undefined);
      }
      return lesson;
    } catch (failed) {
      // Cut off part way: start the download again.
      lastError = failed;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("The lesson did not load.");
}

/** The subtopic has no written lesson in the bank yet. */
export class LessonMissing extends Error {
  constructor() {
    super("No written lesson for this topic yet.");
  }
}

const fetching = new Set<string>();
/** Subtopics the bank has no lesson for, found while fetching ahead: not asked again. */
const missing = new Set<string>();

/**
 * Fetch a lesson ahead, quietly, so it is on the phone before the student reaches it. Nothing
 * happens on a metered or "save data" connection, nor when it is already being fetched.
 */
export function prefetchLesson(
  studentId: string,
  subtopicId: string,
  part = 1,
): void {
  const connection = (
    navigator as Navigator & { connection?: { saveData?: boolean } }
  ).connection;
  if (connection?.saveData) return;
  const key = `${subtopicId}:${part}:${lessonVoice()}`;
  if (fetching.has(key) || missing.has(`${subtopicId}:${part}`)) return;
  fetching.add(key);
  void (async () => {
    const cache = await openCache();
    if (!cache) return;
    const url = packageUrl(studentId, subtopicId, lessonVoice(), part);
    if (await cache.match(url).catch(() => undefined)) return;
    await getLessonPackage(
      studentId,
      subtopicId,
      lessonVoice(),
      undefined,
      part,
    ).catch((error: unknown) => {
      if (error instanceof LessonMissing) missing.add(`${subtopicId}:${part}`);
    });
  })().finally(() => fetching.delete(key));
}
