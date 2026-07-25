/**
 * French typography applied to Markdown bodies at build time.
 *
 * The actual substitution rules live in `../lib/typography.mjs`, shared with
 * the Astro components that render French prose coming from frontmatter.
 *
 * Dependency-free: a recursive walk over the mdast tree. `code` and `inlineCode`
 * nodes are not of type `text`, so they are left untouched.
 */

import { frenchTypography } from '../lib/typography.mjs';

function walk(node) {
  if (node.type === 'text' && typeof node.value === 'string') {
    node.value = frenchTypography(node.value);
  }
  if (Array.isArray(node.children)) {
    for (const child of node.children) walk(child);
  }
}

export default function remarkFrenchTypography() {
  return (tree) => walk(tree);
}
