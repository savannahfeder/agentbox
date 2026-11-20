// A REVIEWER SENDS THE REVIEW BACK FROM THE THREAD (2026-11-20).
//
// Synthetic team run: Priya opened Lena's "Review and send back: Empty state
// mockups", approved empty-state-a.png, sent Lena a note on it ("Sent to
// Lena"), and closed the picture. The thread still read "Waits on Priya" and
// nothing on the page sent the review back, so she could not tell whether
// Lena had it. While the owner's review ask waits on you, the thread's reply
// box, at its foot, says the ask with the owner's note and offers Approve and
// Send back with N notes (your open notes on its files). Either sends the
// verdict as your comment, which ends the owner's wait
// (a-review-sent-back-ends-the-wait-...), and the header then says it went.
//
// The first version sat at the top with a solid white Approve; the design
// review of the rerun asked for the reply box's own place and shape, outline
// buttons, a header that reads as the ask to you rather than "Waits on Priya",
// and no "Continue it yourself" while the review is yours. Measured on the
// box drawn on its own and on the page that holds it.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SendBack, reviewAskedOf, reviewIsMine, sentBackSaid } from '../renderer/src/threads/SendBack.tsx';
import { personWait } from '../shared/thread-waits.mts';
import { askedSaid } from '../shared/thread-ask.mts';
import { askedNote } from '../shared/review-sent-back.mts';

const draw = (notes = 0) => renderToStaticMarkup(h(SendBack, { owner: 'Lena', note: 'Check the v2 empty state', notes, onSend: async () => true }));
const buttons = (html: string) => [...html.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map((m) => ({ words: m[1], off: /disabled=""/.test(m[0]) }));

describe('whose review it is', () => {
  const card = { blockedBy: [{ id: personWait('p-priya'), title: null, want: 'review' as const, note: 'Check the v2' }] };
  it('the person the owner\'s review ask waits on, with the owner\'s note', () => {
    expect(reviewIsMine(card, 'p-priya')).toBe(true);
    expect(reviewAskedOf(card, 'p-priya')).toEqual({ note: 'Check the v2' });
  });
  it('must NOT be someone else, a help ask, or a plain wait', () => {
    expect(reviewIsMine(card, 'p-theo')).toBe(false);
    expect(reviewIsMine({ blockedBy: [{ id: personWait('p-priya'), title: null, want: 'help' as const }] }, 'p-priya')).toBe(false);
    expect(reviewIsMine({ blockedBy: [{ id: personWait('p-priya'), title: null }] }, 'p-priya')).toBe(false);
    expect(reviewIsMine(card, null)).toBe(false);
  });
  it('the card carries the note the owner wrote with the ask', () => {
    expect(askedNote(askedSaid('review', 'Priya', 'Check the v2'))).toBe('Check the v2');
    expect(askedNote(askedSaid('review', 'Priya', ''))).toBe('');
  });
});

describe('the reviewer\'s reply box', () => {
  it('says the ask and offers Approve and Send back with her notes counted: the reported case', () => {
    const html = draw(2);
    expect(html).toContain('Lena asked you to review and send back: Check the v2 empty state');
    expect(html).toContain('Notes for Lena');
    expect(buttons(html)).toEqual([{ words: 'Send back with 2 notes', off: false }, { words: 'Approve', off: false }]);
  });
  it('cannot send back with no notes to send', () => {
    expect(buttons(draw(0))).toEqual([{ words: 'Send back with notes', off: true }, { words: 'Approve', off: false }]);
  });
  it('is the reply box\'s own shape, Approve where Send goes', () => {
    const html = draw(1);
    expect(html).toContain('class="th-comment tp-dock-form tp-send-back"');
    expect(html).toContain('<textarea class="dock-input"');
    expect(html).toContain('<span class="dock-send-pair solo"><button type="submit" class="dock-send">Approve</button></span>');
    expect(html).not.toContain('is-primary');
  });
  it('says plainly that it went back', () => {
    expect(sentBackSaid('approved', 0, 'Lena')).toBe('Approved and sent back to Lena');
    expect(sentBackSaid('changes', 2, 'Lena')).toBe('Sent back to Lena with 2 notes');
    expect(sentBackSaid('changes', 0, 'Lena')).toBe('Sent back to Lena');
  });
});

describe('the thread page', () => {
  const page = fs.readFileSync(new URL('../renderer/src/threads/TeammateThread.tsx', import.meta.url), 'utf8');
  it('puts the box where the reply box goes, at the foot', () => {
    expect(page).toMatch(/\{reviewing \? \(\s*<SendBack owner=\{owner\} note=\{review\.note\} notes=\{myOpenNotes\}/);
    expect(page.indexOf('<SendBack')).toBeGreaterThan(page.indexOf('<QueueAnswer'));
    expect(page).toMatch(/<div className="focus-dock">[\s\S]*<SendBack/);
  });
  it('heads the page with the ask to you, then that it went', () => {
    expect(page).toContain("reviewing ? 'asked you to review and send back' : review ? sentBack : null;");
    expect(page).toContain('{reviewing && review.note && <p className="tp-ask-note">{review.note}</p>}');
  });
  it('does not offer to take the thread while the review is yours', () => {
    expect(page).toMatch(/\{onContinue && !reviewing && (!helping && )?canContinue\(/);
  });
  it('the box is not a white block', () => {
    const css = fs.readFileSync(new URL('../renderer/src/threads/pages.css', import.meta.url), 'utf8');
    expect(css).not.toMatch(/\.tp-send-back[^{]*\{[^}]*background: var\(--text\)/);
  });
});
