// A NOTE FROM ONE AGENT WAKES A STOPPED AGENT'S THREAD.
//
// The Quality lead put seven new faults on the password thread
// (update_work_item with a note, from its own run), and "its agent hasn't
// started, so please tell it to... press R and send: Do the Quality lead's
// note." The note also "may have replaced the agent's own note". Measured
// through the store tools: a note on another thread overwrote that thread's
// note and nothing about it asked for a turn.
//
// Now words an agent leaves on another, stopped agent thread go there as a
// teammate's reply, which the supervisor takes as a turn, under the same rules
// as a person's reply: a thread its owner stopped or closed stays so, a thread
// never started is not started by it, and hand-offs stop past MAX_HOPS.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { stoppedByHer, toldBy } from '../shared/answers.mts';
import { MAX_HOPS, HOP_LABEL_PREFIX } from '../shared/teammates.mts';

let work; let disk; let product; let built = [];
const inherited = process.env.ZERO_ITEM;
const FAULTS = 'Seven new faults on the password screen; picture attached.';

beforeEach(async () => {
  delete process.env.ZERO_ITEM;
  const home = (await import('../main/store/home.mts')).appHome();
  process.env.STORE_ACCOUNT_ID = 'acct-agent-note';
  fs.mkdirSync(path.join(home, 'accounts', 'acct-agent-note'), { recursive: true });
  const { resolveAccount } = await import('../mcp/core/account.mts');
  resolveAccount();
  const { createProduct } = await import('../mcp/core/products.mts');
  product = createProduct(`Notes ${Math.random().toString(36).slice(2, 8)}`);
  work = await import('../mcp/core/work.mts');
  disk = await import('../main/store/work-items.mts');
  product.dir = path.join(home, 'accounts', 'acct-agent-note', product.id);
});
afterEach(() => {
  for (const b of built) b.claims._stop();
  built = [];
  delete process.env.STORE_ACCOUNT_ID;
  if (inherited === undefined) delete process.env.ZERO_ITEM; else process.env.ZERO_ITEM = inherited;
});

const update = async (ownItem, args) => {
  const b = (await import('../mcp/tools.mts')).buildTools({ holder: `test-${Math.random()}`, ownItem });
  built.push(b);
  const out = await b.tools.find((t) => t.name === 'update_work_item').run(args);
  return JSON.parse(out.content[0].text);
};
const read = (id) => disk.readWorkItem(product.dir, id);

// A thread an agent ran and left waiting, and the Quality lead's own run, made
// as the app makes rows (composeItem's first line is the system's).
function threads({ stopped = null, hop = 0 } = {}) {
  const passwords = work.createItem(product.id, { title: 'Per-clinic staff passwords', labels: ['founder'] }, { source: 'system' });
  disk.updateWorkItem(product.dir, passwords.id, { result: 'Passwords are in. Keep it open?', note: 'Open until Dev checks Render.', status: 'blocked' }, { source: 'agent' });
  if (stopped) disk.updateWorkItem(product.dir, passwords.id, { status: stopped }, { source: 'founder' });
  const quality = work.createItem(product.id, { title: 'Quality retest', labels: ['founder', `${HOP_LABEL_PREFIX}${hop}`] }, { source: 'system' });
  return { passwords, quality };
}

describe('a note on another agent\'s stopped thread', () => {
  it('lands as that agent\'s words, starts a turn, and leaves the thread\'s own note alone', async () => {
    const { passwords, quality } = threads();
    const out = await update(quality.id, { id: passwords.id, note: FAULTS });
    expect(out.woke).toBe(true);
    const after = read(passwords.id);
    expect(after.answer).toBe(FAULTS);
    expect(toldBy(after)?.name).toBe('The agent on "Quality retest"');
    expect(after.status).toBe('open');
    expect(after.note).toBe('Open until Dev checks Render.');
    expect(after.labels).toContain(`${HOP_LABEL_PREFIX}1`);
  });

  it('a result written there goes the same way', async () => {
    const { passwords, quality } = threads();
    await update(quality.id, { id: passwords.id, result: FAULTS });
    expect(read(passwords.id).answer).toBe(FAULTS);
    expect(read(passwords.id).result).toBe('Passwords are in. Keep it open?');
  });
});

describe('within the owner\'s rules', () => {
  it('a thread its owner stopped stays stopped, with the words on it', async () => {
    const { passwords, quality } = threads({ stopped: 'blocked' });
    const out = await update(quality.id, { id: passwords.id, note: FAULTS });
    expect(out.woke).toBe(false);
    const after = read(passwords.id);
    expect(after.status).toBe('blocked');
    expect(stoppedByHer(after)).toBe(true);
    expect(after.answer).toBe(FAULTS);
  });

  it('a thread its owner closed stays closed', async () => {
    const { passwords, quality } = threads({ stopped: 'done' });
    const out = await update(quality.id, { id: passwords.id, note: FAULTS });
    expect(out.woke).toBe(false);
    expect(read(passwords.id).status).toBe('done');
  });

  it('a thread no agent has run yet is not started by another agent\'s note', async () => {
    const quality = work.createItem(product.id, { title: 'Quality retest', labels: ['founder'] }, { source: 'founder' });
    const proposal = work.createItem(product.id, { title: 'Filed by an agent', labels: [] }, { source: 'agent' });
    await update(quality.id, { id: proposal.id, note: 'Look at this.' });
    const after = read(proposal.id);
    expect(after.answer ?? null).toBeNull();
    expect(after.note).toBe('Look at this.');
  });

  it('wakes nothing past the most hand-offs in a row, and says so', async () => {
    const { passwords, quality } = threads({ hop: MAX_HOPS });
    const out = await update(quality.id, { id: passwords.id, note: FAULTS });
    expect(out.woke).toBe(false);
    expect(out.note).toMatch(/hand-offs/);
    expect(read(passwords.id).status).toBe('blocked');
  });

  it('a note on its own thread is still its own note', async () => {
    const { quality } = threads();
    await update(quality.id, { id: quality.id, note: 'Retest started.' });
    expect(read(quality.id).note).toBe('Retest started.');
    expect(read(quality.id).answer ?? null).toBeNull();
  });
});
