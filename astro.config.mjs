// @ts-check
import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';

import remarkFrenchTypography from './src/plugins/remark-french-typography.mjs';
import remarkCitations from './src/plugins/remark-citations.mjs';

// https://astro.build/config
export default defineConfig({
  markdown: {
    // Astro 7 defaults to the Sätteri processor, which does not run remark
    // plugins. We switch back to the remark/rehype pipeline for its ecosystem
    // and to apply, at build time: French typography (no-break spaces,
    // quotation marks) then inline citations ([[cite:id]] → numbered links).
    processor: unified({
      remarkPlugins: [remarkFrenchTypography, remarkCitations],
    }),
  },
});
