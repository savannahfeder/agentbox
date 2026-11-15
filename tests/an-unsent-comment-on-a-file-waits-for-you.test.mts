// AN UNSENT COMMENT ON A FILE WAITS FOR YOU, ON THAT FILE.
//
// Someone was writing a comment on a picture, an urgent thread pulled them
// away, and when they came back the comment was gone. Switching to another
// picture lost comments too. The comment box held its words only in the open
// view's React state (ArtifactView `words`), so closing the view or opening
// another thread dropped them, and stepping to another picture cleared the pin
// and carried the words onto the wrong file.
//
// The unsent comment now lives in localStorage under the file version it was
// typed on, and the view reads it back whenever that version is on screen.
// Since then, words with no pin travel to the next file instead
// (an-unpinned-comment-comes-with-you-to-the-next-file); a pinned one stays here.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { commentDraftKey, readCommentDraft, saveCommentDraft } from '../renderer/src/comment-drafts';

function fakeStore() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    size: () => map.size,
  };
}

const ON_V1 = { product: 'agentbox-team', thread: 'w-1', file: 'hero.png@1' };
const ON_V2 = { product: 'agentbox-team', thread: 'w-1', file: 'hero.png@2' };
const OTHER_THREAD = { product: 'agentbox-team', thread: 'w-2', file: 'hero.png@1' };

describe('the unsent comment store', () => {
  it('gives back the words and the pin they were typed with', () => {
    const s = fakeStore();
    saveCommentDraft(ON_V1, { words: 'move the logo left', place: { kind: 'pin', x: 0.2, y: 0.4 } }, s);
    expect(readCommentDraft(ON_V1, s)).toEqual({ words: 'move the logo left', place: { kind: 'pin', x: 0.2, y: 0.4 } });
  });

  it('keeps one comment per file version and per thread', () => {
    const s = fakeStore();
    saveCommentDraft(ON_V1, { words: 'on v1', place: null }, s);
    saveCommentDraft(ON_V2, { words: 'on v2', place: null }, s);
    expect(readCommentDraft(ON_V1, s).words).toBe('on v1');
    expect(readCommentDraft(ON_V2, s).words).toBe('on v2');
    expect(readCommentDraft(OTHER_THREAD, s)).toEqual({ words: '', place: null });
  });

  it('forgets the comment once the words are gone, a lone pin included', () => {
    const s = fakeStore();
    saveCommentDraft(ON_V1, { words: 'x', place: { kind: 'pin', x: 0.5, y: 0.5 } }, s);
    saveCommentDraft(ON_V1, { words: '', place: { kind: 'pin', x: 0.5, y: 0.5 } }, s);
    expect(s.size()).toBe(0);
    saveCommentDraft(ON_V1, { words: '   ', place: null }, s);
    expect(s.size()).toBe(0);
  });

  it('reads nothing from a broken or missing record', () => {
    const s = fakeStore();
    s.setItem(commentDraftKey(ON_V1), '{not json');
    expect(readCommentDraft(ON_V1, s)).toEqual({ words: '', place: null });
    s.setItem(commentDraftKey(ON_V1), JSON.stringify({ words: 3 }));
    expect(readCommentDraft(ON_V1, s)).toEqual({ words: '', place: null });
  });

  it('keys a group file, which has no project or thread, apart from a thread file', () => {
    expect(commentDraftKey({ product: '', file: 'hero.png@1' })).not.toBe(commentDraftKey(ON_V1));
  });
});

describe('the comment box on a file', () => {
  const view = fs.readFileSync(new URL('../renderer/src/components/ArtifactView.tsx', import.meta.url), 'utf8');

  it('reads the version\'s unsent comment back when that version comes on screen', () => {
    const onVersion = view.match(/useEffect\(\(\) => \{\n\s*const kept = openCommentDraft[\s\S]*?\}, \[version\?\.id\]\);/)?.[0] ?? '';
    expect(onVersion).toMatch(/setWords\(kept\.words\)/);
    expect(onVersion).toMatch(/setDraftPlace\(kept\.place\)/);
  });

  it('writes every change of words or pin under the version they belong to', () => {
    const saves = view.match(/useEffect\(\(\) => \{[\s\S]*?keepCommentDraft[\s\S]*?\}, \[words, draftPlace\]\);/)?.[0] ?? '';
    expect(saves).toMatch(/draftOf\.current/);
  });

  it('no longer clears the pin on its own when the version changes', () => {
    expect(view).not.toMatch(/setDraftPlace\(null\); setHere\(null\)/);
  });
});
