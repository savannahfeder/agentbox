// The verify skill's test copy runs a copy of the stand-in Claude kept under
// /tmp, and live.mjs copied the stand-in and two of its imports by name. When
// the stand-in started importing stand-in-key-place.mjs, nobody added a third
// copy, so on 2026-11-15 every `live.mjs up` stand-in died on start with
// ERR_MODULE_NOT_FOUND: `claude auth status` exited 1 and a fresh copy opened
// on "Sign in to Claude Code" instead of the first run. This reads the
// stand-in's own relative imports and checks each one is copied beside it.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');
const relativeImports = (source: string) => [...source.matchAll(/from '\.\/([^']+\.mjs)'/g)].map((m) => m[1]);

describe('the test copy\'s stand-in Claude', () => {
  const live = read('.claude/skills/verify-agentbox/scripts/live.mjs');
  const copied = new Set([...live.matchAll(/path\.dirname\(STUB\), '([^']+\.mjs)'/g)].map((m) => m[1]));

  it('is copied with every file the stand-in imports', () => {
    const wanted = new Set<string>();
    const walk = (file: string) => {
      for (const dep of relativeImports(read(path.join('scripts/lib', file)))) {
        if (wanted.has(dep)) continue;
        wanted.add(dep);
        walk(dep);
      }
    };
    walk('stub-claude-worker.mjs');
    expect(wanted.size).toBeGreaterThan(0);
    expect([...wanted].filter((f) => !copied.has(f))).toEqual([]);
  });

  it('reads the imports it checks, and not package imports', () => {
    expect(relativeImports("import a from './x.mjs';\nimport fs from 'node:fs';\nimport b from '../y.mjs';")).toEqual(['x.mjs']);
  });
});
