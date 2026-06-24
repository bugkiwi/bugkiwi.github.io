import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import react from '@astrojs/react';

// https://astro.build
export default defineConfig({
  site: 'https://bugkiwi.github.io',
  integrations: [mdx(), react()],
});
