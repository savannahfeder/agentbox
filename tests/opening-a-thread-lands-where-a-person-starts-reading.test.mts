// OPENING A THREAD LANDS WHERE A PERSON STARTS READING.
//
// Audit 02-thread-open-doc.png and 05-thread-picture-video-inline.png: a thread
// opened at the true bottom of its box, so a long answer or a document under it
// was entered at its last line, with a picture cut off above. Measured by
// holdAtBottom: scrollTop = scrollHeight - clientHeight on every open. Now a last
// message that fits still lands at the end, and a longer one lands on its first
// line.
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { holdAtBottom, landingTop, RESUME_WINDOW_MS } from '../renderer/src/thread-bottom.ts';

const read = (f) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');

function box({ scrollHeight, clientHeight = 800, lastAt }) {
  const on = new Map();
  const el = {
    scrollTop: 0, scrollHeight, clientHeight, clientWidth: 900, firstElementChild: null, lastAt,
    getBoundingClientRect: () => ({ top: 100 }),
    addEventListener: (type, fn) => on.set(type, fn),
    removeEventListener: (type) => on.delete(type),
    fire: (type) => on.get(type)?.(),
    message: { getBoundingClientRect: () => ({ top: 100 + el.lastAt - el.scrollTop }) },
  };
  return el;
}
const hold = (el, now = () => 0) => holdAtBottom(el, { readFrom: () => el.message, now });

describe('the arithmetic', () => {
  it('stops a little above the first line', () => expect(landingTop(3000, 5000)).toBe(2980));
  it('stays at the end when the message and all under it fit', () => expect(landingTop(4900, 4200)).toBe(4200));
  it('never goes above the page', () => expect(landingTop(5, 400)).toBe(0));
});

describe('a thread opening', () => {
  it('lands on the first line of a last message taller than the window', () => {
    const el = box({ scrollHeight: 5000, lastAt: 2000 });
    hold(el);
    expect(el.scrollTop).toBe(1980);
  });
  it('lands at the end when the last message fits', () => {
    const el = box({ scrollHeight: 5000, lastAt: 4500 });
    hold(el);
    expect(el.scrollTop).toBe(4200);
  });
  it('lands at the end when nothing has been read yet', () => {
    const el = box({ scrollHeight: 5000, lastAt: 0 });
    el.message = null;
    hold(el);
    expect(el.scrollTop).toBe(4200);
  });
  it('holds on it while pictures above push it down', () => {
    const el = box({ scrollHeight: 5000, lastAt: 2000 });
    hold(el);
    el.scrollHeight = 6000; el.lastAt = 3000;
    el.fire('load');
    expect(el.scrollTop).toBe(2980);
  });
  it('lets go the moment she touches the page', () => {
    const el = box({ scrollHeight: 5000, lastAt: 2000 });
    hold(el);
    el.fire('wheel');
    el.scrollHeight = 6000; el.lastAt = 3000;
    el.fire('load');
    expect(el.scrollTop).toBe(1980);
  });
  it('stops chasing once the page has had its time to settle', () => {
    const now = vi.fn(() => 0);
    const el = box({ scrollHeight: 5000, lastAt: 2000 });
    hold(el, now);
    now.mockReturnValue(RESUME_WINDOW_MS + 1);
    el.scrollHeight = 6000; el.lastAt = 3000;
    el.fire('load');
    expect(el.scrollTop).toBe(1980);
  });
  it('still sticks to the end once it landed there', () => {
    const now = vi.fn(() => 0);
    const el = box({ scrollHeight: 5000, lastAt: 4500 });
    hold(el, now);
    now.mockReturnValue(RESUME_WINDOW_MS + 1);
    el.scrollHeight = 5300;
    el.fire('load');
    expect(el.scrollTop).toBe(4500);
  });
  it('a chat stays at its newest line', () => {
    expect(read('renderer/src/components/Thread.tsx')).toMatch(/chat \|\| !box \? \{\} : \{ readFrom/);
  });
});
