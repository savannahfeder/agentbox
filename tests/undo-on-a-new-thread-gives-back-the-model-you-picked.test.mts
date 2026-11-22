// Undo on a new thread brought back its words and project but not its model.
// Overnight Cloud test, round four: a tester sent a GPT-6.1-Sol thread to the
// wrong project, pressed Z, and the card came back on Opus 5.5, so the resend
// would have gone to Claude Code. The card's written copy kept the words, the
// tag and the clock, and a fresh card opens on the Settings default by design.
import { describe, expect, it } from 'vitest';
import { cardPick, EMPTY_COMPOSE_DRAFT, readComposeDraft, restoreComposeDraft, saveComposeDraft } from '../renderer/src/drafts';

const fakeStore = () => {
  const map = new Map<string, string>();
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, String(v)); }, removeItem: (k: string) => { map.delete(k); } };
};
const sol = { engine: 'codex', model: 'gpt-6.1-sol' };

describe('undo on a new thread gives back the model you picked', () => {
  it('keeps the picked model on the written copy and on the card Z restores', () => {
    const s = fakeStore();
    const sent = { ...EMPTY_COMPOSE_DRAFT, text: 'Fix the circular import', pick: sol };
    expect(restoreComposeDraft(sent, s)).toBe(true);
    expect(readComposeDraft(s).pick).toEqual(sol);
    expect(cardPick(readComposeDraft(s), ['claude', 'codex'])).toEqual(sol);
  });

  it('is no draft on its own: a model picked with nothing written is not kept', () => {
    const s = fakeStore();
    saveComposeDraft({ ...EMPTY_COMPOSE_DRAFT, pick: sol }, s);
    expect(readComposeDraft(s).pick).toBeUndefined();
  });

  it('opens on the default when the copy names an engine this Mac no longer offers', () => {
    expect(cardPick({ ...EMPTY_COMPOSE_DRAFT, text: 'x', pick: sol }, ['claude'])).toBeNull();
  });

  it('reads a malformed pick as none', () => {
    const s = fakeStore();
    s.setItem('zero.draft.compose', JSON.stringify({ text: 'x', pick: { engine: 3 } }));
    expect(readComposeDraft(s).pick).toBeUndefined();
  });
});
