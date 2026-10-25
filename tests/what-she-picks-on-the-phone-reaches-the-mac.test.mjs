// WHAT SHE PICKS ON THE PHONE REACHES THE MAC.
//
// What broke (found reading the code, 2026-10-19): a phone command carried a
// reply's words and a new thread's title and body, nothing else. A new thread
// set to start later or at a time, on another model, engine or effort, at a
// priority, or given to a teammate, was started at once on the default; the
// toast had already said "Added to Later". A reply's mode, priority and model
// were thrown away, and a reply to a scheduled thread left it scheduled.
//
// Now the phone sends what she picked, checked, and the Mac hands the checked
// fields, and only those, to the same handlers the window uses.
import { describe, it, expect } from 'vitest';
import { commandFor, phoneSlug } from '../renderer/src/cloud-bridge';
import { phoneChoices } from '../shared/phone-snapshot.mjs';
import { applyThrough } from '../main/phone-inbox.mjs';

const DEV = 'a1b2c3d4e5f6';
const A = phoneSlug(DEV, 'alpha');
const AT = Date.parse('2026-10-20T09:00:00Z');

describe('a new thread from the phone', () => {
  it('carries when it starts, its engine, model, effort and priority, and who it is for', () => {
    const cmd = commandFor('zero:compose', { product: A, title: 'T', body: 'B', runAt: AT, engine: 'codex', model: 'gpt-6.1-sol', effort: 'high', priority: 7, assignee: 'p-2', due: '2026-10-21', visibility: 'people', visibleTo: ['p-2'] });
    expect(cmd.payload).toEqual({ title: 'T', body: 'B', runAt: AT, engine: 'codex', model: 'gpt-6.1-sol', effort: 'high', priority: 7, assignee: 'p-2', due: '2026-10-21', visibility: 'people', visibleTo: ['p-2'] });
    expect(commandFor('zero:compose', { product: A, title: 'T', start: 'later' }).payload).toEqual({ title: 'T', body: '', start: 'later' });
  });

  it('a plain one is what it always was', () => {
    expect(commandFor('zero:compose', { product: A, title: 'T', body: 'B', kind: 'directive' }).payload).toEqual({ title: 'T', body: 'B' });
  });
});

describe('a reply from the phone', () => {
  it('carries its mode, priority, model, effort and "now"', () => {
    expect(commandFor('zero:answer', { product: A, id: 'w-1', answer: 'go', permissionMode: 'plan', priority: 3, model: 'opus', effort: 'max', now: true }).payload)
      .toEqual({ text: 'go', permissionMode: 'plan', priority: 3, model: 'opus', effort: 'max', now: true });
    // Cleared is not the same as untouched.
    expect(commandFor('zero:answer', { product: A, id: 'w-1', answer: 'go', permissionMode: null, model: null }).payload).toEqual({ text: 'go', permissionMode: null, model: null });
  });
});

describe('what the Mac takes of it', () => {
  it('only fields of the right shape, whatever the phone sent', () => {
    expect(phoneChoices('new', { runAt: 'soon', start: 'whenever', engine: 'x'.repeat(200), priority: 99, visibility: 'everyone', visibleTo: 'p-2', model: 5, extra: 1, labels: ['ship'] })).toEqual({});
    expect(phoneChoices('reply', { now: 'yes', permissionMode: 'rm -rf /', priority: -1, status: 'done' })).toEqual({});
    expect(phoneChoices('reply', { now: true, priority: 0 })).toEqual({ now: true, priority: 0 });
  });

  it('hands them to the window\'s own handlers, and a reply to a scheduled thread clears its schedule', async () => {
    const calls = [];
    const channels = new Map(['zero:answer', 'zero:compose', 'zero:schedule'].map((c) => [c, async (_e, args) => { calls.push([c, args]); return { ok: true, id: 'w-new' }; }]));
    const apply = applyThrough(channels);
    await apply({ id: 'c1', kind: 'new', project: 'alpha', item: null, payload: { title: 'T', body: '', start: 'later', model: 'opus', labels: ['ship'] } });
    await apply({ id: 'c2', kind: 'reply', project: 'alpha', item: 'w-1', payload: { text: 'go', permissionMode: 'plan', unschedule: true } });
    await apply({ id: 'c3', kind: 'reply', project: 'alpha', item: 'w-2', payload: { text: 'go' } });
    expect(calls).toEqual([
      ['zero:compose', { product: 'alpha', title: 'T', body: '', fromPhone: 'c1', start: 'later', model: 'opus' }],
      ['zero:answer', { product: 'alpha', id: 'w-1', answer: 'go', fromPhone: 'c2', permissionMode: 'plan' }],
      ['zero:schedule', { product: 'alpha', id: 'w-1', runAt: 0 }],
      ['zero:answer', { product: 'alpha', id: 'w-2', answer: 'go', fromPhone: 'c3' }],
    ]);
  });
});
