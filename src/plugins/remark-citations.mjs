/**
 * Inline citations for Markdown bodies.
 *
 * Authors write `[[cite:source-id]]` in the prose. Each marker becomes a
 * numbered superscript linking to the matching entry in the page's Sources
 * list (`#source-<id>`). The number is the source's position in the page's
 * frontmatter `sources` array, so it lines up with the ordered <ol> the page
 * renders from that same array.
 *
 * A marker whose id is not declared in frontmatter `sources` throws, so a
 * citation can never point at an undeclared (and thus unvalidated) source.
 */

const MARKER = /\[\[cite:([a-z0-9-]+)\]\]/g;

export default function remarkCitations() {
  return (tree, file) => {
    const frontmatter = file?.data?.astro?.frontmatter ?? {};
    const order = Array.isArray(frontmatter.sources) ? frontmatter.sources : [];

    const numberOf = (id) => {
      const index = order.indexOf(id);
      if (index === -1) {
        const where = file?.path ?? 'inconnu';
        throw new Error(
          `Citation [[cite:${id}]] : id absent du frontmatter \`sources\` (${where}).`,
        );
      }
      return index + 1;
    };

    const splitText = (value) => {
      const nodes = [];
      let last = 0;
      MARKER.lastIndex = 0;
      let match;
      while ((match = MARKER.exec(value)) !== null) {
        if (match.index > last) {
          nodes.push({ type: 'text', value: value.slice(last, match.index) });
        }
        const id = match[1];
        nodes.push({
          type: 'html',
          value: `<sup class="cite-ref"><a href="#source-${id}">${numberOf(id)}</a></sup>`,
        });
        last = match.index + match[0].length;
      }
      if (last < value.length) {
        nodes.push({ type: 'text', value: value.slice(last) });
      }
      return nodes;
    };

    const walk = (node) => {
      if (!Array.isArray(node.children)) return;
      const out = [];
      for (const child of node.children) {
        if (child.type === 'text' && child.value.includes('[[cite:')) {
          out.push(...splitText(child.value));
        } else {
          walk(child);
          out.push(child);
        }
      }
      node.children = out;
    };

    walk(tree);
  };
}
