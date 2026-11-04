// THE PHONE APP NAMES NOTHING THE SHARED CODE STOPPED EXPORTING.
//
// The phone app bundles renderer/src and shared/ rather than copying them, and
// nothing ran its typecheck. On 2026-11-02 `clockOf` moved out of
// team/rooms/room-rules.ts into teammates/chat-lines.ts; the desktop's own page
// was moved with it and a test pinned the move, but mobile/src/ui/Groups.tsx
// kept importing it from the old place. Metro does not mind: the name is
// simply `undefined`, so `clockOf(m.at)` throws while a group chat draws, and
// an iOS store build ends on a JavaScript exception thrown in a render.
// Measured on 2026-11-04: `npx tsc --noEmit` in mobile/ named that import and
// one more, and both had been on main for two days.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SHARED = /(?:renderer\/src|\/shared)\//;
const ENDINGS = ['.ts', '.tsx', '.mjs', '.js', '/index.ts', '/index.tsx'];

function filesUnder(folder) {
  return readdirSync(folder, { withFileTypes: true }).flatMap((e) => {
    const path = `${folder}/${e.name}`;
    if (e.isDirectory()) return filesUnder(path);
    return /\.tsx?$/.test(e.name) ? [path] : [];
  });
}

const parsed = (path) => ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, path.endsWith('.tsx') ? ts.ScriptKind.TSX : undefined);

/** Every name a module hands out, declared or passed on, whether a value or a type. */
function namesOut(path) {
  const out = new Set();
  for (const s of parsed(path).statements) {
    const exported = ts.canHaveModifiers(s) && ts.getModifiers(s)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (exported && ts.isVariableStatement(s)) for (const d of s.declarationList.declarations) { if (ts.isIdentifier(d.name)) out.add(d.name.text); }
    else if (exported && s.name && ts.isIdentifier(s.name)) out.add(s.name.text);
    else if (ts.isExportDeclaration(s) && s.exportClause && ts.isNamedExports(s.exportClause)) for (const e of s.exportClause.elements) out.add(e.name.text);
    else if (ts.isExportAssignment(s)) out.add('default');
  }
  return out;
}

/** Where a relative import lands, or null when it is not a file in this repository. */
function fileFor(from, spec) {
  const base = resolve(dirname(from), spec);
  for (const end of ['', ...ENDINGS]) {
    const tried = `${base}${end}`;
    try { readFileSync(tried); return tried; } catch { /* the next ending */ }
  }
  return null;
}

function namesIn(path) {
  const asked = [];
  for (const s of parsed(path).statements) {
    if (!ts.isImportDeclaration(s) || !ts.isStringLiteral(s.moduleSpecifier)) continue;
    const spec = s.moduleSpecifier.text;
    if (!spec.startsWith('.') || !SHARED.test(spec)) continue;
    const clause = s.importClause;
    // Only the names the bundle has to find something under: a type is erased.
    if (!clause || clause.isTypeOnly || !clause.namedBindings || !ts.isNamedImports(clause.namedBindings)) continue;
    for (const e of clause.namedBindings.elements) { if (!e.isTypeOnly) asked.push({ spec, name: (e.propertyName ?? e.name).text }); }
  }
  return asked;
}

describe('the phone app and the code it shares', () => {
  const files = filesUnder(`${repo}/mobile/src`);

  it('reads some of the shared code, so this test is measuring something', () => {
    expect(files.length).toBeGreaterThan(50);
    expect(files.flatMap((f) => namesIn(f)).length).toBeGreaterThan(100);
  });

  it('asks for no name that is not handed out', () => {
    const missing = [];
    for (const file of files) {
      for (const { spec, name } of namesIn(file)) {
        const target = fileFor(file, spec);
        if (!target) { missing.push(`${file.slice(repo.length + 1)}: no such module ${spec}`); continue; }
        if (!namesOut(target).has(name)) missing.push(`${file.slice(repo.length + 1)}: ${spec} does not export ${name}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
