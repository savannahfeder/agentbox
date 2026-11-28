// ⌘/ COMMENTS ON THE WORDS YOU SELECTED.
//
// Asked for: "whenever I highlight text I feel like I really want to have a
// shortcut to make a comment." Measured in the code: the bar over selected
// words answered only a click on Comment; no key anywhere started one.
// A first try at ⌘⌥M was turned down as three keys, too many; the ask is two
// at most, and never a lone letter, since a letter typed over a selection
// replaces it. ⌘/ is the comment key in every code editor and nothing in
// Agentbox used it. Ctrl+/ where there is no ⌘.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { isCommentChord, COMMENT_CHORD } from '../renderer/src/selection-bar.ts';
import { reportSelectedWords } from '../shared/frame-selected-words.mts';
import { SHORTCUTS } from '../shared/shortcuts.mts';
import { HINTS, placeHint } from '../renderer/src/hint-plate.ts';

const press = (over: Record<string, unknown>) => ({ code: 'Slash', key: '/', metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...over });
const bar = () => fs.readFileSync(new URL('../renderer/src/components/SelectionBar.tsx', import.meta.url), 'utf8');

describe('which presses comment', () => {
  it('is two keys', () => {
    expect(COMMENT_CHORD).toBe('⌘/');
  });
  it('⌘/ on a Mac', () => {
    expect(isCommentChord(press({ metaKey: true }), true)).toBe(true);
  });
  it('Ctrl+/ on Linux and Windows', () => {
    expect(isCommentChord(press({ ctrlKey: true }), false)).toBe(true);
  });
  it('a keyboard whose / needs Shift still makes / with ⌘', () => {
    expect(isCommentChord(press({ metaKey: true, shiftKey: true, code: 'Digit7' }), true)).toBe(true);
  });
  it('not / typed into the document', () => {
    expect(isCommentChord(press({}), true)).toBe(false);
  });
  it('not ⌘? or ⌘⌥/, which are other chords', () => {
    expect(isCommentChord(press({ metaKey: true, shiftKey: true, key: '?' }), true)).toBe(false);
    expect(isCommentChord(press({ metaKey: true, altKey: true, key: '÷' }), true)).toBe(false);
  });
  it('not ⌘ with another key', () => {
    expect(isCommentChord(press({ metaKey: true, code: 'Period', key: '.' }), true)).toBe(false);
  });
  it('not Ctrl+/ on a Mac, nor ⌘/ where Ctrl is the key', () => {
    expect(isCommentChord(press({ ctrlKey: true }), true)).toBe(false);
    expect(isCommentChord(press({ metaKey: true }), false)).toBe(false);
  });
});

describe('the bar answers it', () => {
  it('in documents and text boxes, before the editor can keep the press', () => {
    expect(bar()).toContain("window.addEventListener('keydown', key, true)");
    expect(bar()).toContain('if (!isCommentChord(e, MAC)) return;');
  });
  // A hover plate was forgotten, so since 2026-11-28 the key is on the button
  // (tests/the-comment-and-copy-keys-show-on-the-bar).
  it('says it on the button itself, not on a hover plate', () => {
    expect(bar().match(/\{chord\(COMMENT_CHORD\)\}/g)?.length).toBe(2);
    expect(HINTS.comment).toBeUndefined();
  });
  it('is listed on the shortcuts page', () => {
    const row = SHORTCUTS.flatMap((g) => g.keys).find((k) => k.keys.includes(COMMENT_CHORD));
    expect(row?.what).toBe('Comment on the words you selected.');
  });
});

// Measured in the real file view: hung under the bar, the plate covered the selected words, which showed through it.
describe('the plate keeps off the words you selected', () => {
  const screen = { width: 1440, height: 900 };
  const plate = { width: 230, height: 36 };
  const bar = { top: 430, bottom: 460, left: 500, right: 640, width: 140, height: 30 };
  it('rises above a control that asks for it', () => {
    const at = placeHint(bar, plate, screen, 'left', undefined, 0, 'above');
    expect(at?.rose).toBe(true);
    expect(at!.top + plate.height).toBeLessThanOrEqual(bar.top);
  });
  it('hangs under when there is no room above', () => {
    const high = { ...bar, top: 20, bottom: 50 };
    expect(placeHint(high, plate, screen, 'left', undefined, 0, 'above')?.rose).toBe(false);
  });
  it('every other control still hangs under', () => {
    expect(placeHint(bar, plate, screen)?.rose).toBe(false);
  });
  it('a control asks for above with data-hint-side', () => {
    expect(fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8')).toContain("shownHint.el.dataset.hintSide === 'above' ? 'above' : 'below'");
  });
});

describe('a web page hands the chord up, since it keeps the keyboard', () => {
  const page = () => {
    const sent: unknown[] = [];
    const on: Record<string, (e: never) => void> = {};
    reportSelectedWords({
      parent: { postMessage: (m) => sent.push(m) },
      getSelection: () => null,
      requestAnimationFrame: () => 0,
      addEventListener: (type, fn) => { on[type] = fn as (e: never) => void; },
    });
    return { sent, key: (e: Record<string, unknown>) => { let stopped = false; on.keydown({ ...e, preventDefault: () => { stopped = true; } } as never); return stopped; } };
  };
  it('⌘/ goes up to the app and does nothing in the page', () => {
    const p = page();
    expect(p.key(press({ metaKey: true }))).toBe(true);
    expect(p.sent).toContainEqual({ type: 'agentbox-comment-key', code: 'Slash', key: '/', metaKey: true, ctrlKey: false, altKey: false, shiftKey: false });
  });
  it('typing in the page stays in the page', () => {
    const p = page();
    expect(p.key(press({}))).toBe(false);
    expect(p.key(press({ metaKey: true, code: 'KeyM', key: 'm' }))).toBe(false);
    expect(p.sent).toEqual([]);
  });
  it('the app hears it only from its own frame, and checks it is the chord', () => {
    expect(bar()).toContain("e.data?.type === 'agentbox-comment-key' && isCommentChord(e.data, MAC)");
  });
});
