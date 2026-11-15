// A PHONE SAYS WHAT IT DECIDED ON A PERMISSION CARD, DENY AS LOUDLY AS ALLOW.
//
// What broke (QA batch 005, F-115, on the hosted phone site): "the card went
// away on the phone with no message. Only the laptop showed ✕ Denied." The
// stamp was there, and the measurements say why it was missed: it is at full
// strength from about 160ms to 330ms of a 420ms exit, and for Deny alone it is
// drawn in --text-dim with no border change, where Allow is --text and lightens
// the card's edge. On a phone screen that is a flash in the quieter of two inks.
//
// So two things: Deny leaves the same mark Allow does, and a phone, which has
// no cmd-Y and nothing else to confirm against, gets a toast that outlasts the
// card. Measured off the verdict line and the stylesheet.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { approvalAnswered } from '../renderer/src/approval-card.ts';

const styles = fs.readFileSync(new URL('../renderer/src/styles.css', import.meta.url), 'utf8');

describe('what the toast says', () => {
  it('names the decision and what follows from it', () => {
    expect(approvalAnswered(true)).toBe('Allowed. The agent carries on.');
    expect(approvalAnswered(false)).toBe('Denied. The agent carries on without it.');
  });

  // The boundary either side: both decisions get a line, so neither is the
  // silent one. This is the whole of the fault being fixed.
  it('leaves neither decision silent', () => {
    expect(approvalAnswered(true)).not.toBe('');
    expect(approvalAnswered(false)).not.toBe('');
    expect(approvalAnswered(true)).not.toBe(approvalAnswered(false));
  });
});

describe('the stamp on the leaving card', () => {
  it('draws Denied in the card\'s own ink, as Allowed is', () => {
    const dimmed = /\.approval-card\.answered\.deny[^{]*\{[^}]*--text-dim/.test(styles);
    expect(dimmed).toBe(false);
  });

  // The case that must not change: Allow's own mark and border are untouched.
  it('leaves Allow as it was', () => {
    expect(styles).toContain('.approval-card.answered.allow { border-color: var(--text-faint); }');
    expect(styles).toMatch(/\.approval-verdict-mark \{[^}]*color: var\(--text\)/);
  });

  it('gives Deny a border of its own, so the edge moves either way', () => {
    expect(styles).toMatch(/\.approval-card\.answered\.deny \{[^}]*border-color/);
  });
});
