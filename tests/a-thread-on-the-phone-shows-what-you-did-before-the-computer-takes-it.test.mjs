// A THREAD ON THE PHONE SHOWS WHAT YOU DID BEFORE THE COMPUTER TAKES IT (w-e4d49a1539).
//
// The 2026-11-02 phone workday, computer offline, rechecked on main 2026-11-03:
// - A thread sent from the phone opened to its title and "Queued", with the
//   message you wrote nowhere on it (issue 22, logged 4 times).
// - Allowing or denying a permission card made the card vanish and left no
//   trace in its thread, so after an interruption you could not check what you
//   had decided (issue 26).
// Both now show at once, drawn from the command waiting for the computer, as
// replies already were.
import { describe, it, expect } from 'vitest';
import { phoneView, phoneSlug } from '../renderer/src/phone-rows';
import { madeHere } from '../shared/phone-snapshot.mjs';
import { threadOf } from '../mobile/src/lib/thread';

const NOW = Date.parse('2026-11-03T20:00:00Z');
const DEV = 'a1b2c3d4e5f6';
const A = phoneSlug(DEV, 'alpha');
const iso = (ms) => new Date(ms).toISOString();
const projects = [{ device: DEV, project: 'alpha', name: 'Alpha', updated_at: iso(NOW - 3600_000) }];
const cmd = (over) => ({ id: 'c0ffee00-0000-4000-8000-000000000001', device: DEV, project: 'alpha', item: null, payload: {}, created_at: iso(NOW - 60_000), claimed_at: null, taken_at: null, outcome: null, ...over });
const open = (rows, id) => threadOf(rows, phoneView(rows, NOW), A, id);
const yours = (t) => t.events.filter((e) => e.who === 'you');

describe('a thread sent from the phone', () => {
  const sent = cmd({ kind: 'new', payload: { title: 'Rate limiter', body: 'Add a rate limiter to the login endpoint, 5 tries a minute.' } });

  it('shows the message you wrote, waiting for your computer', () => {
    const t = open({ projects, threads: [], commands: [sent] }, madeHere(sent.id));
    expect(yours(t)).toMatchObject([{ text: 'Add a rate limiter to the login endpoint, 5 tries a minute.', pending: true }]);
  });

  it('once the computer has its own copy, shows that copy and not a second message', () => {
    const taken = { ...sent, taken_at: iso(NOW - 30_000), outcome: 'ok' };
    const id = madeHere(sent.id);
    const thread = { device: DEV, project: 'alpha', item: id, updated_at: iso(NOW - 20_000), snapshot: { v: 3, olderLines: 0,
      item: { id, kind: 'directive', labels: ['founder'], priority: 0, title: 'Rate limiter', body: sent.payload.body, status: 'open', createdAt: NOW - 60_000, updatedAt: NOW - 20_000, wrote: { body: { ts: NOW - 60_000, source: 'founder' } } },
      history: [{ id, ts: NOW - 60_000, source: 'founder', patch: { title: 'Rate limiter', body: sent.payload.body, status: 'open' } }] } };
    const t = open({ projects, threads: [thread], commands: [taken] }, id);
    expect(yours(t).filter((e) => e.text === sent.payload.body)).toHaveLength(1);
    expect(yours(t)[0].pending).toBeFalsy();
  });
});

describe('a permission card answered on the phone', () => {
  const id = 'w-bbbb000001';
  const thread = { device: DEV, project: 'alpha', item: id, updated_at: iso(NOW - 600_000), snapshot: { v: 3, olderLines: 0, history: [],
    item: { id, kind: 'directive', labels: ['founder'], priority: 0, title: 'Draw the sign-in screen', status: 'claimed', body: 'Draw it.', createdAt: NOW - 3600_000, updatedAt: NOW - 600_000, wrote: { body: { ts: NOW - 3600_000, source: 'founder' } } },
    approvals: [{ id: 'ap-1', card: 'card-0000-1', at: NOW - 300_000, tool: 'Bash', input: { command: 'npx eas-cli init --non-interactive', description: 'Link this folder to the Expo project' } }] } };
  const answered = (allow) => cmd({ id: 'c-approve', kind: 'approve', item: id, payload: { approval: 'ap-1', allow } });

  it('says in its thread that you allowed it', () => {
    const t = open({ projects, threads: [thread], commands: [answered(true)] }, id);
    expect(t.after).toContainEqual(expect.objectContaining({ verb: 'You allowed', subject: 'npx eas-cli init --non-interactive' }));
  });

  it('says in its thread that you denied it', () => {
    const t = open({ projects, threads: [thread], commands: [answered(false)] }, id);
    expect(t.after).toContainEqual(expect.objectContaining({ verb: 'You denied', subject: 'npx eas-cli init --non-interactive' }));
  });

  it('says nothing while it is still unanswered', () => {
    const t = open({ projects, threads: [thread], commands: [] }, id);
    expect(t.after.filter((a) => /^You (allowed|denied)$/.test(a.verb))).toEqual([]);
  });
});
