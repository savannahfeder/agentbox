// AN ASK THAT ENDS WHILE YOU WRITE SAYS SO, AND KEEPS YOUR DRAFT FOR ITS OWN TARGET (w-f702d60afe, bug 6).
//
// Theo had Sam's thread open with a half-written review in the box when Sam
// took the ask back. Nothing on the page said so: the box quietly became
// "Comment to Sam" with the review still in it, one Enter from being sent to
// Sam as a comment. A draft for Sam's agent did the same, and so did Sam handing
// Theo the whole thread. Measured on two copies by ending the ask from Sam's
// side with words in Theo's box. Each target now keeps its own draft, the page
// says in one line that the ask ended, and the words come across only when Theo
// presses Use your draft.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TeammateThread } from '../renderer/src/threads/TeammateThread.tsx';
import { askEndedWords, boxTarget, draftAtFor } from '../renderer/src/threads/teammate-thread';
import { saveDraft } from '../renderer/src/drafts.ts';

const kept = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => kept.get(k) ?? null,
  setItem: (k: string, v: string) => { kept.set(k, v); },
  removeItem: (k: string) => { kept.delete(k); },
};
beforeEach(() => kept.clear());

const card = { personId: 'sam', threadId: 't', visible: true, title: 'Add an idempotency key', project: 'Payments API', state: 'waiting', priority: null, problem: 'x', progress: null, solution: null, blockedBy: [], blocks: [], people: null, updatedAt: 1 };
const askOf = (kind: 'review' | 'help') => ({ id: 'a', product: 'dm', productName: '', ask: { kind, owner: 'sam', thread: 't', product: 'api' }, body: '' });
const page = (ask: ReturnType<typeof askOf> | null, more: Record<string, unknown> = {}) => renderToStaticMarkup(h(TeammateThread, {
  card, person: { id: 'sam', name: 'Sam Lee' }, now: 1, syncedAt: null, onOpenDoc() {}, onNotice() {},
  backLabel: 'Inbox', onBack() {}, onMessage() {}, ask, onHandBack: async () => true, ...more,
} as never));
const boxText = (html: string) => /<textarea[^>]*>([^<]*)<\/textarea>/.exec(html.slice(html.indexOf('<form class="th-comment"')))?.[1] ?? null;

describe('each target keeps its own draft', () => {
  it('a comment keeps the key it always had, so drafts already saved still open', () => {
    expect(draftAtFor('sam', 't', 'comment')).toEqual({ product: 'teammate:sam', id: 't' });
  });
  it('a review and words for the agent are kept apart from it and from each other', () => {
    const keys = (['comment', 'review', 'agent'] as const).map((t) => JSON.stringify(draftAtFor('sam', 't', t)));
    expect(new Set(keys).size).toBe(3);
  });
  it('the box is for whatever is open on you', () => {
    expect(boxTarget('review')).toBe('review');
    expect(boxTarget('help')).toBe('agent');
    expect(boxTarget(null)).toBe('comment');
  });
  it('a half-written review is not in the comment box once the ask is gone', () => {
    saveDraft(draftAtFor('sam', 't', 'review'), 'The retry loop never stops.');
    expect(boxText(page(askOf('review')))).toBe('The retry loop never stops.');
    expect(boxText(page(null))).toBe('');
  });
  it('words for the agent are not in the comment box either', () => {
    saveDraft(draftAtFor('sam', 't', 'agent'), 'Try the staging key.');
    expect(boxText(page(askOf('help')))).toBe('Try the staging key.');
    expect(boxText(page(null))).toBe('');
  });
  it('a comment draft is not carried into a review or to the agent', () => {
    saveDraft(draftAtFor('sam', 't', 'comment'), 'Nice work.');
    expect(boxText(page(askOf('review')))).toBe('');
    expect(boxText(page(askOf('help')))).toBe('');
    expect(boxText(page(null))).toBe('Nice work.');
  });
});

describe('the line that says the ask ended', () => {
  it('says Sam took it back', () => {
    expect(askEndedWords('Sam', false)).toBe('Sam took the ask back.');
  });
  it('says the thread is yours when Sam handed it over', () => {
    expect(askEndedWords('Sam', true)).toBe('Sam handed this thread to you.');
  });
  it('is drawn whenever Sam has handed you the thread, with the way to your task', () => {
    const task = { id: 'w-9', product: 'dm', title: 'Add an idempotency key' };
    const html = page(null, { handedToYou: task, onOpenTask() {} });
    expect(html).toContain('Sam handed this thread to you.');
    expect(html).toMatch(/<button[^>]*>Open your task<\/button>/);
    expect(html.indexOf('Sam handed this thread to you.')).toBeLessThan(html.indexOf('<form class="th-comment"'));
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
    expect(src).toMatch(/if \(was && !handedBack\.current\) setEnded\(\{ target: boxTarget\(was\.ask\?\.kind \?\? null\), note: /);
    expect(src).toMatch(/handedBack\.current = true;\n\s*const ok = await onHandBack\(verdict, draft\.trim\(\)\);\n\s*if \(!ok\) handedBack\.current = false;/);
  });
  it('a hand-back clears the draft it sent, not the one the box moved on to', () => {
    expect(src).toMatch(/const at = draftAt;[\s\S]*?if \(ok\) sent\(at\);/);
  });
  it('brings the old draft over only on a press', () => {
    expect(src).toMatch(/onClick=\{takeOldDraft\}>Use your draft<\/button>/);
  });
});

// A live check: once Sam took the help ask back, "Sam asked you to help: …"
// left Theo's page with it, so Theo could no longer see what had been asked.
describe('what was asked stays on the line that says it ended', () => {
  const page = fs.readFileSync(new URL('../renderer/src/threads/TeammateThread.tsx', import.meta.url), 'utf8');
  it('keeps the ask\'s note when it ends, and quotes it', () => {
    expect(page).toContain("note: String(was.ask?.note ?? '').trim() });");
    expect(page).toContain('{!handedToYou && ended?.note && <q className="tp-ask-was">');
  });
});
