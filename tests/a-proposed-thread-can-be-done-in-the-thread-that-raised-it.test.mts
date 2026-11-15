// A PROPOSED THREAD CAN BE DONE IN THE THREAD THAT RAISED IT (w-554834e749).
//
// Said 2026-10-13: "I want to be able to do more than just reject or offer
// subthreads, because that's more like, 'Okay the work will never get done.'
// ... What I do really want to do is have the agent not make that a different
// thread and just do it in our thread. Functionally right now the options are
// just approve and, very subtly, no."
//
// Measured on the list as shipped (d48ee45, 3b395be): a thread an agent filed
// under another carried exactly two presses, Approve (a new session on a new
// thread) and a No drawn only under the cursor (the ordinary close, so the work
// is dropped). Neither one is "yes, but here". An earlier session on the same
// complaint (w-31b2eb82ba) named it "Do it here" and left it unbuilt.
//
// The press sends the proposal back to the thread that filed it, as a message
// that thread's agent acts on, and closes the proposed thread. Same reply path
// as anything typed in the box, so it reaches an agent that is idle, running
// or already finished.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { doItHereWords, doItHereWrites, DO_IT_HERE_BODY } from '../renderer/src/threads-made.ts';
import { ThreadsMade } from '../renderer/src/components/ThreadsMade.tsx';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const kid = (over = {}) => ({
  id: 'w-kid', product: 'p', parent: 'w-mum', status: 'open', kind: 'task', labels: [],
  title: 'Fix the meter on the usage page', body: 'The meter reads 0% after a reset. Read it from the limit, not the cache.',
  ...over,
});
const mum = (over = {}) => ({ id: 'w-mum', product: 'p', status: 'open', ...over });

describe('the message the thread that raised it receives', () => {
  it('names the proposal and says to do it here, not as its own thread', () => {
    const words = doItHereWords(kid());
    expect(words).toContain('Fix the meter on the usage page');
    expect(words).toMatch(/in this thread/);
    expect(words).toMatch(/not as (a thread of its own|its own thread)/);
  });

  it('carries what the proposal said, so a fresh session has the whole job', () => {
    expect(doItHereWords(kid())).toContain('Read it from the limit, not the cache.');
  });

  it('is only the title when the proposal had no body', () => {
    const words = doItHereWords(kid({ body: undefined }));
    expect(words).toContain('Fix the meter on the usage page');
    expect(words).not.toContain('undefined');
  });

  it('does not repeat the title when the body opens with it', () => {
    const words = doItHereWords(kid({ body: 'Fix the meter on the usage page\n\nIt reads 0%.' }));
    expect(words.split('Fix the meter on the usage page')).toHaveLength(2);
    expect(words).toContain('It reads 0%.');
  });

  // The boundary either side of the cap, and a pointer to the rest past it.
  it('keeps a body up to the cap whole', () => {
    const body = 'a'.repeat(DO_IT_HERE_BODY);
    expect(doItHereWords(kid({ body }))).toContain(body);
  });

  it('cuts a longer body and says where the rest is', () => {
    const body = 'a'.repeat(DO_IT_HERE_BODY + 1);
    const words = doItHereWords(kid({ body }));
    expect(words).not.toContain(body);
    expect(words).toContain('w-kid');
  });
});

describe('what the press writes', () => {
  it('sends the message to the parent and closes the proposal, parent first', () => {
    const w = doItHereWrites(kid(), mum());
    expect(w).toHaveLength(2);
    expect(w[0]).toMatchObject({ product: 'p', id: 'w-mum' });
    expect(w[0].answer).toBe(doItHereWords(kid()));
    expect(w[1]).toEqual({ product: 'p', id: 'w-kid', status: 'done' });
  });

  it('wakes a parent that had finished or stopped, so the work is picked up', () => {
    expect(doItHereWrites(kid(), mum({ status: 'done' }))[0].status).toBe('open');
    expect(doItHereWrites(kid(), mum({ status: 'blocked' }))[0].status).toBe('open');
  });

  it('leaves a running parent as it is, which reads the message mid-run', () => {
    expect(doItHereWrites(kid(), mum({ status: 'claimed' }))[0].status).toBeUndefined();
    expect(doItHereWrites(kid(), mum({ status: 'open' }))[0].status).toBeUndefined();
  });

  it('writes nothing when the parent is not the thread that raised it', () => {
    expect(doItHereWrites(kid(), mum({ id: 'w-other' }))).toBeNull();
    expect(doItHereWrites(kid({ parent: undefined }), mum())).toBeNull();
    expect(doItHereWrites(kid(), mum({ product: 'q' }))).toBeNull();
    expect(doItHereWrites(kid(), null)).toBeNull();
  });
});

describe('the press, drawn in the list', () => {
  const rows = [
    { id: 'w-a', title: 'Say why Send is off', state: 'waiting', approve: true },
    { id: 'w-b', title: 'Keep a pasted command exactly as typed', state: 'running' },
  ];
  const draw = (props) => renderToStaticMarkup(React.createElement(ThreadsMade, { rows, onOpen: () => {}, ...props }));
  const html = draw({ onApprove: () => {}, onReject: () => {}, onHere: () => {} });

  // THE QUIET LIST (w-fcb5fdc2e5) replaced the two boxed presses: NEW THREAD,
  // DO HERE, DISMISS as words under the cursor, the first in the accent. The
  // accessible name still says what DO HERE does in full.
  it('is one press per waiting thread and none on the rest', () => {
    expect(html.match(/class="made-here"/g)).toHaveLength(1);
    expect(html).toContain('>Do here<');
  });

  it('names the thread it would fold in', () => {
    expect(html).toContain('aria-label="Do in this thread: Say why Send is off"');
  });

  it('comes first, with New thread after it at the edge', () => {
    expect(html.match(/class="made-approve"/g)).toHaveLength(1);
    expect(html.indexOf('made-here')).toBeLessThan(html.indexOf('made-approve'));
  });

  it('is the grey one, and the accent stays on New thread', () => {
    const css = read('renderer/src/components/threads-made.css');
    const here = css.match(/\.made-here \{[^}]*\}/)[0];
    const start = css.match(/\.made-approve \{[^}]*\}/)[0];
    expect(here).not.toContain('--accent');
    expect(here).toMatch(/color: var\(--text-dim\)/);
    expect(start).toMatch(/color: var\(--accent\)/);
    // Words, not a solid block: "the orange backgrounds are a little bit too
    // bright".
    expect(css).toMatch(/\.made-acts button \{[^}]*background: none/);
  });

  it('draws none where it is not wired, which is every other list', () => {
    expect(draw({ onApprove: () => {} })).not.toContain('made-here');
  });

  it('draws none on a list with nothing to approve', () => {
    expect(draw({ rows: rows.map(({ approve, ...r }) => r), onApprove: () => {}, onHere: () => {} })).not.toContain('made-here');
  });

  it('nests no button inside another', () => {
    expect(html).not.toMatch(/<button[^>]*>(?:(?!<\/button>)[\s\S])*<button/);
  });
});

describe('where the press is wired', () => {
  const app = read('renderer/src/App.tsx');
  const focus = read('renderer/src/components/Focus.tsx');
  const thread = read('renderer/src/components/ItemThread.tsx');

  it('folds the child into the thread you are reading, without leaving it', () => {
    expect(app).toMatch(/onHereFiled=\{\(i\) => doItHere\(i\)\}/);
    expect(app).toMatch(/doItHereWrites\(/);
  });

  it('reaches both places the list is drawn', () => {
    expect(focus).toMatch(/onHere=\{onHereFiled && hereFiled\}/);
    expect(thread).toMatch(/onHere=\{onHereFiled\}/);
  });
});
