// SEARCH SIGNED THE AGENT'S ANSWERS "You".
//
// A power tester on a team (2026-11-23) searched "pagination" and every Codex
// answer in the Lines group read "You". In a team copy every ledger line
// carries `by`, the person whose Mac wrote it, agent lines included (Sam's
// payments-api ledger: each `source: "agent"` result has his id), and the
// search row named `by` before it looked at who spoke.
import { describe, it, expect } from 'vitest';
import { insideGroups } from '../renderer/src/found-inside';

const none = { lines: [], files: [], comments: [], total: { lines: 0, files: 0, comments: 0 } };
const at = { kind: 'thread' as const, product: 'payments-api', id: 't1', ownerId: null, threadId: null, updatedAt: 1 };
const line = (o: { by: string | null; source: 'founder' | 'agent' | 'system'; comment?: boolean }) => ({ ...at, uid: 'u1', at: 10, comment: false, text: 'Pagination is committed.', ...o });
const whoOf = (l: ReturnType<typeof line>) => insideGroups({
  query: 'pagination', items: [{ id: 't1', product: 'payments-api', title: 'Optional pagination' } as never], cards: [],
  found: { ...none, lines: [l], total: { ...none.total, lines: 1 } },
  rooms: new Map(), messages: {}, decisions: {}, me: 'p-sam',
  nameOf: (id) => ({ 'p-lena': 'Lena' } as Record<string, string>)[id] ?? 'Someone',
  titleOf: (i) => String(i.title), limit: { lines: 5, files: 5, comments: 5, decisions: 5 },
}).find((g) => g.key === 'lines')?.rows[0]?.who;

describe('a line an agent wrote, found by search', () => {
  it('is signed Agent though the line carries the searcher as `by`', () => {
    expect(whoOf(line({ by: 'p-sam', source: 'agent' }))).toBe('Agent');
  });

  it("is signed Agent on a teammate's thread too, not with the teammate's name", () => {
    expect(whoOf(line({ by: 'p-lena', source: 'agent' }))).toBe('Agent');
  });

  it('still says You for your own words and the name for a teammate', () => {
    expect(whoOf(line({ by: 'p-sam', source: 'founder' }))).toBe('You');
    expect(whoOf(line({ by: 'p-lena', source: 'founder' }))).toBe('Lena');
    expect(whoOf(line({ by: null, source: 'agent' }))).toBe('Agent');
  });

  it('keeps a comment with the person who left it', () => {
    expect(whoOf(line({ by: 'p-lena', source: 'founder', comment: true }))).toBe('Lena commented');
  });
});
