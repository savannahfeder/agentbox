// A COMMENT ON A FILE'S V2 IS LABELLED V2 IN CHAT (2026-11-15).
//
// Two power testers on one team commented on customer-call-tasks.md while Files
// showed "v2 of 2", and both found their comment, and the reply to it, labelled
// "customer-call-tasks.md v1" on the person's page. The thread held one copy of
// the file, edited in place, so its version id was the bare name and the version
// line numbered it 2; the chat read the number out of the id and fell back to 1.
// Measured in the testers' cloud: both notes stored `file: "customer-call-tasks.md"`
// with nothing saying which version was on screen. A note now keeps the number it
// was written on (`v`), and the chat names that.
import { it, expect, beforeEach, afterEach, describe } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createTeamService } from '../main/team/index.mts';
import { memorySession } from '../main/team/session.mts';
import { cleanMark } from '../shared/artifact-marks.mts';
import { fileLabel, pairTimeline } from '../renderer/src/team/pair-timeline.ts';
import type { ThreadTalk } from '../renderer/src/types.ts';

describe('a note keeps the version it was written on', () => {
  const note = { do: 'note', id: 'n1', file: 'customer-call-tasks.md', place: { kind: 'whole' }, text: 'Quick read is clear' };

  it('keeps a whole version number', () => {
    expect(cleanMark({ ...note, v: 2 })).toMatchObject({ v: 2 });
    expect(cleanMark({ ...note, v: 1 })).toMatchObject({ v: 1 });
  });

  it('drops a number that is no version, and keeps the note', () => {
    for (const v of [0, -1, 1.5, '2', 100_000, null]) {
      const kept = cleanMark({ ...note, v });
      expect(kept).toMatchObject({ do: 'note', id: 'n1' });
      expect(kept).not.toHaveProperty('v');
    }
  });
});

describe('the chat names the version a note was written on', () => {
  it('says v2 for a bare file name written on v2', () => {
    expect(fileLabel('customer-call-tasks.md', 2)).toBe('customer-call-tasks.md v2');
  });

  it('reads the name as before when the note carries no number', () => {
    expect(fileLabel('customer-call-tasks.md')).toBe('customer-call-tasks.md v1');
    expect(fileLabel('report.md#3')).toBe('report.md v3');
    expect(fileLabel('report.md@4')).toBe('report.md v4');
    expect(fileLabel('report-v2.md')).toBe('report.md v2');
  });
});

async function aMac(cloud: ReturnType<typeof createMemoryCloud>, personId: string) {
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'v2-in-chat-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  fs.mkdirSync(path.join(accountRoot, 'website'), { recursive: true });
  fs.writeFileSync(path.join(accountRoot, 'website', 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'website', name: 'Website', seenBy: 'team' }));
  const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  const service = createTeamService({
    session: memorySession(() => memoryBackend(cloud, personId)),
    store, disk, accountRoot, stateFile: path.join(storeRoot, '.team-sync.json'), intervalMs: 3_600_000,
  });
  return { personId, store, service };
}

describe('between two people on one team', () => {
  let ana: Awaited<ReturnType<typeof aMac>>, jordan: Awaited<ReturnType<typeof aMac>>;
  let thread: { id: string };
  const syncBoth = async () => { for (const m of [ana, jordan]) await m.service.syncNow(); };
  const labelsOn = (m: typeof ana) => {
    const talk = (m.service.state() as { threadTalk?: ThreadTalk[] }).threadTalk ?? [];
    const other = m === ana ? jordan.personId : ana.personId;
    return pairTimeline({ me: m.personId, other, rooms: [], messages: [], directItems: [], talk, titleOf: () => null })
      .map((e) => [e.text, e.where?.label]);
  };

  beforeEach(async () => {
    disk._internals.forgetFolds();
    const cloud = createMemoryCloud();
    ana = await aMac(cloud, signUpMemory(cloud, { email: 'ana@nw.test', name: 'Ana Ruiz' }));
    jordan = await aMac(cloud, signUpMemory(cloud, { email: 'jordan@nw.test', name: 'Jordan Ellis' }));
    await ana.service.signIn();
    await ana.service.createTeam('Northwind');
    await ana.service.invite('jordan@nw.test');
    await jordan.service.signIn();
    await jordan.service.acceptInvite(ana.service.state().team.id);
    disk.setLineAuthor(ana.personId);
    thread = ana.store.composeItem('website', { title: 'Customer call tasks', body: 'Write customer-call-tasks.md', visibility: 'team' });
    await syncBoth();
  });
  afterEach(async () => { for (const m of [ana, jordan]) await m.service.signOut(); });

  it('labels a note on v2, and the reply to it, v2 on both screens', async () => {
    await jordan.service.markSharedFile(ana.personId, thread.id, { do: 'note', id: 'jn1', file: 'customer-call-tasks.md', v: 2, place: { kind: 'whole' }, text: 'Quick read is clear', mentions: [ana.personId] });
    await syncBoth();
    disk.setLineAuthor(ana.personId);
    ana.store.fileMark('website', thread.id, { do: 'reply', id: 'ar1', on: 'jn1', file: 'customer-call-tasks.md', text: 'Thanks' });
    await syncBoth();
    const want = [['Quick read is clear', 'customer-call-tasks.md v2'], ['Thanks', 'customer-call-tasks.md v2']];
    expect(labelsOn(jordan)).toEqual(want);
    expect(labelsOn(ana)).toEqual(want);
  });
});
