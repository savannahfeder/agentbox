// A REVIEWER ANSWERS FROM THE BOX AT THE BOTTOM (w-f702d60afe, 2026-11-21).
//
// Asked to review Sam's thread, a reviewer typed the answer into the box at the
// bottom of the page, which said "Comment to Sam" and sent with "Send to Sam".
// That posts a comment and leaves the review open for good: the answer lived on
// the "Looks good" and "Needs changes" buttons in the ask above the box, which
// opened a second box. Seen on the tour screens (06-thread, 11-reply-open).
// While a review is open on you, the bottom box is now the answer, and the ask
// keeps only "View the change". A help ask keeps "Send to the agent" and hands
// back from the same box. Measured by drawing the page.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TeammateThread } from '../renderer/src/threads/TeammateThread.tsx';
import { AskBar } from '../renderer/src/team/AskBar.tsx';
import { saveDraft } from '../renderer/src/drafts.ts';

const kept = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => kept.get(k) ?? null,
  setItem: (k: string, v: string) => { kept.set(k, v); },
  removeItem: (k: string) => { kept.delete(k); },
};
beforeEach(() => kept.clear());

const card = { personId: 'sam', threadId: 't', visible: true, title: 'Add an idempotency key', project: 'Payments API', state: 'waiting', priority: null, problem: 'x', progress: null, solution: null, blockedBy: [], blocks: [], people: null, updatedAt: 1 };
const askOf = (kind: 'review' | 'help') => ({ id: 'a', product: 'dm', productName: '', ask: { kind, owner: 'sam', thread: 't', product: 'api' }, body: '[c](attachments/x.change)' });
const page = (ask: ReturnType<typeof askOf> | null) => renderToStaticMarkup(h(TeammateThread, {
  card, person: { id: 'sam', name: 'Sam Lee' }, now: 1, syncedAt: null, onOpenDoc() {}, onNotice() {},
  backLabel: 'Inbox', onBack() {}, onMessage() {}, ask, onHandBack: async () => true,
} as never));
const box = (html: string) => html.slice(html.indexOf('<form class="th-comment"'));
const button = (html: string, label: string) => new RegExp(`<button[^>]*>(?:<svg.*?</svg>)?${label}</button>`).exec(html)?.[0] ?? null;

describe('while a review is open on you', () => {
  it('the box asks for your review, by the owner\'s first name', () => {
    expect(box(page(askOf('review')))).toContain('placeholder="Your review for Sam"');
    expect(box(page(askOf('review')))).not.toContain('Comment to Sam');
  });
  it('offers Looks good at once, and Send changes once there are words', () => {
    const empty = box(page(askOf('review')));
    expect(button(empty, 'Looks good')).not.toContain('disabled');
    expect(button(empty, 'Send changes to Sam')).toContain('disabled');
    expect(button(empty, 'Send to Sam')).toBe(null);
    saveDraft({ product: 'teammate:sam', id: 't' }, 'Keep the old index one more release.');
    const typed = box(page(askOf('review')));
    expect(button(typed, 'Send changes to Sam')).not.toContain('disabled');
    expect(button(typed, 'Looks good')).not.toContain('disabled');
  });
  it('leaves the ask above with only View the change', () => {
    const html = page(askOf('review'));
    const ask = html.slice(html.indexOf('<section class="ask-bar"'), html.indexOf('<form class="th-comment"'));
    expect(ask).toContain('View the change');
    expect(ask).not.toContain('Looks good');
    expect(ask).not.toContain('Needs changes');
  });
  it('sends each verdict through the hand-back the ask uses', () => {
    const src = fs.readFileSync(new URL('../renderer/src/threads/TeammateThread.tsx', import.meta.url), 'utf8');
    expect(src).toMatch(/await onHandBack\(verdict, draft\.trim\(\)\)/);
    expect(src).toMatch(/onClick=\{\(\) => \{ void handBack\('yes'\); \}\}/);
    expect(src).toMatch(/onClick=\{\(\) => \{ void handBack\('changes'\); \}\}/);
    expect(src).toMatch(/onClick=\{\(\) => \{ void handBack\('done'\); \}\}/);
  });
});

describe('while a help ask is open on you', () => {
  it('keeps Send to the agent and hands back beside it', () => {
    const html = box(page(askOf('help')));
    expect(html).toContain("placeholder=\"Write to Sam&#x27;s agent\"");
    expect(button(html, 'Send to the agent')).toContain('disabled');
    expect(button(html, 'Hand back to Sam')).not.toContain('disabled');
  });
  it('and the ask above hands nothing back of its own', () => {
    const html = page(askOf('help'));
    const ask = html.slice(html.indexOf('<section class="ask-bar"'), html.indexOf('<form class="th-comment"'));
    expect(ask).not.toContain('Hand back');
  });
});

describe('with no ask on you', () => {
  it('the box is a comment to the owner, as before', () => {
    const html = box(page(null));
    expect(html).toContain('placeholder="Comment to Sam"');
    expect(button(html, 'Send to Sam')).toContain('disabled');
    expect(html).not.toContain('Looks good');
    expect(html).not.toContain('Hand back');
  });
});

describe('the ask on other pages', () => {
  it('still answers by itself there', () => {
    const html = renderToStaticMarkup(h(AskBar, { task: askOf('review') as never, owner: null, under: true, onHandBack: async () => true }));
    expect(html).toContain('Looks good');
    expect(html).toContain('Needs changes');
  });
});
