// THE COMMAND BAR ANSWERS AN ASK THE WAY THE PAGE DOES (w-f702d60afe, bug 15).
//
// Theo, asked to help on Sam's thread, opened ⌘K on it and typed "hand back":
// nothing matched, although the page has a Hand back to Sam button under the
// box. A review's Looks good and Send changes to Sam were missing too.
// Measured by listing threadCommands for the facts of that page: it had no
// fact for an ask on you at all. The rows now come from `askAnswers`, in the
// page's own words, and a press goes to the page, which hands back with what is
// in its box, as its buttons do.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { matchesQuery } from '../renderer/src/palette-rows.ts';
import { HAND_BACK_EVENT, askAnswers, threadCommands } from '../renderer/src/thread-commands.ts';
import { TeammateThread } from '../renderer/src/threads/TeammateThread.tsx';

const type = (query: string, rows: ReturnType<typeof threadCommands>) => rows.filter((r) => matchesQuery(query, r)).map((r) => r.id);

describe('on a help ask', () => {
  const rows = threadCommands({ answers: askAnswers('help', 'Sam') });
  it('offers Hand back to Sam', () => {
    expect(rows.map((r) => r.label)).toEqual(['Hand back to Sam']);
    expect(rows[0].does).toEqual({ act: 'hand-back', verdict: 'done' });
  });
  it('is found by the words for it', () => {
    for (const q of ['hand back', 'back', 'return', 'sam', 'done']) expect(type(q, rows), q).toEqual(['answer-done']);
  });
});

describe('on a review', () => {
  const rows = threadCommands({ answers: askAnswers('review', 'Sam') });
  it('offers the two answers the page has', () => {
    expect(rows.map((r) => r.label)).toEqual(['Looks good', 'Send changes to Sam']);
    expect(rows.map((r) => r.does)).toEqual([{ act: 'hand-back', verdict: 'yes' }, { act: 'hand-back', verdict: 'changes' }]);
  });
  it('finds each by its own words, and "changes" never finds Looks good', () => {
    expect(type('looks good', rows)).toEqual(['answer-yes']);
    expect(type('approve', rows)).toEqual(['answer-yes']);
    expect(type('changes', rows)).toEqual(['answer-changes']);
    expect(type('review', rows)).toEqual(['answer-yes', 'answer-changes']);
  });
});

describe('with nothing asked of you', () => {
  it('offers no answer', () => {
    expect(askAnswers(null, 'Sam')).toEqual([]);
    expect(threadCommands({}).filter((r) => r.id.startsWith('answer-'))).toEqual([]);
  });
});

describe('the page', () => {
  const card = { personId: 'sam', threadId: 't', visible: true, title: 'Add an idempotency key', project: 'Payments API', state: 'waiting', priority: null, problem: 'x', progress: null, solution: null, blockedBy: [], blocks: [], people: null, updatedAt: 1 };
  const page = (kind: 'help' | 'review') => renderToStaticMarkup(h(TeammateThread, {
    card, person: { id: 'sam', name: 'Sam Lee' }, now: 1, syncedAt: null, onOpenDoc() {}, onNotice() {},
    backLabel: 'Inbox', onBack() {}, onMessage() {}, onHandBack: async () => true,
    ask: { id: 'a', product: 'dm', productName: '', ask: { kind, owner: 'sam', thread: 't', product: 'api' }, body: '' },
  } as never));
  it('has a button for every answer the bar offers, in the same words', () => {
    for (const kind of ['help', 'review'] as const) {
      const html = page(kind);
      for (const a of askAnswers(kind, 'Sam')) expect(html, a.label).toMatch(new RegExp(`<button[^>]*>${a.label}</button>`));
    }
  });
  it('hands back from the bar through the same hand-back as its buttons', () => {
    const src = fs.readFileSync(new URL('../renderer/src/threads/TeammateThread.tsx', import.meta.url), 'utf8');
    expect(src).toContain('window.addEventListener(HAND_BACK_EVENT, hear)');
    expect(src).toMatch(/if \(verdict === 'changes' && !draft\.trim\(\)\) \{[^\n]*\}\n\s*void handBack\(verdict\);/);
    expect(HAND_BACK_EVENT).toBe('zero:hand-back');
  });
});

describe('the window wires it', () => {
  const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
  it('offers the answers on a teammate\'s open thread, and the page opens the task a hand-over made', () => {
    expect(app).toContain('return threadCommands({ answers: askAnswers(ask?.ask?.kind, owner) })');
    expect(app).toContain('window.dispatchEvent(new CustomEvent(HAND_BACK_EVENT, { detail: c.does.verdict }))');
    expect(app).toContain('handedToYou={taskHandedFrom(items, openCard.threadId, openCard.personId) as WorkItem | null}');
  });
});
