// A PAGE BESIDE THE NOTES TAKES PINS AND SELECTED WORDS (w-d18e699928, 2026-11-06).
//
// What was reported: editing works well on most files, but an HTML page opened
// full screen lacked a way to point at specific things. Measured by reading the
// code: a page in a frame offered only a note on the whole page, because the
// app cannot read a selection inside the frame, and pages had lost their pins
// on 2026-11-02 when they moved from the big viewer into the pane.
//
// Now the page's own frame says which words are selected, and the page is
// drawn whole on a sheet so a pin stays on its spot as it scrolls. Pins are
// offered only once the page has said how tall it is.
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import { EventEmitter } from 'node:events';
import { notesCanPoint, pageForNotes, pageTextForNotes } from '../renderer/src/notes-sidebar.ts';
import { reportSelectedWords, wantsSelectedWords } from '../shared/frame-selected-words.mts';
import { reportDocumentHeight } from '../shared/frame-document-height.mts';
import { quietTheFramesScrollbars } from '../main/frame-scrollbars.mts';

const read = (p) => fs.readFileSync(new URL(`../renderer/src/${p}`, import.meta.url), 'utf8');

describe('what a note can point at', () => {
  it('on a page, selected words or a spot', () => {
    expect(notesCanPoint('options.html')).toEqual({ words: true, spots: true });
  });
  it('on a document or a text file, selected words', () => {
    expect(notesCanPoint('plan.md')).toEqual({ words: true, spots: false });
    expect(notesCanPoint('cart.mjs')).toEqual({ words: true, spots: false });
  });
  it('on a picture, a PDF, a film or a table, the whole file', () => {
    for (const f of ['shot.png', 'deck.pdf', 'launch.mp4', 'leads.csv']) expect(notesCanPoint(f), f).toEqual({ words: false, spots: false });
  });
});

// Measured in the browser copy: the full-screen frame loaded at 0 by 0, grew to
// its box, and the height script took that growth for its own and never spoke,
// so the page scrolled inside its frame and a pin stayed put while it moved.
describe('a page whose frame had no size when it loaded', () => {
  const page = (scrollHeight, innerHeight) => {
    let resize;
    const postMessage = vi.fn();
    const p = {
      innerHeight,
      document: { documentElement: { scrollHeight }, body: { scrollHeight } },
      parent: { postMessage },
      ResizeObserver: class { constructor(cb) { resize = cb; } observe() {} disconnect() {} },
      addEventListener: vi.fn(),
    };
    return { p, postMessage, resize: () => resize() };
  };
  it('reports its height once the frame is laid out', () => {
    const { p, postMessage, resize } = page(0, 0);
    reportDocumentHeight(p);
    expect(postMessage).not.toHaveBeenCalled();
    p.innerHeight = 875;
    p.document.documentElement.scrollHeight = 1098;
    resize();
    expect(postMessage).toHaveBeenLastCalledWith({ type: 'agentbox-document-height', height: 1098 }, '*');
  });
  it('still does not grow again because its frame grew to fit it', () => {
    const { p, postMessage, resize } = page(1098, 875);
    reportDocumentHeight(p);
    p.innerHeight = 1098;
    p.document.documentElement.scrollHeight = 1114;
    resize();
    expect(postMessage).toHaveBeenCalledTimes(1);
  });
});

describe('a page drawn from its text', () => {
  it('carries both asks, and a closing script tag inside them cannot end its script early', () => {
    const out = pageTextForNotes('<p>Hi</p>');
    expect(out.startsWith('<p>Hi</p>')).toBe(true);
    expect(out).toContain('agentbox-document-height');
    expect(out).toContain('agentbox-selected-words');
    expect(out.match(/<\/script>/gi)).toHaveLength(1);
  });
  it('is drawn whole in the pane only beside the notes', () => {
    const pane = read('components/DocPane.tsx');
    expect(pane).toContain('srcDoc={aside ? pageTextForNotes(text) : text}');
  });
  it('takes pins only once it is drawn whole', () => {
    expect(read('components/DocPane.tsx')).toContain("data-whole={height ? '' : undefined}");
    expect(read('components/NotesSidebar.tsx')).toContain('const pinsHere = points.spots && whole ? sheet : null;');
  });
});

describe('the page beside the notes', () => {
  it('asks the frame for its whole height and its selected words, keeping its own query and hash', () => {
    const u = new URL(pageForNotes('astral-doc://file/review.html?v=2#end'));
    expect(u.searchParams.get('v')).toBe('2');
    expect(u.searchParams.get('agentbox-height')).toBe('1');
    expect(u.searchParams.get('agentbox-notes')).toBe('1');
    expect(u.hash).toBe('#end');
  });
  it('is drawn whole, in a box that scrolls, only while the notes are open', () => {
    const pane = read('components/DocPane.tsx');
    expect(pane).toContain('aside ? pageForNotes(url) : url');
    expect(pane).toContain("className=\"doc-pin-sheet\"");
  });
  it('the app wires the sidebar off the same rule', () => {
    expect(read('App.tsx')).toContain('const notesHere = fullScreenDoc && !!focused && openDoc?.product === focused.product && !openDoc.readOnly && takesNotesSidebar(openDoc.src);');
  });
});

describe('the frame says which words are selected', () => {
  it('only a page of ours that asked', () => {
    expect(wantsSelectedWords('astral-doc://file/a.html?agentbox-notes=1')).toBe(true);
    expect(wantsSelectedWords('astral-doc://file/a.html?agentbox-height=1')).toBe(false);
    expect(wantsSelectedWords('https://example.com/a.html?agentbox-notes=1')).toBe(false);
    expect(wantsSelectedWords('not a url')).toBe(false);
  });

  it('the window hands the script only to a frame that asked', () => {
    const contents = new EventEmitter();
    contents.mainFrame = {};
    quietTheFramesScrollbars(contents);
    for (const asked of [false, true]) {
      const frame = Object.assign(new EventEmitter(), {
        url: `astral-doc://file/review.html?agentbox-height=1${asked ? '&agentbox-notes=1' : ''}`,
        executeJavaScript: vi.fn(async () => {}),
      });
      contents.emit('frame-created', {}, { frame });
      frame.emit('dom-ready');
      expect(frame.executeJavaScript.mock.calls.some(([s]) => s.includes('agentbox-selected-words')), String(asked)).toBe(asked);
    }
  });

  const fakePage = (selected) => {
    const on = {};
    const parent = { postMessage: vi.fn() };
    let words = selected;
    const sel = {
      get isCollapsed() { return !words.trim(); },
      get rangeCount() { return words ? 1 : 0; },
      toString: () => words,
      getRangeAt: () => ({ getClientRects: () => [{ top: 40, bottom: 58, left: 10, right: 90, width: 80 }], getBoundingClientRect: () => ({ top: 40, bottom: 80, left: 10, right: 200 }) }),
      removeAllRanges: vi.fn(() => { words = ''; }),
    };
    const page = {
      parent,
      getSelection: () => sel,
      requestAnimationFrame: (f) => { f(); return 1; },
      addEventListener: (type, f) => { on[type] = f; },
    };
    return { page, on, parent, sel, select: (w) => { words = w; } };
  };

  it('says the words and where they sit when the hand lets go', () => {
    const p = fakePage('Start free trial');
    reportSelectedWords(p.page);
    p.on.mouseup();
    expect(p.parent.postMessage).toHaveBeenLastCalledWith({
      type: 'agentbox-selected-words', words: 'Start free trial',
      first: { top: 40, bottom: 58, left: 10, right: 90 }, all: { top: 40, bottom: 80, left: 10, right: 200 },
    }, '*');
  });

  it('says nothing is selected when a click starts or the selection empties', () => {
    const p = fakePage('Start');
    reportSelectedWords(p.page);
    p.on.mousedown();
    expect(p.parent.postMessage).toHaveBeenLastCalledWith({ type: 'agentbox-selected-words', words: '' }, '*');
    p.select('   ');
    p.on.keyup();
    expect(p.parent.postMessage).toHaveBeenLastCalledWith({ type: 'agentbox-selected-words', words: '' }, '*');
  });

  it('clears its selection when the app asks, and only the app', () => {
    const p = fakePage('Start');
    reportSelectedWords(p.page);
    p.on.message({ source: {}, data: { type: 'agentbox-clear-selection' } });
    expect(p.sel.removeAllRanges).not.toHaveBeenCalled();
    p.on.message({ source: p.parent, data: { type: 'something-else' } });
    expect(p.sel.removeAllRanges).not.toHaveBeenCalled();
    p.on.message({ source: p.parent, data: { type: 'agentbox-clear-selection' } });
    expect(p.sel.removeAllRanges).toHaveBeenCalled();
  });
});

describe('the sidebar', () => {
  const side = read('components/NotesSidebar.tsx');
  it('hears the words only from the page in its own card', () => {
    expect(read('components/SelectionBar.tsx')).toMatch(/e\.source !== frame\.contentWindow/);
    expect(side).toContain('<FrameWordsBar frame={frame}');
  });
  it('writes a spot as a pin and words as a quote', () => {
    expect(side).toContain("spot ? { kind: 'pin', x: spot.x, y: spot.y } : quote ? { kind: 'quote', ...quote } : { kind: 'whole' }");
  });
});
