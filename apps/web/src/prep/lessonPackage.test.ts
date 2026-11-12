import { describe, expect, it, vi } from 'vitest';

import { unpack } from './lessonPackage.js';
import type { Roadmap, RoadmapItem } from './roadmapApi.js';
import { lessonsAhead } from './roadmapApi.js';

function beat(say: string) {
  return {
    board_index: null,
    write: [say],
    write_at: [0],
    say,
    voice_url: '',
    answer: false,
    point: null,
    show_sketch: false,
    doodle: null,
    doodles: null,
    doodle_do: null,
    diagram: null,
    diagram_do: null,
    on: null,
    section: null,
    mouth: null,
  };
}

/** A package as the server writes it (apps/api/src/app/lesson_package.py). */
function packed(version: string, clips: (Uint8Array | null)[]): ArrayBuffer {
  let offset = 0;
  const header = {
    version,
    engine: 'kokoro',
    title: 'Cell structure',
    subject: 'Biology',
    lesson: { source: 'script', beats: clips.map((_, i) => beat(`Line ${i}.`)) },
    clips: clips.map((clip) =>
      clip ? { offset: (offset += clip.length) - clip.length, length: clip.length, words: [{ w: 'line', start: 0, end: 0.3 }] } : null,
    ),
  };
  const json = new TextEncoder().encode(JSON.stringify(header));
  const audio = clips.filter((clip): clip is Uint8Array => clip !== null);
  const total = 8 + json.length + audio.reduce((sum, clip) => sum + clip.length, 0);
  const out = new Uint8Array(total);
  out.set(new TextEncoder().encode('SPL1'), 0);
  new DataView(out.buffer).setUint32(4, json.length);
  out.set(json, 8);
  let at = 8 + json.length;
  for (const clip of audio) {
    out.set(clip, at);
    at += clip.length;
  }
  return out.buffer;
}

describe('a lesson package', () => {
  it('unpacks every clip into its own playable address, and reads a missing one as silent', () => {
    const made: Blob[] = [];
    vi.stubGlobal('URL', { ...URL, createObjectURL: (blob: Blob) => (made.push(blob), `blob:clip-${made.length}`) });
    const lesson = unpack(packed('v-one', [new Uint8Array([1, 2, 3]), null, new Uint8Array([4, 5])]));
    expect(lesson.title).toBe('Cell structure');
    expect(lesson.lesson.beats.map((b) => b.voice_url)).toEqual(['blob:clip-1', '', 'blob:clip-2']);
    expect(made.map((blob) => blob.size)).toEqual([3, 2]);
    expect(lesson.voiced).toBe(false);
    vi.unstubAllGlobals();
  });

  it('rejects a file that is not a lesson', () => {
    expect(() => unpack(new TextEncoder().encode('<html>oops</html>').buffer)).toThrow();
  });
});

describe('lessons fetched ahead', () => {
  const item = (over: Partial<RoadmapItem>): RoadmapItem => ({
    id: Math.random().toString(),
    day: '2026-11-12',
    position: 0,
    kind: 'run',
    subject_id: 's',
    subject_name: 'Biology',
    subtopic_id: 'a',
    subtopic_name: 'A',
    length: 10,
    reason: '',
    value: null,
    state: 'to_do',
    session_id: null,
    level: 0,
    ...over,
  });
  const roadmap = (items: RoadmapItem[]) => ({ items }) as unknown as Roadmap;

  it('takes every lesson stop not yet taken, and the next run while its subtopic is weak', () => {
    const ahead = lessonsAhead(
      roadmap([
        item({ kind: 'lesson', subtopic_id: 'done', state: 'done' }),
        item({ kind: 'lesson', subtopic_id: 'l1' }),
        item({ kind: 'run', subtopic_id: 'weak', level: 1 }),
        item({ kind: 'run', subtopic_id: 'later', level: 0 }),
      ]),
    );
    expect(ahead).toEqual([
      { subtopic: 'l1', part: 1 },
      { subtopic: 'weak', part: 1 },
    ]);
  });

  it('fetches each lesson of a subtopic that has several', () => {
    const ahead = lessonsAhead(
      roadmap([
        item({ kind: 'lesson', subtopic_id: 'big', part: 1 }),
        item({ kind: 'lesson', subtopic_id: 'big', part: 2 }),
      ]),
    );
    expect(ahead).toEqual([
      { subtopic: 'big', part: 1 },
      { subtopic: 'big', part: 2 },
    ]);
  });

  it('leaves out the next run once its subtopic is strong', () => {
    expect(lessonsAhead(roadmap([item({ kind: 'run', subtopic_id: 'strong', level: 4 })]))).toEqual([]);
  });
});
