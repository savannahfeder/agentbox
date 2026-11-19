// ⌘⌥M COMMENTS ON THE WORDS YOU SELECTED.
//
// Asked for: "whenever I highlight text I feel like I really want to have a
// shortcut to make a comment." Measured in the code: the bar over selected
// words answered only a click on Comment; no key anywhere started one. A plain
// letter cannot be it, because the document in the request is one you type
// into, so C would type over the words. ⌘⌥M is Google Docs' and Word's key for
// a comment, and nothing in Agentbox used it. Ctrl+Alt+M where there is no ⌘.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { isCommentChord, COMMENT_CHORD } from '../renderer/src/selection-bar.ts';
import { reportSelectedWords } from '../shared/frame-selected-words.mts';
import { SHORTCUTS } from '../shared/shortcuts.mts';

const press = (over: Record<string, unknown>) => ({ code: 'KeyM', key: 'µ', metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...over });

describe('which presses comment', () => {
  it('⌘⌥M on a Mac, whatever letter Option makes of M', () => {
    expect(isCommentChord(press({ metaKey: true, altKey: true }), true)).toBe(true);
    expect(isCommentChord(press({ metaKey: true, altKey: true, key: 'm' }), true)).toBe(true);
  });
  it('Ctrl+Alt+M on Linux and Windows', () => {
    expect(isCommentChord(press({ ctrlKey: true, altKey: true, key: 'm' }), false)).toBe(true);
  });
  it('not ⌘M, which is the Mac minimising the window', () => {
    expect(isCommentChord(press({ metaKey: true, key: 'm' }), true)).toBe(false);
  });
  it('not ⌥M alone, which types a letter', () => {
    expect(isCommentChord(press({ altKey: true }), true)).toBe(false);
  });
  it('not M typed into the document', () => {
    expect(isCommentChord(press({ key: 'm' }), true)).toBe(false);
  });
  it('not with Shift or Control added, which are other chords', () => {
    expect(isCommentChord(press({ metaKey: true, altKey: true, shiftKey: true }), true)).toBe(false);
    expect(isCommentChord(press({ metaKey: true, altKey: true, ctrlKey: true }), true)).toBe(false);
  });
  it('not ⌘⌥ with another letter', () => {
    expect(isCommentChord(press({ metaKey: true, altKey: true, code: 'KeyN', key: '˜' }), true)).toBe(false);
  });
  it('not Ctrl+Alt+M on a Mac, nor ⌘⌥M where Ctrl is the key', () => {
    expect(isCommentChord(press({ ctrlKey: true, altKey: true }), true)).toBe(false);
    expect(isCommentChord(press({ metaKey: true, altKey: true }), false)).toBe(false);
  });
});

describe('the bar answers it', () => {
  const bar = fs.readFileSync(new URL('../renderer/src/components/SelectionBar.tsx', import.meta.url), 'utf8');
  it('in documents and text boxes, before the editor can keep the press', () => {
    expect(bar).toContain("window.addEventListener('keydown', key, true)");
    expect(bar).toContain('if (!isCommentChord(e, MAC)) return;');
  });
  it('and draws the chord on Comment, where it is learnt', () => {
    expect(bar.match(/<kbd>\{chord\(COMMENT_CHORD\)\}<\/kbd>/g)?.length).toBe(2);
  });
  it('is listed on the shortcuts page', () => {
    const row = SHORTCUTS.flatMap((g) => g.keys).find((k) => k.keys.includes(COMMENT_CHORD));
    expect(row?.what).toBe('Comment on the words you selected.');
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
  it('⌘⌥M goes up to the app and does nothing in the page', () => {
    const p = page();
    expect(p.key(press({ metaKey: true, altKey: true }))).toBe(true);
    expect(p.sent).toContainEqual({ type: 'agentbox-comment-key', code: 'KeyM', key: 'µ', metaKey: true, ctrlKey: false, altKey: true, shiftKey: false });
  });
  it('typing in the page stays in the page', () => {
    const p = page();
    expect(p.key(press({ key: 'm' }))).toBe(false);
    expect(p.key(press({ metaKey: true, key: 'm' }))).toBe(false);
    expect(p.sent).toEqual([]);
  });
  it('the app hears it only from its own frame, and checks it is the chord', () => {
    expect(bar()).toContain("e.data?.type === 'agentbox-comment-key' && isCommentChord(e.data, MAC)");
  });
});

function bar() { return fs.readFileSync(new URL('../renderer/src/components/SelectionBar.tsx', import.meta.url), 'utf8'); }
