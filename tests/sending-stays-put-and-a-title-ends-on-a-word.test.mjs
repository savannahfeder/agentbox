// Someone sent a thread from Needs you and landed on Everything else, not knowing
// why; on a team the tab has to stay put, because Needs you is the list being
// worked. Thread titles were cut mid-word ("Group bookings v1 pl…"), and only a
// project thread could be renamed, leaving conversations named by a first sentence.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { firstSentence } from '../shared/thread-cards.mjs';
import { tabAfterSending } from '../renderer/src/threads/composer-rules';
import { threadCommands } from '../renderer/src/thread-commands';

describe('where a send leaves you', () => {
  it('on a team you stay', () => {
    expect(tabAfterSending({ team: true, kind: 'task', later: false, view: 'inbox', covered: false })).toBeNull();
    expect(tabAfterSending({ team: true, kind: 'task', later: true, view: 'inbox', covered: false })).toBeNull();
  });
  it('alone the tab still moves to where the row landed', () => {
    expect(tabAfterSending({ team: false, kind: 'task', later: false, view: 'inbox', covered: false })).toBe('progress');
    expect(tabAfterSending({ team: false, kind: 'task', later: true, view: 'inbox', covered: false })).toBe('snoozed');
  });
  it('a message never moves you, nor does a send from over something else', () => {
    expect(tabAfterSending({ team: false, kind: 'message', later: false, view: 'inbox', covered: false })).toBeNull();
    expect(tabAfterSending({ team: false, kind: 'task', later: false, view: 'inbox', covered: true })).toBeNull();
    expect(tabAfterSending({ team: false, kind: 'task', later: false, view: 'done', covered: false })).toBeNull();
  });
});

describe('a title ends on a whole word', () => {
  it('cuts back to a word', () => {
    expect(firstSentence('Group bookings version one needs the page side built today', 20)).toBe('Group bookings…');
  });
  it('a short one is untouched', () => expect(firstSentence('Group bookings', 20)).toBe('Group bookings'));
  it('exactly at the limit is untouched', () => expect(firstSentence('12345678901234567890', 20)).toBe('12345678901234567890'));
  it('one very long word still has to be cut', () => {
    const cut = firstSentence('x'.repeat(50), 20);
    expect(cut.length).toBeLessThanOrEqual(20);
    expect(cut.endsWith('…')).toBe(true);
  });
  it('the title of a conversation goes through it', () => {
    const src = fs.readFileSync(new URL('../main/team/index.mts', import.meta.url), 'utf8');
    expect(src).not.toContain('words.slice(0, 90)');
  });
});

describe('a conversation can be renamed', () => {
  const base = { seen: null, teammates: true, pinned: null, place: null, open: null, repeats: false, addPeople: false, routes: [] };
  it('Ctrl+K offers it where asked', () => {
    expect(threadCommands({ ...base, rename: true }).some((c) => c.id === 'rename')).toBe(true);
    expect(threadCommands({ ...base, rename: false }).some((c) => c.id === 'rename')).toBe(false);
  });
  it('App and the crumb both allow it on a conversation', () => {
    const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
    expect(app).toContain('rename: page || isDirect(project ?? undefined)');
    const focus = fs.readFileSync(new URL('../renderer/src/components/Focus.tsx', import.meta.url), 'utf8');
    expect(focus).not.toContain('const rename = named ? undefined');
  });
});
