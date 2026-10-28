/**
 * A real lesson on the coach's board, inside the page: the watch page (Watch.tsx, its own small
 * app: site/WatchApp.tsx) in a frame, with a tab for each showcase lesson.
 *
 * Kept quick: the frame loads only as it nears the screen (and only one lesson at a time), it
 * shows a poster until the visitor presses Play, and where there is room the board is drawn at
 * its real size rather than a bigger board scaled down. On a phone it is the phone board.
 */
import { useEffect, useRef, useState } from 'react';

import { SHOWCASE } from './showcase.js';

/** The desktop board is drawn at this size (it needs the room) and scaled down to fit. */
const DESKTOP = { width: 1280, height: 800 };

export function LessonPlayer() {
  const [lesson, setLesson] = useState<string>(SHOWCASE[0].id);
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [near, setNear] = useState(false);
  // The frame stays hidden behind its poster until its own poster is drawn (Watch.tsx says so).
  const [ready, setReady] = useState<string | null>(null);
  useEffect(() => {
    const heard = (event: MessageEvent) => {
      const data = event.data as { type?: string; lesson?: string } | null;
      if (event.origin === window.location.origin && data?.type === 'sp-watch-ready') setReady(data.lesson ?? null);
    };
    window.addEventListener('message', heard);
    return () => window.removeEventListener('message', heard);
  }, []);

  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const size = new ResizeObserver(([entry]) => setWidth(entry?.contentRect.width ?? 0));
    size.observe(element);
    // Start loading the frame a screen or so before it scrolls into view.
    const seen = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setNear(true);
          seen.disconnect();
        }
      },
      { rootMargin: '600px 0px' },
    );
    seen.observe(element);
    return () => {
      size.disconnect();
      seen.disconnect();
    };
  }, []);

  const narrow = width > 0 && width < 640;
  const native = width >= DESKTOP.width;
  const scale = narrow || native ? 1 : width / DESKTOP.width;
  const height = narrow ? 600 : native ? Math.round(width * (DESKTOP.height / DESKTOP.width)) : DESKTOP.height * scale;
  const frameStyle = narrow || native
    ? { width: '100%', height }
    : { width: DESKTOP.width, height: DESKTOP.height, transform: `scale(${scale})`, transformOrigin: '0 0' };

  return (
    <div className="lp">
      <div className="lp-tabs" role="tablist" aria-label="Choose a lesson">
        {SHOWCASE.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={lesson === item.id}
            className={lesson === item.id ? 'on' : undefined}
            onClick={() => setLesson(item.id)}
          >
            <small>{item.subject}</small>
            {item.label}
          </button>
        ))}
      </div>
      <div className="lp-window">
        <div className="lp-bar" aria-hidden="true">
          <i />
          <i />
          <i />
          <span>stackprep · the board</span>
        </div>
        <div className="lp-screen" ref={box} style={{ height: width ? height : undefined }}>
          {/* Until the frame is near, the poster alone: the same picture the frame opens on. */}
          <img src={`/showcase/${lesson}.jpg`} alt="" className="lp-poster" loading="lazy" />
          {near && width > 0 ? (
            <iframe
              key={lesson}
              title="A lesson on the coach's board"
              src={`/watch/${lesson}?embed=1`}
              allow="autoplay"
              style={{ ...frameStyle, opacity: ready === lesson ? 1 : 0 }}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
