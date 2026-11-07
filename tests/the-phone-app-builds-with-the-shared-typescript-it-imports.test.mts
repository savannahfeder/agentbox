// THE PHONE APP BUILDS WITH THE SHARED TYPESCRIPT IT IMPORTS (w-e4d49a1539).
//
// Main moved shared/ to TypeScript in .mts files. The phone reaches fifteen of
// them through the .mjs files it imports, and its web build failed on
// 2026-11-04: Metro did not resolve ".mts" ("Unable to resolve
// ../../shared/bridge-map.mts"), and once it did, Expo's Babel preset left the
// types in ("Missing initializer in const declaration"), because it strips
// TypeScript only from .ts and .tsx. The same bundler builds the TestFlight app.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = path.resolve(__dirname, '..');
const mobile = path.join(root, 'mobile');
const need = createRequire(path.join(mobile, 'package.json'));

const phoneFiles = (dir) => fs.readdirSync(dir, { withFileTypes: true })
  .flatMap((e) => e.isDirectory() ? phoneFiles(path.join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [path.join(dir, e.name)] : []);

/** Every .mts file the phone's source reaches by relative import. */
function mtsThePhoneReaches() {
  const seen = new Set(); const found = new Set();
  const walk = (file) => {
    if (seen.has(file)) return; seen.add(file);
    if (file.endsWith('.mts')) found.add(file);
    for (const m of fs.readFileSync(file, 'utf8').matchAll(/(?:from|import)\s*\(?\s*'(\.{1,2}\/[^']+)'/g)) {
      const base = path.resolve(path.dirname(file), m[1]);
      const hit = [base, `${base}.ts`, `${base}.tsx`].find((c) => fs.existsSync(c) && fs.statSync(c).isFile());
      if (hit) walk(hit);
    }
  };
  for (const f of phoneFiles(path.join(mobile, 'src'))) walk(f);
  return [...found];
}

describe('the phone build', () => {
  it('reaches shared .mts files, so the rest of this test means something', () => {
    expect(mtsThePhoneReaches().length).toBeGreaterThan(0);
  });

  it('lets Metro resolve .mts', () => {
    const config = need('./metro.config.js');
    expect(config.resolver.sourceExts).toContain('mts');
    expect(config.resolver.sourceExts).toContain('tsx');
  });

  it('takes the types out of every .mts file the phone reaches', () => {
    const babel = need('@babel/core');
    const { parse } = need('@babel/parser');
    for (const file of mtsThePhoneReaches()) {
      const out = babel.transformFileSync(file, { cwd: mobile, configFile: path.join(mobile, 'babel.config.js'), babelrc: false, caller: { name: 'metro', platform: 'ios', bundler: 'metro' } });
      expect(() => parse(out.code, { sourceType: 'module' }), path.relative(root, file)).not.toThrow();
    }
  }, 60_000);
});
