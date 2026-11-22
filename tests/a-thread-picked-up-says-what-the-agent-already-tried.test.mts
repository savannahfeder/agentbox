// A THREAD PICKED UP SAYS WHAT THE AGENT ALREADY TRIED (w-f702d60afe, 2026-11-20).
//
// Feedback the founder passed on: "When I pick up a bug from someone else, the
// first thing I want to know is what the agent already tried." The agent keeps
// that list on every thread (`progress`, the Done list), but a hand-over carried
// only the brief and "Where it got to", and a teammate's thread page kept the
// list behind its About button, so whoever picked the thread up never saw it.
// Measured on the in-memory cloud and by drawing the pages.
import { it, expect, beforeEach, afterEach, describe } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createTeamService } from '../main/team/index.mts';
import { memorySession } from '../main/team/session.mts';
import { isGivenTask } from '../shared/team-rules.mts';
import { TeammateSummary } from '../renderer/src/threads/Summary.tsx';
import { machineryPath } from '../main/store/home.mts';
import { changePath } from '../main/code-change.mts';
globalThis.React = React;

async function aMac(cloud: ReturnType<typeof createMemoryCloud>, personId: string) {
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'already-tried-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  fs.mkdirSync(path.join(accountRoot, 'api'), { recursive: true });
  fs.writeFileSync(path.join(accountRoot, 'api', 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'api', name: 'Payments API', seenBy: 'team' }));
  const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  const service = createTeamService({ session: memorySession(() => memoryBackend(cloud, personId)), store, disk, accountRoot, stateFile: path.join(storeRoot, '.team-sync.json'), intervalMs: 3_600_000 });
  return { personId, store, service, dir: path.join(accountRoot, 'api') };
}

let cloud: ReturnType<typeof createMemoryCloud>, theo: Awaited<ReturnType<typeof aMac>>, lena: Awaited<ReturnType<typeof aMac>>;
beforeEach(async () => {
  disk._internals.forgetFolds();
  cloud = createMemoryCloud();
  theo = await aMac(cloud, signUpMemory(cloud, { email: 'theo@nw.test', name: 'Theo Okafor' }));
  lena = await aMac(cloud, signUpMemory(cloud, { email: 'lena@nw.test', name: 'Lena Fischer' }));
  await theo.service.signIn();
  await theo.service.createTeam('Northwind');
  await theo.service.invite('lena@nw.test');
  await lena.service.signIn();
  await lena.service.acceptInvite(theo.service.state().team.id);
  disk.setLineAuthor(theo.personId);
});
afterEach(async () => { disk.setLineAuthor(null); await theo.service.signOut(); await lena.service.signOut(); });

async function handed(progress?: string, change?: { uncommitted: boolean }) {
  const t = theo.store.composeItem('api', { title: 'Retries charge twice', body: 'Find why a retried payment charges twice.' });
  if (progress !== undefined) disk.updateWorkItem(theo.dir, t.id, { progress }, { source: 'agent' });
  if (change) {
    const file = machineryPath(theo.dir, changePath(t.id));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ item: t.id, files: [], committed: !change.uncommitted, uncommitted: change.uncommitted }));
  }
  theo.store.recordSessionResult('api', t.id, { result: 'The retry path skips the key check.' });
  await theo.service.handOn({ product: 'api', id: t.id, to: lena.personId });
  for (let k = 0; k < 2; k += 1) { await theo.service.syncNow(); await lena.service.syncNow(); }
  return lena.store.listItems().find((i) => isGivenTask(i, lena.store.listProducts().find((p) => p.slug === i.product)))!;
}

describe('the task a hand-over makes', () => {
  it('lists what the agent already tried, oldest first, before where it got to', async () => {
    const task = await handed('Reproduced it with two POSTs 50ms apart\n- Tried a lock on the row, which **deadlocked** under load\nFound the retry path skips the key check');
    expect(task.body).toContain('What the agent already tried:\n\n- Reproduced it with two POSTs 50ms apart\n- Tried a lock on the row, which deadlocked under load\n- Found the retry path skips the key check\n\nWhere it got to:\n\nThe retry path skips the key check.');
  });
  // 2026-11-22, a power test: Dana asked Priya to review her thread, Priya's review came back, and Dana
  // handed the thread to Lena. Lena's task showed the old draft and not a word of Priya's review, so
  // Dana's note ("use Priya's copy") pointed at words Lena could not see.
  it('carries the review that came back, after where it got to', async () => {
    const t = theo.store.composeItem('api', { title: 'Payment failed copy', body: 'Write the payment failed screen.' });
    theo.store.recordSessionResult('api', t.id, { result: 'Drafted: "Your payment failed."' });
    theo.store.tellItem('api', t.id, { text: 'Lena reviewed this.\n\nUse "Your payment didn\'t go through" as the heading.', from: { teammate: lena.personId, name: 'Lena Fischer' }, hold: true });
    await theo.service.handOn({ product: 'api', id: t.id, to: lena.personId });
    for (let k = 0; k < 2; k += 1) { await theo.service.syncNow(); await lena.service.syncNow(); }
    const task = lena.store.listItems().find((i) => isGivenTask(i, lena.store.listProducts().find((p) => p.slug === i.product)))!;
    expect(task.body).toContain('Where it got to:\n\nDrafted: "Your payment failed."\n\nWhat Lena said back:\n\nLena reviewed this.\n\nUse "Your payment didn\'t go through" as the heading.');
  });
  it('carries no review when the newest words are the giver\'s own', async () => {
    const t = theo.store.composeItem('api', { title: 'Payment failed copy', body: 'Write the payment failed screen.' });
    theo.store.recordSessionResult('api', t.id, { result: 'Drafted it.' });
    theo.store.answerItem('api', t.id, { answer: 'Make it shorter.' });
    await theo.service.handOn({ product: 'api', id: t.id, to: lena.personId });
    for (let k = 0; k < 2; k += 1) { await theo.service.syncNow(); await lena.service.syncNow(); }
    const task = lena.store.listItems().find((i) => isGivenTask(i, lena.store.listProducts().find((p) => p.slug === i.product)))!;
    expect(task.body).not.toContain('said back');
  });
  it('says nothing about it when the agent kept no list', async () => {
    const task = await handed();
    expect(task.body).not.toContain('already tried');
    expect(task.body).toContain('Where it got to:');
  });
  it('says the work is not committed and carries every edit with it', async () => {
    // Round eleven: the receiver's agent could not find the test the summary named; it was only on the giver's computer.
    const task = await handed('Added a focused test', { uncommitted: true });
    expect(task.body).toContain("Not committed yet: this work is only on Theo's computer. The file below holds every edit the agent made.");
    expect(task.body).toMatch(/\]\(attachments\/[^)]*change\.change\)/);
  });
  it('says nothing of it when the work is committed, and still carries the change', async () => {
    const task = await handed('Added a focused test', { uncommitted: false });
    expect(task.body).not.toContain('Not committed');
    expect(task.body).toMatch(/change\.change\)/);
  });
  it('says nothing about it when the list is only blank lines', async () => {
    const task = await handed('\n  \n');
    expect(task.body).not.toContain('already tried');
  });
});

describe('a teammate\'s thread page', () => {
  const page = fs.readFileSync(new URL('../renderer/src/threads/TeammateThread.tsx', import.meta.url), 'utf8');
  // 2026-11-21 (w-8a8eac7620): the list is part of the summary at the top, which About became.
  it('shows the list in the summary under the thread\'s name, before the conversation', () => {
    const at = page.indexOf('<TeammateSummary card={card} owner={owner} files={files} />');
    expect(at).toBeGreaterThan(page.indexOf('<h2 className="one-title">{title}</h2>'));
    expect(at).toBeLessThan(page.indexOf('<Thread events={before}'));
  });
  it('shows it once, with what the thread is about', () => {
    const card = { personId: 'theo', threadId: 'w', visible: true, title: 'T', project: null, state: 'working', priority: null, problem: 'Retries charge twice.', progress: 'Tried a lock', solution: null, blockedBy: [], blocks: [], people: null, updatedAt: 1 };
    const html = renderToStaticMarkup(React.createElement(TeammateSummary, { card: card as never, owner: 'Theo' }));
    expect(html.match(/Tried a lock/g)).toHaveLength(1);
    expect(html).toContain('What Theo&#x27;s agent already tried');
    expect(html).toContain('Retries charge twice.');
    expect(page).not.toMatch(/tp-tried|TeammateCard/);
  });
});
