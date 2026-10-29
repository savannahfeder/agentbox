// AN IMPORTED CHAT IS CAUGHT UP INTO THE APP'S OWN SHAPE (w-31c71743b5, 2026-10-29).
//
// What broke: a Claude Code chat brought in at setup arrived as the agent's
// raw last message, a long block with headings and code, and no question or
// options. The founder, on the first imported chat she opened: "If our app
// looks like Claude Code or Codex ... people are going to evaluate it as 'Oh
// it's just the same'. I think for tasks that are imported, we need to
// reformat them." So a chat brought in from Claude Code is owed one run that
// resumes it, does no new work, and writes where it stands the way every
// thread here reads: a context line, what was done, and one question with
// options. The run is owed once: its label comes off when it starts.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';
import { machineryPath } from '../main/store/home.mjs';
import { CATCH_UP_LABEL, catchUpDue, threadImportRow, THREAD_LABEL } from '../shared/agent-import.mjs';

const dirs = [];
afterEach(() => { while (dirs.length) fs.rmSync(dirs.pop(), { recursive: true, force: true }); });
const bare = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'catch-up-'));
  dirs.push(root);
  const sup = new Supervisor({ storeRoot: root, home: root, authProfiles: ['default'] }, { listItems: () => [], listProducts: () => [], isDue: () => true }, root);
  sup._saveState = () => {};
  return sup;
};
const imported = (over = {}) => ({
  id: 'w-1', product: 'p', title: 'Fix the flaky test', status: 'open', kind: 'question',
  labels: [THREAD_LABEL, 'thread:abc', CATCH_UP_LABEL], body: 'fix the flaky test', result: 'I fixed it. Let me know!',
  wrote: { body: { ts: 1, source: 'founder' }, result: { ts: 2, source: 'agent' } },
  ...over,
});

describe('what is owed a catch-up', () => {
  it('a Claude Code chat just brought in', () => {
    expect(threadImportRow({ id: 'abc', title: 'T', firstSaid: 'a', lastSaid: 'b' }).labels).toContain(CATCH_UP_LABEL);
    expect(catchUpDue(imported())).toBe(true);
  });
  it('not one that already had it, or was filed in Done, or is any other row', () => {
    expect(catchUpDue(imported({ labels: [THREAD_LABEL, 'thread:abc'] }))).toBe(false);
    expect(catchUpDue(imported({ status: 'done' }))).toBe(false);
    expect(catchUpDue({ labels: ['founder'], status: 'open' })).toBe(false);
    expect(catchUpDue({})).toBe(false);
  });
});

describe('the supervisor', () => {
  it('starts it, although the row is a question with an agent answer waiting', () => {
    const sup = bare();
    sup.importedThreadFor = () => ({ sessionId: 'abc', imported: true, folder: '/x' });
    expect(sup._isFreshWork(imported())).toBe(true);
  });
  it('does not start it when the chat cannot be resumed here', () => {
    const sup = bare();
    sup.importedThreadFor = () => null;
    expect(sup._isFreshWork(imported())).toBe(false);
  });
  it('still leaves the same row alone once it has been caught up', () => {
    const sup = bare();
    sup.importedThreadFor = () => ({ sessionId: 'abc', imported: true, folder: '/x' });
    expect(sup._isFreshWork(imported({ labels: [THREAD_LABEL, 'thread:abc'] }))).toBe(false);
  });
});

describe('what the run is told', () => {
  const sup = bare();
  const brief = sup.catchUpBrief(imported(), { slug: 'p', name: 'P', dir: '/x' }, { folder: '/x' });
  it('to do no new work and change nothing', () => {
    expect(brief).toMatch(/Do no new work/);
    expect(brief).toMatch(/change no files/i);
  });
  it('to leave the thread open for the person', () => {
    expect(brief).toMatch(/Leave its status as it is/);
  });
  it('to write it the way every thread reads: context, what was done, one question with options', () => {
    expect(brief).toMatch(/problem/);
    expect(brief).toMatch(/progress/);
    expect(brief).toMatch(/## Options/);
  });
  it('and it is the brief such a run gets, with the label taken off as it starts', () => {
    const src = fs.readFileSync(new URL('../main/supervisor.mjs', import.meta.url), 'utf8');
    expect(src).toContain('else if (forkFrom?.imported && catchUpDue(item)) prompt = this.catchUpBrief(item, product, { folder: forkFrom.folder });');
    expect(src).toContain('this.store.routeItem?.(item.product, item.id, { labels: (item.labels ?? []).filter((l) => l !== CATCH_UP_LABEL) });');
  });
});

describe('a catch-up that dies', () => {
  // Measured 2026-10-29 in a fresh window on the founder's computer: the
  // catch-up started, Claude Code was at its usage limit, and the imported chat
  // was left reading "Claude Code hit its usage limit partway through".
  const dying = () => {
    const sup = bare();
    const writes = [];
    sup.store = { routeItem: (product, id, patch) => writes.push(patch), recordSessionResult: () => { throw new Error('wrote a sentence'); } };
    return { sup, writes };
  };
  const row = imported({ labels: [THREAD_LABEL, 'thread:abc'] });
  it('leaves the chat as it was and is owed again', () => {
    const { sup, writes } = dying();
    sup._catchUps = { 'w-1': 1 };
    sup.sayTheRunDied(row, { tail: ['stderr: usage limit reached'] });
    expect(writes).toEqual([{ labels: [THREAD_LABEL, 'thread:abc', CATCH_UP_LABEL], status: 'open' }]);
    expect(sup._catchUps['w-1']).toBeUndefined();
  });
  it('and is marked spoken for, so the pass over resting rows writes nothing either', () => {
    // The same morning: four seconds after the chat was left as it was, that
    // pass wrote "Claude Code is at its usage limit, so nothing has been done".
    const { sup } = dying();
    sup._catchUps = { 'w-1': 1 };
    sup._fruitless = { 'p:w-1': { runs: 1, endedAt: 123 } };
    sup.sayTheRunDied(row, { tail: [] });
    expect(sup._fruitless['p:w-1'].saidAt).toBe(123);
  });
  it('is not owed a fourth time', () => {
    const { sup, writes } = dying();
    sup._catchUps = { 'w-1': 3 };
    sup.sayTheRunDied(row, { tail: [] });
    expect(writes).toEqual([{ labels: [THREAD_LABEL, 'thread:abc'], status: 'open' }]);
  });
  it('and leaves no record of itself for the thread to draw', () => {
    // Measured the same morning with a chat brought in fresh: the page opened on
    // "This run stopped because the account hit its usage limit." in place of
    // the agent's answer, read from the dead catch-up's own run log.
    const project = fs.mkdtempSync(path.join(os.tmpdir(), 'catch-up-project-'));
    dirs.push(project);
    const log = machineryPath(project, path.join('sessions', 'w-1', '123.log'));
    fs.mkdirSync(path.dirname(log), { recursive: true });
    fs.writeFileSync(log, "08:14:45  You've hit your weekly limit\n");
    const kept = machineryPath(project, path.join('sessions', 'w-1', '100.log'));
    fs.writeFileSync(kept, 'an earlier run\n');
    const { sup } = dying();
    sup.store.listProducts = () => [{ slug: 'p', dir: project }];
    sup._catchUps = { 'w-1': 1 };
    sup.sayTheRunDied(row, { startedAt: 123, tail: [] });
    expect(fs.existsSync(log)).toBe(false);
    expect(fs.existsSync(kept)).toBe(true);
  });
});
