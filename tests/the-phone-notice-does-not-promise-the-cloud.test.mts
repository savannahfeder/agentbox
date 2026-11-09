// THE PHONE'S NOTICE DOES NOT PROMISE THE CLOUD (w-e4d49a1539).
//
// Round 1 of the 2026-11-03 phone testers, issues 20 and 25: "Where your
// messages go" said what you write goes to your computer "or to Agentbox Cloud
// when your computer is off", then the banner said "What you send waits for
// it" and the toast said it was waiting for the computer. Two testers read the
// notice as a promise that their task would run during their meetings. It still
// says where words can go (the-phone-app-asks-before-your-words-go-to-claude-
// or-codex), and now says the cloud is only there once it is set up. The
// first run's card layout (w-2808010895) brought the bare promise back on
// 2026-11-04; its line now carries the same condition.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const notice = fs.readFileSync('mobile/src/app/ai-notice.tsx', 'utf8');

describe('Where your messages go', () => {
  it('says the cloud takes over only once you have set it up', () => {
    expect(notice).toMatch(/title: 'To your computer', detail: 'Or Agentbox Cloud when your computer is off, if you have set it up' \}/);
  });
  it('no longer reads as a promise that the cloud runs it', () => {
    expect(notice).not.toMatch(/goes to your computer, or to Agentbox Cloud when your computer is off/);
    expect(notice).not.toMatch(/'Or Agentbox Cloud when your computer is off'/);
  });
});
