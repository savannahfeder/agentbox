// A THREAD FILED BECAUSE YOU ASKED FOR IT STARTS AT ONCE (w-0e21f73f90).
//
// You asked an agent to file something as a thread so it would be done, and
// the thread it filed waited until you pressed Approve: four threads filed
// that way in nine days started only on "Approved. Run it." (w-5f87b9f03c,
// w-44bbef1327, w-caca7cb130, w-2e2e04616a). Everything an agent files is a
// proposal, and nothing let the agent say you had already asked for it.
// Now create_work_item takes startBecause: your words asking for it, quoted
// from the thread the agent works for and checked there the way closeBecause
// is. With them the new thread is approved as your press approves one, and
// starts. Without them, or with words that are not yours, it waits as before.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mts';
import { approvableFiled, RUN_IT } from '../renderer/src/threads-made.ts';

let work; let disk; let product; let built = [];
const inherited = process.env.ZERO_ITEM;
const ASKED = 'File that as a thread so it can be fixed.';

beforeEach(async () => {
  delete process.env.ZERO_ITEM;
  const home = (await import('../main/store/home.mts')).appHome();
  process.env.STORE_ACCOUNT_ID = 'acct-filed-on-ask';
  fs.mkdirSync(path.join(home, 'accounts', 'acct-filed-on-ask'), { recursive: true });
  const { resolveAccount } = await import('../mcp/core/account.mts');
  resolveAccount();
  const { createProduct } = await import('../mcp/core/products.mts');
  product = createProduct(`Filed ${Math.random().toString(36).slice(2, 8)}`);
  work = await import('../mcp/core/work.mts');
  disk = await import('../main/store/work-items.mts');
  product.dir = path.join(home, 'accounts', 'acct-filed-on-ask', product.id);
});
afterEach(() => {
  for (const b of built) b.claims._stop();
  built = [];
  delete process.env.STORE_ACCOUNT_ID;
  if (inherited === undefined) delete process.env.ZERO_ITEM; else process.env.ZERO_ITEM = inherited;
});

const file = async (ownItem, args) => {
  const b = (await import('../mcp/tools.mts')).buildTools({ holder: `test-${Math.random()}`, ownItem });
  built.push(b);
  return JSON.parse((await b.tools.find((t) => t.name === 'create_work_item').run({ product: product.id, ...args })).content[0].text);
};
const read = (id) => disk.readWorkItem(product.dir, id);
const runs = (item) => Object.create(Supervisor.prototype)._isContinuation(item);

// Your thread as the app writes it: the system's first line, your words, the agent's answer.
function yourThread({ body = undefined, reply = ASKED } = {}) {
  const call = work.createItem(product.id, { title: 'Plan the onboarding calls', labels: ['founder'] }, { source: 'system' });
  disk.updateWorkItem(product.dir, call.id, { title: 'Plan the onboarding calls', ...(body ? { body } : {}) }, { source: 'founder' });
  disk.updateWorkItem(product.dir, call.id, { result: 'The agent picked up an old copy of the script.' }, { source: 'agent' });
  if (reply) disk.updateWorkItem(product.dir, call.id, { answer: reply }, { source: 'founder' });
  return call;
}

describe('a thread an agent files because you asked for it', () => {
  it('starts at once when the agent quotes your reply asking for it', async () => {
    const call = yourThread();
    const out = await file(call.id, { title: 'Old copy of the script picked up', parent: call.id, startBecause: 'File that as a thread so it can be fixed' });
    expect(out.started).toMatch(/starts now/);
    const filed = read(out.id);
    expect(filed.answer).toBe(RUN_IT);
    expect(filed.wrote.answer.source).toBe('founder');
    expect(runs(filed)).toBe(true);
    expect(approvableFiled(filed, 'scheduled')).toBe(false);
  });

  it('also finds your words in the message that opened the thread', async () => {
    const call = yourThread({ body: 'When you find a bug, file it as its own thread and get it fixed.', reply: null });
    const out = await file(call.id, { title: 'A bug found on the way', parent: call.id, startBecause: 'file it as its own thread and get it fixed' });
    expect(read(out.id).answer).toBe(RUN_IT);
  });

  it('finds an earlier reply of yours, not only the newest', async () => {
    const call = yourThread();
    disk.updateWorkItem(product.dir, call.id, { result: 'Noted. Anything else?' }, { source: 'agent' });
    disk.updateWorkItem(product.dir, call.id, { answer: 'Thanks.' }, { source: 'founder' });
    const out = await file(call.id, { title: 'Old copy of the script picked up', parent: call.id, startBecause: ASKED });
    expect(read(out.id).answer).toBe(RUN_IT);
  });

  it('starts one the agent made to solve part of what you asked', async () => {
    const call = yourThread({ reply: 'Get the demo copy ready for Saturday.' });
    const out = await file(call.id, { title: 'Rename the demo company', parent: call.id, startBecause: 'Get the demo copy ready for Saturday' });
    expect(read(out.id).answer).toBe(RUN_IT);
  });
});

// Your rule (w-0e21f73f90): a thread you told an agent to make starts, and so
// does one it makes to solve what you asked; something you did not expect
// waits for your yes. Only the agent knows which, so this is what it is told.
describe('what a filing agent is told', () => {
  const source = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

  it('quotes you for a thread you asked for or one that solves part of your ask', () => {
    const tools = source('mcp/tools.mts');
    const said = tools.slice(tools.indexOf('startBecause: z.'), tools.indexOf('startBecause: z.') + 800);
    expect(said).toMatch(/a thread they told you to make, or one that does part of what they asked/);
    expect(source('briefs/worker.md')).toMatch(/part of what they asked[^;]*startBecause/);
  });

  it('leaves out what they did not ask for, which waits for their yes', () => {
    const tools = source('mcp/tools.mts');
    const said = tools.slice(tools.indexOf('startBecause: z.'), tools.indexOf('startBecause: z.') + 800);
    expect(said).toMatch(/Leave it out for anything they did not ask for/);
  });
});

describe('without your words it waits for your yes, as before', () => {
  it('when nothing is quoted', async () => {
    const call = yourThread();
    const out = await file(call.id, { title: 'Old copy of the script picked up', parent: call.id });
    expect(out.started ?? out.notStarted ?? null).toBeNull();
    expect(read(out.id).answer ?? null).toBeNull();
    expect(runs(read(out.id))).toBe(false);
  });

  it('when the words are not yours on that thread', async () => {
    const call = yourThread();
    const out = await file(call.id, { title: 'Old copy of the script picked up', parent: call.id, startBecause: 'picked up an old copy of the script' });
    expect(out.notStarted).toMatch(/yes/);
    expect(read(out.id).answer ?? null).toBeNull();
  });

  it('when the words are a teammate\'s message, not yours', async () => {
    const call = yourThread({ reply: null });
    disk.updateWorkItem(product.dir, call.id, { answer: 'Please file the rename as a thread and start it.', from: { teammate: 't-1', name: 'Launch lead' } }, { source: 'system' });
    const out = await file(call.id, { title: 'Rename the demo company', parent: call.id, startBecause: 'Please file the rename as a thread and start it' });
    expect(out.notStarted).toBeTruthy();
    expect(read(out.id).answer ?? null).toBeNull();
  });

  it('when the session runs for no thread', async () => {
    const out = await file(null, { title: 'Old copy of the script picked up', startBecause: ASKED });
    expect(out.notStarted).toBeTruthy();
    expect(read(out.id).answer ?? null).toBeNull();
  });

  it('and a question for you is never answered for you', async () => {
    const call = yourThread();
    const out = await file(call.id, { title: 'Which copy is right?', kind: 'question', parent: call.id, startBecause: ASKED });
    expect(out.notStarted).toBeTruthy();
    expect(read(out.id).answer ?? null).toBeNull();
  });
});
