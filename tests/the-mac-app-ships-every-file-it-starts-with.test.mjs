// THE MAC APP SHIPS EVERY FILE IT STARTS WITH.
//
// The Linux pull request (2026-10-07) gave main/main.mjs a top-level import of
// ../scripts/linux-launcher.mjs. A checkout has that file, so every test was
// green, but the packaged app is built from package.json `build.files` and the
// npx package from `files`, and neither lists it. A dmg built from that commit
// would have failed to load main.mjs and never opened a window, on every Mac.
// Found by reading `build.files` against the import, not by a failing test,
// which is why this one exists.
//
// The rule: a static import from main/, shared/ or bin/ may only reach a file
// both lists carry. A dynamic `import()` is not a static import: it runs only
// when its branch does, which is how a Linux-only file is loaded.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

// The relative specifiers a module imports statically: `import … from`,
// `import '…'` and `export … from`. Not `import(…)`.
export function staticImports(src) {
  const out = [];
  const re = /^\s*(?:import|export)\s+(?:[^'";]*?\sfrom\s+)?['"](\.{1,2}\/[^'"]+)['"]/gm;
  for (const m of src.matchAll(re)) out.push(m[1]);
  return out;
}

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) { if (entry.name !== 'node_modules') out.push(...walk(p)); }
    else if (/\.(mjs|cjs|js)$/.test(entry.name)) out.push(p);
  }
  return out;
}

// What one of package.json's file lists carries, for the patterns it uses:
// `dir/`, `dir/**/*`, `dir/**/*.ext`, an exact file, and `!` exclusions.
function carries(list, rel) {
  let hit = false;
  for (const raw of list) {
    const neg = raw.startsWith('!');
    const pat = neg ? raw.slice(1) : raw;
    let ok;
    const deep = pat.match(/^(.*)\/\*\*\/\*(\.[a-z]+)?$/);
    if (deep) ok = rel.startsWith(`${deep[1]}/`) && (!deep[2] || rel.endsWith(deep[2]));
    else if (pat.endsWith('/')) ok = rel.startsWith(pat);
    else ok = rel === pat;
    if (ok) hit = !neg;
  }
  return hit;
}

describe('the import reader', () => {
  it('sees a static import and not a dynamic one', () => {
    const src = [
      "import { a } from '../scripts/linux-launcher.mjs';",
      "import '../shared/side-effect.mjs';",
      "export { b } from './b.mjs';",
      "  const { c } = await import('../scripts/linux-launcher.mjs');",
      "import fs from 'node:fs';",
    ].join('\n');
    expect(staticImports(src)).toEqual([
      '../scripts/linux-launcher.mjs',
      '../shared/side-effect.mjs',
      './b.mjs',
    ]);
  });

  it('reads the file lists the way they are written', () => {
    expect(carries(pkg.build.files, 'main/main.mjs')).toBe(true);
    expect(carries(pkg.build.files, 'scripts/approval-server.sh')).toBe(true);
    expect(carries(pkg.build.files, 'scripts/linux-launcher.mjs')).toBe(false);
    expect(carries(pkg.build.files, 'briefs/founder.md')).toBe(false);
    expect(carries(pkg.files, 'shared/product-name.mjs')).toBe(true);
    expect(carries(pkg.files, 'scripts/linux-launcher.mjs')).toBe(false);
  });
});

describe('what the app starts with', () => {
  const sources = ['main', 'shared', 'bin'].flatMap((d) => walk(path.join(root, d)));

  it('reaches only files the packaged app carries', () => {
    const missing = [];
    for (const file of sources) {
      if (file.startsWith(path.join(root, 'bin'))) continue; // bin/ is the npx entry, not the app
      for (const spec of staticImports(fs.readFileSync(file, 'utf8'))) {
        const rel = path.relative(root, path.resolve(path.dirname(file), spec)).split(path.sep).join('/');
        if (!carries(pkg.build.files, rel)) missing.push(`${path.relative(root, file)} -> ${rel}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('reaches only files the npx package carries', () => {
    const missing = [];
    for (const file of sources) {
      for (const spec of staticImports(fs.readFileSync(file, 'utf8'))) {
        const rel = path.relative(root, path.resolve(path.dirname(file), spec)).split(path.sep).join('/');
        if (!carries(pkg.files, rel)) missing.push(`${path.relative(root, file)} -> ${rel}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
