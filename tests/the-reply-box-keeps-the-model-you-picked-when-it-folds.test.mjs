// "Closing the reply box keeps my text but throws away the model I picked"
// (power test w-811757c0b5 run 2, issue 22). She picked Opus 5.5 and High,
// pressed Escape, pressed R again, and the footer said Sonnet 5.5. "If I'd hit
// send without looking it would have gone to the wrong model."
//
// The words survived because `drafts.ts` writes them on every keystroke. The
// pick lived in the composer's own React state, which dies with the box, so it
// was the same loss as the pasted images were in August and the fix is the same
// one: the pick goes in the draft, beside the words and under its own key.
//
// The same state is what issue 10 lost mid-sentence: the box re-seeded itself
// from `item.model` whenever a snapshot arrived carrying a different one, which
// threw away a pick she had made seconds earlier AND the flag saying she had
// made one, so the send then wrote nothing. The mode chip next to it already
// watches only the row's identity for exactly this reason.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import {
  clearDraft, draftKey, draftPickKey, readDraft, readDraftPick, saveDraft, saveDraftPick,
} from '../renderer/src/drafts.ts';

const item = { product: 'agentbox', id: 'w-1234' };

function store() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    keys: () => [...map.keys()],
  };
}

describe('the pick outlives the box, the way her words already do', () => {
  it('comes back as she left it', () => {
    const s = store();
    saveDraftPick(item, { model: 'opus', effort: 'high' }, s);
    expect(readDraftPick(item, s)).toEqual({ model: 'opus', effort: 'high' });
  });

  it("comes back when what she picked was the engine's own", () => {
    // null inside a kept pick is a choice. Dropping it would send her back to
    // the row's old model, which is the bug being fixed.
    const s = store();
    saveDraftPick(item, { model: null, effort: 'high' }, s);
    expect(readDraftPick(item, s)).toEqual({ model: null, effort: 'high' });
  });

  it('says there is no pick when she never opened the drawer', () => {
    expect(readDraftPick(item, store())).toBeNull();
  });

  it('forgets the pick when it is taken back off the box', () => {
    const s = store();
    saveDraftPick(item, { model: 'opus', effort: null }, s);
    saveDraftPick(item, null, s);
    expect(readDraftPick(item, s)).toBeNull();
  });

  it('is sent with the reply and gone afterwards', () => {
    const s = store();
    saveDraft(item, 'ship it', s);
    saveDraftPick(item, { model: 'opus', effort: 'high' }, s);
    clearDraft(item, s);
    expect(readDraftPick(item, s)).toBeNull();
    expect(readDraft(item, s)).toBe('');
  });

  it('never mixes with the words, whatever she types', () => {
    const s = store();
    saveDraft(item, '{"model":"haiku"}', s);
    expect(readDraftPick(item, s)).toBeNull();
    expect(draftPickKey(item)).not.toBe(draftKey(item));
  });

  it('is one pick per thread', () => {
    const s = store();
    saveDraftPick(item, { model: 'opus', effort: null }, s);
    expect(readDraftPick({ product: 'agentbox', id: 'w-9999' }, s)).toBeNull();
  });

  it('reads anything unusable as no pick rather than throwing', () => {
    const s = store();
    s.setItem(draftPickKey(item), 'not json');
    expect(readDraftPick(item, s)).toBeNull();
    s.setItem(draftPickKey(item), '{"model":7,"effort":[]}');
    expect(readDraftPick(item, s)).toEqual({ model: null, effort: null });
  });
});

describe('the box seeds itself from the thread and not from a passing snapshot', () => {
  const focus = fs.readFileSync(new URL('../renderer/src/components/Focus.tsx', import.meta.url), 'utf8');
  const dock = focus.slice(focus.indexOf('function DockComposer'));

  it('re-reads the pick when the row changes and at no other time', () => {
    // A snapshot arriving mid-sentence must not overwrite a model she just
    // picked. `item.model` and `item.effort` in this list is what did.
    const seed = dock.match(/const opens = replyOpensOn\([^;]+;[\s\S]*?\}, \[([^\]]*)\]\);/);
    expect(seed, 'the dock re-seeds its pick in one effect').toBeTruthy();
    expect(seed[1].replace(/\s/g, '')).toBe('item.product,item.id');
  });

  it('writes the pick down as she makes it', () => {
    expect(dock).toContain('saveDraftPick(');
  });

  it('reads the row through the rule that knows what an empty model means', () => {
    expect(dock).toContain('replyOpensOn(');
    expect(dock).not.toContain('item.model ?? null');
    expect(dock).not.toContain('item.effort ?? null');
  });

  it('draws the folded pill through the same rule', () => {
    expect(focus).not.toMatch(/engineModelLabel\([^)]*item\.model \?\? null/);
    expect(focus).toContain('pickOnTheRow(item).model');
  });
});
