// THE PHONE APP IMPORTS ONLY WHAT THE DESKTOP STILL EXPORTS (r-00a452c588-20261103).
//
// On 2026-11-02 a desktop polish moved `clockOf` out of
// renderer/src/team/rooms/room-rules.ts. The phone's group chat still imported
// it from there, so every group or mention opened to a white screen
// ("clockOf is not a function"); three synthetic testers hit it four times.
// Nothing noticed: the desktop's typecheck does not read mobile/, and the
// phone's own `tsc` needs mobile/node_modules, which CI does not install.
// This reads every named import in mobile/src from renderer/ or shared/ and
// asks the TypeScript checker for that file's exports, without the phone's
// packages.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const ts = createRequire(import.meta.url)('typescript');
const root = path.resolve(__dirname, '..');
const mobile = path.join(root, 'mobile', 'src');

function sources(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? sources(p) : /\.tsx?$/.test(e.name) ? [p] : [];
  });
}

/** Every `import { a, type B } from '<desktop file>'` in the phone app. */
export function desktopImports(files, read = (f) => fs.readFileSync(f, 'utf8')) {
  const out = [];
  for (const file of files) {
    const sf = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true);
    for (const st of sf.statements) {
      if (!ts.isImportDeclaration(st) && !(ts.isExportDeclaration(st) && st.moduleSpecifier)) continue;
      const spec = st.moduleSpecifier.text;
      const target = path.resolve(path.dirname(file), spec);
      if (!/^\.\.?\//.test(spec) || !(target.startsWith(path.join(root, 'renderer') + path.sep) || target.startsWith(path.join(root, 'shared') + path.sep))) continue;
      const bindings = ts.isImportDeclaration(st) ? st.importClause?.namedBindings : st.exportClause;
      if (!bindings || !('elements' in bindings)) continue;
      for (const el of bindings.elements) out.push({ file: path.relative(root, file), target, name: (el.propertyName ?? el.name).text });
    }
  }
  return out;
}

/** The file TypeScript reads for an import: a shared .mjs's declaration beside it, as the phone's tsc does. */
function resolveFile(target) {
  const candidates = target.endsWith('.mjs') ? [target.replace(/\.mjs$/, '.d.mts'), target] : ['.ts', '.tsx', '/index.ts', ''].map((e) => target + e);
  return candidates.find((p) => fs.existsSync(p) && fs.statSync(p).isFile()) ?? null;
}

describe('the phone app imports only what the desktop still exports', () => {
  const imports = desktopImports(sources(mobile));

  it('finds the imports it is checking', () => {
    expect(imports.length).toBeGreaterThan(50);
    expect(imports.some((i) => i.name === 'clockOf')).toBe(true);
  });

  it('every imported name is exported by the file it comes from', () => {
    const files = [...new Set(imports.map((i) => resolveFile(i.target)).filter(Boolean))];
    const program = ts.createProgram(files, { allowJs: true, noEmit: true, skipLibCheck: true, jsx: ts.JsxEmit.Preserve, moduleResolution: ts.ModuleResolutionKind.Bundler, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ESNext });
    const checker = program.getTypeChecker();
    const exportsOf = new Map(files.map((f) => {
      const sym = checker.getSymbolAtLocation(program.getSourceFile(f));
      return [f, new Set(sym ? checker.getExportsOfModule(sym).map((s) => s.name) : [])];
    }));
    const missing = imports.filter((i) => {
      const f = resolveFile(i.target);
      return !f || !exportsOf.get(f).has(i.name);
    }).map((i) => `${i.file}: ${i.name} from ${path.relative(root, i.target)}`);
    expect(missing).toEqual([]);
  }, 60_000);

  it('would catch a name the desktop no longer exports', () => {
    const fake = path.join(mobile, 'ui', 'Fake.tsx');
    const found = desktopImports([fake], () => "import { clockOf, gone } from '../../../renderer/src/team/rooms/room-rules';");
    expect(found.map((i) => i.name)).toEqual(['clockOf', 'gone']);
    expect(found[0].target).toBe(path.join(root, 'renderer/src/team/rooms/room-rules'));
  });
});
