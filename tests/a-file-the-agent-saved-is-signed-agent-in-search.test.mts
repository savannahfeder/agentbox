// SEARCH SIGNED A FILE THE AGENT SAVED "You".
//
// A power tester on a team (2026-11-23) searched "focus outline" after Codex
// saved checkout-keyboard-qa.md. The Lines group signed the agent's reply
// Agent, but the Files group signed the QA file's excerpt You. Her web-app
// ledger: the only lines naming the file are `source: "agent"` with her id as
// `by`, and the finder handed on `by` alone, so the row read it as hers.
import { describe, it, expect } from 'vitest';
import { filesAndNotesOf } from '../main/everything-found.mts';
import { insideGroups } from '../renderer/src/found-inside';

const ME = 'p-lena';
const asked = { id: 't1', ts: 1, by: ME, source: 'founder', patch: { body: 'Save a short checkout-keyboard-qa.md with any blockers.' } };
const saved = { id: 't1', ts: 2, by: ME, source: 'agent', patch: { note: 'Saved [Checkout keyboard QA](checkout-keyboard-qa.md)' } };
const attached = { id: 't1', ts: 3, by: ME, source: 'founder', patch: { body: 'Here is my note', artifact: { do: 'share', path: 'my-notes.md' } } };

const none = { lines: [], files: [], comments: [], total: { lines: 0, files: 0, comments: 0 } };
const at = { kind: 'thread' as const, product: 'web-app', id: 't1', ownerId: null, threadId: null, updatedAt: 1 };
const whoOf = (file: { by: string | null; agent?: string }) => insideGroups({
  query: 'focus', items: [{ id: 't1', product: 'web-app', title: 'Checkout keyboard use' } as never], cards: [],
  found: { ...none, files: [{ ...at, how: 'contents', src: 'checkout-keyboard-qa.md', name: 'checkout-keyboard-qa.md', at: 2, text: 'The focus outline is clipped.', ...file }], total: { ...none.total, files: 1 } },
  rooms: new Map(), messages: {}, decisions: {}, me: ME,
  nameOf: (id) => ({ 'p-sam': 'Sam' } as Record<string, string>)[id] ?? 'Someone',
  titleOf: (i) => String(i.title), limit: { lines: 5, files: 5, comments: 5, decisions: 5 },
}).find((g) => g.key === 'files')?.rows[0]?.who;

describe('a file found by search', () => {
  it('says the agent saved it when only an agent line names it', () => {
    const [file] = filesAndNotesOf([asked, saved] as never).files;
    expect(file.name).toBe('checkout-keyboard-qa.md');
    expect(file.agent).toBe('');
  });

  it('is signed Agent though the line carries the searcher as `by`', () => {
    expect(whoOf({ by: ME, agent: '' })).toBe('Agent');
    expect(whoOf({ by: 'p-sam', agent: 'Codex' })).toBe('Agent');
  });

  it('is still signed by the person who shared it', () => {
    expect(filesAndNotesOf([attached] as never).files[0]?.agent).toBeUndefined();
    expect(whoOf({ by: ME })).toBe('You');
    expect(whoOf({ by: 'p-sam' })).toBe('Sam');
  });
});
