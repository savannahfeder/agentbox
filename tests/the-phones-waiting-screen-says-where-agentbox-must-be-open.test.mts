// THE PHONE'S WAITING SCREEN SAYS WHERE AGENTBOX MUST BE OPEN (2026-11-08).
//
// A first-day tester on the App Store build read "It connects once Agentbox
// there is open" on the screen after sign-in and logged it as a garbled
// sentence: "there" pointed at a computer the sentence had not named yet.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const onboarding = fs.readFileSync(new URL('../mobile/src/ui/Onboarding.tsx', import.meta.url), 'utf8');
const wait = onboarding.slice(onboarding.indexOf('export function ComputerWait'));

describe('the waiting screen', () => {
  it('names the computer in its first sentence', () => {
    expect(wait).toMatch(/<Lede>It connects once Agentbox is open on your computer and signed in to the same account\.<\/Lede>/);
  });
  it('no longer says "Agentbox there"', () => {
    expect(onboarding).not.toMatch(/Agentbox there/);
  });
});
