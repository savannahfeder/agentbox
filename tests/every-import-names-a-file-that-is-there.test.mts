// AN IMPORT OF A FILE THAT WAS RENAMED PASSED THE TYPE CHECK AND FAILED AT RUN TIME.
//
// After the back end moved to .mts, main/sign-in-returns.mts still imported
// '../shared/sign-in-ask.mjs'. tsc maps a .mjs import onto the .mts beside it,
// so all three strict checks were clean, while Node, which loads the name as
// written, threw ERR_MODULE_NOT_FOUND the moment the app started. The push hook
// found it, through a test that starts the app in its own process. Measured by
// scanning every relative import in the code and the tests: two named a file
// that was not there.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const AREAS = ['main', 'shared', 'mcp', 'renderer/src', 'mobile/src', 'tests', 'scripts', 'cloud', 'bin', '.claude/skills'];
const SKIP = new Set(['node_modules', 'scratch', 'fixtures', 'build', 'dist']);
const CODE = /\.(mjs|mts|js|cjs|ts|tsx)$/;
// `from '...'`, `import('...')` and `import '...'`, at the start of a line or after `export`, so words in comments are not read.
const SPEC = /^\s*(?:import|export)\b[^'"\n]*?(?:\bfrom\s*)?['"](\.{1,2}\/[^'"\n]+)['"]|\bimport\(\s*['"](\.{1,2}\/[^'"\n]+)['"]\s*\)/gm;

function files(dir: string, out: string[] = []): string[] {
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(path.join(root, dir), { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP.has(e.name)) files(rel, out); } else if (CODE.test(e.name)) out.push(rel);
  }
  return out;
}

// The renderer and the phone import without an extension, and their bundlers fill it in.
const at = (p: string, spec: string): boolean => {
  if (/\.(mjs|mts|js|cjs|ts|tsx|json|css|svg|png|html)$/.test(spec)) return fs.existsSync(p);
  return ['', '.ts', '.tsx', '.mts', '/index.ts', '/index.tsx'].some((ext) => fs.existsSync(p + ext));
};
// A test's source text written to a file at the repo's root (to bundle or run there) names
// paths from the root; a build's own output is there only after a build.
const resolves = (from: string, spec: string): boolean =>
  spec.includes('/dist/') || at(path.resolve(root, path.dirname(from), spec), spec) || (spec.startsWith('./') && at(path.resolve(root, spec), spec));

export function missingImports(list: string[]): string[] {
  const out: string[] = [];
  for (const f of list) {
    const src = fs.readFileSync(path.join(root, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const m of src.matchAll(SPEC)) {
      const spec = m[1] ?? m[2];
      if (!resolves(f, spec)) out.push(`${f}: ${spec}`);
    }
  }
  return out;
}

describe('every import in the app and its tests', () => {
  it('names a file that is there under that very name', () => {
    const self = path.relative(root, import.meta.filename);
    expect(missingImports(AREAS.flatMap((a) => files(a)).filter((f) => f !== self))).toEqual([]);
  });
});

describe('the check', () => {
  const at = path.join(root, 'tests', `.import-check-${process.pid}.mts`);
  const run = (body: string) => { fs.writeFileSync(at, body); try { return missingImports([path.relative(root, at)]); } finally { fs.rmSync(at, { force: true }); } };

  it('finds an import of a .mjs that is now .mts', () => {
    expect(run("import { comesBackTo } from '../shared/sign-in-ask.mjs';\n")).toHaveLength(1);
  });
  // In a task folder three below the app's own checkout, read from the root this
  // lands on that checkout's shared/, where the old .mjs still is.
  it('finds one that climbs out of the folder to a copy that still has the old name', () => {
    expect(run("import { starterAsks } from '../../../shared/teammates.mjs';\n")).toHaveLength(1);
  });
  it('finds a dynamic import of a name that is gone', () => {
    expect(run("const m = await import('../main/no-such-file.mts');\n")).toHaveLength(1);
  });
  it('passes the file under its own name, and an extensionless renderer import', () => {
    expect(run("import { comesBackTo } from '../shared/sign-in-ask.mts';\nimport { App } from '../renderer/src/App';\n")).toEqual([]);
  });
  it('does not read a path written in a comment or a string', () => {
    expect(run("// see '../shared/sign-in-ask.mjs'\nconst s = 'from \\'../gone.mjs\\'';\n")).toEqual([]);
  });
});
