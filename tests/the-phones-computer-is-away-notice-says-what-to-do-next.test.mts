// THE PHONE'S "COMPUTER IS AWAY" NOTICE SAYS ONE THING TO DO NEXT.
//
// 2026-11-08: "What you send waits for it." and nothing more left a tester on
// a train not knowing whether to wait, wake the computer or act on the phone.
// The notice now ends "Open it to run what you send." A second line, "Wake it
// to carry on, or set up Agentbox Cloud on it.", stayed under it, so it gave
// two overlapping instructions, neither of which the phone can do, beside a
// lone Dismiss (QA M-58, 2026-11-14).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { phoneStatusLine } from '../renderer/src/phone-rows';

const notice = fs.readFileSync(new URL('../mobile/src/ui/StatusNotice.tsx', import.meta.url), 'utf8');
const inbox = fs.readFileSync(new URL('../mobile/src/app/index.tsx', import.meta.url), 'utf8');
const NOW = 1_800_000_000_000;
const HOUR = 3_600_000;

describe('the away notice', () => {
  it('says the one step: open Agentbox on the computer', () => {
    expect(phoneStatusLine({ error: null, fetchedAt: NOW, macSeen: NOW - HOUR, cloud: false }, NOW))
      .toBe('Agentbox on your computer was last online 1 hour ago. Open it to run what you send.');
  });

  it('with the cloud carrying on, asks for nothing', () => {
    expect(phoneStatusLine({ error: null, fetchedAt: NOW, macSeen: NOW - HOUR, cloud: true }, NOW))
      .toBe('Your computer is off. Replies carry on in Agentbox Cloud.');
  });
  it('has no second line; only the no-computer notice carries one', () => {
    expect(inbox).toMatch(/const notice = c\.status \? \{ message: c\.status, next: null \} : waitNotice\(c\.connect\);/);
    expect(inbox).toMatch(/<StatusNotice message=\{notice\?\.message\} next=\{notice\?\.next\} \/>/);
    expect(notice).not.toMatch(/Wake it/);
  });
});
