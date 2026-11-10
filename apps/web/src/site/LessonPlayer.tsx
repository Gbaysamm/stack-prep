/**
 * A real lesson on the coach's board, inside the page: the watch page (Watch.tsx, its own small
 * app: site/WatchApp.tsx) in a frame, with a tab for each showcase lesson.
 *
 * Kept quick: the frame loads only as it nears the screen (and only one lesson at a time), and
 * it shows a poster until the visitor presses Play. It keeps the board's shape (16:10) at every
 * size, scaled to the width, as a video would.
 */
import { useEffect, useRef, useState } from 'react';

import { SHOWCASE } from './showcase.js';

/** The board is drawn at this size and scaled to the width it has. */
const DESKTOP = { width: 1280, height: 800 };

export function LessonPlayer() {
  const [lesson, setLesson] = useState<string>(SHOWCASE[0].id);
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [near, setNear] = useState(false);
  // The frame stays hidden behind its poster until its own poster is drawn (Watch.tsx says so).
  const [ready, setReady] = useState<string | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  // The frame loads once, on the first lesson; a tab then asks it to show another, which it
  // does in place, with no new page load (Watch.tsx listens for this).
  const [first] = useState<string>(SHOWCASE[0].id);
  const show = (id: string) => {
    setLesson(id);
    frame.current?.contentWindow?.postMessage({ type: 'sp-watch-show', lesson: id }, window.location.origin);
  };
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

  // One shape at every size, like a video: the board drawn at a laptop's size and scaled to
  // fit, so it looks the same on a phone as on a laptop, only smaller.
  const scale = width > 0 ? width / DESKTOP.width : 1;
  const height = Math.round(DESKTOP.height * scale);
  const frameStyle = {
    width: DESKTOP.width,
    height: DESKTOP.height,
    transform: `scale(${scale})`,
    transformOrigin: '0 0',
  };

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
            onClick={() => show(item.id)}
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
          {/* Every lesson's poster is there from the start, so a tab shows its picture at once;
              the frame covers them once it is ready. */}
          {SHOWCASE.map((item) => (
            <img
              key={item.id}
              src={`/showcase/${item.id}.jpg`}
              alt=""
              className="lp-poster"
              style={{ opacity: item.id === lesson ? 1 : 0 }}
            />
          ))}
          {near && width > 0 ? (
            <iframe
              ref={frame}
              title="A lesson on the coach's board"
              src={`/watch/${first}?embed=1`}
              allow="autoplay"
              style={{ ...frameStyle, opacity: ready === lesson ? 1 : 0 }}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
