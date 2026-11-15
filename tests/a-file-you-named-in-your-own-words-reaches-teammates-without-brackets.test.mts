// A FILE YOU NAMED IN YOUR OWN WORDS REACHES TEAMMATES WITHOUT BRACKETS (2026-11-12).
//
// A tester opened her teammate's thread and his first message read "Save the
// table as [auth-audit.md](attachments/ea2e387f31d5-auth-audit.md) in the repo
// root." A shared thread swaps every file a message names for a link to the
// copy that goes up with it. That is right in an agent's answer, which is
// markdown. A person's words are drawn as typed, so there the link showed as
// its brackets. Measured on the in-memory cloud. A person's words now go up as
// they typed them, with the file on a line of its own under them, which a
// thread draws as the file (renderer/src/typed-message.ts).
import { it, expect, beforeEach, afterEach, describe } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createTeamService } from '../main/team/index.mts';
import { memorySession } from '../main/team/session.mts';
import { typedParts } from '../renderer/src/typed-message.ts';

async function aMac(cloud, personId) {
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'typed-words-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  fs.mkdirSync(path.join(accountRoot, 'api'), { recursive: true });
  fs.writeFileSync(path.join(accountRoot, 'api', 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'api', name: 'Payments API', seenBy: 'team' }));
  const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  const service = createTeamService({ session: memorySession(() => memoryBackend(cloud, personId)), store, disk, accountRoot, stateFile: path.join(storeRoot, '.team-sync.json'), intervalMs: 3_600_000 });
  return { personId, store, service, dir: path.join(accountRoot, 'api') };
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
afterEach(async () => { await theo.service.signOut(); await lena.service.signOut(); });

const asLenaReadsIt = async ({ body, result, reply }) => {
  const item = theo.store.composeItem('api', { title: 'Payment API auth skip audit', body, visibility: 'team' });
  fs.mkdirSync(path.join(theo.dir, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(theo.dir, 'docs', 'auth-audit.md'), '# Audit\n');
  theo.store.recordSessionResult('api', item.id, { result });
  if (reply) theo.store.answerItem('api', item.id, { answer: reply });
  await theo.service.syncNow();
  await lena.service.syncNow();
  const { lines } = lena.service.threadWork(theo.personId, item.id);
  const said = (field) => lines.map((l) => l.patch?.[field]).filter(Boolean);
  return { body: said('body')[0], result: said('result')[0], answer: said('answer')[0] };
};
const LINK = /\[auth-audit\.md\]\(attachments\/[0-9a-f]{12}-auth-audit\.md\)/;

describe("a person's words that name a file", () => {
  it('go up as typed, with the file on its own line under them', async () => {
    const { body } = await asLenaReadsIt({ body: 'Save the table as auth-audit.md in the repo root.', result: 'Wrote auth-audit.md' });
    const [words, , file] = body.split('\n');
    expect(words).toBe('Save the table as auth-audit.md in the repo root.');
    expect(file).toMatch(new RegExp(`^${LINK.source}$`));
    const parts = typedParts(body);
    expect(parts[0]).toEqual({ text: 'Save the table as auth-audit.md in the repo root.' });
    expect(parts[1].embed).toMatch(LINK);
  });
  it('a reply is treated the same, and names the file once however often it says it', async () => {
    const { answer } = await asLenaReadsIt({ body: 'Audit the auth.', result: 'Wrote auth-audit.md', reply: 'Add a fix section to auth-audit.md, and keep `auth-audit.md` short.' });
    expect(answer.startsWith('Add a fix section to auth-audit.md, and keep `auth-audit.md` short.')).toBe(true);
    expect(answer.match(new RegExp(LINK.source, 'g'))).toHaveLength(1);
  });
});

describe('what must not change', () => {
  it("an agent's answer still links the file where it names it", async () => {
    const { result } = await asLenaReadsIt({ body: 'Audit the auth.', result: 'Wrote auth-audit.md with four findings.' });
    expect(result).toMatch(new RegExp(`^Wrote ${LINK.source} with four findings\\.$`));
  });
  it('words that name no file go up untouched', async () => {
    const { body } = await asLenaReadsIt({ body: 'Audit the auth, nothing else.', result: 'Wrote auth-audit.md' });
    expect(body).toBe('Audit the auth, nothing else.');
  });
});
