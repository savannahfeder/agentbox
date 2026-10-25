// A LITTLE ARROW FOLDS THE CHOICES AT THE FOOT (w-65bcefb857).
//
// The choices on the one-at-a-time page sit over the reply box for as long as
// the thread is open, and the founder asked for the room back: "All you need
// is a little toggle, like a dropdown, on what we already have... Just a
// little downward arrow... You don't need text and you don't need to change
// the component." It was built once (the `.opt-collapse` chevron) and taken
// out on 2026-10-05, 6bd9bc3f, when the options moved into the conversation
// and scrolled away by themselves (tests/the-options-are-never-folded-away).
// At the foot they no longer scroll away, so the same arrow comes back here,
// on this page's box only.
//
// Folded, the box goes altogether and the reply box carries a small sign
// that it can come back: "don't you think it should add just a little
// indicator to the input field showing that it's condensed and can be
// expanded, rather than having a whole single option there?" The number keys
// pick any choice either way, and one picked out with the arrow keys brings
// the box back. The fold stays from thread to thread, since it is how
// somebody likes to read.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChoicesFold, ChoicesShow } from '../renderer/src/components/OneThingAtATime.tsx';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const css = read('renderer/src/one-thing-at-a-time.css');
const focus = read('renderer/src/components/Focus.tsx');
const visible = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

describe('the arrow on the box', () => {
  const arrow = renderToStaticMarkup(h(ChoicesFold, { onFold: () => {} }));
  it('is the old chevron, with no words on it', () => {
    expect(arrow).toContain('<path d="M4 6l4 4 4-4"');
    expect(visible(arrow)).toBe('');
    expect(arrow).toMatch(/aria-label="Fold the choices"/);
  });
  it('sits in the box\'s corner', () => {
    expect(css).toMatch(/\.one-choices-fold \{[^}]*position: absolute; top: 6px; right: 8px;/);
  });
});

describe('folded', () => {
  const sign = renderToStaticMarkup(h(ChoicesShow, { count: 3, onShow: () => {} }));
  it('the box goes, unless a choice is picked out with the keys', () => {
    expect(css).toMatch(/\.one-choices-folded:not\(:has\(\.opt-row\.selected\)\) \{ display: none; \}/);
  });
  it('and the reply box carries a small sign: how many, and an arrow up', () => {
    expect(visible(sign)).toBe('3');
    expect(sign).toContain('<path d="M4 10l4-4 4 4"');
    expect(sign).toMatch(/aria-label="Show the 3 choices"/);
  });
  it('at its right end, after the R', () => {
    expect(focus).toMatch(/<span className="dock-pill-key"><kbd>R<\/kbd><\/span>\s*\{choicesFolded && page && stripShown && !fullScreenDoc && !closeAsk && <ChoicesShow count=\{options\.length\} onShow=\{foldChoices\} \/>\}/);
  });
  it('which brings the box back without opening the reply', () => {
    expect(read('renderer/src/components/OneThingAtATime.tsx')).toMatch(/onClick=\{\(e\) => \{ e\.stopPropagation\(\); onShow\(\); \}\}/);
  });
  it('and the fold stays from thread to thread', () => {
    expect(focus).toMatch(/localStorage\.getItem\(CHOICES_FOLDED\) === '1'/);
    expect(focus).toMatch(/localStorage\.setItem\(CHOICES_FOLDED, now \? '1' : '0'\)/);
  });
});

describe('the number keys', () => {
  // "these numbers aren't even properly centered": measured at the founder's
  // zoom (115%), each digit sat 1 to 3 device pixels high and one left, and the
  // three boxes came out 44 and 46 pixels tall, from a height of 18.94px and a
  // 1px nudge meant for the conversation's options. Now a whole-pixel box with
  // the digit centred in it: within half a device pixel, all three the same.
  const rule = (sel) => css.match(new RegExp(`${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`))?.[1] ?? '';
  it('are a 20px box with the digit in its middle', () => {
    expect(rule('.one-choices .opt-key')).toMatch(/display: inline-flex; align-items: center; justify-content: center; align-self: flex-start;/);
    expect(rule('.one-choices .opt-key')).toMatch(/box-sizing: border-box; width: 20px; height: 20px; padding: 0; line-height: 1; top: 0;/);
  });
  it('level with the first line of their words, which is 20px too', () => {
    expect(rule('.one-choices .opt-key')).toMatch(/align-self: flex-start;/);
    expect(css).toMatch(/\.one-choices \.opt-row \{[^}]*line-height: 20px;/);
  });
});

describe('only on this page', () => {
  it('drawn beside the choices at the foot', () => {
    expect(focus).toMatch(/<div className=\{`one-choices\$\{choicesFolded \? ' one-choices-folded' : ''\}`\}>[\s\S]{0,700}<ChoicesFold onFold=\{foldChoices\} \/>/);
  });
  it('and not inside the options block, which the conversation draws without one', () => {
    expect(read('renderer/src/components/OptionsOffer.tsx')).not.toMatch(/ChoicesFold|ChoicesShow|one-choices-fold/);
  });
});
