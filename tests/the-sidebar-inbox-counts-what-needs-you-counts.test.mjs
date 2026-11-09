// THE SIDEBAR'S INBOX NUMBER COUNTS WHAT NEEDS YOU COUNTS (w-d19fcb9309).
//
// The second synthetic team run, Maya (and Theo the run before): after a
// done-notice arrived, Needs you said 19 and the sidebar's Inbox said 18. The
// sidebar added your rows and invitations; Needs you also counted a
// teammate's file news and the threads you asked to hear about finishing.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { inboxBadge } from '../renderer/src/needs-count.ts';

describe('the Inbox badge', () => {
  it('counts the done-notice and the file news beside your rows and invitations', () => {
    expect(inboxBadge({ rows: 16, leads: 2, fileNews: 0, follows: 1 })).toBe(19);
    expect(inboxBadge({ rows: 0, leads: 0, fileNews: 2, follows: 0 })).toBe(2);
  });
  it('is nothing when nothing waits', () => {
    expect(inboxBadge({ rows: 0, leads: 0, fileNews: 0, follows: 0 })).toBe(0);
  });
  it('is what the sidebar draws, with the same parts Needs you adds', () => {
    const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
    expect(app).toContain('inboxCount={inboxBadge({ rows: inbox.length, leads: leadCount, fileNews: sharedFileNews.length, follows: followingNews.length })}');
    expect(app).toMatch(/inbox: \(mineShown \? shownCount\(inbox\) : 0\) \+ theirCount\('inbox'\) \+ leadCount \+ sharedFileNews\.length \+ followingNews\.length/);
  });
});
