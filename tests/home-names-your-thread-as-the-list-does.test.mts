// HOME NAMES YOUR THREAD AS THE LIST DOES (w-34443a206b).
//
// A tester on 2026-11-22 saw one thread under two names for about a minute:
// the inbox list had its new name and Home's "You" card the old one. On a
// team, that card says what your newest agent is on from the room's copy of
// you, which main rebuilds once a minute and named by `label || title`
// rather than by the rule every row uses. Home now names the thread from the
// thread itself, and main's copy uses the row's rule. Measured on the helper
// App.tsx hands Home's cards through, and on main/team/rooms.mts.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { withMyThreadNamed } from '../renderer/src/team/everything/members.ts';

const read = (f: string) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');
const card = (over: Record<string, unknown>) => ({ id: 'u-me', name: 'Me', me: true, avatarUrl: null, agents: 1, workingOn: 'add a rate limter', workingPrivate: false, workingThread: 'w-1', status: null, ...over });
const items = [{ id: 'w-1', title: 'add a rate limter', label: 'Rate limit the login', wrote: { label: { ts: 2, source: 'agent' } } }];

describe('your card on Home', () => {
  it('names the thread your agent is on by the name its row has now', () => {
    expect(withMyThreadNamed([card({})], items)[0].workingOn).toBe('Rate limit the login');
  });

  it('leaves a teammate\'s card, a card on no thread, and a thread this Mac cannot see alone', () => {
    const mate = card({ id: 'u-mate', me: false });
    expect(withMyThreadNamed([mate], items)[0].workingOn).toBe('add a rate limter');
    expect(withMyThreadNamed([card({ workingThread: null })], items)[0].workingOn).toBe('add a rate limter');
    expect(withMyThreadNamed([card({ workingThread: 'w-gone' })], items)[0].workingOn).toBe('add a rate limter');
    expect(withMyThreadNamed(null, items)).toBeNull();
  });

  it('is what App hands Home', () => {
    expect(read('renderer/src/App.tsx')).toMatch(/wall: withMyThreadNamed\(teamRoom\?\.wall \?\? null, items\)/);
  });
});

describe('the room\'s own copy of you', () => {
  it('names your thread by the row\'s rule', () => {
    const own = read('main/team/rooms.mts');
    const fn = own.slice(own.indexOf('function ownWork()'), own.indexOf('const local = () =>'));
    expect(fn).toMatch(/shownTitle\(item/);
    expect(fn).not.toMatch(/item\?\.label \?\? ''\)\.trim\(\) \|\| String\(item\?\.title/);
  });
});
