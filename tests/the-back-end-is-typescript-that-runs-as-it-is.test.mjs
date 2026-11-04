// The back end is moving from .mjs to .mts, a slice at a time (2026-10-29).
// GitHub called the repo JavaScript because main/ was untyped, and nothing ran
// a type check on main/ at all: `npm run typecheck` covered only the renderer,
// and CI ran no typecheck. These hold the two things a migrated file needs:
//
// - Every main/**/*.mts passes `tsc -p main/tsconfig.json`, which is strict.
//   This is the one place the back end's types are checked; CI runs it on
//   every push like any other test.
// - Every main/**/*.mts is plain TypeScript that Node strips at load, because
//   nothing compiles it: Electron 43 (Node 24.22) imports .mts as it is,
//   measured with a throwaway main process and a packed app.asar, both of
//   which loaded a typed module. An enum or a namespace would need a build.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { stripTypeScriptTypes } from 'node:module';

const root = path.resolve(import.meta.dirname, '..');

function mtsUnder(dir) {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : mtsUnder(rel);
    return e.name.endsWith('.mts') && !e.name.endsWith('.d.mts') ? [rel] : [];
  });
}

describe('the back end is TypeScript that runs as it is', () => {
  const files = [...mtsUnder('main'), ...mtsUnder('shared')];

  it('has migrated files to check', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  // Not spawnSync: a worker blocked for the whole check stops answering vitest,
  // and on a busy machine the run then dies without naming a test.
  it('passes the strict type check', async () => {
    const tsc = await new Promise((resolve) => {
      execFile(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'), '--noEmit', '-p', 'main/tsconfig.json'], {
        cwd: root,
        encoding: 'utf8',
        timeout: 170_000,
        maxBuffer: 16 * 1024 * 1024,
      }, (error, stdout, stderr) => resolve({ error, text: stdout + stderr }));
    });
    expect(tsc.text).toBe('');
    expect(tsc.error).toBeNull();
  }, 180_000);

  it.each(files)('%s is stripped by Node with nothing left to compile', (file) => {
    const src = fs.readFileSync(path.join(root, file), 'utf8');
    expect(() => stripTypeScriptTypes(src, { mode: 'strip' })).not.toThrow();
  });

  it('a non-erasable construct is refused, so the check above can fail', () => {
    expect(() => stripTypeScriptTypes('enum Side { Left, Right }', { mode: 'strip' })).toThrow();
  });
});

// `npx agentbox-app` runs main/ on the user's own Node, which loads .mts
// without a flag from 22.18. Below that it throws ERR_UNKNOWN_FILE_EXTENSION.
describe('the Node it asks for can load it', () => {
  it('is 22.18 or newer', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const [major, minor] = pkg.engines.node.match(/>=\s*(\d+)\.(\d+)/).slice(1).map(Number);
    expect(major > 22 || (major === 22 && minor >= 18), pkg.engines.node).toBe(true);
  });
});

// The push check, ship, the build, the store server and the cloud machines
// run on whatever node is on PATH, and on 2026-11-01 that was 22.14 on the
// Mac the agents share. Until that is known to be 22.18 or newer, nothing
// they load may be .mts, or every push and every agent's store tools fail.
describe('what plain Node on the Mac loads stays .mjs for now', () => {
  const SPEC = /(?:\bfrom\s*|\bimport\s*\(?\s*|new URL\(\s*)['"](\.[^'"\n]*)['"]/g;
  const imports = (file) => [...fs.readFileSync(path.join(root, file), 'utf8').matchAll(SPEC)]
    .map((m) => path.normalize(path.join(path.dirname(file), m[1])))
    .filter((p) => fs.existsSync(path.join(root, p)) && fs.statSync(path.join(root, p)).isFile());
  const under = (dir) => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : under(rel);
    return /\.m?js$/.test(e.name) ? [rel] : [];
  });
  const named = ['scripts/hooks/pre-push', 'scripts/hooks/pre-commit', 'package.json', '.github/workflows/tests.yml']
    .flatMap((f) => fs.readFileSync(path.join(root, f), 'utf8').match(/scripts\/[\w/.-]+\.mjs/g) ?? []);
  // cloud/standin is the stand-in cloud the tests import into vitest, which
  // loads .mts itself; nothing runs it under plain node.
  const roots = [...new Set([...named, ...under('mcp'), ...under('cloud').filter((f) => !f.startsWith('cloud/standin/'))])].filter((f) => fs.existsSync(path.join(root, f)));

  function reached() {
    const seen = new Set();
    const stack = [...roots];
    while (stack.length) {
      for (const next of imports(stack.pop())) if (!seen.has(next)) { seen.add(next); stack.push(next); }
    }
    return [...seen];
  }

  it('starts from the scripts those run', () => {
    expect(roots).toContain('scripts/ship.mjs');
    expect(roots).toContain('mcp/stdio.mjs');
  });

  it('reaches no .mts', () => {
    expect(reached().filter((f) => f.endsWith('.mts'))).toEqual([]);
  });
});
