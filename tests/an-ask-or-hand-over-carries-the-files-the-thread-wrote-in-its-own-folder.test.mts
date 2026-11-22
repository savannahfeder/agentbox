// An ask or a hand-over carried only the thread's change and the files in the project's documents, so a doc
// the agent wrote in the thread's own checkout opened as "not in Direct" for the reviewer, and the .change came first.
import { it, expect, beforeEach, afterEach, describe, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createTeamService } from '../main/team/index.mts';
import { memorySession } from '../main/team/session.mts';
import { machineryPath } from '../main/store/home.mts';
import { changePath } from '../main/code-change.mts';
import { MAX_MESSAGE_FILE_BYTES } from '../main/team/sync.mts';

async function aMac(cloud, personId, repoPath = null) {
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ask-carries-own-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  fs.mkdirSync(path.join(accountRoot, 'api'), { recursive: true });
  fs.writeFileSync(path.join(accountRoot, 'api', 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'api', name: 'Payments API', seenBy: 'team', ...(repoPath ? { repoPath } : {}) }));
  const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  const service = createTeamService({ session: memorySession(() => memoryBackend(cloud, personId)), store, disk, accountRoot, stateFile: path.join(storeRoot, '.team-sync.json'), intervalMs: 3_600_000, tellThread: vi.fn() });
  return { personId, store, service, dir: path.join(accountRoot, 'api') };
}

let cloud, sam, priya, repo;
beforeEach(async () => {
  disk._internals.forgetFolds();
  cloud = createMemoryCloud();
  repo = fs.mkdtempSync(path.join(os.tmpdir(), 'ask-carries-repo-'));
  sam = await aMac(cloud, signUpMemory(cloud, { email: 'sam@cf.test', name: 'Sam Ortiz' }), repo);
  priya = await aMac(cloud, signUpMemory(cloud, { email: 'priya@cf.test', name: 'Priya Shah' }));
  await sam.service.signIn();
  await sam.service.createTeam('Clinicflow');
  await sam.service.invite('priya@cf.test');
  await priya.service.signIn();
  await priya.service.acceptInvite(sam.service.state().team.id);
  disk.setLineAuthor(sam.personId);
});
afterEach(async () => { disk.setLineAuthor(null); await sam.service.signOut(); await priya.service.signOut(); });

const both = async () => { for (let k = 0; k < 3; k += 1) { await sam.service.syncNow(); await priya.service.syncNow(); } };
const write = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };
const checkout = (id, rel) => path.join(repo, '.claude', 'worktrees', id, rel);
const theTask = () => priya.store.listItems().find((i) => i.title === 'Payment amount in cents or decimals');
const linked = (body) => [...body.matchAll(/\]\((attachments\/[^)\s]+)\)/g)].map((m) => m[1]);
const carried = (task, rel) => fs.readFileSync(path.join(priya.store.listProducts().find((p) => p.slug === task.product).dir, rel), 'utf8');

function aThread(result) {
  const t = sam.store.composeItem('api', { title: 'Payment amount in cents or decimals', body: 'Write the error messages for a bad amount.' });
  sam.store.recordSessionResult('api', t.id, { result: result(t.id) });
  return t;
}
function withAChange(id) {
  const file = machineryPath(sam.dir, changePath(id));
  write(file, JSON.stringify({ item: id, files: [{ path: 'src/amount.ts', hunks: [{ rows: [['+', 'export const cents = true;']], plus: 1, minus: 0 }], plus: 1, minus: 0 }], plus: 1, minus: 0 }));
}

describe('a doc the agent wrote in the thread\'s own checkout', () => {
  it('goes with an ask for a review, before the change, and opens for the reviewer', async () => {
    const t = aThread(() => 'Wrote [amount-errors.md](amount-errors.md) with the three new lines.');
    write(checkout(t.id, 'amount-errors.md'), 'For developers only.\n');
    withAChange(t.id);
    await sam.service.syncNow();
    await sam.service.askTeammate({ product: 'api', id: t.id, to: priya.personId, kind: 'review', note: 'Look only at amount-errors.md.' });
    await both();
    const files = linked(theTask().body);
    expect(files).toHaveLength(2);
    expect(files[0]).toMatch(/amount-errors\.md$/);
    expect(files[1]).toMatch(/\.change$/);
    expect(carried(theTask(), files[0])).toBe('For developers only.\n');
  });

  it('goes with a hand-over, before the change', async () => {
    const t = aThread(() => 'Wrote amount-errors.md.');
    write(checkout(t.id, 'docs/amount-errors.md'), 'For developers only.\n');
    withAChange(t.id);
    await sam.service.syncNow();
    await sam.service.handOn({ product: 'api', id: t.id, to: priya.personId });
    await both();
    const files = linked(theTask().body);
    expect(files.map((f) => f.split('.').pop())).toEqual(['md', 'change']);
    expect(carried(theTask(), files[0])).toBe('For developers only.\n');
  });

  // A power test, 2026-11-22: Priya handed her reviewed checkout thread to Lena, and the newest
  // page the agent made, clinic-checkout-v3.html, reached her as words she could not open.
  it('goes with a hand-over when it is a page the agent made', async () => {
    const t = aThread(() => 'The prototype is [clinic-checkout-v3.html](clinic-checkout-v3.html).');
    write(checkout(t.id, 'clinic-checkout-v3.html'), '<h1>Visit checkout</h1>\n');
    await sam.service.syncNow();
    await sam.service.handOn({ product: 'api', id: t.id, to: priya.personId });
    await both();
    const files = linked(theTask().body);
    expect(files.some((f) => /clinic-checkout-v3\.html$/.test(f))).toBe(true);
    expect(carried(theTask(), files.find((f) => /clinic-checkout-v3\.html$/.test(f))!)).toBe('<h1>Visit checkout</h1>\n');
  });

  // The third round: the review that came back said "Notes on bookings-empty-states.html:", the bare
  // name was taken as the page's newest copy, nothing held it, and the page stayed "On Priya's computer".
  it('goes with a hand-over when a review that came back names it in words', async () => {
    const at = (id) => path.join(sam.dir, 'designs', id, 'bookings-empty-states.html');
    const t = aThread((id) => `The two states:\n\n${at(id)}`);
    write(at(t.id), '<h1>No bookings yet</h1>\n');
    sam.store.tellItem('api', t.id, { text: 'Priya reviewed this.\n\nNotes on bookings-empty-states.html:\n- Pin 1: Say New booking.', from: { teammate: priya.personId, name: 'Priya Shah' }, hold: true });
    await sam.service.syncNow();
    await sam.service.handOn({ product: 'api', id: t.id, to: priya.personId });
    await both();
    const page = linked(theTask().body).find((f) => /bookings-empty-states\.html$/.test(f));
    expect(page).toBeTruthy();
    expect(carried(theTask(), page!)).toBe('<h1>No bookings yet</h1>\n');
  });

  it('is said to be left behind when it is over the size a message carries', async () => {
    const t = aThread(() => 'Wrote [amount-errors.md](amount-errors.md).');
    write(checkout(t.id, 'amount-errors.md'), '');
    fs.truncateSync(checkout(t.id, 'amount-errors.md'), MAX_MESSAGE_FILE_BYTES + 1);
    await sam.service.syncNow();
    await sam.service.handOn({ product: 'api', id: t.id, to: priya.personId });
    await both();
    expect(linked(theTask().body)).toEqual([]);
    expect(theTask().body).toContain('Not sent: amount-errors.md, over 10 MB.');
  });

  it('goes at the size a message carries', async () => {
    const t = aThread(() => 'Wrote [amount-errors.md](amount-errors.md).');
    write(checkout(t.id, 'amount-errors.md'), '');
    fs.truncateSync(checkout(t.id, 'amount-errors.md'), MAX_MESSAGE_FILE_BYTES);
    await sam.service.syncNow();
    await sam.service.handOn({ product: 'api', id: t.id, to: priya.personId });
    await both();
    expect(linked(theTask().body)).toHaveLength(1);
  });
});

describe('what an ask still leaves behind', () => {
  it('a code file the thread names in passing, though its checkout holds it', async () => {
    const t = aThread(() => 'Changed `src/amount.ts` to keep cents.');
    write(checkout(t.id, 'src/amount.ts'), 'export const cents = true;\n');
    await sam.service.syncNow();
    await sam.service.askTeammate({ product: 'api', id: t.id, to: priya.personId, kind: 'review' });
    await both();
    expect(linked(theTask().body)).toEqual([]);
  });

  it('a doc named by its full path outside the project', async () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ask-carries-outside-'));
    write(path.join(outside, 'salaries.md'), 'private\n');
    aThread(() => `Read [salaries.md](${path.join(outside, 'salaries.md')}).`);
    const t = sam.store.listItems().find((i) => i.title === 'Payment amount in cents or decimals');
    await sam.service.syncNow();
    await sam.service.askTeammate({ product: 'api', id: t.id, to: priya.personId, kind: 'review' });
    await both();
    expect(linked(theTask().body)).toEqual([]);
  });

  it('a doc of the same name in another thread\'s checkout that this thread never named', async () => {
    const other = sam.store.composeItem('api', { title: 'Other work', body: 'Something else.' });
    write(checkout(other.id, 'amount-errors.md'), 'not this one\n');
    const t = aThread(() => 'Will write amount-errors.md next.');
    await sam.service.syncNow();
    await sam.service.askTeammate({ product: 'api', id: t.id, to: priya.personId, kind: 'review' });
    await both();
    expect(linked(theTask().body)).toEqual([]);
  });
});
