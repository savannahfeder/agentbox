// SHE CLEARS HER INBOX, WALKS AWAY, AND THE NEXT AGENT TO FINISH SAYS NOTHING.
//
// What broke: renderer/src/App.tsx decided whether it had ever seen a snapshot
// by asking whether the ids it remembered were empty —
//
//   const first = prevInboxIds.current.size === 0;
//   const fresh = first ? [] : inbox.filter((i) => !prevInboxIds.current.has(i.id));
//
// which is true on the app's genuine first snapshot AND true every time the
// inbox is empty. Inbox zero is the state the whole product aims at, so the
// arrival most worth a banner — the first one after she got clear — was the one
// arrival the app threw away. Nothing in main/notify.mjs ever saw it, so no
// rule about being away could have saved it.
//
// Measured 2026-10-07 while answering "do notifications work? I don't think
// they do for me": the banner path itself is sound end to end (Electron accepts
// the notification from the binary the app runs), and this is the one place in
// it that drops news on purpose by accident.
//
// Empty and never-looked are different facts, so they are now different values:
// `null` is never-looked, an empty Set is an inbox she has seen and cleared.

import { describe, it, expect } from 'vitest';
import { isNew } from '../shared/notify-rules.mjs';

describe('what counts as news', () => {
  it('says nothing about the inbox it is seeing for the first time', () => {
    // The app has just booted. Everything already waiting has been waiting;
    // none of it arrived while she was away, so none of it is a banner.
    expect(isNew(null, 'w-already-here')).toBe(false);
  });

  it('speaks for the first row to land after she reached inbox zero', () => {
    // The boundary either side of the bug. She has seen the inbox; it is empty;
    // a worker finishes. That is news, and it was being dropped.
    expect(isNew(new Set(), 'w-just-finished')).toBe(true);
  });

  it('speaks for a row that was not in the inbox she last saw', () => {
    expect(isNew(new Set(['w-old']), 'w-new')).toBe(true);
  });

  it('says nothing about a row she has already been shown', () => {
    // The case that must NOT match: a snapshot that re-renders with the same
    // rows is not twenty arrivals.
    expect(isNew(new Set(['w-old']), 'w-old')).toBe(false);
  });
});
