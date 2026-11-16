// A REPORTED CHAT MESSAGE HIDES ONLY ONCE THE REPORT IS SENT (w-47416cec15).
//
// 2026-11-15, the phone testers on the App Store build: a new user opened
// Report message on a harmless message, backed out without sending, and the
// message was gone from the chat. Groups.tsx hid it the moment Report was
// tapped. It now hides when the report reaches the feedback inbox.
import fs from 'node:fs';
import { describe, it, expect } from 'vitest';
import { messageToHide } from '../mobile/src/lib/chat-safety';

describe('which message a sent report hides', () => {
  it('a message report hides that message', () => {
    expect(messageToHide({ kind: 'message', ref: 'r-1/m7', title: 'A message', answer: 'x' })).toBe('m7');
  });
  it('a thread report hides nothing in a chat', () => {
    expect(messageToHide({ kind: 'thread', ref: 'agentbox/w-1', title: 'T', answer: 'A' })).toBeNull();
    expect(messageToHide({ ref: 'agentbox/w-1', title: 'T', answer: 'A' })).toBeNull();
  });
  it('plain feedback hides nothing', () => {
    expect(messageToHide(null)).toBeNull();
  });
});

describe('when it hides', () => {
  const src = (p: string) => fs.readFileSync(new URL(`../mobile/src/${p}`, import.meta.url), 'utf8');
  it('not when Report is tapped', () => {
    const report = src('ui/Groups.tsx').match(/const report = \(m: RoomMessage\) => \{[\s\S]*?\n {2}\};/)?.[0] ?? '';
    expect(report).toContain('/settings/feedback');
    expect(report).not.toContain('hideReported');
  });
  it('after the report is sent', () => {
    const page = src('ui/FeedbackPage.tsx');
    expect(page).toMatch(/if \(out\.ok\) \{[^}]*hideReported\(/);
  });
});
