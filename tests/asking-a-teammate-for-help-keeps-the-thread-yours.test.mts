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
import { askIGave, askOnMe, asksOnThread, handedBackAsks, handedBackBy, handedBackWords, helpAskOpen, stepOf } from '../shared/thread-asks.mts';
import { GiveSheet } from '../renderer/src/threads/SharePanel.tsx';
import { machineryPath } from '../main/store/home.mts';
import { byWorkHere } from '../renderer/src/thread-commands.ts';
import { AskBar, askChange } from '../renderer/src/team/AskBar.tsx';
import { offerIsLive } from '../renderer/src/format.ts';
import { rowSummary } from '../renderer/src/list-rules.ts';
import { taskWords } from '../renderer/src/team/company.ts';
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
    // The line over the message already says who asked and what for, so the words do not say it again.
    expect(task.body).toContain("What you write on Sam's thread goes to Sam's agent until you hand it back.");
    expect(task.body).not.toMatch(/asked you to help/);
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
    expect(back).toEqual([{ slug: 'api', id: t.id, hold: true, from: { teammate: theo.personId, name: 'Theo Okafor' }, text: 'Theo handed this back.\n\nSafe to drop. I told your agent to do it concurrently.\n\nSam had asked: “Is dropping the index safe?”' }]);
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

  // Round three: Theo opened Sam's thread to review and found no way to the change.
  it('the bar on the thread names the change it carries, and nothing when it carries none', () => {
    expect(askChange({ body: 'Review\n\n[Health change.change](attachments/ab12cd34ef56-Health-change.change)' })).toBe('attachments/ab12cd34ef56-Health-change.change');
    expect(askChange({ body: 'Review\n\n[plan.md](attachments/x-plan.md)' })).toBeNull();
    const html = renderToStaticMarkup(h(AskBar, { task: { id: 't', product: 'dm', productName: '', ask: { kind: 'review', owner: 'sam', thread: 'w', product: 'api' }, body: '[c](attachments/x.change)' }, owner: null, onHandBack: async () => true, onOpenChange() {} }));
    expect(html).toContain('View the change');
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
    expect(told.filter((x) => x.hold).map((x) => x.text)).toEqual(['Theo reviewed this and asked for changes.\n\nSay "Book a visit", not Submit.\n\nSam had asked: “Is dropping the index safe?”']);
  });
});

describe('who may do what', () => {
  // Round three: Sam thanked Theo on a returned review, and it read "Theo is reviewing your thread" again.
  it('a reply on an ask handed back does not open the ask again', async () => {
    const t = await asked('help');
    disk.setLineAuthor(theo.personId);
    await theo.service.handBack({ product: theTask().product, id: theTask().id, words: 'Done.' });
    await both();
    disk.setLineAuthor(sam.personId);
    const onSams = sam.store.listItems().find((i) => i.ask);
    sam.store.answerItem(onSams.product, onSams.id, { answer: 'Thanks!' });
    await both();
    expect(asksOnThread(sam.store.listItems(), sam.personId, t.id).filter((a) => a.open)).toEqual([]);
    expect(askOnMe(theo.store.listItems(), theo.personId, sam.personId, t.id)).toBeNull();
    // Round six: the thank-you reopened the task, so it read "asked Dana" and moved back to In progress.
    expect(sam.store.listItems().find((i) => i.ask)?.status).toBe('done');
    expect(theo.store.listItems().find((i) => i.ask)?.status).toBe('done');
  });

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
  it('the step is the paragraph that asks, without its markdown', () => {
    expect(stepOf('I added a check.\n\nOne decision. **Should I drop it?** It locks writes.\n\n1. Drop it\n2. Keep it')).toBe('One decision. Should I drop it? It locks writes.');
    expect(stepOf('Done: added `/health`.\n\nAll tests pass.')).toBe('Done: added /health.');
    expect(stepOf('')).toBe('');
    expect(stepOf(`${'x'.repeat(700)}?`)).toHaveLength(601);
  });
  // Round two: a thread Priya handed back read "Answered" in Needs you, like every other row.
  it('a thread handed back says by whom while their words are the newest on it', () => {
    const back = { status: 'blocked', wrote: { answer: { ts: 5, teammate: 'priya' }, result: { ts: 3 } } };
    expect(handedBackBy(back)).toBe('priya');
    expect(handedBackBy({ ...back, wrote: { ...back.wrote, result: { ts: 9 } } })).toBeNull();
    expect(handedBackBy({ ...back, status: 'open' })).toBeNull();
    expect(handedBackBy({ status: 'blocked', wrote: { answer: { ts: 5 } } })).toBeNull();
  });
  // Round three: Theo handed Sam's thread back, and the agent's two options could no longer be picked.
  it('a hand-back leaves the agent\'s options open for you to pick', () => {
    const offer = { result: 'Which way?\n\n## Options\n1. Keep it\n2. Drop it', answer: 'Theo handed this back.', wrote: { result: { ts: 1, source: 'agent' }, answer: { ts: 2, source: 'system', teammate: 'theo' } } };
    expect(offerIsLive(offer as never)).toBe(true);
    expect(offerIsLive({ ...offer, wrote: { ...offer.wrote, answer: { ts: 2, source: 'founder' } } } as never)).toBe(false);
  });
  // Round three: the returned row previewed words the status already said, not Theo's answer.
  it('a handed-back row previews the helper\'s own words', () => {
    const row = { answer: 'Theo reviewed this and it looks good.\n\nShip it after the migration runs.', status: 'blocked', wrote: { answer: { ts: 5, by: 'sam', teammate: 'theo' }, result: { ts: 1 } } };
    expect(rowSummary(row, 'inbox')).toBe('Ship it after the migration runs.');
    expect(rowSummary({ ...row, answer: 'Theo handed this back.' }, 'inbox')).toBe('Theo handed this back.');
    expect(rowSummary({ ...row, wrote: { ...row.wrote, answer: { ts: 5, by: 'sam' } } }, 'inbox')).toBe('Theo reviewed this and it looks good.');
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
    expect(app).toMatch(/const askedOut = useMemo\(\(\) => new Set\(items\.flatMap\(\(r\) => \{\s*const a = askIGave\(r, team\?\.me \?\? null\);\s*return a && askIsOpen\(r\) \? \[a\.thread\] : \[\];/);
  });
  // Round two: Dana handed Priya a task, Priya started it in a thread of her own, and Dana could not find it.
  it('a thread started from a task someone handed you leaves its link on that task', () => {
    expect(read('renderer/src/threads/ThreadComposer.tsx')).toContain('answer: `Started on this in a thread of my own: [${message.title}](${startedAt})`');
  });
  // Round two: Priya messaged Dana from Dana's thread and had to spell out which thread she meant.
  it('a message started from a teammate\'s thread starts by naming that thread', () => {
    const app = read('renderer/src/App.tsx');
    expect(app).toContain("const about = openCard.title ? `About “${openCard.title}”: ` : '';");
    expect(app).toContain('if (about && !readDraft(convo).trim()) { saveDraft(convo, about);');
  });
  // Rounds three and four: Home said a teammate had nothing running while their profile showed two in progress.
  it('Home counts a teammate\'s running work the way their profile does', () => {
    expect(read('renderer/src/App.tsx')).toContain('const agents = Math.max(m.agents ?? 0, m.inProgress ?? 0);');
  });
  // Round two: Dana's returned review sat under week-old rows because its project ranks last.
  it('a thread handed back ranks with a teammate\'s message, not with its project', () => {
    expect(read('renderer/src/App.tsx')).toContain('handedBackBy(i as Parameters<typeof handedBackBy>[0]) ? new Set([i.product]) : directSlugs');
  });
  it('a helper\'s words on your thread are passed on by your own supervisor', () => {
    expect(read('main/main.mts')).toContain('tellThread: (slug, id, o) => supervisor.tellThread(slug, id, o),');
    expect(read('main/serve.mts')).toContain('tellThread: (slug, id, o) => supervisor.tellThread(slug, id, o),');
  });
});

// Round four: Priya could not tell from the inbox which rows were teammates asking for her review.
describe('the row of an ask', () => {
  const product = { slug: 'dm', team: { direct: true, projectId: 'd1', people: ['sam', 'theo'] } };
  const task = (o = {}) => ({ id: 'k', product: 'dm', labels: [GIVEN_TASK], status: 'open', assignee: 'theo', createdBy: 'sam', people: ['sam', 'theo'], ask: { kind: 'review', owner: 'sam', thread: 't', product: 'api' }, ...o });
  const nameOf = (id) => ({ sam: 'Sam', theo: 'Theo' })[id];
  it('says what is asked, to the person asked and to the one who asked', () => {
    expect(taskWords(task(), product, 'theo', nameOf)?.word).toBe('Sam asks for a review');
    expect(taskWords(task({ ask: { kind: 'help', owner: 'sam', thread: 't', product: 'api' } }), product, 'theo', nameOf)?.word).toBe('Sam asks for help');
    expect(taskWords(task(), product, 'sam', nameOf)?.word).toBe('Theo is reviewing');
  });
  // Round four: the board said "With Dana" for a review Dana had handed back and Priya had thanked her for.
  it('says it was handed back, even after a thank-you reopened the task', () => {
    expect(taskWords(task({ verdict: 'yes' }), product, 'sam', nameOf)?.word).toBe('Theo handed it back');
    expect(taskWords(task({ verdict: 'yes' }), product, 'theo', nameOf)?.word).toBe('You handed it back');
  });
  it('a task that is not an ask reads as before', () => {
    expect(taskWords(task({ ask: undefined }), product, 'sam', nameOf)?.word).toBe('With Theo');
  });
});

describe('whom to ask', () => {
  const now = 10 * 86_400_000;
  const people = [{ id: 'dana', name: 'Dana' }, { id: 'theo', name: 'Theo' }, { id: 'priya', name: 'Priya' }];
  const card = (personId, project, ago = 0) => ({ personId, project, updatedAt: now - ago });
  it('puts whoever worked in this project this week first, saying how much', () => {
    const out = byWorkHere(people, [card('theo', 'Payments API'), card('theo', 'Payments API'), card('priya', 'Payments API'), card('dana', 'Web app')], 'Payments API', now);
    expect(out.map((p) => [p.name, p.detail])).toEqual([['Theo', '2 in Payments API this week'], ['Priya', '1 in Payments API this week'], ['Dana', undefined]]);
  });
  it('counts nothing older than a week, and keeps the team\'s order when nobody worked there', () => {
    expect(byWorkHere(people, [card('theo', 'Payments API', 8 * 86_400_000)], 'Payments API', now).map((p) => p.name)).toEqual(['Dana', 'Theo', 'Priya']);
    expect(byWorkHere(people, [], null, now)).toEqual(people);
  });
});

// The founder on the first sheet, three radio rows each with a line under it:
// "this is lowkey confusing". Now one switch of three short words, and one
// sentence for the picked one only.
describe('the sheet after you pick a person', () => {
  const sheet = (o = {}) => renderToStaticMarkup(h(GiveSheet, { to: { id: 'u', name: 'Theo Okafor' }, onGive() {}, onAsk() {}, ...o }));
  it('offers help, a review or handing it over as one switch, and starts on help', () => {
    const html = sheet();
    expect(html).toContain('role="radiogroup"');
    expect((html.match(/role="radio"/g) ?? []).length).toBe(3);
    expect(html).toMatch(/>Help<\/button>/);
    expect(html).toMatch(/>Review<\/button>/);
    expect(html).toMatch(/>Hand over<\/button>/);
    expect(html).toContain('Ask Theo to help');
  });
  it('says what the picked one does in one sentence, and only that one', () => {
    const help = sheet();
    expect(help).toContain('Theo can write to your agent, then hands it back to you.');
    expect(help).not.toContain('from now on');
    const give = sheet({ start: 'give' });
    expect(give).toContain('It becomes Theo’s thread from now on.');
    expect(give).not.toContain('write to your agent');
    expect(sheet({ start: 'review' })).toContain('Theo reads it and tells you it looks good or what to change.');
  });
  it('offers only handing over when asking is not possible', () => {
    const html = renderToStaticMarkup(h(GiveSheet, { to: { id: 'u', name: 'Theo Okafor' }, onGive() {} }));
    expect(html).not.toContain('role="radiogroup"');
    expect(html).toContain('Give to Theo');
  });
});
