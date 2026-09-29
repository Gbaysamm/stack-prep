/**
 * THE DOODLE LIBRARY: every `<name>.svg` in this folder, by name, with its alt text (the SVG's
 * own aria-label). A new file is picked up by the build with no change here.
 *
 * The files are in the board's art format (database/lesson_doodles.py): viewBox 0 0 120 120,
 * drawn in strokes, groups that may carry `data-anim` / `data-origin` / `data-react`. They are
 * cleaned again before they are drawn (Doodle.tsx), like any doodle.
 *
 * `buddy-*.svg` are the coach buddy's expressions (Buddy.tsx), and are doodles like the rest.
 */

export interface DoodleArt {
  name: string;
  svg: string;
  alt: string;
}

const files = import.meta.glob<string>("./*.svg", {
  query: "?raw",
  import: "default",
  eager: true,
});

/** The words of an SVG's aria-label on its root, as its alt text. */
export function altOf(svg: string): string {
  const found = /<svg\b[^>]*\baria-label="([^"]*)"/i.exec(svg);
  return (found?.[1] ?? "").replace(/&quot;/g, '"').replace(/&amp;/g, "&").trim();
}

const LIBRARY = new Map<string, DoodleArt>(
  Object.entries(files).map(([path, svg]) => {
    const name = path.replace(/^\.\//, "").replace(/\.svg$/, "");
    return [name, { name, svg, alt: altOf(svg) || "A doodle" }];
  }),
);

/** A library doodle by name, or null when there is none by that name. */
export function libraryDoodle(name: string): DoodleArt | null {
  return LIBRARY.get(name) ?? null;
}

/** Every library doodle's name. */
export function libraryNames(): string[] {
  return Array.from(LIBRARY.keys()).sort();
}
