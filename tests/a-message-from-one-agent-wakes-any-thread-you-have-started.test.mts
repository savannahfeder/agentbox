// A MESSAGE FROM ONE AGENT WAKES ANY THREAD YOU HAVE STARTED (w-0e21f73f90).
//
// You asked one agent to pass feedback to the agent on another thread. That
// thread had been filed by an agent, you had approved it and talked on it for
// days, and the words still landed there as a "Checkpoint" and started
// nothing: you had to type a reply yourself to get it moving (w-f46f8e5ed9).
// Measured through the store tools: `noteToAnotherThread` woke only threads
// labelled `founder`, so every agent-filed thread counted as a proposal for
// ever. Words sent with a summary (problem, progress), as the brief tells every
// agent to send them, skipped the message too, and so did a thread whose agent
// was working. Each of those fell through to the writer taking the other
// thread and writing the words there as that thread's own note, while the tool
// answered as if all was well.
//
// Now words for another agent's thread go there as that agent's message
// whenever the thread is past waiting for your yes, and never as its own note.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { toldBy } from '../shared/answers.mts';
import { HOP_LABEL_PREFIX } from '../shared/teammates.mts';

let work; let disk; let product; let built = [];
const inherited = process.env.ZERO_ITEM;
const RENAME = 'Rename the demo company everywhere it shows, then send a picture.';

beforeEach(async () => {
  delete process.env.ZERO_ITEM;
  const home = (await import('../main/store/home.mts')).appHome();
  process.env.STORE_ACCOUNT_ID = 'acct-agent-message';
  fs.mkdirSync(path.join(home, 'accounts', 'acct-agent-message'), { recursive: true });
  const { resolveAccount } = await import('../mcp/core/account.mts');
  resolveAccount();
  const { createProduct } = await import('../mcp/core/products.mts');
  product = createProduct(`Messages ${Math.random().toString(36).slice(2, 8)}`);
  work = await import('../mcp/core/work.mts');
  disk = await import('../main/store/work-items.mts');
  product.dir = path.join(home, 'accounts', 'acct-agent-message', product.id);
});
afterEach(() => {
  for (const b of built) b.claims._stop();
  built = [];
  delete process.env.STORE_ACCOUNT_ID;
  if (inherited === undefined) delete process.env.ZERO_ITEM; else process.env.ZERO_ITEM = inherited;
});

const tools = async (ownItem) => {
  const b = (await import('../mcp/tools.mts')).buildTools({ holder: `test-${Math.random()}`, ownItem });
  built.push(b);
  const call = async (name, args) => JSON.parse((await b.tools.find((t) => t.name === name).run(args)).content[0].text);
  return { call };
};
const update = async (ownItem, args) => (await tools(ownItem)).call('update_work_item', args);
const read = (id) => disk.readWorkItem(product.dir, id);

// Your thread with its agent, and a thread that agent filed under it, as the
// app writes them: yours composed on the system's line, the filing an agent's.
function filed({ approval = 'Approved. Run it.' } = {}) {
  const call = work.createItem(product.id, { title: 'Plan the onboarding calls', labels: ['founder'] }, { source: 'system' });
  const demo = work.createItem(product.id, { title: 'A demo copy of the app', parent: call.id }, { source: 'agent' });
  if (approval) {
    disk.updateWorkItem(product.dir, demo.id, { answer: approval }, { source: 'founder' });
    disk.updateWorkItem(product.dir, demo.id, { result: 'The demo copy opens from the menu. Ship it?', problem: 'You wanted a demo copy for calls.', progress: 'Built the demo copy' }, { source: 'agent' });
  }
  return { call, demo };
}

describe('a thread an agent filed, once you have started it', () => {
  it('is woken by another agent\'s message, which lands as that agent\'s words', async () => {
    const { call, demo } = filed();
    const out = await update(call.id, { id: demo.id, note: RENAME });
    expect(out.woke).toBe(true);
    const after = read(demo.id);
    expect(after.answer).toBe(RENAME);
    expect(toldBy(after)?.name).toBe('The agent on "Plan the onboarding calls"');
    expect(after.status).toBe('open');
    expect(after.note ?? null).toBeNull();
    expect(after.labels).toContain(`${HOP_LABEL_PREFIX}1`);
  });

  it('is woken again when the last word on it was another agent\'s', async () => {
    const { call, demo } = filed();
    await update(call.id, { id: demo.id, note: RENAME });
    disk.updateWorkItem(product.dir, demo.id, { result: 'Renamed. Here is the picture.' }, { source: 'agent' });
    const other = work.createItem(product.id, { title: 'Call script', labels: ['founder'] }, { source: 'system' });
    const out = await update(other.id, { id: demo.id, note: 'Use the new name on the sign-in page too.' });
    expect(out.woke).toBe(true);
    expect(read(demo.id).answer).toBe('Use the new name on the sign-in page too.');
  });

  it('is not taken by the agent writing to it', async () => {
    const { call, demo } = filed();
    await update(call.id, { id: demo.id, note: RENAME });
    expect(read(demo.id).claim).toBeNull();
  });
});

describe('a thread still waiting for your yes', () => {
  it('is not started by another agent\'s message, and the writer is told so', async () => {
    const { call, demo } = filed({ approval: null });
    const out = await update(call.id, { id: demo.id, note: 'Look at this too.' });
    expect(out.woke).toBe(false);
    expect(out.note).toMatch(/yes/);
    const after = read(demo.id);
    expect(after.answer ?? null).toBeNull();
    expect(after.note).toBe('Look at this too.');
    expect(after.status).toBe('open');
    expect(after.claim).toBeNull();
  });

  it('includes one whose approval you took back', async () => {
    const { call, demo } = filed({ approval: '(withdrawn)' });
    const out = await update(call.id, { id: demo.id, note: 'Look at this too.' });
    expect(out.woke).toBe(false);
    expect(read(demo.id).answer).toBe('(withdrawn)');
  });
});

describe('a thread no agent has run yet', () => {
  it('keeps the words as the note its first run reads, and is not taken', async () => {
    const call = work.createItem(product.id, { title: 'Plan the onboarding calls', labels: ['founder'] }, { source: 'system' });
    const yours = work.createItem(product.id, { title: 'Write the call script', labels: ['founder'] }, { source: 'system' });
    const out = await update(call.id, { id: yours.id, note: RENAME });
    expect(out.woke).toBe(false);
    expect(out.note).toMatch(/first run/);
    const after = read(yours.id);
    expect(after.note).toBe(RENAME);
    expect(after.answer ?? null).toBeNull();
    expect(after.claim).toBeNull();
  });
});

describe('words sent with a summary', () => {
  it('still reach the other thread as a message, and its own summary stays its own', async () => {
    const { call, demo } = filed();
    const out = await update(call.id, { id: demo.id, note: RENAME, problem: 'You wanted the calls planned.', progress: 'Asked the demo thread to rename' });
    expect(out.woke).toBe(true);
    expect(out.note).toMatch(/summary/);
    const after = read(demo.id);
    expect(after.answer).toBe(RENAME);
    expect(after.problem).toBe('You wanted a demo copy for calls.');
    expect(after.progress).toBe('Built the demo copy');
  });

  it('closing a thread it filed is still an ordinary write', async () => {
    const { call, demo } = filed();
    await update(call.id, { id: demo.id, status: 'done', note: 'Folded into the call thread.' });
    const after = read(demo.id);
    expect(after.status).toBe('done');
    expect(after.note).toBe('Folded into the call thread.');
    expect(after.answer).toBe('Approved. Run it.');
  });
});

describe('a thread whose agent is working', () => {
  it('gets the words to take when its run ends, and the run keeps the thread', async () => {
    const { call, demo } = filed();
    await disk.claimWorkItem(product.dir, { id: demo.id, holder: 'its-own-run' });
    const out = await update(call.id, { id: demo.id, note: RENAME });
    expect(out.woke).toBe(true);
    expect(out.note).toMatch(/run ends/);
    const after = read(demo.id);
    expect(after.answer).toBe(RENAME);
    expect(after.status).toBe('claimed');
    expect(after.claim?.holder).toBe('its-own-run');
  });

  it('does the same when it is that thread\'s first run', async () => {
    const call = work.createItem(product.id, { title: 'Plan the onboarding calls', labels: ['founder'] }, { source: 'system' });
    const yours = work.createItem(product.id, { title: 'Write the call script', labels: ['founder'] }, { source: 'system' });
    await disk.claimWorkItem(product.dir, { id: yours.id, holder: 'its-first-run' });
    const out = await update(call.id, { id: yours.id, note: RENAME });
    expect(out.note).toMatch(/run ends/);
    expect(read(yours.id).answer).toBe(RENAME);
    expect(read(yours.id).claim?.holder).toBe('its-first-run');
  });

  it('a thread this session holds itself is still its own note', async () => {
    const { call, demo } = filed();
    const session = await tools(call.id);
    expect((await session.call('claim_work_item', { id: demo.id })).claimed).toBe(true);
    await session.call('update_work_item', { id: demo.id, note: 'Working on the rename.' });
    const after = read(demo.id);
    expect(after.note).toBe('Working on the rename.');
    expect(after.answer).toBe('Approved. Run it.');
  });
});
