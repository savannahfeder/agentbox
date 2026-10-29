// "@Felix take the xss and the silent booking failure first" was typed as a
// reply in an ordinary thread in the second power test. The thread's own agent
// did the work, Felix never heard, and later two agents fixed the same bug on
// two branches. A reply or task that names a teammate with @ now tells the
// thread's agent to hand that part over with team_pass and not do it itself.
// A teammate's own run is left alone: your message already woke whoever it
// named, so a hint there would hand the same work over twice.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';

const FELIX = { id: 't-felix00001', name: 'Felix', status: 'active' };
const DRAFT = { id: 't-draft00001', name: 'Iris', status: 'draft' };
const make = () => new Supervisor(
  { storeRoot: fs.mkdtempSync(path.join(os.tmpdir(), 'zero-named-mate-')), maxConcurrentSessions: 1, alphaTeammates: true },
  { listItems: () => [], listProducts: () => [], isDue: () => true, readItem: () => null, teammates: { list: () => [FELIX, DRAFT] } },
  '/tmp',
);
const thread = { id: 'w-1', product: 'p', title: 'Web app bugs', labels: ['founder'] };

describe('a teammate named in a thread', () => {
  it('tells the thread\'s agent to hand that part to it', () => {
    const block = make().namedThreadsBlock(thread, { slug: 'p' }, ['@Felix take the xss first, then cors']);
    expect(block).toMatch(/Felix/);
    expect(block).toMatch(/team_pass/);
    expect(block).toMatch(/do not do that part yourself/);
  });

  // "@Felix learn from this thread" is how a thread that went well teaches a
  // teammate: the hand-off carries this thread's id, and the teammate's run is
  // given the thread whole (a-teammate-works-from-one-method...).
  it('tells the thread\'s agent to put this thread\'s id in the hand-off', () => {
    const block = make().namedThreadsBlock(thread, { slug: 'p' }, ['@Felix learn how I want bugs filed from this thread']);
    expect(block).toContain('w-1');
    expect(block).toMatch(/learn from this thread/);
  });

  it('says nothing for a name that is no started teammate, an email, or no name at all', () => {
    const sup = make();
    expect(sup.namedThreadsBlock(thread, { slug: 'p' }, ['@Iris write the article'])).toBe('');
    expect(sup.namedThreadsBlock(thread, { slug: 'p' }, ['mail felix@example.com about it'])).toBe('');
    expect(sup.namedThreadsBlock(thread, { slug: 'p' }, ['fix the cors error'])).toBe('');
  });

  it('says nothing on a teammate\'s own run', () => {
    const run = { ...thread, labels: ['founder', 'teammate:t-ada000001', 'hop:0'] };
    expect(make().namedThreadsBlock(run, { slug: 'p' }, ['@Felix can take the fix'])).toBe('');
  });

  it('reaches a reply that lands while the agent is working, too', () => {
    const sup = make();
    sup.store.listProducts = () => [{ slug: 'p', dir: '/tmp/none' }];
    expect(sup.replyFiles('p', '@Felix take this one').block).toMatch(/team_pass/);
  });
});
