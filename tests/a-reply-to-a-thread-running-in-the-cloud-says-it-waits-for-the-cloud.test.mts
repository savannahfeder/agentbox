// A REPLY TO A THREAD RUNNING IN THE CLOUD SAYS IT WAITS FOR THE CLOUD (w-e4d49a1539).
//
// 2026-11-02 phone workday, issue 37: "Draw the sign-in screen" showed
// "Drawing the third screen, 13m, in the cloud", while the reply under it said
// "Waiting for your computer" with a Send now button. A thread live in Agentbox
// Cloud takes its replies from there, and Send now goes to the computer, so
// both told the tester the wrong place. Before the cloud takes it, the reply
// now says it waits for Agentbox Cloud, with no Send now.
import { describe, it, expect } from 'vitest';
import { phoneView, phoneSlug } from '../renderer/src/phone-rows';
import { threadOf } from '../mobile/src/lib/thread';

const NOW = Date.parse('2026-11-03T20:00:00Z');
const DEV = 'a1b2c3d4e5f6';
const A = phoneSlug(DEV, 'alpha');
const iso = (ms) => new Date(ms).toISOString();
const id = 'w-cccc000001';
const thread = (live) => ({ device: DEV, project: 'alpha', item: id, updated_at: iso(NOW - 60_000), snapshot: { v: 3, olderLines: 0, history: [],
  item: { id, kind: 'directive', labels: ['founder'], priority: 0, title: 'Draw the sign-in screen', status: 'claimed', body: 'Draw five.', createdAt: NOW - 3600_000, updatedAt: NOW - 60_000, wrote: { body: { ts: NOW - 3600_000, source: 'founder' } } },
  ...(live ? { live } : {}) } });
const reply = { id: 'c-reply', device: DEV, project: 'alpha', item: id, kind: 'reply', payload: { text: 'Use the dark wall on all five.' }, created_at: iso(NOW - 30_000), claimed_at: null, taken_at: null, outcome: null };
const replyOn = (live) => {
  const rows = { projects: [{ device: DEV, project: 'alpha', name: 'Alpha', updated_at: iso(NOW - 3600_000) }], threads: [thread(live)], commands: [reply] };
  return threadOf(rows, phoneView(rows, NOW), A, id).events.find((e) => e.text === 'Use the dark wall on all five.');
};

describe('a reply the cloud has not taken yet', () => {
  it('on a thread running in Agentbox Cloud, waits for the cloud', () => {
    expect(replyOn({ at: NOW - 5_000, since: NOW - 780_000, where: 'cloud', doing: [] })).toMatchObject({ pending: true, toCloud: true });
  });
  it('on a thread running on the computer, waits for the computer, as before', () => {
    expect(replyOn({ at: NOW - 5_000, since: NOW - 780_000, doing: [] }).toCloud).toBeFalsy();
  });
  it('on a thread nothing is running, waits for the computer, as before', () => {
    expect(replyOn(null).toCloud).toBeFalsy();
  });
});
