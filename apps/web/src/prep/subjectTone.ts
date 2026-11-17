/**
 * A subject's two-letter tile. Subjects share our colours (purple tiles, as on the Roadmap);
 * the founder turned down a colour per subject on 17 Nov 2026 as off-brand.
 */

/** Two letters for a subject's tile: "Use of English" → "En", "Chemistry" → "Ch". */
export function initials(subjectName: string): string {
  const words = subjectName.split(/\s+/).filter((w) => !['of', 'and', 'the', 'in'].includes(w.toLowerCase()));
  const main = /english/i.test(subjectName) ? 'English' : (words[0] ?? subjectName);
  return main.slice(0, 2);
}
