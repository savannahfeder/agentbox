// A REVIEWER SENDS THE REVIEW BACK FROM THE THREAD (2026-11-20).
//
// Synthetic team run: Priya opened Lena's "Review and send back: Empty state
// mockups", approved empty-state-a.png, sent Lena a note on it ("Sent to
// Lena"), and closed the picture. The thread still read "Waits on Priya" and
// nothing on the page sent the review back, so she could not tell whether
// Lena had it. While the owner's review ask waits on you, the top of their
// thread now holds a box for your notes with Approve and Send back with N
// notes (your open notes on its files). Either sends the verdict as your
// comment, which ends the owner's wait (a-review-sent-back-ends-the-wait-...),
// and the box becomes the line that says it went back. Measured on the panel
// drawn on its own and on the page that holds it.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SendBack, reviewIsMine, sentBackSaid } from '../renderer/src/threads/SendBack.tsx';
import { personWait } from '../shared/thread-waits.mts';

const draw = (o: { notes?: number; open?: boolean }) =>
  renderToStaticMarkup(h(SendBack, { owner: 'Lena', notes: o.notes ?? 0, open: o.open ?? true, onSend: async () => true }));
const buttons = (html: string) => [...html.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map((m) => ({ words: m[1], off: /disabled=""/.test(m[0]) }));

describe('whose review it is', () => {
  const card = { blockedBy: [{ id: personWait('p-priya'), title: null, want: 'review' as const }] };
  it('the person the owner\'s review ask waits on', () => {
    expect(reviewIsMine(card, 'p-priya')).toBe(true);
  });
  it('must NOT be someone else, a help ask, or a plain wait', () => {
    expect(reviewIsMine(card, 'p-theo')).toBe(false);
    expect(reviewIsMine({ blockedBy: [{ id: personWait('p-priya'), title: null, want: 'help' as const }] }, 'p-priya')).toBe(false);
    expect(reviewIsMine({ blockedBy: [{ id: personWait('p-priya'), title: null }] }, 'p-priya')).toBe(false);
    expect(reviewIsMine(card, null)).toBe(false);
  });
});

describe('the send-back box', () => {
  it('offers Approve and Send back with her notes counted: the reported case', () => {
    const html = draw({ notes: 2 });
    expect(html).toContain('Notes for Lena');
    expect(buttons(html)).toEqual([{ words: 'Approve', off: false }, { words: 'Send back with 2 notes', off: false }]);
  });
  it('cannot send back with no notes to send', () => {
    expect(buttons(draw({ notes: 0 }))).toEqual([{ words: 'Approve', off: false }, { words: 'Send back with notes', off: true }]);
  });
  it('is not there when the review is not yours', () => {
    expect(draw({ open: false })).toBe('');
  });
  it('says plainly that it went back', () => {
    expect(sentBackSaid('approved', 0, 'Lena')).toBe('Approved and sent back to Lena');
    expect(sentBackSaid('changes', 2, 'Lena')).toBe('Sent back to Lena with 2 notes');
    expect(sentBackSaid('changes', 0, 'Lena')).toBe('Sent back to Lena');
  });
});

describe('the thread page', () => {
  const page = fs.readFileSync(new URL('../renderer/src/threads/TeammateThread.tsx', import.meta.url), 'utf8');
  it('holds the box at the top while the review is yours, counting your open notes', () => {
    expect(page).toMatch(/<SendBack key=\{threadId\} owner=\{owner\} notes=\{myOpenNotes\} open=\{reviewIsMine\(card, team\?\.me \?\? null\)\}/);
    expect(page.indexOf('<SendBack')).toBeLessThan(page.indexOf('className="tp-grid"'));
  });
  it('the box is rounded', () => {
    const css = fs.readFileSync(new URL('../renderer/src/threads/pages.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\.tp-send-back \{[^}]*border-radius/);
    expect(css).toMatch(/\.tp-send-back button \{[^}]*border-radius/);
  });
});
