// A cancelled "Hand to an agent" quoting a private message from Sofia showed up
// in the box when its writer then went to message Maya: one key from sending it
// to the wrong person. The New thread card kept one shared draft, so whatever any
// card held opened in the next. A second leak: the reply box was one box moving
// between threads, so a stray "@" typed on one was saved onto the next. Each card
// now has its own place, a hand-off closed unchanged keeps nothing, and a reply
// box belongs to one thread.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { COMPOSE_DRAFT_KEY, readComposeDraft, saveComposeDraft, openingComposeDraft, clearComposeDraft, markComposeDraftSending, dropComposeDraft, restoreComposeDraft, EMPTY_COMPOSE_DRAFT, restoreDraft, readDraft, saveDraft } from '../renderer/src/drafts';
import { cardDraftPlace, cardDraftToKeep } from '../renderer/src/threads/composer-rules';

const fake = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; };
const draft = (text) => ({ ...EMPTY_COMPOSE_DRAFT, text });
const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

describe('each card has its own draft', () => {
  it('words saved in one place do not open in another', () => {
    const s = fake();
    saveComposeDraft(draft('quoting Sofia'), s, 'hand:direct-1:w1:m1');
    expect(readComposeDraft(s).text).toBe('');
    expect(openingComposeDraft(s).text).toBe('');
    expect(readComposeDraft(s, 'to:maya').text).toBe('');
    expect(readComposeDraft(s, 'hand:direct-1:w1:m1').text).toBe('quoting Sofia');
  });
  it('the plain card keeps the key it always had, so drafts on disk still open', () => {
    const s = fake();
    saveComposeDraft(draft('mine'), s);
    expect(s.m.has(COMPOSE_DRAFT_KEY)).toBe(true);
  });
  it('sending, undoing and clearing stay in their own place', () => {
    const s = fake();
    saveComposeDraft(draft('plain'), s);
    saveComposeDraft(draft('scoped'), s, 'to:maya');
    const taken = markComposeDraftSending(s, 1, 'to:maya');
    dropComposeDraft(taken, s, 'to:maya');
    expect(readComposeDraft(s, 'to:maya').text).toBe('');
    expect(readComposeDraft(s).text).toBe('plain');
    expect(restoreComposeDraft(taken, s, 'to:maya')).toBe(true);
    expect(readComposeDraft(s, 'to:maya').text).toBe('scoped');
    clearComposeDraft(s, 'to:maya');
    expect(readComposeDraft(s).text).toBe('plain');
  });
});

describe('which place a card opens in', () => {
  it('a card opened on a person is theirs', () => expect(cardDraftPlace({ to: 'maya' })).toBe('to:maya'));
  it('a group is the group, whatever order it was named in', () => {
    expect(cardDraftPlace({ to: 'b', also: ['a'] })).toBe(cardDraftPlace({ to: 'a', also: ['b'] }));
  });
  it('a hand-off names the message it came from', () => {
    expect(cardDraftPlace({ to: 'agent', handFrom: { product: 'd', id: 'w', message: 'm1' } })).toBe('hand:d:w:m1');
    expect(cardDraftPlace({ to: 'agent', handFrom: { product: 'd', id: 'w', message: 'm2' } })).toBe('hand:d:w:m2');
  });
  it('a plain card, and the box moving off the page, use the shared place', () => {
    expect(cardDraftPlace(null)).toBeUndefined();
    expect(cardDraftPlace({ to: 'agent' })).toBeUndefined();
    expect(cardDraftPlace({ to: 'maya', body: 'moved', moved: true })).toBeUndefined();
  });
});

describe('a hand-off closed without a change keeps nothing', () => {
  const start = { body: 'Sofia wrote: private\n\n', handFrom: { product: 'd', id: 'w', message: 'm' } };
  it('the words it was opened with are not a draft', () => {
    expect(cardDraftToKeep('Sofia wrote: private\n\n', start)).toBe('');
    expect(cardDraftToKeep('Sofia wrote: private', start)).toBe('');
  });
  it('words you added are kept, in that card only', () => {
    expect(cardDraftToKeep('Sofia wrote: private\n\nfix it', start)).toBe('Sofia wrote: private\n\nfix it');
  });
  it('a card not opened from a message keeps what it holds', () => {
    expect(cardDraftToKeep('hello', null)).toBe('hello');
    expect(cardDraftToKeep('hello', { to: 'maya' })).toBe('hello');
  });
});

describe('the reply box belongs to one thread', () => {
  it('moving to another thread makes a new box', () => {
    expect(read('renderer/src/components/Focus.tsx')).toMatch(/<DockComposer key=\{`\$\{item\.product\}:\$\{item\.id\}`\}/);
  });
  it('a side thread box is its own already', () => {
    expect(read('renderer/src/team/ThreadPanel.tsx')).toContain('ThreadPanelBody key=');
  });
});

describe('undo puts the words in the box that says so', () => {
  const app = read('renderer/src/App.tsx');
  it('both undo paths open the box and tell a box already open', () => {
    expect(app.match(/wordsBackInTheBox\(item, sent\?\.words \?\? text, sent\?\.attachments \?\? \[\](, keepsTime, pick)?\)/g)).toHaveLength(2);
    const fn = app.slice(app.indexOf('const wordsBackInTheBox'));
    expect(fn.slice(0, 400)).toContain('zero:reply-restored');
    expect(fn.slice(0, 400)).toContain("setModal('reply')");
  });
  it('a newer draft is not overwritten, so the toast cannot promise it', () => {
    const s = fake();
    const item = { product: 'p', id: 'i' };
    saveDraft(item, 'newer', s);
    expect(restoreDraft(item, 'older', [], s)).toBe(false);
    expect(readDraft(item, s)).toBe('newer');
  });
});
