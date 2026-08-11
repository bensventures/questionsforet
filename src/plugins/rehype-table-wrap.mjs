/**
 * Wraps every Markdown table in `<div class="table-wrap">`.
 *
 * A comparative table (essences, densités) is wider than the reading column on
 * a phone. Without a wrapper the page itself scrolls sideways; with one, only
 * the table does. The scrolling is CSS-only (`overflow-x` in global.css), so
 * this costs nothing at runtime.
 *
 * `tabindex` makes the scrollable region reachable by keyboard, which is what
 * lets a keyboard user reach the columns that overflow. A `region` role is only
 * announced when it carries a name, hence the label.
 */

export default function rehypeTableWrap() {
  return (tree) => {
    const walk = (node) => {
      if (!Array.isArray(node.children)) return;
      for (const [index, child] of node.children.entries()) {
        if (child.type === 'element' && child.tagName === 'table') {
          node.children[index] = {
            type: 'element',
            tagName: 'div',
            properties: {
              className: ['table-wrap'],
              tabIndex: 0,
              role: 'region',
              'aria-label': 'Tableau, défilement horizontal',
            },
            children: [child],
          };
        } else {
          walk(child);
        }
      }
    };
    walk(tree);
  };
}
