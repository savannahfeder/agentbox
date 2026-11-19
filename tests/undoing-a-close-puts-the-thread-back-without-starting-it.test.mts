// UNDOING A CLOSE PUTS THE THREAD BACK, AND STARTS NOTHING (w-93a0f0248a).
//
// A tester opened a cause row in Needs you ("Git cannot write the shared
// worktree index"), pressed E, then Z. The thread went to In progress and its
// lead agent began working on the tester's plan. A cause row waits as
// `blocked` until you reply; Z wrote `open`, and an open row with your tag and
// nothing for you to read is fresh work. Reproduced on a real cause row made
// through wait_on_cause and read by the queue's own `_isFreshWork`: true after
// E and Z before this change.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mts';
import { Store } from '../main/store.mts';
import { stoppedByHer } from '../shared/answers.mts';
import { wasBeforeClose, writesToReopen } from '../shared/reopen-as-it-was.mts';
import { belongsInInbox } from '../renderer/src/list-rules.ts';

const queue = () => {
  const sup = Object.create(Supervisor.prototype);
  sup.config = {};
  sup._fruitless = {};
  return sup as Supervisor;
};

describe('E then Z on a cause row waiting for your reply', () => {
  let product: { id: string }; let work: typeof import('../mcp/core/work.mts');
  beforeEach(async () => {
    const home = (await import('../main/store/home.mts')).appHome();
    process.env.STORE_ACCOUNT_ID = `acct-undo-${Math.random().toString(36).slice(2, 8)}`;
    fs.mkdirSync(path.join(home, 'accounts', process.env.STORE_ACCOUNT_ID), { recursive: true });
    (await import('../mcp/core/account.mts')).resolveAccount();
    product = (await import('../mcp/core/products.mts')).createProduct(`Undo ${Math.random().toString(36).slice(2, 8)}`);
    work = await import('../mcp/core/work.mts');
  });
  afterEach(() => { delete process.env.STORE_ACCOUNT_ID; });

  const causeRow = async () => {
    const a = work.createItem(product.id, { title: 'Ship the fix', labels: ['founder'] }, { source: 'founder' });
    const { tools } = (await import('../mcp/tools.mts')).buildTools({ holder: `test-${a.id}`, ownItem: a.id });
    const out = await tools.find((t) => t.name === 'wait_on_cause')!.run({ cause: 'Git cannot write the shared worktree index', new: true });
    return work.listWorkItems({ includeDone: true }).find((i) => i.id === JSON.parse(out.content[0].text).waitingOn)!;
  };

  it('is back in Needs you, blocked, and not work the queue would start', async () => {
    const row = await causeRow();
    const was = wasBeforeClose(row);
    work.updateItem(row.id, { status: 'done' }, { source: 'founder' });
    let after = row;
    for (const w of writesToReopen(was)) after = work.updateItem(row.id, { status: w.status }, { source: w.source })!;
    expect(after.status).toBe('blocked');
    expect(queue()._isFreshWork(after as never)).toBe(false);
    expect(queue()._isContinuation(after as never)).toBe(false);
    expect(belongsInInbox(after as never, { now: Date.now() + 1 })).toBe(true);
  });

  it('a plain reopen to open is what used to start it', async () => {
    const row = await causeRow();
    work.updateItem(row.id, { status: 'done' }, { source: 'founder' });
    const after = work.updateItem(row.id, { status: 'open' }, { source: 'founder' })!;
    expect(queue()._isFreshWork(after as never)).toBe(true);
  });

  it('still starts its lead once you reply after the undo', async () => {
    const row = await causeRow();
    work.updateItem(row.id, { status: 'done' }, { source: 'founder' });
    work.updateItem(row.id, { status: 'open' }, { source: 'founder' });
    work.updateItem(row.id, { status: 'blocked' }, { source: 'system' });
    const answered = work.updateItem(row.id, { answer: 'Go ahead' }, { source: 'founder' })!;
    expect(queue()._isContinuation(answered as never)).toBe(true);
  });
});

describe('the store puts each kind of row back as it was', () => {
  let store: Store; let dir: string; let root: string;
  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'undo-close-'));
    const accountRoot = path.join(root, 'accounts', 'a');
    fs.mkdirSync(accountRoot, { recursive: true });
    store = await new Store({ storeRoot: root, accountId: 'a', accountRoot, products: [] }).init();
    const p = store.createProduct({ name: 'Alpha' });
    dir = store.productDir(p.slug);
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  const slug = () => store.listProducts()[0].slug;
  const make = (status: string, source: 'founder' | 'agent' | 'system', extra: Record<string, unknown> = {}) => {
    const id = store.modules.workItemsDisk.createWorkItem(dir, { title: 'Thread', labels: ['founder'] }, { source: 'founder' }).id;
    store.modules.workItemsDisk.updateWorkItem(dir, id, { status, ...extra }, { source });
    return store.readItem(slug(), id)!;
  };
  const closeAndUndo = (row: ReturnType<typeof make>) => {
    const was = wasBeforeClose(row);
    store.answerItem(slug(), row.id, { status: 'done' });
    return store.reopenAsItWas(slug(), row.id, was)!;
  };

  it('a thread waiting on the app stays waiting, written by the app', () => {
    const after = closeAndUndo(make('blocked', 'system'));
    expect(after.status).toBe('blocked');
    expect(after.wrote?.status?.source).toBe('system');
  });

  it('a thread you stopped stays stopped', () => {
    const after = closeAndUndo(make('blocked', 'founder'));
    expect(after.status).toBe('blocked');
    expect(stoppedByHer(after)).toBe(true);
    expect(queue()._isFreshWork(after as never)).toBe(false);
  });

  it('a thread an agent blocked behind another keeps waiting on it, not stopped by you', () => {
    const other = make('open', 'founder');
    const after = closeAndUndo(make('blocked', 'agent', { blockedBy: [other.id] }));
    expect(after.status).toBe('blocked');
    expect(stoppedByHer(after)).toBe(false);
  });

  it('an open thread opens again, as before', () => {
    expect(closeAndUndo(make('open', 'system')).status).toBe('open');
  });

  it('a running thread the close stopped comes back open, not claimed by nobody', () => {
    expect(closeAndUndo(make('claimed', 'agent')).status).toBe('open');
  });
});

describe('every close Z undoes in the window says what the thread was', () => {
  const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
  it('passes reopenAs on each reopen', () => {
    const reopens = app.match(/pushUndo\(\{ label: `Reopened:[\s\S]*?\} \}\);/g) ?? [];
    expect(reopens.length).toBe(3);
    for (const r of reopens) {
      for (const call of r.match(/api\.answer\(\{[^}]*status: 'open'[^}]*\}\)/g) ?? []) {
        if (call.includes('t.product')) continue;
        expect(call).toContain('reopenAs: wasBeforeClose(item)');
      }
    }
  });
});
