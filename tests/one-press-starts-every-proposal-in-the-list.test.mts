// ONE PRESS STARTS EVERY PROPOSAL IN THE LIST (w-fe64f35bdd).
//
// What broke: a thread that filed nine proposals took nine presses of NEW
// THREAD to start them, one row at a time. "It would be nice if there was a
// way to approve all or approve in bulk because I have to click manually for
// all these and it's a bit annoying." Measured on the shipped list drawn in the
// built app with nine proposals: nine separate presses, and no other way.
//
// Picked off six placements drawn in the real app: DISMISS ALL and START ALL
// on the count line, over the column the rows' own answers stand in, with no
// new orange. One press writes every approval, and one Z takes back the lot.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ThreadsMade, START_ALL, DISMISS_ALL } from '../renderer/src/components/ThreadsMade.tsx';
import { answerAllWrites, RUN_IT } from '../renderer/src/threads-made.ts';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const css = read('renderer/src/components/threads-made.css');
const rule = (sel) => {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return css.match(new RegExp(`(?:^|\\n)${esc} \\{[^}]*\\}`))?.[0] ?? '';
};

const proposals = (n) => Array.from({ length: n }, (_, i) => ({ id: `w-${i}`, title: `Proposal ${i}`, state: 'scheduled', approve: true }));
const running = { id: 'w-run', title: 'Already under way', state: 'running' };
const props = (rows, extra = {}) => ({
  rows, label: 'Filed from this thread', onOpen: () => {}, onApprove: () => {}, onHere: () => {}, onDismiss: () => {},
  onStartAll: () => {}, onDismissAll: () => {}, ...extra,
});
const draw = (rows, extra) => renderToStaticMarkup(React.createElement(ThreadsMade, props(rows, extra)));
const countLine = (html) => html.slice(html.indexOf('class="made-label"'), html.indexOf('class="made-list"'));

// The elements ThreadsMade returns, walked without a DOM, so a press can be made.
const find = (node, cls) => {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap((n) => find(n, cls));
  const here = String(node.props?.className ?? '').split(' ').includes(cls) ? [node] : [];
  return [...here, ...find(node.props?.children, cls)];
};

describe('the count line answers for every proposal in the list', () => {
  const html = draw([running, ...proposals(9)]);
  const line = countLine(html);

  it('carries Dismiss all and Start all, Start all last, beside the count', () => {
    expect(line).toContain('>9 proposals waiting on you<');
    expect(line.indexOf(`>${DISMISS_ALL}<`)).toBeGreaterThan(-1);
    expect(line.indexOf(`>${DISMISS_ALL}<`)).toBeLessThan(line.indexOf(`>${START_ALL}<`));
    expect(START_ALL).toBe('Start all');
    expect(DISMISS_ALL).toBe('Dismiss all');
  });

  it('names how many each press is about, for a screen reader and a hovering cursor', () => {
    expect(line).toContain('aria-label="Start all 9 as new threads"');
    expect(line).toContain('aria-label="Dismiss all 9"');
  });

  it('leaves every row its own three answers', () => {
    expect(html.match(/>New thread</g)).toHaveLength(9);
    expect(html.match(/>Dismiss</g)).toHaveLength(9);
  });

  it('nests no button inside another', () => {
    expect(html).not.toMatch(/<button[^>]*>(?:(?!<\/button>)[\s\S])*<button/);
  });
});

describe('what each press hands on', () => {
  const rows = [running, ...proposals(3)];

  it('Start all hands every proposal in this list, in the order drawn, and not the row already under way', () => {
    const got = [];
    const el = ThreadsMade(props(rows, { onStartAll: (ids) => got.push(ids) }));
    find(el, 'made-all-start').forEach((b) => b.props.onClick());
    expect(got).toEqual([['w-0', 'w-1', 'w-2']]);
  });

  it('Dismiss all does the same for dropping them', () => {
    const got = [];
    const el = ThreadsMade(props(rows, { onDismissAll: (ids) => got.push(ids) }));
    find(el, 'made-all-dismiss').forEach((b) => b.props.onClick());
    expect(got).toEqual([['w-0', 'w-1', 'w-2']]);
  });
});

describe('when the count line carries them', () => {
  it('does with two proposals, the fewest that make an "all"', () => {
    expect(countLine(draw(proposals(2)))).toContain(`>${START_ALL}<`);
  });

  it('does not with one, where Start all would be its own New thread twice', () => {
    const html = draw([running, ...proposals(1)]);
    expect(html).not.toContain(`>${START_ALL}<`);
    expect(html).not.toContain(`>${DISMISS_ALL}<`);
    expect(html).toContain('>1 proposal waiting on you<');
  });

  it('does not when nothing in the list waits on you', () => {
    const html = draw([running, { ...running, id: 'w-run2' }]);
    expect(html).not.toContain(`>${START_ALL}<`);
    expect(html).toContain('>Filed from this thread<');
  });

  it('does not where the list cannot answer a single row', () => {
    expect(draw(proposals(3), { onApprove: undefined })).not.toContain(`>${START_ALL}<`);
  });

  it('does not where Start all is not wired, and draws Dismiss all only where it is', () => {
    expect(draw(proposals(3), { onStartAll: undefined })).not.toContain(`>${DISMISS_ALL}<`);
    const start = draw(proposals(3), { onDismissAll: undefined });
    expect(start).toContain(`>${START_ALL}<`);
    expect(start).not.toContain(`>${DISMISS_ALL}<`);
  });
});

describe('how the count line looks', () => {
  it('wears no orange: NEW THREAD stays the only orange word in the list', () => {
    expect(rule('.made-all-start')).toMatch(/color: var\(--text-dim\)/);
    expect(rule('.made-all-dismiss')).toMatch(/color: var\(--text-faint\)/);
    for (const sel of ['.made-all', '.made-all-start', '.made-all-dismiss']) expect(rule(sel)).not.toContain('--accent');
  });

  it('wears the same mono capitals as the rows, since the presses are the same kind of thing', () => {
    const html = draw(proposals(2));
    expect(countLine(html)).toContain('class="made-acts made-all"');
  });

  it('ends at the right-hand edge the rows end at, the 10px row padding plus the list border', () => {
    expect(rule('.made-label')).toMatch(/display: flex/);
    expect(rule('.made-label')).toMatch(/padding-right: 11px/);
    expect(rule('.made-all')).toMatch(/margin: -6px -2px -6px auto/);
  });
});

describe('the writes behind them', () => {
  const kids = [{ product: 'p', id: 'w-1' }, { product: 'p', id: 'w-2' }];

  it('Start all writes the approval New thread writes, once per proposal', () => {
    expect(answerAllWrites(kids, 'start').writes).toEqual([
      { product: 'p', id: 'w-1', answer: RUN_IT },
      { product: 'p', id: 'w-2', answer: RUN_IT },
    ]);
    expect(RUN_IT).toBe('Approved. Run it.');
  });

  it('and its undo withdraws each approval and reopens each one, which is what a single undo does', () => {
    expect(answerAllWrites(kids, 'start').undo).toEqual([
      { product: 'p', id: 'w-1', answer: '(withdrawn)', status: 'open' },
      { product: 'p', id: 'w-2', answer: '(withdrawn)', status: 'open' },
    ]);
  });

  it('Dismiss all closes each one, and its undo reopens them', () => {
    const { writes, undo } = answerAllWrites(kids, 'dismiss');
    expect(writes).toEqual([{ product: 'p', id: 'w-1', status: 'done' }, { product: 'p', id: 'w-2', status: 'done' }]);
    expect(undo).toEqual([{ product: 'p', id: 'w-1', status: 'open' }, { product: 'p', id: 'w-2', status: 'open' }]);
  });

  it('writes nothing for an empty list', () => {
    expect(answerAllWrites([], 'start')).toEqual({ writes: [], undo: [] });
  });
});

describe('where it is wired', () => {
  const app = read('renderer/src/App.tsx');
  const focus = read('renderer/src/components/Focus.tsx');
  const thread = read('renderer/src/components/ItemThread.tsx');
  const body = app.slice(app.indexOf('const answerAllFiled = useCallback'), app.indexOf('const answerAllFiled = useCallback') + 2500);

  it('a single New thread and Start all write the same approval', () => {
    expect(app).toMatch(/approveWith\(RUN_IT, /);
  });

  it('reaches the thread from the app for both presses, without leaving the thread', () => {
    expect(app).toMatch(/onStartAllFiled=\{\(kids\) => answerAllFiled\(kids, 'start'\)\}/);
    expect(app).toMatch(/onDismissAllFiled=\{\(kids\) => answerAllFiled\(kids, 'dismiss'\)\}/);
  });

  it('reaches both places the list is drawn under a thread', () => {
    expect(focus).toMatch(/onStartAll=\{onStartAllFiled && startAllFiled\}/);
    expect(focus).toMatch(/onStartAllFiled=\{onStartAllFiled && startAllFiled\}/);
    expect(focus).toMatch(/onDismissAll=\{onDismissAllFiled && dismissAllFiled\}/);
    expect(thread).toMatch(/onStartAll=\{onStartAllFiled\}/);
    expect(thread).toMatch(/onDismissAll=\{onDismissAllFiled\}/);
  });

  it('pushes one undo for the lot, so one Z takes all of them back', () => {
    expect(body).toMatch(/answerAllWrites\(kids, act\)/);
    expect(body.match(/pushUndo\(/g)).toHaveLength(1);
  });

  it('stops whatever an approval already started when Z takes Start all back', () => {
    expect(body).toMatch(/stopSession/);
  });
});
