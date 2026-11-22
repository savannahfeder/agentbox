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
  // See tests/an-imported-chat-is-rewritten-the-way-every-thread-reads: the
  // model guessed the project from the person's own settings.
  it('asks the model with the project named and what was typed in the terminal', async () => {
    const sup = bare();
    const root = dirs[dirs.length - 1];
    const asked = path.join(root, 'asked.txt');
    const fake = path.join(root, 'fake-claude');
    fs.writeFileSync(fake, `#!/bin/sh\nprintf '%s' "$2" > '${asked}'\necho '${JSON.stringify(card)}'\n`, { mode: 0o755 });
    sup.store = { listProducts: () => [{ slug: 'p', name: 'Shop' }], catchUpItem: () => {}, routeItem: () => {} };
    sup._askSmall = async (ask) => ask({ claudeBin: fake, engine: 'claude', timeoutMs: 20_000 });
    sup.store.readHistory = () => [{ source: 'agent', patch: { result: 'Mock or retry?' } }, { source: 'founder', patch: { saidOutside: 'Mock the clock.' } }];
    await sup.catchUpTheImports([imported()]);
    const prompt = fs.readFileSync(asked, 'utf8');
    expect(prompt).toContain('--- the project ---\nShop\n');
    expect(prompt).toContain('Mock the clock.');
  });

  // Measured on real chats carried on in their terminals: each answer there was
  // written up again. The second one renamed the thread (2026-11-21), and one
  // made up an apology and a first option to undo approved work (2026-11-22).
  it('keeps the name a thread already has', async () => {
    const { sup, writes } = watching(card);
    await sup.catchUpTheImports([imported({ label: 'Naming the checkout module' })]);
    expect(writes[0][1]).not.toHaveProperty('label');
    expect(writes[0][1].result).toMatch(/^\*\*Should I merge it\?\*\*/);
  });
  it('leaves a later answer in its agent\'s own words, and renews only what the thread is about', async () => {
    const { sup, writes } = watching(card);
    await sup.catchUpTheImports([imported({ label: 'Naming it', wrote: { ...imported().wrote, problem: { ts: 5, source: 'agent' } } })]);
    expect(writes).toEqual([['catchUp', { problem: 'The agent fixed a flaky test.' }], ['route', { labels: [THREAD_LABEL, 'thread:abc'] }]]);
  });

  // The model takes about 20 s, and a chat carried on in its terminal moves in that time.
  it('is dropped, and still owed, when the chat moved on while it was written', async () => {
    const moved = [
      { result: '**Claude Code stopped to ask you a question. Answer it there.**' },
      { saidOutside: 'Merge it.', wrote: { ...imported().wrote, saidOutside: { ts: 3, source: 'founder' } } },
      { status: 'claimed' },
      { status: 'done' },
    ];
    for (const over of moved) {
      const { sup, writes } = watching(card);
      sup.store.readItem = () => imported(over);
      await sup.catchUpTheImports([imported()]);
      expect(writes, JSON.stringify(over)).toEqual([]);
    }
    const { sup, writes } = watching(card);
    sup.store.readItem = () => imported({ labels: [THREAD_LABEL, 'thread:abc', CATCH_UP_LABEL, 'seen'], priority: 3 });
    await sup.catchUpTheImports([imported()]);
    expect(writes.map(([k]) => k)).toEqual(['catchUp', 'route']);
  });

  it('waits for a chat that has no answer to rewrite', async () => {
    const { sup, writes } = watching(card);
    await sup.catchUpTheImports([imported({ result: '' })]);
    expect(writes).toEqual([]);
  });
});

describe('a chat being written up', () => {
  // A later answer in a chat that follows its terminal read "Getting ready" in
  // Needs you (2026-11-22), which a tester took for one that had not started.
  it('says it is getting ready the first time only', async () => {
    const { gettingReady } = await import('../shared/agent-import.mts');
    expect(gettingReady(imported())).toBe(true);
    expect(gettingReady(imported({ wrote: { ...imported().wrote, problem: { ts: 5, source: 'agent' } } }))).toBe(false);
    expect(gettingReady(imported({ labels: [] }))).toBe(false);
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
