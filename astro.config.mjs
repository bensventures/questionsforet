// @ts-check
import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';

import remarkFrenchTypography from './src/plugins/remark-french-typography.mjs';
import remarkCitations from './src/plugins/remark-citations.mjs';
import rehypeTableWrap from './src/plugins/rehype-table-wrap.mjs';

// https://astro.build/config
export default defineConfig({
  site: 'https://questionsforet.fr',
  vite: {
    build: {
      // Les scripts ne sont jamais mis en ligne dans le HTML : un script inline
      // obligerait la CSP de `public/_headers` à autoriser 'unsafe-inline' pour
      // `script-src`. `undefined` laisse le comportement par défaut aux autres
      // ressources, donc le CSS de page reste inline (une requête de moins au
      // premier rendu, ce qui compte pour un lecteur arrivé par une recherche).
      assetsInlineLimit: (file) => (file.endsWith('.js') ? false : undefined),
    },
  },
  markdown: {
    // Astro 7 defaults to the Sätteri processor, which does not run remark
    // plugins. We switch back to the remark/rehype pipeline for its ecosystem
    // and to apply, at build time: French typography (no-break spaces,
    // quotation marks) then inline citations ([[cite:id]] → numbered links),
    // and on the HTML side a scroll wrapper around wide tables.
    processor: unified({
      remarkPlugins: [remarkFrenchTypography, remarkCitations],
      rehypePlugins: [rehypeTableWrap],
    }),
  },
});
