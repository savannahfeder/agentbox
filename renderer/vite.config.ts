import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Two pages: the app, and the corner tag that floats over other apps
// (main/corner-tag.mjs loads it into its own small window).
const page = (name: string) => fileURLToPath(new URL(name, import.meta.url));

// THE THEME LAB IS GONE, AND THE FLAG WENT WITH IT., 2026-08-21. There used to
// be a `define` here replacing __THEME_LAB__ with a literal so rollup could
// delete the lab out of anything scripts/release.mjs built. She asked for the
// strip to be removed outright, so there is nothing left to keep out and no
// flag to get wrong. tests/the-theme-lab-is-gone.test.mjs checks.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    // Vite's 500 kB warning is about what a browser downloads over the
    // internet. Nothing here is downloaded: the app window loads these files
    // off the disk beside it, and a browser tab loads them from 127.0.0.1. So
    // the warning only ever told a person following the README that their
    // build had gone wrong (F-144). The limit is set above what the bundle is
    // so a chunk that really does run away still says so.
    chunkSizeWarningLimit: 4000,
    rollupOptions: { input: { main: page('index.html'), cornerTag: page('corner-tag.html') } },
  },
});
