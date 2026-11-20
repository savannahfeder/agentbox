// ASKING A TEAMMATE FOR HELP OR A REVIEW KEEPS THE THREAD YOURS (2026-11-19).
//
// The only way to bring someone into a thread was to give it away: "Give it to
// someone else" closed the thread here and gave them a task to carry on in a
// thread of their own. A junior engineer stuck at one step, or a PM wanting a
// designer's yes, lost the thread to get the help. Power testers on a team
// logged "Returned handoff answer is absent from original agent thread" and
// "Handoff note is not visible in the original thread".
//
// Now an ask is a task to one person naming your thread. With help, what they
// write on your thread goes to its agent through your own computer, as theirs.
// Handing it back closes their task, and your thread says what they said and
// waits for you. Measured on the in-memory cloud with two computers.
import { it, expect, beforeEach, afterEach, describe, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createTeamService } from '../main/team/index.mts';
import { memorySession } from '../main/team/session.mts';
import { GIVEN_TASK, whatATeammateMaySet } from '../shared/team-rules.mts';
import { pickFields } from '../shared/work-items.mts';
import { askIGave, askOnMe, asksOnThread, handedBackAsks, handedBackWords, helpAskOpen } from '../shared/thread-asks.mts';
import { GiveSheet } from '../renderer/src/threads/SharePanel.tsx';
import { machineryPath } from '../main/store/home.mts';
import { changePath } from '../main/code-change.mts';

async function aMac(cloud, personId, tellThread) {
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ask-a-teammate-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  fs.mkdirSync(path.join(accountRoot, 'api'), { recursive: true });
  fs.writeFileSync(path.join(accountRoot, 'api', 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'api', name: 'Payments API', seenBy: 'team' }));
  const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  const service = createTeamService({ session: memorySession(() => memoryBackend(cloud, personId)), store, disk, accountRoot, stateFile: path.join(storeRoot, '.team-sync.json'), intervalMs: 3_600_000, tellThread });
  return { personId, store, service };
}

let cloud, sam, theo, told;
beforeEach(async () => {
  disk._internals.forgetFolds();
  cloud = createMemoryCloud();
  told = [];
  const tell = (slug, id, o) => { told.push({ slug, id, ...o }); };
  sam = await aMac(cloud, signUpMemory(cloud, { email: 'sam@cf.test', name: 'Sam Ortiz' }), tell);
  theo = await aMac(cloud, signUpMemory(cloud, { email: 'theo@cf.test', name: 'Theo Okafor' }), vi.fn());
  await sam.service.signIn();
  await sam.service.createTeam('Clinicflow');
  await sam.service.invite('theo@cf.test');
  await theo.service.signIn();
  await theo.service.acceptInvite(sam.service.state().team.id);
});
afterEach(async () => { disk.setLineAuthor(null); await sam.service.signOut(); await theo.service.signOut(); });

const both = async (n = 3) => { for (let k = 0; k < n; k += 1) { await sam.service.syncNow(); await theo.service.syncNow(); } };
const theTask = () => theo.store.listItems().find((i) => i.ask);

async function asked(kind, extra = {}) {
  disk.setLineAuthor(sam.personId);
  const t = sam.store.composeItem('api', { title: 'Add an idempotency key to POST /payments', body: 'Add one.' });
  sam.store.recordSessionResult('api', t.id, { result: 'Should I drop the old unique index first?' });
  await sam.service.syncNow();
  await sam.service.askTeammate({ product: 'api', id: t.id, to: theo.personId, kind, note: 'Is dropping the index safe?', ...extra });
  await both();
  return t;
}

describe('an ask for help', () => {
  it('reaches them as a task that names your thread, the step and the note, and your thread stays open', async () => {
    const t = await asked('help', { step: 'Should I drop the old unique index first?' });
    const task = theTask();
    expect(task.title).toBe('Add an idempotency key to POST /payments');
    expect(task.ask).toMatchObject({ kind: 'help', owner: sam.personId, thread: t.id, product: 'api', note: 'Is dropping the index safe?', step: 'Should I drop the old unique index first?' });
    expect(task.assignee).toBe(theo.personId);
    expect(sam.store.readItem('api', t.id).status).not.toBe('done');
  });

  it('passes what they write on your thread to its agent, once, as theirs', async () => {
    const t = await asked('help');
    disk.setLineAuthor(theo.personId);
    await theo.service.commentOnThread(sam.personId, t.id, 'Yes, drop it, but concurrently.');
    await both();
    await both();
    const toAgent = told.filter((x) => !x.hold);
    expect(toAgent).toEqual([{ slug: 'api', id: t.id, text: 'Yes, drop it, but concurrently.', from: { teammate: theo.personId, name: 'Theo Okafor' } }]);
  });

  it('keeps a comment as a comment from someone who was not asked, or after it was handed back', async () => {
    const t = await asked('help');
    disk.setLineAuthor(theo.personId);
    await theo.service.handBack({ product: theTask().product, id: theTask().id, words: 'Done, it is safe.' });
    await both();
    await theo.service.commentOnThread(sam.personId, t.id, 'One more thing.');
    await both();
    expect(told.filter((x) => !x.hold)).toEqual([]);
  });

  it('comes back to your thread when they hand it back, saying what they said, and waits for you', async () => {
    const t = await asked('help');
    disk.setLineAuthor(theo.personId);
    await theo.service.handBack({ product: theTask().product, id: theTask().id, words: 'Safe to drop. I told your agent to do it concurrently.' });
    await both();
    await both();
    const back = told.filter((x) => x.hold);
    expect(back).toEqual([{ slug: 'api', id: t.id, hold: true, from: { teammate: theo.personId, name: 'Theo Okafor' }, text: 'Theo handed this back.\n\nSafe to drop. I told your agent to do it concurrently.' }]);
  });
});

describe('an ask for a review', () => {
  // Round one of the team test: "Reviewer cannot access health diff from handed-off task". The change lived only on the owner's computer.
  it('carries the change the thread made, so the reviewer can read it', async () => {
    disk.setLineAuthor(sam.personId);
    const t = sam.store.composeItem('api', { title: 'Add a health endpoint', body: 'Add /health.' });
    const dir = sam.store.listProducts().find((p) => p.slug === 'api').dir;
    const file = machineryPath(dir, changePath(t.id));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ item: t.id, files: [{ path: 'src/health.js', hunks: [{ rows: [['+', 'export const ok = true;']], plus: 1, minus: 0 }], plus: 1, minus: 0 }], plus: 1, minus: 0 }));
    await sam.service.syncNow();
    await sam.service.askTeammate({ product: 'api', id: t.id, to: theo.personId, kind: 'review' });
    await both();
    expect(theTask().body).toMatch(/\(attachments\/[\w.-]*Add-a-health-endpoint-change\.change\)/);
  });

  it('carries nothing when the thread changed no code', async () => {
    await asked('review');
    expect(theTask().body).not.toContain('.change)');
  });

  it('does not pass their comments to the agent, and brings their verdict back', async () => {
    const t = await asked('review');
    disk.setLineAuthor(theo.personId);
    await theo.service.commentOnThread(sam.personId, t.id, 'The copy on step two is off.');
    await theo.service.handBack({ product: theTask().product, id: theTask().id, verdict: 'changes', words: 'Say "Book a visit", not Submit.' });
    await both();
    await both();
    expect(told.filter((x) => !x.hold)).toEqual([]);
    expect(told.filter((x) => x.hold).map((x) => x.text)).toEqual(['Theo reviewed this and asked for changes.\n\nSay "Book a visit", not Submit.']);
  });
});

describe('who may do what', () => {
  it('only the person asked hands it back, and only once', async () => {
    await asked('help');
    disk.setLineAuthor(sam.personId);
    const onSams = sam.store.listItems().find((i) => i.ask);
    await expect(sam.service.handBack({ product: onSams.product, id: onSams.id })).rejects.toThrow('not yours');
    disk.setLineAuthor(theo.personId);
    await theo.service.handBack({ product: theTask().product, id: theTask().id });
    await expect(theo.service.handBack({ product: theTask().product, id: theTask().id })).rejects.toThrow('already');
  });

  it('a take-back by the owner is not news on their own thread', () => {
    const rows = [{ id: 'k', labels: [GIVEN_TASK], status: 'done', assignee: 'theo', createdBy: 'sam', ask: { kind: 'help', owner: 'sam', thread: 't', product: 'api' }, wrote: { status: { by: 'sam' } } }];
    expect(handedBackAsks(rows, 'sam', new Set())).toEqual([]);
  });
});

describe('the rules, without a cloud', () => {
  const row = (o = {}) => ({ id: 'k', labels: [GIVEN_TASK], status: 'open', assignee: 'theo', createdBy: 'sam', ask: { kind: 'help', owner: 'sam', thread: 't', product: 'api' }, ...o });
  it('an ask is believed only from the copy that wrote it', () => {
    expect(askIGave(row(), 'sam')).toBeTruthy();
    expect(askIGave(row({ createdBy: 'theo' }), 'sam')).toBeNull();
    expect(askIGave(row({ wrote: { ask: { by: 'theo' } } }), 'sam')).toBeNull();
    expect(askIGave({ ...row(), labels: [] }, 'sam')).toBeNull();
  });
  it('help is open to that person on that thread only', () => {
    expect(helpAskOpen([row()], 'sam', 't', 'theo')).toBeTruthy();
    expect(helpAskOpen([row()], 'sam', 't', 'priya')).toBeNull();
    expect(helpAskOpen([row()], 'sam', 'other', 'theo')).toBeNull();
    expect(helpAskOpen([row({ status: 'done' })], 'sam', 't', 'theo')).toBeNull();
    expect(helpAskOpen([row({ ask: { kind: 'review', owner: 'sam', thread: 't', product: 'api' } })], 'sam', 't', 'theo')).toBeNull();
  });
  it('the helper finds it from either side of the thread', () => {
    expect(askOnMe([row()], 'theo', 'sam', 't')).toBeTruthy();
    expect(askOnMe([row()], 'priya', 'sam', 't')).toBeNull();
    expect(asksOnThread([row()], 'sam', 't')).toHaveLength(1);
  });
  it('the words say what came back', () => {
    expect(handedBackWords({ kind: 'review', name: 'Priya', verdict: 'yes', words: '' })).toBe('Priya reviewed this and it looks good.');
    expect(handedBackWords({ kind: 'help', name: 'Theo', verdict: 'done', words: ' ' })).toBe('Theo handed this back.');
  });
  it('the ask field keeps its shape, and crosses only on the line that opens a task', () => {
    expect(pickFields({ ask: { kind: 'take', owner: 'a', thread: 't', product: 'api' } })).toBeNull();
    expect(pickFields({ ask: { kind: 'help', owner: 'a', thread: 't', product: 'api', note: 'n' } }).ask).toEqual({ kind: 'help', owner: 'a', thread: 't', product: 'api', note: 'n' });
    const opening = { id: 'k', ts: 1, by: 'sam', uid: 'u', patch: { kind: 'task', labels: [GIVEN_TASK], title: 'Help', ask: { kind: 'help', owner: 'sam', thread: 't', product: 'api' } } };
    expect(whatATeammateMaySet(opening, { direct: true }).patch.ask).toBeTruthy();
    const later = { id: 'k', ts: 2, by: 'theo', uid: 'v', patch: { ask: { kind: 'help', owner: 'theo', thread: 't', product: 'api' }, verdict: 'yes' } };
    expect(whatATeammateMaySet(later, { direct: true }).patch.ask).toBeUndefined();
    expect(whatATeammateMaySet(later, { direct: true }).patch.verdict).toBe('yes');
    expect(whatATeammateMaySet(opening, { direct: false })).toBeNull();
  });
});

describe('the wiring', () => {
  const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
  it('a thread someone you asked has is out of your Needs you until it comes back', () => {
    const app = read('renderer/src/App.tsx');
    expect(app).toContain("if (askedOut.has(i.id) && !asking(i)) return false;");
    expect(app).toMatch(/const askedOut = useMemo\(\(\) => new Set\(items\.flatMap\(\(r\) => \{\s*const a = askIGave\(r, team\?\.me \?\? null\);\s*return a && r\.status !== 'done' \? \[a\.thread\] : \[\];/);
  });
  it('a helper\'s words on your thread are passed on by your own supervisor', () => {
    expect(read('main/main.mts')).toContain('tellThread: (slug, id, o) => supervisor.tellThread(slug, id, o),');
    expect(read('main/serve.mts')).toContain('tellThread: (slug, id, o) => supervisor.tellThread(slug, id, o),');
  });
});

describe('the sheet after you pick a person', () => {
  it('offers help, a review or handing it over, and starts on help', () => {
    const html = renderToStaticMarkup(h(GiveSheet, { to: { id: 'u', name: 'Theo Okafor' }, onGive() {}, onAsk() {} }));
    expect(html).toContain('Help with a step');
    expect(html).toContain('Review it');
    expect(html).toContain('Hand it over');
    expect(html).toContain('Ask Theo to help');
  });
  it('offers only handing over when asking is not possible', () => {
    const html = renderToStaticMarkup(h(GiveSheet, { to: { id: 'u', name: 'Theo Okafor' }, onGive() {} }));
    expect(html).not.toContain('Help with a step');
    expect(html).toContain('Give to Theo');
  });
});
