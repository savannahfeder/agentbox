// AN IMPORTED CHAT IS CAUGHT UP INTO THE APP'S OWN SHAPE (w-31c71743b5, 2026-10-29).
//
// What broke: a Claude Code chat brought in at setup arrived as the agent's
// raw last message, a long block with headings and code, and no question or
// options. The founder: "If our app looks like Claude Code or Codex ... people
// are going to evaluate it as 'Oh it's just the same'." The first fix was an
// agent run resuming the chat on Claude Code. Measured in fresh windows the
// same morning, it never landed: the account was at its weekly limit, and the
// dead run's "usage limit" line was drawn over the agent's answer. So the
// rewrite is now a small-model call asked on any account or engine with room
// (main/catch-up.mts), and no agent run starts for it.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mts';
import { CATCH_UP_LABEL, CATCH_UP_TRIES, catchUpDue, threadImportRow, THREAD_LABEL } from '../shared/agent-import.mts';

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
const card = { title: 'Flaky test fix', context: 'The agent fixed a flaky test.', ask: 'Should I merge it?', said: 'I fixed it.', options: ['Merge it', 'Wait'] };
const watching = (answer) => {
  const sup = bare();
  const writes = [];
  sup.store = {
    catchUpItem: (product, id, patch) => writes.push(['catchUp', patch]),
    routeItem: (product, id, patch) => writes.push(['route', patch]),
  };
  sup._askSmall = async () => answer;
  return { sup, writes };
};

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

describe('no agent run starts for it', () => {
  it('the row is a question with an answer waiting, and stays that way', () => {
    const sup = bare();
    sup.importedThreadFor = () => ({ sessionId: 'abc', imported: true, folder: '/x' });
    expect(sup._isFreshWork(imported())).toBe(false);
  });
});

describe('the rewrite', () => {
  it('writes the name, the context and the answer with options, and is owed no more', async () => {
    const { sup, writes } = watching(card);
    await sup.catchUpTheImports([imported()]);
    expect(writes[0][0]).toBe('catchUp');
    expect(writes[0][1]).toMatchObject({ label: 'Flaky test fix', problem: 'The agent fixed a flaky test.' });
    expect(writes[0][1].result).toMatch(/^\*\*Should I merge it\?\*\*/);
    expect(writes[0][1].result).toContain('## Options\n1. Merge it (recommended)\n2. Wait');
    expect(writes[1]).toEqual(['route', { labels: [THREAD_LABEL, 'thread:abc'] }]);
  });
  it('leaves the row as it was when no account has room, and tries again later', async () => {
    const { sup, writes } = watching('');
    await sup.catchUpTheImports([imported()], 1000);
    expect(writes).toEqual([]);
    await sup.catchUpTheImports([imported()], 2000);
    expect(writes).toEqual([]);
    expect(sup._catchUpMisses.get('p:w-1').count).toBe(1);
  });
  it('and stops being owed after its last try', async () => {
    const { sup, writes } = watching('');
    for (let i = 0; i < CATCH_UP_TRIES; i++) await sup.catchUpTheImports([imported()], i * 3_600_000);
    expect(writes).toEqual([['route', { labels: [THREAD_LABEL, 'thread:abc'] }]]);
  });
  it('waits for a chat that has no answer to rewrite', async () => {
    const { sup, writes } = watching(card);
    await sup.catchUpTheImports([imported({ result: '' })]);
    expect(writes).toEqual([]);
  });
});

describe('one name, not two', () => {
  // Measured 2026-10-29 in a fresh window: the namer and the rewrite both took
  // the row in the same tick, and the name changed twice in five seconds,
  // ending on the namer's.
  it('the namer leaves a chat still owed its rewrite, which names it', async () => {
    const { wantsName } = await import('../main/row-label.mts');
    expect(wantsName(imported())).toBe(false);
    expect(wantsName(imported({ labels: [THREAD_LABEL, 'thread:abc'] }))).toBe(true);
  });
});

describe('several chats brought in at once', () => {
  it('are written up three at a time, not one a tick', async () => {
    const { sup, writes } = watching(card);
    const rows = ['w-1', 'w-2', 'w-3', 'w-4'].map((id) => imported({ id }));
    await sup.catchUpTheImports(rows);
    expect(writes.filter(([k]) => k === 'catchUp')).toHaveLength(3);
  });
});
