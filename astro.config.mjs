// @ts-check
import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';

import remarkFrenchTypography from './src/plugins/remark-french-typography.mjs';

// https://astro.build/config
export default defineConfig({
  markdown: {
    // Astro 7 defaults to the Sätteri processor, which does not run remark
    // plugins. We switch back to the remark/rehype pipeline for its ecosystem
    // (directives, footnotes, the upcoming citation component) and to apply
    // French typography (no-break spaces, quotation marks) at build time.
    processor: unified({
      remarkPlugins: [remarkFrenchTypography],
    }),
  },
});
