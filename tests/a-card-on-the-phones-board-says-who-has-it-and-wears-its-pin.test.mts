// The desktop's board card says what it waits on where the running mark goes:
// "Handed to Theo" for a thread handed over (since 2026-11-23, as its list
// row does), "Waits on Maya" or "Waits on a thread" for one set to wait. A
// pinned card wears its pin beside the title. The phone parity round of
// 2026-11-25 found the phone's cards drawing none of these: a handed-over
// card read like any other.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { phoneView } from '../renderer/src/phone-rows';
import { DEFAULT_DISPLAY } from '../renderer/src/threads/page-rules';
import { phoneBoard, phoneTabs } from '../mobile/src/lib/tabs';

const NOW = Date.parse('2026-11-25T18:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString();
const DEV = 'a1b2c3d4e5f6';
const thread = (item: string, extra = {}) => ({ device: DEV, project: 'alpha', item, updated_at: iso(NOW - 1000), snapshot: { v: 2, item: { id: item, title: `T ${item}`, kind: 'directive', labels: ['founder'], status: 'blocked', updatedAt: NOW - 1e5, createdAt: NOW - 2e5, ...extra }, history: [] } });

function card(threads: unknown[], id: string) {
  const view = phoneView({ projects: [{ device: DEV, project: 'alpha', name: 'Alpha', updated_at: iso(NOW - 1000) }], threads, commands: [] } as never, NOW);
  const cols = phoneBoard(view, phoneTabs(view, NOW), { ...DEFAULT_DISPLAY.inbox, view: 'board' }, NOW);
  return cols.flatMap((c) => c.rows).find((r) => r.item?.id === id)!;
}

describe("a card on the phone's board", () => {
  it('says who a handed-over thread went to', () => {
    expect(card([thread('w-h', { status: 'done', answer: 'Given to Theo Park.' })], 'w-h').wait).toBe('Handed to Theo');
  });

  it('says what a thread set to wait waits on', () => {
    expect(card([thread('w-w', { blockedBy: ['name:the launch date'], wrote: { blockedBy: { ts: NOW - 1e5, source: 'founder' } } })], 'w-w').wait).toBe('Waits on the launch date');
  });

  it('says nothing more for a thread that waits on nobody', () => {
    expect(card([thread('w-n')], 'w-n').wait).toBeNull();
  });

  it('draws the word where the running mark would be, and the pin beside the title', () => {
    const src = fs.readFileSync(new URL('../mobile/src/app/index.tsx', import.meta.url), 'utf8');
    expect(src).toMatch(/\{e\.wait \? <T[^>]*>\{e\.wait\}<\/T> : e\.queued \? <T[^>]*>Queued<\/T> : e\.live && /);
    expect(src).toMatch(/e\.item\?\.pinned && e\.item\.status !== 'done' && <View accessibilityLabel="Pinned"[^\n]*<Pin filled tint=\{color\.dim\} \/>/);
  });
});
