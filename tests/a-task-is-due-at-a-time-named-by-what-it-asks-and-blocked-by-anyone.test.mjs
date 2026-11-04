// A TASK IS DUE AT A TIME, NAMED BY WHAT IT ASKS, AND BLOCKED BY ANYONE.
//
// Dev asked for "tomorrow 10am" and the task card only offered
// days. His task to Sofia, typed as "Task for Sofia: words for the seat picker
// ...", was titled "Task for Sofia": the title's first clause, cut at the
// colon. Maya wanted the double-booking fix "blocked by Jordan's answers", and
// Jordan, a freelancer, is not on the team, so the picker had no way to say it.
// Measured on the rules: `pickFields` dropped a due with a time, `shortTitle`
// of that line gave "Task for Sofia", and `taskBlocks` dropped any block that
// was not a person or a card.
import { describe, it, expect } from 'vitest';
import { pickFields } from '../shared/work-items.mjs';
import { dayDeadline, dueFromWords, dueSaid, taskTitle, taskBlocks, blockedWords, endedTaskBlocks } from '../shared/team-tasks.mjs';
import { nameWait, waitParts } from '../shared/thread-waits.mjs';
import { dueWords as cardDueWords } from '../renderer/src/threads/composer-rules.ts';
import { dueWords as rowDueWords } from '../renderer/src/team/company.ts';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mjs';
import { Store } from '../main/store.mts';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createTeamService } from '../main/team/index.mts';
import { memorySession } from '../main/team/session.mjs';

async function aMac(cloud, personId) {
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'task-fields-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  fs.mkdirSync(accountRoot, { recursive: true });
  const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  const service = createTeamService({ session: memorySession(() => memoryBackend(cloud, personId)), store, disk, accountRoot, stateFile: path.join(storeRoot, '.team-sync.json'), intervalMs: 3_600_000 });
  return { personId, store, service };
}

it('Dev\'s task to Sofia is named by what it asks, due at 10am and blocked on Jordan, on her Mac', async () => {
  disk._internals.forgetFolds();
  const cloud = createMemoryCloud();
  const dev = await aMac(cloud, signUpMemory(cloud, { email: 'dev@lumen.test', name: 'Dev Rao' }));
  const sofia = await aMac(cloud, signUpMemory(cloud, { email: 'sofia@lumen.test', name: 'Sofia Lin' }));
  await dev.service.signIn();
  await dev.service.createTeam('Lumen');
  await dev.service.invite('sofia@lumen.test');
  await sofia.service.signIn();
  await sofia.service.acceptInvite(dev.service.state().team.id);
  await dev.service.syncNow();
  const words = 'Task for Sofia: words for the seat picker when fewer than 20 seats are open';
  disk.setLineAuthor(dev.personId);
  let made;
  try { made = await dev.service.giveTask(sofia.personId, { title: words, body: words, due: '2026-11-01T10:00', blockedBy: [nameWait('Jordan')] }); } finally { disk.setLineAuthor(null); }
  await sofia.service.syncNow();
  const row = sofia.store.readItem(made.product, made.id);
  expect(row.title).toBe('Words for the seat picker');
  expect(row.due).toBe('2026-11-01T10:00');
  expect(row.blockedBy).toEqual(['name:Jordan']);
  await dev.service.signOut();
  await sofia.service.signOut();
});

// Saturday 31 October 2026, 11:50pm, on this Mac's clock.
const NOW = new Date(2026, 9, 31, 23, 50).getTime();

describe('a due time of day', () => {
  it('is kept on the ledger beside a plain day', () => {
    expect(pickFields({ due: '2026-11-01T10:00' })).toEqual({ due: '2026-11-01T10:00' });
    expect(pickFields({ due: '2026-11-01' })).toEqual({ due: '2026-11-01' });
  });
  it('and a time that is not one is not', () => {
    expect(pickFields({ due: '2026-11-01T25:00' })).toBeNull();
    expect(pickFields({ due: '2026-11-01T10:60' })).toBeNull();
    expect(pickFields({ due: '2026-11-01T10:00Z' })).toBeNull();
  });
  it('passes at that minute, not at the end of the day', () => {
    expect(dayDeadline('2026-11-01T10:00')).toEqual({ at: new Date(2026, 10, 1, 10, 0).getTime(), clock: true });
    expect(dayDeadline('2026-11-01')).toEqual({ at: new Date(2026, 10, 2).getTime(), clock: false });
  });
  it('reads Due 10am on the day and 1 hour late after it', () => {
    const d = dayDeadline('2026-11-01T10:00');
    expect(dueSaid(d, new Date(2026, 10, 1, 9, 0).getTime()).word).toBe('Due 10am');
    expect(dueSaid(d, new Date(2026, 10, 1, 11, 5).getTime())).toEqual({ word: '1 hour late', late: true });
    expect(dueSaid(d, new Date(2026, 10, 2, 11, 5).getTime()).word).toBe('1 day late');
  });
  it('is typed in words: "tomorrow 10am", a weekday, or a bare time', () => {
    expect(dueFromWords('tomorrow 10am', NOW)).toBe('2026-11-01T10:00');
    expect(dueFromWords('Tue 3:30pm', NOW)).toBe('2026-11-03T15:30');
    expect(dueFromWords('fri', NOW)).toBe('2026-11-06');
    // 9am said at 11:50pm is the next one.
    expect(dueFromWords('9am', NOW)).toBe('2026-11-01T09:00');
  });
  it('and words that name no time are not a deadline', () => {
    expect(dueFromWords('soon', NOW)).toBeNull();
    expect(dueFromWords('', NOW)).toBeNull();
  });
  it('the card and the row say the time', () => {
    expect(cardDueWords('2026-11-01T10:00', new Date(NOW))).toBe('Tomorrow, Sun 1 Nov at 10am');
    expect(rowDueWords('2026-11-01T10:00', new Date(NOW))).toBe('Due tomorrow at 10am');
    expect(rowDueWords('2026-11-01', new Date(NOW))).toBe('Due tomorrow');
  });
});

describe('a new task\'s title', () => {
  const names = ['Sofia Lin', 'Dev Rao'];
  it('is what it asks, not who it is for', () => {
    expect(taskTitle('Task for Sofia: words for the seat picker when fewer than 20 seats are open', names)).toBe('Words for the seat picker');
    expect(taskTitle('Sofia, can you write the low availability words?', names)).toBe('Write the low availability words');
    expect(taskTitle('For Dev - fix the double booking', names)).toBe('Fix the double booking');
  });
  it('a first line that is only the address leaves the rest to name it', () => {
    expect(taskTitle('Task for Sofia\n\nSeat picker words at fewer than 20 open', names)).toBe('Seat picker words at fewer than 20 open');
    expect(taskTitle('Task for Sofia', names, 'Task for Sofia\n\nSeat picker words at fewer than 20 open')).toBe('Seat picker words at fewer than 20 open');
  });
  it('a title somebody chose stays theirs', () => {
    expect(taskTitle('Render account', names, 'Make the Render account and send me the link.')).toBe('Render account');
  });
  it('a name inside the work stays', () => {
    expect(taskTitle('Sofia’s seat picker v5 needs a 6-open state', names)).toBe('Sofia’s seat picker v5 needs a 6-open state');
    expect(taskTitle('Fix the LUM-41 title', names)).toBe('Fix the LUM-41 title');
  });
  it('nothing but the address keeps the address rather than nothing', () => {
    expect(taskTitle('Task for Sofia', names)).toBe('Task for Sofia');
  });
});

describe('a block on someone outside the team', () => {
  const task = (blockedBy) => ({ id: 't1', labels: ['given-task'], status: 'open', assignee: 'p-dev', blockedBy, wrote: { blockedBy: { ts: 10 } } });
  it('is plain words, kept on the task', () => {
    const id = nameWait('  Jordan’s answers ');
    expect(id).toBe('name:Jordan’s answers');
    expect(waitParts(id)).toEqual({ kind: 'name', name: 'Jordan’s answers' });
    expect(taskBlocks(task([id]))).toEqual([id]);
    expect(pickFields({ blockedBy: [id] })).toEqual({ blockedBy: [id] });
  });
  it('says what it waits on', () => {
    expect(blockedWords(task([nameWait('Jordan')]), { me: 'p-dev', nameOf: () => 'X' })).toMatchObject({ word: 'Blocked on Jordan', on: 'Jordan' });
    // Long words are cut on the narrow status column, whole on the hover.
    expect(blockedWords(task([nameWait('Jordan’s answers on the booking server')]), { me: 'p-dev', nameOf: () => 'X' }))
      .toEqual({ word: 'Blocked on Jordan’s…', title: 'Blocked on Jordan’s answers on the booking server', on: 'Jordan’s answers on the booking server' });
  });
  it('ends only when its holder says so, never on its own', () => {
    expect(endedTaskBlocks([task([nameWait('Jordan')])], { me: 'p-dev', nameOf: () => 'X', lastWordFrom: () => 1e15 })).toEqual([]);
  });
  it('a long one is cut to fit, and an empty one is nothing', () => {
    expect(nameWait('x'.repeat(200)).length).toBeLessThanOrEqual(64);
    expect(nameWait('   ')).toBeNull();
  });
  it('a bare word that is not a block kind is still dropped', () => {
    expect(taskBlocks(task(['Jordan']))).toEqual([]);
  });
});
