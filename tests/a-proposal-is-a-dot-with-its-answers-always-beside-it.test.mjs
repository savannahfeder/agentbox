// A PROPOSAL IS A DOT, WITH ITS ANSWERS ALWAYS BESIDE IT (w-fcb5fdc2e5).
//
// What broke: the list of threads a thread filed drew two boxed presses on
// every waiting row inside an orange border, and the row shaded the instant a
// cursor touched it. "Everything immediately shades... the really abrupt
// orange button might be kind of overwhelming... kind of hard to process." And
// there was no way to turn a proposal down: "I sometimes will just want to
// reject something."
//
// Picked off four looks drawn in the real app (the quiet list), then corrected
// on the drawing: NEEDS YOU in orange beside the orange NEW THREAD made two
// orange words ("we can't have two pieces of text in orange"), the label
// counted two proposals where only the hovered one looked like one, and rows
// already under way still read as asking for attention. Measured by rendering
// the list and reading its stylesheet, as below.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ThreadsMade, waitingWords } from '../renderer/src/components/ThreadsMade.tsx';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const css = read('renderer/src/components/threads-made.css');
const rule = (sel) => {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return css.match(new RegExp(`(?:^|\\n)${esc} \\{[^}]*\\}`))?.[0] ?? '';
};
const rows = [
  { id: 'w-1', title: 'Rename the usage page heading', state: 'running' },
  { id: 'w-2', title: 'Show the reset time in your own timezone', state: 'scheduled', approve: true },
  { id: 'w-3', title: 'Add a test for the meter at exactly 100%', state: 'scheduled', approve: true },
];
const draw = (extra = {}, rs = rows) => renderToStaticMarkup(React.createElement(ThreadsMade, {
  rows: rs, label: 'Filed from this thread', onOpen: () => {}, onApprove: () => {}, onHere: () => {}, onDismiss: () => {}, ...extra,
}));

describe('a dot is what a proposal looks like', () => {
  const html = draw();

  it('puts one dot on every proposal waiting on you, and none on the rest', () => {
    expect(html.match(/class="made-dot"/g)).toHaveLength(2);
    const running = html.slice(html.indexOf('Rename the usage page heading') - 200, html.indexOf('Rename the usage page heading'));
    expect(running).not.toContain('made-dot');
  });

  it('says NEEDS YOU nowhere: the dot says it', () => {
    expect(html).not.toContain('>Needs you<');
    expect(html).not.toContain('>Later<');
  });

  it('counts what the dots count', () => {
    expect(html).toContain(`>${waitingWords(2)}<`);
    expect(waitingWords(2)).toBe('2 proposals waiting on you');
    expect(waitingWords(1)).toBe('1 proposal waiting on you');
    expect(draw({}, rows.slice(0, 2))).toContain('>1 proposal waiting on you<');
  });

  it('draws no dot where the list cannot answer, which is every list but this one', () => {
    expect(draw({ onApprove: undefined })).not.toContain('made-dot');
    expect(draw({ onApprove: undefined })).toContain('>Filed from this thread<');
  });

  it('paints the dot in the accent', () => {
    expect(rule('.made-dot')).toMatch(/background: var\(--accent\)/);
  });
});

describe('only one word in the list is orange', () => {
  it('is NEW THREAD, and nothing else that is text wears the accent', () => {
    expect(rule('.made-approve')).toMatch(/color: var\(--accent\)/);
    for (const sel of ['.made-label', '.made-state', '.made-title', '.made-here', '.made-dismiss', '.made-open']) {
      expect(rule(sel)).not.toContain('--accent');
    }
  });

  it('puts no orange border round the list while proposals wait', () => {
    expect(css).not.toMatch(/\.made-waiting \.made-list \{[^}]*accent/);
  });
});

describe('what is already under way goes grey', () => {
  it('marks the rows that are not proposals as quiet while any proposal waits', () => {
    const html = draw();
    expect(html.match(/class="made-row made-quiet"/g)).toHaveLength(1);
    expect(html.match(/class="made-row made-ask"/g)).toHaveLength(2);
  });

  it('leaves a list with nothing waiting at full strength', () => {
    const html = draw({}, [rows[0]]);
    expect(html).not.toContain('made-quiet');
    expect(html).toContain('class="made-row"');
  });

  it('greys its title and its word', () => {
    expect(css).toMatch(/\.made-quiet \.made-title, \.made-quiet \.made-state \{ color: var\(--text-faint\); \}/);
  });
});

describe('the three answers', () => {
  const html = draw();

  // THE MAIN ONE AT THE RIGHT-HAND EDGE (third correction): "don't you think
  // New Thread should logically be on the right?" Answers hung off a row's
  // right edge end on the one most people pick, it stands in one column down
  // the list, and the throwaway one is the furthest from it.
  it('are Dismiss, Do here and New thread, in that order, on each proposal', () => {
    expect(html.match(/>New thread</g)).toHaveLength(2);
    expect(html.match(/>Do here</g)).toHaveLength(2);
    expect(html.match(/>Dismiss</g)).toHaveLength(2);
    const first = html.slice(html.indexOf('made-acts'));
    expect(first.indexOf('>Dismiss<')).toBeLessThan(first.indexOf('>Do here<'));
    expect(first.indexOf('>Do here<')).toBeLessThan(first.indexOf('>New thread<'));
    const one = first.slice(0, first.indexOf('</div>'));
    expect(one.trim().endsWith('>New thread</button>')).toBe(true);
  });

  it('name the proposal each one is about', () => {
    expect(html).toContain('aria-label="Dismiss: Show the reset time in your own timezone"');
    expect(html).toContain('aria-label="Do in this thread: Show the reset time in your own timezone"');
  });

  it('draws Dismiss only where dropping is wired', () => {
    expect(draw({ onDismiss: undefined })).not.toContain('made-dismiss');
  });

  it('hands the press the id of the row it sits on', () => {
    const got = [];
    const el = ThreadsMade({ rows, onOpen: () => {}, onApprove: () => {}, onDismiss: (id) => got.push(id) });
    const find = (node) => {
      if (!node || typeof node !== 'object') return [];
      if (Array.isArray(node)) return node.flatMap(find);
      const here = node.props?.className === 'made-dismiss' ? [node] : [];
      return [...here, ...find(node.props?.children)];
    };
    find(el).forEach((b) => b.props.onClick());
    expect(got).toEqual(['w-2', 'w-3']);
  });

  it('nests no button inside another', () => {
    expect(html).not.toMatch(/<button[^>]*>(?:(?!<\/button>)[\s\S])*<button/);
  });
});

// ALWAYS THERE, NOT UNDER THE CURSOR (second correction). Shown only on hover,
// the proposal you were not pointing at looked broken: "Why is this proposal
// not showing the options... it should always show those options even if
// you're not hovering over it."
describe('the answers are always on every proposal, and nothing snaps', () => {
  it('never hides them or holds them back from a press', () => {
    expect(css).not.toMatch(/\.made-acts \{[^}]*opacity: 0/);
    expect(css).not.toMatch(/\.made-acts \{[^}]*pointer-events: none/);
    expect(css).not.toMatch(/:hover[^{]*\.made-acts \{/);
  });

  it('sits in the row beside the title, so a long title shortens instead of running under them', () => {
    expect(rule('.made-acts')).not.toMatch(/position: absolute/);
    expect(rule('.made-acts')).toMatch(/flex: none/);
    expect(rule('.made-title')).toMatch(/text-overflow: ellipsis/);
  });

  it('fades every colour the cursor changes', () => {
    const t = css.match(/\.made-row, \.made-open, \.made-title, \.made-state, \.made-acts button \{[^}]*\}/)?.[0] ?? '';
    for (const prop of ['background-color', 'color']) expect(t).toMatch(new RegExp(`${prop} \\.\\d+s`));
  });

  it('stands still for someone who has asked for less motion', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[^}]*transition: none/);
  });
});

describe('where Dismiss is wired', () => {
  const app = read('renderer/src/App.tsx');
  const focus = read('renderer/src/components/Focus.tsx');
  const thread = read('renderer/src/components/ItemThread.tsx');

  it('closes the proposal the way its own row would, with its undo, without leaving this thread', () => {
    expect(app).toMatch(/onDismissFiled=\{\(i\) => markDone\(i, \{ stay: true, force: true \}\)\}/);
  });

  it('reaches both places the list is drawn under a thread', () => {
    expect(focus).toMatch(/onDismiss=\{onDismissFiled && dismissFiled\}/);
    expect(focus).toMatch(/onDismissFiled=\{onDismissFiled && dismissFiled\}/);
    expect(thread).toMatch(/onDismiss=\{onDismissFiled\}/);
  });
});
