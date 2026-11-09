// CLAUDE AND CODEX COPIES OF ONE TASK SAY WHICH IS WHICH ON THE PHONE.
//
// What broke (phone tester, 2026-11-08): the same task sent once to Claude Code
// and once to Codex drew two identical rows, same title, same project, and the
// only way to tell them apart was to open each. Read from phoneTabs' rows.
import { describe, it, expect } from 'vitest';
import { phoneBoard, phoneTabs } from '../mobile/src/lib/tabs';
import { DEFAULT_DISPLAY } from '../renderer/src/threads/page-rules';
import type { WorkItem } from '../renderer/src/types';

const NOW = 1_800_000_000_000;
const thread = (id: string, title: string, more: Partial<WorkItem> = {}) => ({
  id, product: 'mac:alpha', title, status: 'blocked', priority: 5, labels: ['founder'], kind: 'directive',
  createdAt: NOW - 60_000, updatedAt: NOW - 60_000, note: 'Done, have a look.', wrote: { note: { ts: NOW - 60_000, source: 'agent' } }, ...more,
}) as unknown as WorkItem;
const rows = (items: WorkItem[]) => phoneTabs({ items, running: [], products: [{ slug: 'mac:alpha', name: 'Alpha' }] }, NOW).inbox;

describe('a row names its agent', () => {
  it('when another row has its title and runs on the other agent', () => {
    const r = rows([thread('w-1', 'Fix the login bug', { engine: 'claude' }), thread('w-2', 'Fix the login bug', { engine: 'codex' })]);
    expect(Object.fromEntries(r.map((x) => [x.id, x.agent]))).toEqual({ 'w-1': 'Claude Code', 'w-2': 'Codex' });
  });
  it('a row naming no agent reads as Claude Code beside a Codex copy', () => {
    const r = rows([thread('w-1', 'Fix the login bug'), thread('w-2', 'Fix the login bug', { engine: 'codex' })]);
    expect(r.find((x) => x.id === 'w-1')!.agent).toBe('Claude Code');
  });
});

describe('and says nothing when it would tell nothing apart', () => {
  it('a title no other row has', () => {
    const r = rows([thread('w-1', 'Fix the login bug', { engine: 'codex' }), thread('w-2', 'Draw the sign-in screen', { engine: 'claude' })]);
    expect(r.map((x) => x.agent)).toEqual([null, null]);
  });
  it('two copies on the same agent', () => {
    const r = rows([thread('w-1', 'Fix the login bug', { engine: 'codex' }), thread('w-2', 'Fix the login bug', { engine: 'codex' })]);
    expect(r.map((x) => x.agent)).toEqual([null, null]);
  });
});

describe('on the board', () => {
  it('a card says its agent as its row does', () => {
    const items = [thread('w-1', 'Fix the login bug', { engine: 'claude' }), thread('w-2', 'Fix the login bug', { engine: 'codex' })];
    const view = { items, running: [], products: [{ slug: 'mac:alpha', name: 'Alpha' }] };
    const cards = phoneBoard(view, phoneTabs(view, NOW), { ...DEFAULT_DISPLAY.inbox, view: 'board' }, NOW).flatMap((c) => c.rows);
    expect(Object.fromEntries(cards.map((e) => [e.item!.id, e.agent]))).toEqual({ 'w-1': 'Claude Code', 'w-2': 'Codex' });
  });
});
