// A REPLY TO A THREAD RUNNING IN THE CLOUD SAYS THE CLOUD TAKES IT.
//
// 2026-11-08 product-loop workday, issue 14: in a thread running in Agentbox
// Cloud, each reply was tagged "Waiting for Agentbox Cloud" while the toast
// over it said "Waiting for your computer → Agentbox", so the tester could not
// tell where the reply was going. The toast read only whether the computer was
// away, never where this thread runs.
import { describe, it, expect } from 'vitest';
import { planFor } from '../mobile/src/lib/actions';

const NOW = Date.parse('2026-11-09T13:00:00Z');
const item = { product: 'agentbox', id: 'w-aaaa000001', status: 'open', title: 'Draw the sign-in screen', productName: 'Agentbox' };
const reply = { kind: 'reply' as const, text: 'only do the quiet one' };

describe('the toast after a reply', () => {
  it('names the cloud when the thread runs there and the computer is away', () => {
    expect(planFor(reply, item, NOW, { away: true, inCloud: true })?.toast).toMatch(/^Waiting for Agentbox Cloud → Agentbox · /);
  });

  it('names the cloud when the thread runs there and the computer is on', () => {
    expect(planFor(reply, item, NOW, { away: false, inCloud: true })?.toast).toMatch(/^Waiting for Agentbox Cloud → Agentbox · /);
  });

  it('still waits for the computer when the thread does not run in the cloud', () => {
    expect(planFor(reply, item, NOW, { away: true })?.toast).toMatch(/^Waiting for your computer → Agentbox · /);
  });

  it('says sent when the computer is on and the thread is its', () => {
    expect(planFor(reply, item, NOW, { away: false })?.toast).toMatch(/^Sent → Agentbox · /);
  });
});
