// A NEW THREAD BOX OPENED RIGHT AFTER SEND STARTS EMPTY.
//
// What broke (2026-10-20, found by the pre-deploy check's real Claude Code
// drive "many-at-once"): since 66f3f58e the card's words stay written down
// until the send lands, so N during a frozen send gives them back. But N
// pressed before an ORDINARY send has landed opened on the task just sent.
// Measured on the browser copy with real Claude Code, N straight after each
// send: the second box opened holding the first task, the third holding the
// first two, and sending again made duplicates.
//
// Now Send stamps the written copy, and a card opened within the grace that the
// stuck-app line already uses (6 s) starts empty and leaves the copy alone.
// After that the send is stuck, and the words come back as 66f3f58e intended.
import { describe, it, expect } from 'vitest';
import {
  COMPOSE_SENDING_GRACE_MS, dropComposeDraft, markComposeDraftSending, openingComposeDraft,
  readComposeDraft, restoreComposeDraft, saveComposeDraft, EMPTY_COMPOSE_DRAFT,
} from '../renderer/src/drafts';

const fakeStore = () => {
  const map = new Map();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => { map.set(k, String(v)); }, removeItem: (k) => { map.delete(k); } };
};
const draft = (text) => ({ ...EMPTY_COMPOSE_DRAFT, text });
const T = 1_000_000;

describe('the card opened while the last send is in flight', () => {
  it('starts empty within the grace, and the sent copy is still kept', () => {
    const s = fakeStore();
    saveComposeDraft(draft('Verify QUICK1'), s);
    markComposeDraftSending(s, T);
    expect(openingComposeDraft(s, T + 1_000).text).toBe('');
    expect(readComposeDraft(s).text).toBe('Verify QUICK1');
  });

  it('gives the words back once the send has hung past the grace, as a freeze needs', () => {
    const s = fakeStore();
    saveComposeDraft(draft('Verify QUICK1'), s);
    markComposeDraftSending(s, T);
    expect(openingComposeDraft(s, T + COMPOSE_SENDING_GRACE_MS + 1).text).toBe('Verify QUICK1');
  });

  it('must NOT hide an ordinary unsent draft', () => {
    const s = fakeStore();
    saveComposeDraft(draft('half typed'), s);
    expect(openingComposeDraft(s, T).text).toBe('half typed');
  });

  it('typing in the new card replaces the stamp, and the landing send does not empty it', () => {
    const s = fakeStore();
    saveComposeDraft(draft('Verify QUICK1'), s);
    const sent = markComposeDraftSending(s, T);
    saveComposeDraft(draft('the next task'), s);
    expect(openingComposeDraft(s, T + 500).text).toBe('the next task');
    dropComposeDraft(sent, s);
    expect(readComposeDraft(s).text).toBe('the next task');
  });

  it('a send that failed comes straight back into the next card', () => {
    const s = fakeStore();
    saveComposeDraft(draft('Verify QUICK1'), s);
    const sent = markComposeDraftSending(s, T);
    expect(restoreComposeDraft(sent, s)).toBe(true);
    expect(openingComposeDraft(s, T + 500).text).toBe('Verify QUICK1');
  });

  it('Z on a send that landed puts the words back at once', () => {
    const s = fakeStore();
    saveComposeDraft(draft('Verify QUICK1'), s);
    const sent = markComposeDraftSending(s, T);
    dropComposeDraft(sent, s);
    expect(restoreComposeDraft(sent, s)).toBe(true);
    expect(openingComposeDraft(s, T + 500).text).toBe('Verify QUICK1');
  });

  it('the send landing still drops the stamped copy', () => {
    const s = fakeStore();
    saveComposeDraft(draft('Verify QUICK1'), s);
    const sent = markComposeDraftSending(s, T);
    dropComposeDraft(sent, s);
    expect(readComposeDraft(s).text).toBe('');
  });
});
