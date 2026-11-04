// The run host and the cloud host each hash a list of their own source files
// (MADE_OF), so an updated app can tell an old host from a current one and
// replace it. A name that matches no file is hashed as the bare name instead,
// and edits to that file stop counting. When main/claude-input.mts became
// claude-input.mts on 2026-11-01, main/run-host.mjs still listed the .mjs
// name, so a change to how replies reach a run would have left old hosts
// running the old rules.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

function madeOf(file) {
  const src = fs.readFileSync(path.join(root, file), 'utf8');
  const list = src.match(/const MADE_OF = \[([^\]]*)\]/);
  return [...list[1].matchAll(/'([^']+)'/g)].map((m) => path.join(path.dirname(file), m[1]));
}

describe('a host process fingerprints files that exist', () => {
  it.each(['main/run-host.mjs', 'main/cloud/host.mts'])('every file %s lists is there to hash', (file) => {
    const named = madeOf(file);
    expect(named.length).toBeGreaterThan(1);
    expect(named.filter((f) => !fs.existsSync(path.join(root, f)))).toEqual([]);
  });
});
