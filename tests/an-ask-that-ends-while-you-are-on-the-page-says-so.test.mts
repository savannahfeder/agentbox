// AN ASK THAT ENDS WHILE YOU ARE ON THE PAGE SAYS SO (w-f702d60afe, bug 6).
//
// Theo had Sam's thread open when Sam took the ask back, and nothing on the
// page said so; Sam handing him the whole thread was as silent. Measured on two
// copies by ending the ask from Sam's side. The page says in one line that the
// ask ended, quoting what was asked, or that the thread is now his, with the way
// to his task. (The first version also kept a draft per target; the teammate's
// page was redrawn on main with one box that keeps what you type, so that part
// went with the old box.)
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TeammateThread } from '../renderer/src/threads/TeammateThread.tsx';
import { askEndedWords } from '../renderer/src/threads/teammate-thread';

const kept = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => kept.get(k) ?? null,
  setItem: (k: string, v: string) => { kept.set(k, v); },
  removeItem: (k: string) => { kept.delete(k); },
};

const card = { personId: 'sam', threadId: 't', visible: true, title: 'Add an idempotency key', project: 'Payments API', state: 'waiting', priority: null, problem: 'x', progress: null, solution: null, blockedBy: [], blocks: [], people: null, updatedAt: 1 };
const askOf = (kind: 'review' | 'help') => ({ id: 'a', product: 'dm', productName: '', ask: { kind, owner: 'sam', thread: 't', product: 'api' }, body: '' });
const page = (ask: ReturnType<typeof askOf> | null, more: Record<string, unknown> = {}) => renderToStaticMarkup(h(TeammateThread, {
  card, person: { id: 'sam', name: 'Sam Lee' }, now: 1, syncedAt: null, onOpenDoc() {}, onNotice() {},
  backLabel: 'Inbox', onBack() {}, onMessage() {}, ask, onHandBack: async () => true, ...more,
} as never));

describe('the line that says the ask ended', () => {
  it('says Sam took it back', () => {
    expect(askEndedWords('Sam', false)).toBe('Sam took the ask back.');
  });
  it('says the thread is yours when Sam handed it over', () => {
    expect(askEndedWords('Sam', true)).toBe('Sam handed this thread to you.');
  });
  it('is drawn whenever Sam has handed you the thread, with the way to your task, above the reply box', () => {
    const task = { id: 'w-9', product: 'dm', title: 'Add an idempotency key' };
    const html = page(null, { handedToYou: task, onOpenTask() {} });
    expect(html).toContain('Sam handed this thread to you.');
    expect(html).toMatch(/<button[^>]*>Open your task<\/button>/);
    // The box, folded to its pill until you press R or click it (w-8a8eac7620).
    expect(html.indexOf('class="dock-card tp-compose')).toBeGreaterThan(-1);
    expect(html.indexOf('Sam handed this thread to you.')).toBeLessThan(html.indexOf('class="dock-card tp-compose'));
  });
  it('is not drawn while the ask is open or when nothing happened', () => {
    expect(page(askOf('review'))).not.toContain('took the ask back');
    expect(page(null)).not.toContain('took the ask back');
    expect(page(null)).not.toContain('handed this thread to you');
  });
});

describe('the page', () => {
  const src = fs.readFileSync(new URL('../renderer/src/threads/TeammateThread.tsx', import.meta.url), 'utf8');
  it('notices the ask going while the page is open, unless you handed it back yourself', () => {
    expect(src).toContain("if (was && !handedBack.current) setEnded({ note: String(was.ask?.note ?? '').trim() });");
    expect(src).toMatch(/handedBack\.current = true;\n\s*const ok = await onHandBack\(verdict, words\);\n\s*if \(!ok\) handedBack\.current = false;/);
    expect(src).toContain('onHandBack={handBack}');
  });
  // A live check: once Sam took the help ask back, "Sam asked you to help: …"
  // left Theo's page with it, so Theo could no longer see what had been asked.
  it('keeps what was asked, quoted, on that line', () => {
    expect(src).toContain('{!handedToYou && ended?.note && <q className="tp-ask-was">');
  });
});
