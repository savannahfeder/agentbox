// THE PHONE'S "COMPUTER IS AWAY" NOTICE SAYS WHAT TO DO NEXT.
//
// What broke (phone testers, 2026-11-08, three reports): "Your computer was
// last online 3 hours ago. What you send waits for it." and nothing more, so a
// tester on a train did not know whether to wait, wake the computer or do
// something on the phone. Read from awayNext and the notice's source.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { awayNext } from '../mobile/src/lib/computer-line';

const notice = fs.readFileSync(new URL('../mobile/src/ui/StatusNotice.tsx', import.meta.url), 'utf8');
const inbox = fs.readFileSync(new URL('../mobile/src/app/index.tsx', import.meta.url), 'utf8');
const NOW = 1_800_000_000_000;
const seen = (minutesAgo: number) => NOW - minutesAgo * 60_000;

describe('the next step under the notice', () => {
  it('away with no cloud: wake it, or set up Agentbox Cloud on it', () => {
    expect(awayNext({ error: null, macSeen: seen(180), cloud: false }, NOW))
      .toBe('Wake it to carry on, or set up Agentbox Cloud on it.');
  });
  it('away with the cloud carrying on: nothing to do, so nothing said', () => {
    expect(awayNext({ error: null, macSeen: seen(180), cloud: true }, NOW)).toBeNull();
  });
  it('online: no notice, no next step', () => {
    expect(awayNext({ error: null, macSeen: seen(0.5), cloud: false }, NOW)).toBeNull();
  });
  it('the phone itself offline: the notice is about the phone, not the computer', () => {
    expect(awayNext({ error: 'fetch failed', macSeen: seen(180), cloud: false }, NOW)).toBeNull();
  });
  it('never connected: the inbox draws its own connect page, not this', () => {
    expect(awayNext({ error: null, macSeen: 0, cloud: false }, NOW)).toBeNull();
  });
});

describe('drawn', () => {
  it('under the notice\'s words, and the inbox passes it', () => {
    expect(notice).toMatch(/\{message\}\{!!next && <T[^>]*>\{` \$\{next\}`\}<\/T>\}/);
    expect(inbox).toMatch(/<StatusNotice message=\{c\.status\} next=\{c\.statusNext\} \/>/);
  });
});
