/**
 * French typography applied once, at build time.
 *
 * Rules enforced:
 *   - narrow no-break space (U+202F) before  ; ! ?
 *   - no-break space (U+00A0) before  :
 *   - narrow no-break space inside the French quotation marks « … »
 *
 * Deliberately conservative for high punctuation: we only harden a regular
 * space the author already typed before the mark (" ;"), so we never touch a
 * "12:30" or a "1:2" ratio. Quotation marks are unambiguous, so we also cover
 * the case where the author left no space ("« mot »").
 *
 * Dependency-free: a recursive walk over the mdast tree. `code` and `inlineCode`
 * nodes are not of type `text`, so they are left untouched.
 */

const NNBSP = '\u202F'; // narrow no-break space
const NBSP = '\u00A0'; // no-break space

function fix(value) {
  return value
    // inside French quotation marks, whether or not a space was typed
    .replace(/«\s*/g, '«' + NNBSP)
    .replace(/\s*»/g, NNBSP + '»')
    // high punctuation: only harden a plain space that is already present
    .replace(/ ([;!?])/g, NNBSP + '$1')
    .replace(/ :/g, NBSP + ':');
}

function walk(node) {
  if (node.type === 'text' && typeof node.value === 'string') {
    node.value = fix(node.value);
  }
  if (Array.isArray(node.children)) {
    for (const child of node.children) walk(child);
  }
}

export default function remarkFrenchTypography() {
  return (tree) => walk(tree);
}
