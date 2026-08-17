/**
 * French typography: no-break spaces around high punctuation and quotation
 * marks. Shared by the remark plugin (Markdown bodies) and the Astro
 * components (frontmatter prose such as titles, verdicts, explanations).
 *
 * Conservative on high punctuation: only a regular space the author already
 * typed is hardened, so "12:30" and "1:2" stay intact. Quotation marks are
 * unambiguous, so the inner space is added whether or not it was typed.
 *
 * The typewriter apostrophe is converted too. It has no other use in French
 * prose, and the frontmatter used to keep straight apostrophes while Markdown
 * bodies got curly ones: on the home page, a title pulled from a collection sat
 * next to hand-written prose and the difference showed.
 */

const NNBSP = '\u202F'; // narrow no-break space
const NBSP = '\u00A0'; // no-break space

/** @param {string} value @returns {string} */
export function frenchTypography(value) {
  if (typeof value !== 'string') return value;
  return value
    .replace(/'/g, '\u2019')
    .replace(/«\s*/g, '«' + NNBSP)
    .replace(/\s*»/g, NNBSP + '»')
    .replace(/ ([;!?])/g, NNBSP + '$1')
    .replace(/ :/g, NBSP + ':');
}
