// The back end moved from .mjs to .mts, a slice at a time from 2026-10-29 and
// the rest at once on 2026-11-06. GitHub called the repo JavaScript because
// main/ was untyped, and nothing ran a type check on main/ at all. These hold
// what that needs:
//
// - Every .mts in main/, shared/ and mcp/ passes `tsc -p main/tsconfig.json`, which is strict.
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
  const files = [...mtsUnder('main'), ...mtsUnder('shared'), ...mtsUnder('mcp')];

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

describe('the back end keeps no JavaScript it does not need', () => {
  const left = (dir) => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) return ['node_modules', 'build'].includes(e.name) ? [] : left(rel);
    return /\.m?js$|\.d\.mts$/.test(e.name) ? [rel] : [];
  });

  it('is .mts but for the entry, the name Expo reads, and declarations for untyped packages', () => {
    expect([...left('main'), ...left('shared'), ...left('mcp')].sort()).toEqual([
      'main/phone-sw.js',           // the phone's service worker, which its browser loads as it is
      'main/start.mjs',             // package.json main, the file Electron starts
      'main/untyped-packages.d.mts',
      'shared/product-name.d.mts',
      'shared/product-name.mjs',    // mobile/app.config.ts, loaded by Expo's own config reader
    ]);
  });
});

// On a node below 22.18 an import of a .mts fails before a script's first line
// runs, and on 2026-11-01 the Mac the agents share had 22.14. So whatever
// starts a script that reaches one passes the flag when that node needs it.
describe('a script plain Node starts can load the back end', () => {
  const SPEC = /(?:\bfrom\s*|\bimport\s*\(?\s*|new URL\(\s*)['"](\.[^'"\n]*)['"]/g;
  const imports = (file) => [...fs.readFileSync(path.join(root, file), 'utf8').matchAll(SPEC)]
    .map((m) => path.normalize(path.join(path.dirname(file), m[1])))
    .filter((p) => fs.existsSync(path.join(root, p)) && fs.statSync(path.join(root, p)).isFile());
  // A child started as spawnSync('node', ['scripts/x.mjs']) inherits NODE_OPTIONS
  // and nothing else, so it counts as part of the script that starts it.
  const SPAWN = /['"]node['"]\s*,\s*\[\s*['"](scripts\/[\w/.-]+\.mjs)['"]/g;
  const spawned = (file) => file.startsWith('scripts/')
    ? [...fs.readFileSync(path.join(root, file), 'utf8').matchAll(SPAWN)].map((m) => m[1])
    : [];
  const reachesTypeScript = (start) => {
    const seen = new Set([start]);
    const stack = [start];
    while (stack.length) {
      const file = stack.pop();
      for (const next of [...imports(file), ...spawned(file)]) if (!seen.has(next)) { seen.add(next); stack.push(next); }
    }
    return [...seen].some((f) => f.endsWith('.mts'));
  };
  const plainNodeRuns = (text) => [...text.matchAll(/\bnode\s+(?:"\$[\w]+"\s+)?(scripts\/[\w/.-]+\.mjs)/g)].map((m) => m[1]);

  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const commands = [
    ...Object.entries(pkg.scripts).map(([name, cmd]) => [`npm run ${name}`, cmd]),
    ...['scripts/hooks/pre-push', 'scripts/hooks/pre-commit'].map((f) => [f, fs.readFileSync(path.join(root, f), 'utf8')]),
  ];

  it('goes through scripts/run.mjs from npm and the git hooks', () => {
    const bare = commands.flatMap(([where, text]) => plainNodeRuns(text)
      .filter((s) => s !== 'scripts/run.mjs' && reachesTypeScript(s))
      .map((s) => `${where}: node ${s}`));
    expect(bare, 'start these as `node scripts/run.mjs <script>`').toEqual([]);
  });

  it('sees the scripts that do reach it', () => {
    expect(reachesTypeScript('scripts/dev.mjs')).toBe(true);
    expect(plainNodeRuns(pkg.scripts.dev)).toEqual(['scripts/run.mjs']);
  });

  // 2026-11-12: `npm run deploy` on Node 22.14 died at the Mac build with
  // ERR_UNKNOWN_FILE_EXTENSION for main/cloud/config.mts. deploy.mjs imports no
  // TypeScript itself; the release.mjs it starts does.
  it('sees a script that reaches it only through a child it starts', () => {
    expect(reachesTypeScript('scripts/deploy.mjs')).toBe(true);
    expect(plainNodeRuns(pkg.scripts.deploy)).toEqual(['scripts/run.mjs']);
  });

  it('includes the store server, whose launcher passes the flag', () => {
    const launcher = fs.readFileSync(path.join(root, 'mcp', 'agentbox-mcp.sh'), 'utf8');
    expect(launcher).toMatch(/process\.features\.typescript/);
    expect(launcher).toMatch(/^exec node \$strip .*\/stdio\.mts"/m);
  });
});
