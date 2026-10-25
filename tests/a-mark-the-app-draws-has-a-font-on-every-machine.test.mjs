// A MISSING-GLYPH BOX IN A TOAST ON THE LINUX BOX.
//
// QA batch 002, F-43, Oct 23 2026, filed needs-info: "A missing-glyph box
// renders in the toast. Possibly a font missing on this box; not checked on
// another OS." No screenshot, so what the box stood in for is not known.
//
// WHAT IS MEASURED. The app bundles Geist and names only macOS families after
// it, so on a Mac a character Geist lacks is drawn by Avenir Next or the system
// font and nobody sees a box. Read off the two woff2 files on 2026-10-25,
// Geist carries 728 characters and three of the ones the app draws are not
// among them:
//
//   ⌘ U+2318   ✓ U+2713   ✕ U+2715
//
// ⌘ never reaches a Linux screen: shared/key-caps.mjs turns it into "Ctrl"
// where there is no Command key. ✓ and ✕ are drawn as themselves, on the
// approval verdict, the Later picker's repeat tick, the box filter, the
// teammates menu and every "copied ✓". On a machine whose system sans has no
// tick, every one of those is a box.
//
// So each stack names DejaVu Sans before the generic family. It carries all
// thirteen of the marks this app draws, it is on effectively every Linux
// desktop (fonts-dejavu-core), and on a Mac it is never reached.
//
// This does not prove F-43 was one of those two marks. It removes the cause
// that can be measured.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Every CSS file the app's windows load. */
const sheets = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (
  e.isDirectory() ? sheets(path.join(dir, e.name)) : e.name.endsWith('.css') ? [path.join(dir, e.name)] : []
));

/**
 * Each stack in them, as { file, stack }: every `font-family:` outside an
 * @font-face, and the custom properties the rest of the app reads for one.
 */
function stacks() {
  const out = [];
  for (const file of sheets(path.join(root, 'renderer', 'src'))) {
    const css = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const at = path.relative(root, file);
    for (const m of css.matchAll(/(@font-face\s*\{[^}]*)?font-family\s*:\s*([^;}]+)/g)) {
      if (!m[1]) out.push({ file: at, stack: m[2].trim() });
    }
    for (const m of css.matchAll(/--(?:mono|serif|font-ui)\s*:\s*([^;}]+)/g)) {
      out.push({ file: at, stack: m[1].trim() });
    }
  }
  return out;
}

// The families a stack may end on: the generic keywords, and what passes the
// question on to another stack.
const GENERIC = new Set(['sans-serif', 'serif', 'monospace', 'cursive', 'system-ui', 'inherit', 'initial', 'unset']);
const CARRIES_THE_MARKS = /^'?DejaVu Sans( Mono)?'?$/;

const named = stacks().filter(({ stack }) => !stack.startsWith('var(') && !GENERIC.has(stack));

describe('the fonts the app names', () => {
  it('are found, and there are the handful we know about', () => {
    expect(named.length).toBeGreaterThanOrEqual(7);
  });

  for (const { file, stack } of named) {
    it(`${file}: ${stack.slice(0, 48)} falls through to a font that has the marks`, () => {
      const families = stack.split(',').map((f) => f.trim());
      const last = families[families.length - 1];
      // A stack of one named family is a face asked for by name, not a stack.
      if (families.length === 1) { expect(GENERIC.has(last)).toBe(false); return; }
      expect(GENERIC.has(last), `${stack} ends on a generic family`).toBe(true);
      expect(families[families.length - 2]).toMatch(CARRIES_THE_MARKS);
    });
  }
});

describe('the surface that says a thread is ready', () => {
  const ct = fs.readFileSync(path.join(root, 'renderer', 'src', 'corner-tag', 'corner-tag.css'), 'utf8');

  // F-43 was seen on "Add is ready", which is the corner tag's own window.
  // It names only macOS faces, so on Linux every character in it came from
  // whatever fontconfig picked.
  it('names one too', () => {
    expect(/body\s*\{[^}]*font-family:[^;]*DejaVu Sans[^;]*sans-serif/.test(ct)).toBe(true);
  });
});
