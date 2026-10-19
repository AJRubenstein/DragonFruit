// @ts-check
import { defineConfig } from 'astro/config';
import socialCards from './src/og/integration.mjs';

// https://astro.build/config
export default defineConfig({
  site: 'https://dragonfruit-slicer.com',
  trailingSlash: 'ignore',
  integrations: [
    /* Every page gets a social card, rendered from the page itself once the site is
       built. See src/og/. */
    socialCards(),
  ],
  build: {
    inlineStylesheets: 'auto',
  },
  devToolbar: {
    enabled: false,
  },
});
