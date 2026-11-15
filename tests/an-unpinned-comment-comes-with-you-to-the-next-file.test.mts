// AN UNPINNED COMMENT COMES WITH YOU TO THE NEXT FILE; A PINNED ONE STAYS PUT.
//
// Someone reading through a thread's pictures writes notes in the comment box
// as they go. Stepping to the next picture emptied the box, because the unsent
// comment was kept under the file version it was typed on
// (an-unsent-comment-on-a-file-waits-for-you), so their notes stayed behind on
// the last picture.
//
// Now words with no pin are kept once per thread (or Files, or group) and show
// on whichever file is open. Placing a pin, a region or a quote ties them to
// that file, where they wait as before. Measured on a fake localStorage below,
// and on ArtifactView's text for the wiring.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { openCommentDraft, keepCommentDraft, readCommentDraft, saveCommentDraft } from '../renderer/src/comment-drafts';

function fakeStore() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    size: () => map.size,
  };
}

const A = { product: 'p', thread: 'w-1', file: 'a.png@1', across: 'p:w-1' };
const B = { product: 'p', thread: 'w-1', file: 'b.png@1', across: 'p:w-1' };
const ELSEWHERE = { product: 'p', thread: 'w-2', file: 'c.png@1', across: 'p:w-2' };
const PIN = { kind: 'pin', x: 0.3, y: 0.6 };

describe('a comment with no pin', () => {
  it('shows on the next file you open in the same thread', () => {
    const s = fakeStore();
    let holding = openCommentDraft(A, s).holding;
    holding = keepCommentDraft(A, { words: 'logo too small; ', place: null }, holding, s);
    expect(holding).toBe('loose');
    expect(openCommentDraft(B, s)).toEqual({ words: 'logo too small; ', place: null, holding: 'loose' });
  });

  it('keeps growing as you type on the next file, and is there back on the first', () => {
    const s = fakeStore();
    keepCommentDraft(A, { words: 'on a; ', place: null }, openCommentDraft(A, s).holding, s);
    keepCommentDraft(B, { words: 'on a; on b', place: null }, openCommentDraft(B, s).holding, s);
    expect(openCommentDraft(A, s).words).toBe('on a; on b');
  });

  it('does not follow you into another thread', () => {
    const s = fakeStore();
    keepCommentDraft(A, { words: 'notes', place: null }, 'loose', s);
    expect(openCommentDraft(ELSEWHERE, s)).toEqual({ words: '', place: null, holding: 'loose' });
  });

  it('is forgotten once it is sent or emptied', () => {
    const s = fakeStore();
    keepCommentDraft(A, { words: 'x', place: null }, 'loose', s);
    keepCommentDraft(B, { words: '', place: null }, 'loose', s);
    expect(s.size()).toBe(0);
  });
});

describe('a comment with a pin', () => {
  it('stays on the file it was pinned on, and the next file starts empty', () => {
    const s = fakeStore();
    let holding = keepCommentDraft(A, { words: 'here', place: null }, 'loose', s);
    holding = keepCommentDraft(A, { words: 'here', place: PIN }, holding, s);
    expect(holding).toBe('file');
    expect(openCommentDraft(A, s)).toEqual({ words: 'here', place: PIN, holding: 'file' });
    expect(openCommentDraft(B, s)).toEqual({ words: '', place: null, holding: 'loose' });
  });

  it('hides the notes you carried while it is open, and loses none of them', () => {
    const s = fakeStore();
    keepCommentDraft(A, { words: 'pinned on a', place: PIN }, 'loose', s);
    keepCommentDraft(B, { words: 'running notes', place: null }, 'loose', s);
    const onA = openCommentDraft(A, s);
    expect(onA.words).toBe('pinned on a');
    keepCommentDraft(A, { words: 'pinned on a!', place: PIN }, onA.holding, s);
    expect(openCommentDraft(B, s).words).toBe('running notes');
  });

  it('comes with you again once its pin is taken off, when nothing else is travelling', () => {
    const s = fakeStore();
    keepCommentDraft(A, { words: 'was pinned', place: PIN }, 'loose', s);
    const holding = keepCommentDraft(A, { words: 'was pinned', place: null }, 'file', s);
    expect(holding).toBe('loose');
    expect(openCommentDraft(B, s).words).toBe('was pinned');
    expect(readCommentDraft(A, s).words).toBe('');
  });

  it('stays on its file once unpinned when other notes are already travelling, so neither is lost', () => {
    const s = fakeStore();
    keepCommentDraft(B, { words: 'running notes', place: null }, 'loose', s);
    keepCommentDraft(A, { words: 'was pinned', place: PIN }, 'file', s);
    const holding = keepCommentDraft(A, { words: 'was pinned', place: null }, 'file', s);
    expect(holding).toBe('file');
    expect(openCommentDraft(A, s).words).toBe('was pinned');
    expect(openCommentDraft(B, s).words).toBe('running notes');
  });

  it('a draft kept under a file before this change still opens on that file', () => {
    const s = fakeStore();
    saveCommentDraft(A, { words: 'old draft', place: null }, s);
    expect(openCommentDraft(A, s)).toEqual({ words: 'old draft', place: null, holding: 'file' });
  });
});

describe('the comment box on a file', () => {
  const view = fs.readFileSync(new URL('../renderer/src/components/ArtifactView.tsx', import.meta.url), 'utf8');

  it('opens the draft through the travelling rule and keeps it the same way', () => {
    expect(view).toMatch(/openCommentDraft\(/);
    expect(view).toMatch(/keepCommentDraft\(/);
  });

  it('gives Files, a group and a teammate\'s thread each their own travelling draft', () => {
    const at = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
    expect(at('../renderer/src/files/FilesPlace.tsx')).toMatch(/draftsAcross=/);
    expect(at('../renderer/src/team/rooms/RoomFileView.tsx')).toMatch(/draftsAcross=\{`room:\$\{room\.id\}`\}/);
    expect(at('../renderer/src/threads/TeammateThread.tsx')).toMatch(/draftsAcross=/);
  });
});
