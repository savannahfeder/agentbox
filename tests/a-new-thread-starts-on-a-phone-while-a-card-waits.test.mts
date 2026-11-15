// A NEW THREAD CAN BE STARTED ON A PHONE WHILE A PERMISSION CARD WAITS.
//
// What broke (2026-10-26, the web app at iPhone size on a stand-in cloud with
// two cards waiting): the phone layout hid the New thread button whenever a
// card was up, because the card covers the corner the button floats in. There
// was no other way to start a thread on a phone, so until every card was
// answered no agent could be started from it. Measured with Playwright: the
// button's isVisible() was false. Now, with a card up, the pen sits in the top
// bar beside search and filters.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const phone = fs.readFileSync(new URL('../renderer/src/phone.css', import.meta.url), 'utf8');
const rule = (sel) => {
  const at = phone.indexOf(`${sel} {`);
  return at < 0 ? null : phone.slice(at, phone.indexOf('}', at) + 1);
};

describe('the pen with a card up', () => {
  it('is not hidden', () => {
    expect(phone).not.toMatch(/:has\(\.approvals\) \.topbar \.th-new \{ display: none; \}/);
  });
  it('sits in the top bar as one of its icons', () => {
    const r = rule(':root:root:root:has(.approvals) .topbar .th-new');
    expect(r).toMatch(/position: static;/);
    expect(r).toMatch(/width: 40px;/);
    expect(r).toMatch(/background: none;/);
  });
});
