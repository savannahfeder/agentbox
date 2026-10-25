// A THREAD YOU NAME IS SUMMED UP FOR THE AGENT (w-c110f2371d).
//
// Naming a thread with # sends `[Its name](w-…)`. An agent handed only that
// had no way to read it: the store lists every thread at once (1,307 on one
// Mac), and nothing reads one by id. So the brief now carries each named
// thread's project, state, summary and last answer.
//
// Measured here: what the block says for a thread it can read, for one it
// cannot find, for the row's own id, for a message naming nothing, the cap on
// how many and how long, and that a thread fewer people can see than the row is
// never summed up into it (a team thread must not quote a private one).
import { describe, it, expect } from 'vitest';
import { namedThreadIds, namedThreadsBlock } from '../shared/named-threads.mjs';

const T = Date.parse('2026-10-20T14:02:00Z');
const team = { slug: 'agentbox-team', name: 'Agentbox Team' };
const solo = { slug: 'notes', name: 'Notes', personal: true };
const login = {
  id: 'w-a000000001', product: 'agentbox-team', title: 'Fix the login loop on the phone', label: 'Login loop on the phone', status: 'done', updatedAt: T,
  problem: 'The phone signed out every time it woke.', progress: 'Found the cookie was dropped\nKept it across wakes',
  result: 'Fixed: the phone keeps its sign-in across sleep.',
};
const diary = { id: 'w-a000000002', product: 'notes', title: 'Private diary', status: 'open', updatedAt: T, result: 'Secret words.' };
const rows = { [login.id]: { item: login, product: team }, [diary.id]: { item: diary, product: solo } };
const find = (id) => rows[id] ?? null;
const here = { id: 'w-a000000009', product: 'agentbox-team' };

const block = (text, row = here, product = team) => namedThreadsBlock({ texts: [text], row, product, find });

describe('which threads a message names', () => {
  it('reads links and bare ids, once each, in order, never the row itself', () => {
    expect(namedThreadIds([`Like [Login](${login.id}) and ${diary.id}, then [again](${login.id}) on ${here.id}.`], here.id))
      .toEqual([login.id, diary.id]);
  });
  it('leaves an id inside a path or an address alone', () => {
    expect(namedThreadIds([`see designs/${login.id}/a.png and https://x.test/${login.id}`], here.id)).toEqual([]);
  });
});

describe('the block in the brief', () => {
  it('is empty when the message names no thread', () => {
    expect(block('Make the reply box taller.')).toBe('');
  });
  it('sums up a named thread: its name, project, state, summary and last answer', () => {
    const out = block(`Do what [Login loop on the phone](${login.id}) did.`);
    expect(out).toContain('# The threads this message names');
    expect(out).toContain(`## Login loop on the phone (${login.id})`);
    expect(out).toContain('Agentbox Team, done, last moved 2026-10-20');
    expect(out).toContain('The phone signed out every time it woke.');
    expect(out).toContain('- Kept it across wakes');
    expect(out).toContain('Fixed: the phone keeps its sign-in across sleep.');
  });
  it('says so when the thread is not on this computer, rather than leaving the agent to guess', () => {
    expect(block('Read w-a00000000f first.')).toContain('## w-a00000000f\n\nNot on this computer');
  });
  it('never sums up a thread fewer people can see into a thread more people can see', () => {
    const out = block(`Use [Private diary](${diary.id}).`);
    expect(out).toContain(`## ${diary.id}`);
    expect(out).not.toContain('Secret words.');
    expect(out).not.toContain('Private diary');
  });
  it('does sum it up into a thread just as private', () => {
    expect(block(`Use [Private diary](${diary.id}).`, { id: 'w-a00000000a', product: 'notes' }, solo)).toContain('Secret words.');
  });
  it('cuts a long answer and stops after five threads', () => {
    const long = { ...login, id: 'w-a0000000aa', result: 'word '.repeat(800) };
    const many = Object.fromEntries(Array.from({ length: 7 }, (_, i) => [`w-b00000000${i}`, { item: { ...login, id: `w-b00000000${i}`, title: `T${i}`, label: `T${i}` }, product: team }]));
    const out = namedThreadsBlock({ texts: [`${long.id} ${Object.keys(many).join(' ')}`], row: here, product: team, find: (id) => (id === long.id ? { item: long, product: team } : many[id] ?? null) });
    expect(out.length).toBeLessThan(9000);
    expect(out).toContain('…');
    expect((out.match(/^## /gm) ?? []).length).toBe(5);
    expect(out).toContain('and 3 more');
  });
});
