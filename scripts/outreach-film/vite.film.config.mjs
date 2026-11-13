// The app's screen built for the outreach film: the normal renderer build plus
// the film's demo door (demo-hook.mjs). It writes to FILM_DIST, never to the
// repo. Run by film.mjs; by hand:
//   FILM_DIST=/tmp/film-dist npx vite build --config scripts/outreach-film/vite.film.config.mjs
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { demoHook } from './demo-hook.mjs';

const renderer = fileURLToPath(new URL('../../renderer/', import.meta.url));
const out = process.env.FILM_DIST || path.join(os.tmpdir(), 'outreach-film-dist');

export default defineConfig({
  root: renderer,
  base: './',
  cacheDir: path.join(os.tmpdir(), 'outreach-film-vite-cache'),
  logLevel: 'warn',
  plugins: [demoHook(), react()],
  build: { outDir: out, emptyOutDir: true, chunkSizeWarningLimit: 8000, rollupOptions: { input: { main: path.join(renderer, 'index.html') } } },
});
