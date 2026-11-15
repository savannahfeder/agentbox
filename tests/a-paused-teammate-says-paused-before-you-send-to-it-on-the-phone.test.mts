// A PAUSED TEAMMATE SAYS PAUSED BEFORE YOU SEND TO IT ON THE PHONE.
//
// The 2026-11-07 phone workday (issue 29): New thread > To > Growth lead, a
// paused teammate, then Send. Nothing in the picker said paused, and the toast
// "Sent to Growth lead" read as done; only its chat said "Your messages wait
// until you resume it". Measured in the phone preview's To sheet.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

describe('sending to a paused teammate from New thread', () => {
  const src = fs.readFileSync('mobile/src/ui/NewThreadForm.tsx', 'utf8');
  it('the To sheet says Paused beside it, before Primary or its role', () => {
    expect(src).toMatch(/aside=\{t\.paused \? 'Paused' : t\.primary \? 'Primary' : roleOf\(t\) \?\? undefined\}/);
  });
  it('the toast says the message waits until you resume it', () => {
    expect(src).toMatch(/mate\.paused \? `Sent to \$\{mate\.name\}, who is paused\. It waits until you resume it in Chats\.` : `Sent to \$\{mate\.name\}`/);
  });
});
