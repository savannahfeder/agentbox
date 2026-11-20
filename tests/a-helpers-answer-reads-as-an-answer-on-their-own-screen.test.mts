// A HELPER'S ANSWER READS AS AN ANSWER ON THEIR OWN SCREEN (2026-11-20).
//
// Second rerun, two copies: Lena typed her answer to Theo's step and pressed
// Send to Theo's agent. Theo's copy took it as the answer at once (his
// ledger: the reply under Lena's name, "Lena answered this step", a run 100s
// later), but Lena's own page showed her words as "Comment, goes to the agent
// with the next reply" and the box went back to "Send to Theo": her copy
// draws what she wrote from the cloud's comments, which say nothing of an
// answer, until Theo's copy publishes the thread again. Her copy now
// remembers the comments it sent as answers and draws them as hers, answered.
// And Theo typed a reason, then pressed option 2: only the option went, and
// his words vanished. An option pressed with words in the box sends both.
// Measured on two copies over the in-memory cloud, the thread as drawn, and
// the option's words.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { askedPatch } from '../shared/thread-ask.mts';
import { threadEvents } from '../renderer/src/thread-history.ts';
import { optionWithNote } from '../renderer/src/threads/TeammateThread.tsx';
import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createTeamService } from '../main/team/index.mts';
import { memorySession } from '../main/team/session.mts';

async function aMac(cloud: ReturnType<typeof createMemoryCloud>, personId: string) {
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'helper-screen-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  fs.mkdirSync(path.join(accountRoot, 'api'), { recursive: true });
  fs.writeFileSync(path.join(accountRoot, 'api', 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'api', name: 'Payments API' }));
  const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  const service = createTeamService({ session: memorySession(() => memoryBackend(cloud, personId)), store, disk, accountRoot, stateFile: path.join(storeRoot, '.team-sync.json'), intervalMs: 3_600_000 });
  return { personId, store, service };
}

describe('on the helper\'s copy', () => {
  let theo: Awaited<ReturnType<typeof aMac>>;
  let lena: Awaited<ReturnType<typeof aMac>>;
  let thread: { id: string };
  beforeEach(async () => {
    disk._internals.forgetFolds();
    const cloud = createMemoryCloud();
    theo = await aMac(cloud, signUpMemory(cloud, { email: 'theo@nw.test', name: 'Theo Okafor' }));
    lena = await aMac(cloud, signUpMemory(cloud, { email: 'lena@nw.test', name: 'Lena Fischer' }));
    await theo.service.signIn();
    await theo.service.createTeam('Northwind');
    await theo.service.invite('lena@nw.test');
    await lena.service.signIn();
    await lena.service.acceptInvite(theo.service.state().team.id);
    disk.setLineAuthor(theo.personId);
    await theo.service.share('api', { visibility: 'team' });
    thread = theo.store.composeItem('api', { title: 'Overlapping appointments in POST', body: 'Propose two ways to reject overlaps.', visibility: 'team' });
    theo.store.recordSessionResult('api', thread.id, { result: 'Which approach should I take?\n\n## Options\n1. In-memory overlap check\n2. Database constraint' });
    theo.store.threadEdit('api', thread.id, askedPatch([lena.personId], 'Asked Lena', Date.now() - 1000, 'help'));
    for (let k = 0; k < 3; k += 1) { await theo.service.syncNow(); await lena.service.syncNow(); }
  });
  afterEach(async () => { disk.setLineAuthor(null); await theo.service.signOut(); await lena.service.signOut(); });

  const drawn = () => threadEvents(lena.service.threadWork(theo.personId, thread.id).lines)
    .filter((e) => (e.words ?? '').includes('in-memory overlap check, and name the clash'));

  it('draws a typed answer as hers, answered, before the owner\'s copy has synced', async () => {
    await lena.service.commentOnThread(theo.personId, thread.id, 'Go with the in-memory overlap check, and name the clash in the 400.', { answers: true });
    expect(drawn()).toHaveLength(1);
    expect(drawn()[0]).toMatchObject({ said: 'Lena Fischer answered' });
  });

  it('still once, and still an answer, after both copies sync', async () => {
    await lena.service.commentOnThread(theo.personId, thread.id, 'Go with the in-memory overlap check, and name the clash in the 400.', { answers: true });
    for (let k = 0; k < 3; k += 1) { await theo.service.syncNow(); await lena.service.syncNow(); }
    expect(drawn()).toHaveLength(1);
    expect(drawn()[0]).toMatchObject({ said: 'Lena Fischer answered' });
    expect(theo.store.readItem('api', thread.id).answer).toBe('Go with the in-memory overlap check, and name the clash in the 400.');
  });

  it('a plain comment is still drawn as a comment', async () => {
    await lena.service.commentOnThread(theo.personId, thread.id, 'Nice table. Go with the in-memory overlap check, and name the clash in the 400.');
    expect(drawn()[0]).toMatchObject({ said: 'They commented' });
  });
});

describe('an option pressed with words in the box', () => {
  it('sends the option and the words', () => {
    expect(optionWithNote('Cursor pagination', '  Offsets break when rows are inserted mid-scroll.  ')).toBe('Cursor pagination\n\nOffsets break when rows are inserted mid-scroll.');
  });
  it('sends the option alone with an empty box', () => {
    expect(optionWithNote('Cursor pagination', '   ')).toBe('Cursor pagination');
  });
  it('is what the option buttons send, and the helper is told it went', () => {
    const page = fs.readFileSync(new URL('../renderer/src/threads/TeammateThread.tsx', import.meta.url), 'utf8');
    // Since round 3 a press picks and the one send carries both (a-helper-picks-an-option-and-says-why-in-one-send).
    expect(page).toContain('return o ? optionWithNote(o.text.replace(');
    expect(page).toContain('api.teamComment({ personId, threadId, text, ...(answering ? { answers: true } : {}) })');
  });
});
