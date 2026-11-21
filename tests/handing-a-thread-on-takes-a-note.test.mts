// HANDING A THREAD ON TAKES A NOTE (2026-11-12).
//
// A tester picked "Give it to someone else", then his teammate's name, and
// the thread was gone that second: "It is handed over the moment I pick her
// name. No note step." What he wanted from her went in a chat message
// afterwards, apart from the task. A second tester said the same of Share.
// Picking a person now opens the sheet Share uses, with a note box and a
// button that names them; the note goes at the top of the task, under the
// thread's link and over where the agent got to. Measured on the in-memory
// cloud and by drawing the sheet.
import { it, expect, beforeEach, afterEach, describe } from 'vitest';
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
import { isGivenTask } from '../shared/team-rules.mts';
import { handedFrom } from '../shared/thread-link.mts';
import { GiveSheet } from '../renderer/src/threads/SharePanel.tsx';

async function aMac(cloud, personId) {
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hand-on-note-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  fs.mkdirSync(path.join(accountRoot, 'api'), { recursive: true });
  fs.writeFileSync(path.join(accountRoot, 'api', 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'api', name: 'Payments API', seenBy: 'team' }));
  const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  const service = createTeamService({ session: memorySession(() => memoryBackend(cloud, personId)), store, disk, accountRoot, stateFile: path.join(storeRoot, '.team-sync.json'), intervalMs: 3_600_000 });
  return { personId, store, service };
}

let cloud, theo, lena;
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

async function handed(note) {
  const t = theo.store.composeItem('api', { title: 'Payment API auth skip audit', body: 'List the routes that skip auth.' });
  theo.store.recordSessionResult('api', t.id, { result: 'Four routes skip it.' });
  await theo.service.handOn({ product: 'api', id: t.id, to: lena.personId, ...(note === undefined ? {} : { note }) });
  for (let k = 0; k < 2; k += 1) { await theo.service.syncNow(); await lena.service.syncNow(); }
  return lena.store.listItems().find((i) => isGivenTask(i, lena.store.listProducts().find((p) => p.slug === i.product)));
}

describe('the task a hand-off makes', () => {
  it('carries the note between the thread\'s link and where the agent got to', async () => {
    const task = await handed('Can you take the web side? I am out Thursday.');
    const [link, , note, , ask] = task.body.split('\n');
    expect(link).toMatch(/^\[Payment API auth skip audit\]\(https:/);
    expect(note).toBe('Can you take the web side? I am out Thursday.');
    expect(ask).toBe('List the routes that skip auth.');
    expect(task.body).toContain('Where it got to:\n\nFour routes skip it.');
  });
  it('still leads back to the thread it came from', async () => {
    const task = await handed('Can you take the web side?');
    expect(handedFrom(task.body, theo.personId)).toMatchObject({ owner: theo.personId });
  });
  it('is as it was with no note, or one of only spaces', async () => {
    const plain = await handed(undefined);
    expect(plain.body.split('\n')[2]).toBe('List the routes that skip auth.');
    const spaces = await handed('   ');
    expect(spaces.body.split('\n')[2]).toBe('List the routes that skip auth.');
  });
});

describe('the sheet after you pick a person', () => {
  const html = renderToStaticMarkup(h(GiveSheet, { to: { id: 'u-lena', name: 'Lena Fischer' }, onGive() {} }));
  it('names who gets it, has a note box, and a button that says so', () => {
    expect(html).toContain('Lena');
    expect(html).toContain('placeholder="Add a note"');
    expect(html).toContain('Give to Lena');
  });
});

describe('the wiring', () => {
  const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
  it('picking a person opens the sheet; an AI teammate still starts at once', () => {
    const menu = read('renderer/src/threads/ThreadMenu.tsx');
    expect(menu).toContain("if (p.id.startsWith('mate:')) { close(false); onGive?.(p, ''); } else setGivingTo(p);");
    expect(menu).toMatch(/<GiveSheet to=\{givingTo\} step=\{step\} onGive=\{\(note\) => \{ close\(false\); onGive\?\.\(givingTo, note\); \}\}/);
  });
  it('the note travels to the hand-off', () => {
    expect(read('renderer/src/App.tsx')).toContain('api.teamHandOn({ product: item.product, id: item.id, to: to.id, ...(note.trim() ? { note: note.trim() } : {}) })');
    expect(read('main/ipc.mts')).toContain('team!.handOn({ product, id, to, note })');
  });
});
