// THE ⌘ ON A CARD'S KEYS STANDS AS TALL AS ITS NUMBER.
//
// Asked for on w-c07d8993c4 (2026-11-13): on the key card, "the cmd + number
// are not properly aligned with one another (in all cmd + number cases)".
// Geist has no ⌘, so the glyph came from whatever font the machine fell back
// to. Measured in the built card at 2x: the ⌘ ink ran from y 1686 to 1705 and
// the 1 beside it from 1688 to 1705, so the ⌘ stood a pixel above the number
// and was wider than it. The ⌘ is now drawn on the baseline at 0.68em, so it
// matches on every machine: there both inks run from 1688 to 1705.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CardKey } from '../renderer/src/components/CardKey.tsx';

const root = path.resolve(import.meta.dirname, '..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');
const drawn = (keys: string) => renderToStaticMarkup(h(CardKey, { keys }));

describe('a card key', () => {
  it('draws ⌘ as a mark and keeps the number as text', () => {
    const html = drawn('⌘1');
    expect(html).toMatch(/^<span class="approval-key"><svg class="key-mark"[^>]*>.*<\/svg>1<\/span>$/);
    expect(html).not.toContain('⌘');
  });

  it('leaves a key with no ⌘ as the text it was', () => {
    expect(drawn('Ctrl+1')).toBe('<span class="approval-key">Ctrl+1</span>');
    expect(drawn('↵')).toBe('<span class="approval-key">↵</span>');
    expect(drawn('esc')).toBe('<span class="approval-key">esc</span>');
  });

  it('draws every ⌘ in a chord', () => {
    expect(drawn('⇧⌘1').match(/class="key-mark"/g)).toHaveLength(1);
    expect(drawn('⌘⌘').match(/class="key-mark"/g)).toHaveLength(2);
  });
});

describe('every key on an approval card', () => {
  it('goes through CardKey, Allow and Deny and the key card\'s Reply alike', () => {
    const app = read('renderer/src/App.tsx');
    const actions = read('renderer/src/components/KeyCardActions.tsx');
    for (const k of ['⌘1', '⌘2']) expect(app).toContain(`<CardKey keys={chord('${k}')} />`);
    expect(actions).toContain("<CardKey keys={chord('⌘3')} />");
    expect(app + actions).not.toMatch(/className="approval-key">\{chord\(/);
  });

  it('sizes the mark to the number beside it and sets it on the baseline', () => {
    const rule = /\.key-mark \{[^}]*\}/.exec(read('renderer/src/styles.css'))?.[0] ?? '';
    expect(rule).toMatch(/height: 0\.68em/);
    expect(rule).toMatch(/vertical-align: baseline/);
  });
});
