// A FOUND LINE OPENED THE THREAD AT THE BOTTOM.
//
// Pressing a line in the search results opened its thread or group on the newest
// message, so a status post from last week was somewhere above, unmarked. The
// page draws a thread a moment after it opens, so the landing waits for the
// message to be drawn, asks a windowed thread for the whole conversation if it is
// not there, and marks the line for a few seconds. This runs that with a fake page.
import { describe, it, expect, vi } from 'vitest';
import { revealLine, LINE_MARK, LINE_MISSING } from '../renderer/src/reveal-line';
import { markedWords } from '../renderer/src/found-inside';

function pageWith(drawnAfter) {
  let polls = 0;
  const marked = new Set();
  const el = {
    scrollIntoView: vi.fn(),
    classList: { add: (c) => marked.add(c), remove: (c) => marked.delete(c) },
  };
  const events = [];
  return {
    el, marked, events,
    doc: {
      querySelector: (selector) => {
        polls += 1;
        return selector === '[data-line="u7"]' && polls > drawnAfter ? el : null;
      },
    },
    announce: (name, uid) => events.push([name, uid]),
  };
}
// The looking again runs at once; the taking off of the mark waits.
const clock = () => { const waits = []; return { waits, later: (fn, ms) => { waits.push(ms); if (ms < 1000) fn(); return 0; }, clear: () => {} }; };

describe('landing on a found line', () => {
  it('scrolls to the line and marks it once it is drawn', () => {
    const page = pageWith(0);
    revealLine('u7', { doc: page.doc, announce: page.announce, ...clock() });
    expect(page.el.scrollIntoView).toHaveBeenCalledWith({ block: 'center' });
    expect(page.marked.has(LINE_MARK)).toBe(true);
  });

  it('waits for a thread that is drawn a moment later', () => {
    const page = pageWith(3);
    revealLine('u7', { doc: page.doc, announce: page.announce, ...clock() });
    expect(page.el.scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('asks for the whole conversation once when the line is not drawn, then keeps looking', () => {
    const page = pageWith(12);
    revealLine('u7', { doc: page.doc, announce: page.announce, ...clock() });
    expect(page.events.filter(([name]) => name === LINE_MISSING)).toEqual([[LINE_MISSING, 'u7']]);
    expect(page.el.scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('gives up quietly when the line never appears', () => {
    const page = pageWith(9999);
    const c = clock();
    revealLine('u7', { doc: page.doc, announce: page.announce, ...c });
    expect(page.el.scrollIntoView).not.toHaveBeenCalled();
    expect(c.waits.length).toBeLessThan(80);
  });

  it('finds a line whose id has quote marks in it', () => {
    const asked = [];
    revealLine('a"b', { doc: { querySelector: (s) => { asked.push(s); return null; } }, announce: () => {}, ...clock() });
    expect(asked[0]).toBe('[data-line="a\\"b"]');
  });
});

describe('the words of a found line in the page', () => {
  it('marks the typed words where they start a word, and not inside one', () => {
    expect(markedWords('Render account is live', 'render acc').filter((r) => r.hit).map((r) => r.text)).toEqual(['Render acc']);
    expect(markedWords('We redeployed the render box', 'deploy').some((r) => r.hit)).toBe(false);
    expect(markedWords('Deploy, then render', 'deploy render').filter((r) => r.hit).map((r) => r.text)).toEqual(['Deploy', 'render']);
  });
});
