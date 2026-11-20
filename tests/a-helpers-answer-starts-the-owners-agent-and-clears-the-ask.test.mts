// A HELPER'S ANSWER STARTS THE OWNER'S AGENT AND CLEARS THE ASK (2026-11-20).
//
// Rerun on two copies, read off their ledgers and the stand-in's cards:
// - Sam answered Theo's step at 02:08 and Theo's agent never ran. Theo's
//   thread is in the project he shares, where only lines of Theo's own may
//   start a run (mayRunHere), and the answer line was written as Sam's.
// - Priya opened Lena's help ask and got plain options and "Comment to
//   Lena": Lena's agent had run again after the ask and written the same
//   wait itself, which made the ask look stale (the wait was newer), so the
//   card carried no "help" and Priya's comment stayed a comment.
// - After Theo answered Sam's step on the thread, Sam's ask still sat at the
//   top of Theo's Needs you, from their chat.
// - Sam could not tell whose pick "Picked …" on his own thread was.
// Measured on two copies over the in-memory cloud, the ask rule, the chat's
// Needs you rule and the pick's line.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { askWords, askedOf, askedPatch, askedThread } from '../shared/thread-ask.mts';
import { personWait } from '../shared/thread-waits.mts';
import { mayRunHere } from '../shared/team-rules.mts';
import { groupRow } from '../shared/room-needs-you.mts';
import { actWords } from '../renderer/src/act-line.ts';
import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createTeamService } from '../main/team/index.mts';
import { memorySession } from '../main/team/session.mts';

describe('an ask the agent wrote the wait of again', () => {
  const at = 1_000;
  const base = { status: 'open', ...askedPatch(['p-priya'], 'Asked Priya', at, 'help') };
  it('is still the ask while the wait names them', () => {
    const mirrored = { ...base, wrote: { blockedBy: { source: 'agent', ts: at + 30 }, asked: { source: 'founder', ts: at } } };
    expect(askedOf(mirrored)?.want).toBe('help');
  });
  it('is over once the wait no longer names them', () => {
    expect(askedOf({ ...base, blockedBy: [personWait('p-jun')], wrote: { blockedBy: { source: 'founder', ts: at + 30 }, asked: { source: 'founder', ts: at } } })).toBeNull();
  });
});

describe('the ask in the helper\'s chat', () => {
  const body = askWords({ want: 'help', title: 'Idempotency key', link: 'https://app.agentbox.ac/t/p-sam/w-0000000abc', note: 'Look at this step?' });
  const ask = { id: 'm-1', by: 'p-sam', at: 1000, body };
  it('names the thread it is about', () => {
    expect(askedThread(body)).toEqual({ owner: 'p-sam', id: 'w-0000000abc' });
    expect(askedThread('Hey, look at https://app.agentbox.ac/t/p-sam/w-0000000abc')).toBeNull();
  });
  it('leaves Needs you once answered on that thread', () => {
    const row = (answered: boolean) => groupRow({ roomId: 'r', roomName: 'Sam', messages: [ask], me: 'p-theo', pair: true, answeredOnItsThread: () => answered });
    expect(row(false)?.messageId).toBe('m-1');
    expect(row(true)).toBeNull();
  });
  it('is answered by a comment of mine on that thread after it, read from the comments the copy holds', () => {
    const rooms = fs.readFileSync(new URL('../main/team/rooms.mts', import.meta.url), 'utf8');
    expect(rooms).toContain("return !!on && talk.some((t) => t.kind === 'comment' && t.by === who && t.owner === on.owner && t.threadId === on.id && (t.at ?? 0) > m.at);");
    expect(fs.readFileSync(new URL('../main/team/index.mts', import.meta.url), 'utf8')).toContain('threadTalk: () => threadShare?.talk() ?? []');
  });
});

describe('a pick on a team thread', () => {
  it('says whose it was, yours too', () => {
    expect(actWords({ verb: 'You picked option 1', subject: 'Postgres' }, 'You').lead).toBe('You picked');
    expect(actWords({ verb: 'You picked option 1', subject: 'Postgres' }, 'Theo').lead).toBe('Theo picked');
    const thread = fs.readFileSync(new URL('../renderer/src/components/Thread.tsx', import.meta.url), 'utf8');
    expect(thread).toContain("team && /^You picked option \\d+$/.test(act.verb) ? 'You' : null");
  });
});

describe('in a project the owner shares', () => {
  async function aMac(cloud: ReturnType<typeof createMemoryCloud>, personId: string) {
    const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'help-runs-'));
    const accountRoot = path.join(storeRoot, 'accounts', 'a');
    fs.mkdirSync(path.join(accountRoot, 'api'), { recursive: true });
    fs.writeFileSync(path.join(accountRoot, 'api', 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'api', name: 'Payments API' }));
    const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
    const service = createTeamService({ session: memorySession(() => memoryBackend(cloud, personId)), store, disk, accountRoot, stateFile: path.join(storeRoot, '.team-sync.json'), intervalMs: 3_600_000 });
    return { personId, store, service };
  }
  let theo: Awaited<ReturnType<typeof aMac>>;
  let sam: Awaited<ReturnType<typeof aMac>>;
  const both = async () => { for (let k = 0; k < 3; k += 1) { await theo.service.syncNow(); await sam.service.syncNow(); } };
  beforeEach(async () => {
    disk._internals.forgetFolds();
    const cloud = createMemoryCloud();
    theo = await aMac(cloud, signUpMemory(cloud, { email: 'theo@nw.test', name: 'Theo Okafor' }));
    sam = await aMac(cloud, signUpMemory(cloud, { email: 'sam@nw.test', name: 'Sam Ortiz' }));
    await theo.service.signIn();
    await theo.service.createTeam('Northwind');
    await theo.service.invite('sam@nw.test');
    await sam.service.signIn();
    await sam.service.acceptInvite(theo.service.state().team.id);
    disk.setLineAuthor(theo.personId);
    await theo.service.share('api', { visibility: 'team' });
  });
  afterEach(async () => { disk.setLineAuthor(null); await theo.service.signOut(); await sam.service.signOut(); });

  it('the helper\'s answer may start the owner\'s agent on the owner\'s Mac', async () => {
    const t = theo.store.composeItem('api', { title: 'Unvalidated payments API routes', body: 'Find the routes with no validation.', visibility: 'team' });
    theo.store.recordSessionResult('api', t.id, { result: 'How should validation be added?\n\n## Options\n1. Hand-written checks\n2. A schema library' });
    theo.store.threadEdit('api', t.id, askedPatch([sam.personId], 'Asked Sam', Date.now() - 1000, 'help'));
    await both();
    await sam.service.commentOnThread(theo.personId, t.id, 'Hand-written checks please (option 1)');
    await both();
    const row = theo.store.readItem('api', t.id);
    const product = theo.store.listProducts().find((p: { slug: string }) => p.slug === 'api');
    expect(row.answer).toBe('Hand-written checks please (option 1)');
    expect(row.wrote.answer.by).toBe(theo.personId);
    expect(mayRunHere(row, product, theo.personId)).toBe(true);
  });
});
