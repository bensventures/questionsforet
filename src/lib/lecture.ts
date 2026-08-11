/**
 * Reading time for the long-form collection. Dossiers run 2000–6000 words, a
 * range where the reader deserves to know what they are committing to before
 * they start.
 *
 * The count is deliberately rough: Markdown syntax, citation markers and
 * directive fences are stripped, then words are counted at 200 per minute
 * (a common estimate for French non-fiction read attentively). Displayed with
 * a « ≈ », never as a precise figure.
 */

const MOTS_PAR_MINUTE = 200;

/** @param body Raw Markdown body of a collection entry. */
export function tempsDeLecture(body: string | undefined): number {
  if (!body) return 0;
  const texte = body
    .replace(/```[\s\S]*?```/g, ' ') // fenced blocks
    .replace(/\[\[cite:[a-z0-9-]+\]\]/g, ' ') // citation markers
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // links and images, keep the label
    .replace(/^[:>#\-*\s]+/gm, ' ') // list bullets, quotes, headings, directives
    .replace(/[*_`]/g, ' ');
  const mots = texte.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(mots / MOTS_PAR_MINUTE));
}