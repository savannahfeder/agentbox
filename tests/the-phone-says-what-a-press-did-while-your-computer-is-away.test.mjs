// THE PHONE SAYS WHAT A PRESS DID WHILE YOUR COMPUTER IS AWAY (w-e4d49a1539).
//
// The 2026-11-02 phone workday, with the computer offline for the whole day:
// - Run now said "Up next. It starts as soon as an agent is free" (issue 11,
//   logged 3 times), so a tester waited for capacity instead of waking the Mac.
// - A new thread said "Started in Website" and sat under In progress (issue
//   29): it had started nothing.
// - Closing a thread the computer had not taken yet said "Done", and the
//   thread was nowhere afterwards, in Done or search (issue 33): it had been
//   withdrawn before it ever reached the computer.
// - Do here's toast opened the proposal as a thread when tapped (issue 25),
//   while the work was going on in the thread on screen.
import { describe, it, expect } from 'vitest';
import { planFor } from '../mobile/src/lib/actions';

const NOW = Date.parse('2026-11-03T20:00:00Z');
const item = { product: 'site@dev', id: 'w-1', status: 'open', title: 'Rate limiter', productName: 'Website' };
const away = { away: true, cloud: false };

describe('Run now', () => {
  it('while the computer is away, says it runs when the computer is back', () => {
    expect(planFor({ kind: 'run-now' }, item, NOW, away).toast).toBe('Up next once your computer is back.');
  });
  it('while the computer is here, says it waits for a free agent, as before', () => {
    expect(planFor({ kind: 'run-now' }, item, NOW).toast).toBe('Up next. It starts as soon as an agent is free.');
  });
  it('with Agentbox Cloud carrying on, waits for a free agent there too', () => {
    expect(planFor({ kind: 'run-now' }, item, NOW, { away: true, cloud: true }).toast).toBe('Up next. It starts as soon as an agent is free.');
  });
});

describe('a new thread', () => {
  const press = { kind: 'new', product: 'site@dev', text: 'Check the slowest endpoint', to: 'Website' };
  it('while the computer is away, says it waits for it rather than that it started', () => {
    expect(planFor(press, null, NOW, away).toast).toBe('Waiting for your computer in Website · Z to undo');
  });
  it('while the computer is here, started, as before', () => {
    expect(planFor(press, null, NOW).toast).toBe('Started in Website · Z to undo');
  });
  it('sent for tomorrow morning from Send later says when, away or not (round 1 of the 2026-11-03 testers)', () => {
    const at = new Date(NOW); const tomorrow8 = new Date(at.getFullYear(), at.getMonth(), at.getDate() + 1, 8, 0).getTime();
    expect(planFor({ ...press, choices: { runAt: tomorrow8 } }, null, NOW, away).toast).toBe('Scheduled in Website · tomorrow 8:00am · Z to undo');
    expect(planFor({ ...press, choices: { runAt: tomorrow8 } }, null, NOW).toast).toBe('Scheduled in Website · tomorrow 8:00am · Z to undo');
  });
  it('scheduled or added to Later says that whatever the computer is doing', () => {
    expect(planFor({ ...press, when: 'tomorrow 8:00am' }, null, NOW, away).toast).toBe('Scheduled in Website · tomorrow 8:00am · Z to undo');
    expect(planFor({ ...press, choices: { start: 'later' } }, null, NOW, away).toast).toBe('Added to Later in Website · Z to undo');
  });
});

describe('closing', () => {
  it('a thread the computer never took says it was withdrawn, with no Undo to promise', () => {
    const plan = planFor({ kind: 'close' }, { ...item, waitsForMac: true }, NOW, away);
    expect(plan.toast).toBe('Withdrawn: Rate limiter. It never reached your computer. · press Z to undo');
    // Names no thread, since there is none to open, so the toast wraps whole rather than cut to one line.
    expect(plan.goes).toBeNull();
  });
  it('a withdrawn thread comes back with Undo, sent again with what it had (round 3, issue 3)', () => {
    const plan = planFor({ kind: 'close' }, { ...item, waitsForMac: true, body: 'Add a rate limiter to the login handler.', runAt: NOW + 3600_000, priority: 3 }, NOW, away);
    expect(plan.undo({ ok: true })).toEqual([{ door: 'compose', payload: { product: 'site@dev', title: 'Rate limiter', body: 'Add a rate limiter to the login handler.', kind: 'directive', priority: 3, runAt: NOW + 3600_000 } }]);
  });
  it('a thread the computer has says Done, with Undo, as before', () => {
    const plan = planFor({ kind: 'close' }, item, NOW, away);
    expect(plan.toast).toMatch(/^Done: Rate limiter/);
    expect(plan.undo).toBeTypeOf('function');
  });
});

describe('Do here', () => {
  it('names the thread doing the work, so tapping the toast stays there', () => {
    const child = { id: 'w-2', product: 'site@dev', title: 'Add a report button', parent: 'w-1' };
    const plan = planFor({ kind: 'do-here', child, parent: { id: 'w-1', product: 'site@dev', status: 'open' } }, { ...child, status: 'open' }, NOW);
    expect(plan.goes).toEqual({ product: 'site@dev', id: 'w-1' });
  });
});

describe('a reply', () => {
  it('while the computer is away, says it waits for it rather than that it was sent (round 3, issue 8)', () => {
    expect(planFor({ kind: 'reply', text: 'Use a token bucket' }, item, NOW, away).toast).toMatch(/^Waiting for your computer → Website/);
  });
  it('while the computer is here, Sent, as before', () => {
    expect(planFor({ kind: 'reply', text: 'Use a token bucket' }, item, NOW).toast).toMatch(/^Sent → Website/);
  });
});
