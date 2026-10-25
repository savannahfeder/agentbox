// NO LABEL CARRIES A MAC GLYPH OF ITS OWN ANY MORE.
//
// The Send button, the walk's cards, the shortcuts page and a dozen tooltips
// each wrote ⌘ into their own string, so on Linux the app named a key the
// keyboard does not have while Ctrl was what worked. Every one of them now asks
// shared/key-caps.mjs, through renderer/src/this-keyboard.ts.
//
// What is pinned here is the rule rather than the fourteen labels: a glyph in a
// string a person reads has to come from the table. Comments are stripped
// first — this repo explains its keys at length and those explanations stay.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Every .ts and .tsx under renderer/src, with its comments taken out. */
function codeOf(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { codeOf(full, out); continue; }
    if (!/\.tsx?$/.test(entry.name)) continue;
    const text = fs.readFileSync(full, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^[ \t]*\/\/.*$/gm, '')
      .replace(/\/\/.*$/gm, '')
      // What a template puts INTO a string is code, and the code is allowed to
      // ask the table for a glyph: `Press ${chord('⌘S')}` draws Ctrl+S here.
      .replace(/\$\{[^}]*\}/g, '');
    out.push([path.relative(root, full), text]);
  }
  return out;
}

const MAC_GLYPH = /[⌘⌥⇧⌃]/u;

/**
 * THE VOCABULARY FILES, where a key IS written in the Mac's glyphs on purpose.
 *
 *  These hold the app's one canonical name for each key — the hint plate's
 *  list, the walk's cards, the cloud's chord, the import card's sentence — and
 *  every one of them is turned into this keyboard's words where it is DRAWN.
 *  That is the whole design: one spelling in the source, the right one on the
 *  screen. Files that draw are held to the rule below.
 */
const VOCABULARY = [
  'renderer/src/hint-plate.ts',
  'renderer/src/onboarding.ts',
  'renderer/src/cloud-menu.ts',
  'renderer/src/agent-import-card.ts',
  'renderer/src/this-keyboard.ts',
];

describe('the glyphs come from the table', () => {
  const files = codeOf(path.join(root, 'renderer/src'));

  it('reads the keyboard once, and from the shared table', () => {
    const keyboard = fs.readFileSync(path.join(root, 'renderer/src/this-keyboard.ts'), 'utf8');
    expect(keyboard).toContain("from '../../shared/key-caps.mjs'");
    // Nobody else decides which keyboard this is. (`navigator.userAgent` is
    // still read elsewhere, for the phone, which is a different question.)
    const askers = files
      .filter(([name, text]) => name !== 'renderer/src/this-keyboard.ts' && /navigator\.platform/.test(text))
      .map(([name]) => name);
    expect(askers).toEqual([]);
  });

  it('draws no Mac glyph in a cap of its own', () => {
    const caps = [];
    for (const [name, text] of files) {
      for (const m of text.matchAll(/<kbd[^>]*>([^<]*)</g)) {
        // `<kbd>{chord('⌘↵')}</kbd>` is the table being asked, which is right.
        if (MAC_GLYPH.test(m[1]) && !m[1].includes('chord(')) caps.push(`${name}: ${m[1]}`);
      }
    }
    expect(caps).toEqual([]);
  });

  it('puts no Mac glyph in anything the pointer rests on', () => {
    // A tooltip, a label or a placeholder: the strings that are drawn as
    // written, as against the vocabulary a draw point translates.
    const said = [];
    for (const [name, text] of files) {
      if (VOCABULARY.includes(name)) continue;
      for (const m of text.matchAll(/(?:title|aria-label|placeholder)=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
        const label = m[1] ?? m[2] ?? '';
        if (MAC_GLYPH.test(label)) said.push(`${name}: ${label}`);
      }
    }
    expect(said).toEqual([]);
  });

  it('says the three sentences that carry a key in this keyboard’s words', () => {
    // The walk's leave card, the toast after it, and the import card: each is a
    // whole sentence with ⌘K inside it, so it is the sentence that is rewritten.
    const walk = fs.readFileSync(path.join(root, 'renderer/src/components/Onboarding.tsx'), 'utf8');
    const app = fs.readFileSync(path.join(root, 'renderer/src/App.tsx'), 'utf8');
    const imports = fs.readFileSync(path.join(root, 'renderer/src/components/ImportAgents.tsx'), 'utf8');
    expect(walk).toContain('sayKeys(COPY.leaveLine)');
    expect(app).toContain('sayKeys(WALK_COPY.offerLater)');
    expect(imports).toMatch(/sayKeys\(alreadyIn > 0 \? CARD\.laterAllIn : CARD\.noneLater\)/);
  });
});
