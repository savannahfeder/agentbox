// THE LOGO LIST LOADS OUTSIDE VITE.
//
// A ship went red on tests/inline-links-keep-their-place: its esbuild bundle of
// the thread page threw "import_meta3.glob is not a function" on load. The
// thread page reaches the Connections logo list through its connection links,
// and the list asked import.meta.glob, which only Vite fills in. Reproduced by
// bundling that test's page with esbuild and running it in Chromium. Outside
// Vite the list is now empty instead of fatal.
import { it, expect } from 'vitest';
import { build } from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';

it('bundles with esbuild and loads with no logos rather than throwing', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'logos-'));
  try {
    // An iife run in a bare context, the way the thread page's bundle runs:
    // importing it here would go through Vitest, which fills the glob in.
    const out = path.join(dir, 'logos.js');
    await build({ entryPoints: ['renderer/src/connections/logos.ts'], bundle: true, format: 'iife', globalName: 'logos', outfile: out, logLevel: 'silent' });
    const box = {};
    vm.runInNewContext(fs.readFileSync(out, 'utf8'), box);
    expect(box.logos.logoOf('github')).toBeNull();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
