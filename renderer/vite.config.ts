import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// THE THEME LAB IS GONE, AND THE FLAG WENT WITH IT., 2026-08-21. There used to
// be a `define` here replacing __THEME_LAB__ with a literal so rollup could
// delete the lab out of anything scripts/release.mjs built. She asked for the
// strip to be removed outright, so there is nothing left to keep out and no
// flag to get wrong. tests/the-theme-lab-is-gone.test.mjs checks.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { outDir: 'dist' },
});
