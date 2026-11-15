// A TEAMMATE'S ASSIGNEE LINE STARTS NOTHING ON YOUR MAC.
//
// A teammate's pulled line may set `assignee`, and it keeps the source the
// teammate put on it. The 2026-11-10 security audit sent one line,
// {source:'founder', patch:{assignee:'agent'}}, onto a row whose finished
// answer was waiting on its owner and which was held after six dead starts:
// the row became fresh work again and the hold lifted, so the owner's Mac
// started an agent nobody there asked for, and the same line could lift the
// hold again each time. A row the owner gave to that teammate ran on the
// owner's Mac when the teammate pressed "Give it to an agent". Now `assignee`
// counts among the fields only you start a run with, and only your own
// writes count as your word.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { mayRunHere } from '../shared/team-rules.mts';
import { Supervisor, awaitingHer } from '../main/supervisor.mts';

const ME = 'p-me';
const MAYA = 'p-maya';
const T0 = Date.parse('2026-11-10T12:00:00Z');
const shared = { slug: 'p', team: { projectId: 'proj-1' } };
const mine = (extra: Record<string, unknown> = {}) => ({
  id: 'w-1', product: 'p', title: 'w-1', kind: 'task', status: 'open', labels: ['founder'], createdBy: ME,
  body: 'Plan the launch.', wrote: { body: { ts: T0, source: 'founder', by: ME } }, ...extra,
});
const withWrite = (item: ReturnType<typeof mine>, field: string, w: Record<string, unknown>, value?: unknown) =>
  ({ ...item, ...(value !== undefined ? { [field]: value } : {}), wrote: { ...item.wrote, [field]: w } });

let before: string | undefined;
beforeEach(() => { before = process.env.AGENTBOX_PERSON_ID; process.env.AGENTBOX_PERSON_ID = ME; });
afterEach(() => { if (before === undefined) delete process.env.AGENTBOX_PERSON_ID; else process.env.AGENTBOX_PERSON_ID = before; });

describe('a row a teammate gave back to an agent', () => {
  it('does not run on your Mac when the teammate wrote the assignee', () => {
    const given = withWrite(mine(), 'assignee', { ts: T0 + 1, source: 'founder', by: MAYA }, 'agent');
    expect(mayRunHere(given, shared, ME)).toBe(false);
  });

  it('runs on your Mac when you gave it to the agent yourself', () => {
    const given = withWrite(mine(), 'assignee', { ts: T0 + 1, source: 'founder', by: ME }, 'agent');
    expect(mayRunHere(given, shared, ME)).toBe(true);
  });
});

describe('an answer waiting on you', () => {
  const answered = withWrite(mine(), 'result', { ts: T0 + 10, source: 'agent' }, 'Here is the plan.');

  it('still waits when a teammate writes a founder line on it', () => {
    expect(awaitingHer(withWrite(answered, 'assignee', { ts: T0 + 20, source: 'founder', by: MAYA }, 'agent'))).toBe(true);
  });

  it('is answered by your own word', () => {
    expect(awaitingHer(withWrite(answered, 'answer', { ts: T0 + 20, source: 'founder', by: ME }, 'Go on.'))).toBe(false);
  });

  it('is answered by a word written before anyone signed in, which is yours', () => {
    expect(awaitingHer(withWrite(answered, 'answer', { ts: T0 + 20, source: 'founder' }, 'Go on.'))).toBe(false);
  });
});

describe('a thread held after six dead starts', () => {
  let root: string; let now: number; const realNow = Date.now;
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'held-')); now = T0; Date.now = () => now; });
  afterEach(() => { Date.now = realNow; fs.rmSync(root, { recursive: true, force: true }); });

  const held = () => {
    const sup = new Supervisor({ storeRoot: root, home: root, maxConcurrentSessions: 1, authProfiles: ['default'] },
      { listItems: () => [], listProducts: () => [], isDue: () => true }, root, root, root);
    const item = mine();
    for (let i = 0; i < 6; i += 1) {
      now += 15_000;
      sup._noteHowTheRunStarted(item, { itemId: item.id, product: 'p', startedAt: now - 800, sessionId: null, result: null, tail: ['stderr: died'] });
    }
    expect(sup._heldFromStarting(item)).toBe(true);
    return { sup, item };
  };

  it('stays held when a teammate writes a founder line on it', () => {
    const { sup, item } = held();
    now += 60_000;
    expect(sup._heldFromStarting(withWrite(item, 'assignee', { ts: now, source: 'founder', by: MAYA }, 'agent'))).toBe(true);
  });

  it('lets go when you write on it', () => {
    const { sup, item } = held();
    now += 60_000;
    expect(sup._heldFromStarting(withWrite(item, 'answer', { ts: now, source: 'founder', by: ME }, 'Try again.'))).toBe(false);
  });
});
