// THE TRAY'S LOOK KEPT CHANGING AFTER IT WAS APPROVED. Between 2026-10-08 and
// 2026-11-01 its glass, tint, ink and light-or-dark rule were reworked about
// fifteen times, each change checked only against the bug it fixed, with
// tests that use a pretend glass. The last one left it a flat grey slab over
// dark windows, which only showed up on the owner's screen.
//
// So the parts that make the tray look the way it does are pinned here by a
// fingerprint of their code, comments and spacing left out. A change to any
// of them fails this test until the person has approved a picture of the real
// glass, and only then is the fingerprint moved.
import { describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const approval = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/the-trays-approved-look.json'), 'utf8'));
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

// Comments and spacing say nothing about the look, so editing them is free.
export function withoutComments(code) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

// `const name = (...) => {` or `function name(` up to its closing brace.
export function body(code, name) {
  const at = code.search(new RegExp(`(const ${name} = |function ${name}\\()`));
  if (at < 0) throw new Error(`${name} is gone`);
  let depth = 0;
  for (let i = code.indexOf('{', at); i < code.length; i++) {
    if (code[i] === '{') depth++;
    else if (code[i] === '}' && --depth === 0) return code.slice(at, i + 1);
  }
  throw new Error(`${name} never closes`);
}

const fingerprint = (text) => crypto.createHash('sha256').update(withoutComments(text)).digest('hex').slice(0, 16);

// Types, and whether an import says .mjs or .mts, say nothing about the look
// either: the code is read as the JavaScript it runs as.
export function asCode(code, file) {
  const options = { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.Preserve, verbatimModuleSyntax: true, removeComments: true };
  return ts.transpileModule(code, { fileName: file, compilerOptions: options }).outputText.replace(/\.m[jt]s(['"])/g, '.mjs$1');
}

// What the tray looks like, part by part.
export const PARTS = {
  'the tray page styles (renderer/src/corner-tag/corner-tag.css)': () => read('renderer/src/corner-tag/corner-tag.css'),
  'the tray page (renderer/src/corner-tag/main.tsx)': () => asCode(read('renderer/src/corner-tag/main.tsx'), 'main.tsx'),
  'the nine dots (renderer/src/corner-tag/lattice.tsx)': () => asCode(read('renderer/src/corner-tag/lattice.tsx'), 'lattice.tsx'),
  'the corner picker (renderer/src/corner-tag/place.tsx)': () => asCode(read('renderer/src/corner-tag/place.tsx'), 'place.tsx'),
  "the Mac's glass (main/native/liquid-glass/liquid-glass.mm)": () => read('main/native/liquid-glass/liquid-glass.mm'),
  'how the tray holds its glass light or dark (main/corner-tag.mts readTone, dress, make)': () => {
    const code = read('main/corner-tag.mts');
    return ['readTone', 'dress', 'make'].map((n) => asCode(body(code, n), 'corner-tag.mts')).join('\n');
  },
  'where light turns to dark (shared/corner-tag.mts toneFromLuma)': () => asCode(body(read('shared/corner-tag.mts'), 'toneFromLuma'), 'corner-tag.mts'),
};

describe("the tray's approved look", () => {
  it('records when it was approved and the pictures that were approved', () => {
    expect(approval.approved).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(approval.pictures).toBeTruthy();
    expect(Object.keys(approval.parts).sort()).toEqual(Object.keys(PARTS).sort());
  });

  for (const [part, text] of Object.entries(PARTS)) {
    it(`has not changed: ${part}`, () => {
      const now = fingerprint(text());
      expect(now, [
        `The tray's look was approved on ${approval.approved} (${approval.pictures}), and ${part} has changed.`,
        'Show the person a picture of the real tray on the Mac first, over a dark window and a light one.',
        `Only after they approve it, set "${part}" to "${now}" in tests/fixtures/the-trays-approved-look.json,`,
        'with the date and the pictures they approved. A bug fix that needs this is still a change to the look.',
      ].join('\n')).toBe(approval.parts[part]);
    });
  }
});

describe('what counts as a change', () => {
  it('ignores comments and spacing', () => {
    expect(fingerprint('a { color: red; } /* why */\n// note\n')).toBe(fingerprint('a {\n  color: red;\n}'));
  });

  it('keeps a web address that has two slashes in it', () => {
    expect(withoutComments('url("https://x.y/z")')).toBe('url("https://x.y/z")');
  });

  it('notices a changed value', () => {
    expect(fingerprint('a { color: red; }')).not.toBe(fingerprint('a { color: blue; }'));
  });

  it('ignores types and an import that now ends .mts, and still notices a changed value under them', () => {
    const was = "import { tone } from './glass.mjs';\nfunction dress(win) { return tone(win, 0.42); }";
    const typed = "import { tone } from './glass.mts';\nimport type { Win } from './win.mts';\nfunction dress(win: Win): number { return tone(win, 0.42); }";
    expect(fingerprint(asCode(typed, 'a.mts'))).toBe(fingerprint(asCode(was, 'a.mjs')));
    expect(fingerprint(asCode(typed.replace('0.42', '0.5'), 'a.mts'))).not.toBe(fingerprint(asCode(was, 'a.mjs')));
  });

  it('cuts one function out of a file whole', () => {
    expect(body('const a = () => { if (x) { y(); } };\nconst b = 1;', 'a')).toBe('const a = () => { if (x) { y(); } }');
    expect(body('function f(x) { return { x }; }', 'f')).toBe('function f(x) { return { x }; }');
  });
});
