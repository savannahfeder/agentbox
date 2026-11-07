// To reset to Auto on every mount. Render fresh cards against saved picks,
// including stale recipients and explicit conversation targets.
import { beforeEach, expect, it } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ThreadComposer } from '../renderer/src/threads/ThreadComposer.tsx';
import { LAST_RECIPIENT_KEY, readLastRecipient, writeLastRecipient } from '../renderer/src/threads/recipient.ts';

const key = LAST_RECIPIENT_KEY;
const mate = { id: 'video', name: 'Video producer', letter: 'V', role: null };
beforeEach(() => {
  const values = new Map();
  globalThis.localStorage = { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) };
});
const draw = (initial) => renderToStaticMarkup(h(ThreadComposer, {
  products: [{ slug: 'p', name: 'P', dir: '/p', repoPath: '/r' }], items: [],
  agentMates: [mate], onToTeammate: async () => null, onClose() {}, onSent() {}, initial,
}));
const save = value => localStorage.setItem(key, JSON.stringify(value));

it('keeps the coding agent selected when another card opens', () => {
  save({ to: 'agent', mate: null, auto: false });
  expect(draw()).not.toContain('tc-word-text">Auto</span>');
});
it('does not keep an AI teammate when another card opens', () => {
  save({ to: 'agent', mate: mate.id, auto: false });
  expect(draw()).not.toContain('tc-word-text">Video producer</span>');
});
it('keeps Auto when selected and uses it before any choice', () => {
  expect(draw()).toContain('tc-word-text">Auto</span>');
  save({ to: 'agent', mate: null, auto: true });
  expect(draw()).toContain('tc-word-text">Auto</span>');
});
it('uses an explicit target ahead of the remembered recipient', () => {
  save({ to: 'agent', mate: mate.id, auto: false });
  expect(draw({ to: 'agent' })).not.toContain('tc-word-text">Video producer</span>');
  save({ to: 'agent', mate: null, auto: true });
  expect(draw({ mate: mate.id })).toContain('tc-word-text">Video producer</span>');
});
it('falls back when a saved recipient is gone, temporary, malformed, or unreadable', () => {
  for (const value of [{ to: 'gone' }, { to: 'agent', mate: 'gone' }, { to: 'agent', mate: 'new' }, null, 5]) {
    save(value);
    expect(draw()).toContain('tc-word-text">Auto</span>');
  }
  localStorage.setItem(key, '{');
  expect(draw()).toContain('tc-word-text">Auto</span>');
  globalThis.localStorage.getItem = () => { throw Error('unavailable'); };
  expect(draw()).toContain('tc-word-text">Auto</span>');
});

it('saves Auto or a coding agent, and neither a person nor a teammate', () => {
  for (const recipient of [{ to: 'agent', mate: null, auto: false }, { to: 'agent', mate: null, auto: true }]) {
    writeLastRecipient(recipient);
    expect(readLastRecipient([{ id: 'person' }], [mate], true)).toEqual(recipient);
  }
  writeLastRecipient({ to: 'agent', mate: mate.id, auto: false });
  writeLastRecipient({ to: 'person', mate: null, auto: false });
  expect(readLastRecipient([{ id: 'person' }], [mate], true)).toEqual({ to: 'agent', mate: null, auto: true });
});
it('does not remember Someone new', () => {
  writeLastRecipient({ to: 'agent', mate: null, auto: false });
  writeLastRecipient({ to: 'agent', mate: 'new', auto: false });
  expect(readLastRecipient([], [mate], true).auto).toBe(false);
});
it('keeps the current selection usable when saving is refused', () => {
  globalThis.localStorage.setItem = () => { throw Error('unavailable'); };
  expect(() => writeLastRecipient({ to: 'agent', mate: null, auto: false })).not.toThrow();
});
