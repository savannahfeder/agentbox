// A FILE AN AGENT NAMES BY ITS STORED NAME READS AS ITS OWN NAME (2026-11-23).
//
// Rerun A, issues 15, 23 and 31. Asked which file it received, Codex answered
// "The exact filename I received was `mwtnpns0-uip8b9-checkout-preview-v3.html`"
// (Priya's ledger, w-cee402c7b0), and another answer said "stored as
// mwtni1z1-q49y5j-checkout-preview-v2.html": the app drew each as a file link
// wearing the stamp a saved attachment carries, because the name rule took the
// stamp off only a path inside attachments/. And Hand to an agent from the
// third version of a teammate's checkout-style-v2.md put a chip on the card
// reading "32b3bd19d012-checkout-style-v2.md": two copies in the thread share a
// name, so the brief keeps the second under its stored name, and the card took
// the last copy of the family rather than the one being viewed. Measured with
// mentionName, shownName and carriedForFile.
import { describe, it, expect } from 'vitest';
import { shownName } from '../shared/artifact-marks.mts';
import { mentionName, mentionLabel } from '../renderer/src/mentions.ts';
import { carriedForFile } from '../renderer/src/threads/continue-thread';

const stamp = Date.now().toString(36);

describe('a stored name an agent writes out bare', () => {
  it('is drawn as the name the file was sent with', () => {
    expect(mentionName(`${stamp}-uip8b9-checkout-preview-v3.html`)).toBe('checkout-preview-v3.html');
    expect(mentionLabel(`${stamp}-q49y5j-checkout-preview-v2.html`, `${stamp}-q49y5j-checkout-preview-v2.html`)).toBe('checkout-preview-v2.html');
    expect(shownName(`${stamp}-uip8b9-checkout-preview-v3.html`)).toBe('checkout-preview-v3.html');
  });

  it('loses a shared thread\'s hash in front as well', () => {
    expect(mentionName('32b3bd19d012-checkout-style-v2.md')).toBe('checkout-style-v2.md');
  });

  it('leaves names that only look stamped alone', () => {
    expect(mentionName('payments-auth-audit.md')).toBe('payments-auth-audit.md');
    expect(mentionName('bookings-empty-state.html')).toBe('bookings-empty-state.html');
    expect(mentionName('main/x.mjs#L40')).toBe('x.mjs#L40');
  });
});

describe('Hand to an agent from one version of a teammate\'s file', () => {
  const brief = [
    { name: 'checkout-style.md', srcPath: '/copy/attachments/aaaaaaaaaaaa-checkout-style.md', image: false },
    { name: 'checkout-style-v2.md', srcPath: '/copy/attachments/bbbbbbbbbbbb-checkout-style-v2.md', image: false },
    { name: '32b3bd19d012-checkout-style-v2.md', srcPath: '/copy/attachments/32b3bd19d012-checkout-style-v2.md', image: false },
  ];

  it('carries the version being viewed, under its own name', () => {
    expect(carriedForFile(brief, ['/copy/attachments/32b3bd19d012-checkout-style-v2.md']))
      .toEqual([{ name: 'checkout-style-v2.md', srcPath: '/copy/attachments/32b3bd19d012-checkout-style-v2.md', image: false }]);
    expect(carriedForFile(brief, ['/copy/attachments/bbbbbbbbbbbb-checkout-style-v2.md']))
      .toEqual([brief[1]]);
  });

  it('still carries the newest of the family when the viewed copy is not in the brief', () => {
    expect(carriedForFile(brief, ['/elsewhere/checkout-style-v2.md']))
      .toEqual([{ name: 'checkout-style-v2.md', srcPath: '/copy/attachments/32b3bd19d012-checkout-style-v2.md', image: false }]);
  });
});
