// Approving an older version of a picture built the newest one instead.
//
// With version 1 of 8 open, Approve sent the agent "Approved
// designs/<thread>/claude-tile-2-white-light.png. Proceed as you proposed."
// Version 1 carries the family's bare name, so the path read as "the picture",
// and "as you proposed" pointed at the agent's latest recommendation: it built
// version 8. Measured with noteToItsAgent on an approve mark for the first of
// three versions: the answer named no version and said nothing of a newer one.
import { it, expect, beforeEach, describe } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { noteToItsAgent } from '../main/notes-wake.mts';

let store, dir, thread, D;
const supervisor = { sessions: new Map(), wake: () => {} };
const approve = (file) => {
  const m = { do: 'approve', file };
  store.fileMark('website', thread.id, m);
  return noteToItsAgent({ store, supervisor, product: 'website', id: thread.id, mark: m });
};
const row = () => store.readItem('website', thread.id);
const said = (result) => disk.updateWorkItem(dir, thread.id, { result }, { source: 'agent' });

beforeEach(async () => {
  disk._internals.forgetFolds();
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'approve-older-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  dir = path.join(accountRoot, 'website');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'website', name: 'Website' }));
  store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  thread = store.composeItem('website', { title: 'Tile', body: 'Fix the tile.' });
  D = `designs/${thread.id}`;
  said(`**This tile?**\n\n${D}/tile.png`);
  said(`**Softer edge?**\n\n${D}/tile-v2.png`);
  said(`**Built it.**\n\n${D}/tile-v3.png`);
  // Another family named last, which must not count as the tile's newest.
  said(`**And the badge.**\n\n${D}/badge.png`);
  disk.updateWorkItem(dir, thread.id, { status: 'blocked' }, { source: 'system' });
});

describe('approving a version older than the newest', () => {
  it('names version 1, its file, and the newer one, and does not say to proceed as proposed', async () => {
    expect(await approve('tile.png')).toBe(true);
    const answer = row().answer;
    expect(answer).toBe(`Approved version 1 of 3 (${D}/tile.png). It is older than the newest, version 3 (${D}/tile-v3.png). Go ahead with version 1, not version 3.`);
    expect(answer).not.toContain('Proceed as you proposed');
  });

  it('a middle version is named the same way', async () => {
    expect(await approve('tile-v2.png')).toBe(true);
    expect(row().answer).toBe(`Approved version 2 of 3 (${D}/tile-v2.png). It is older than the newest, version 3 (${D}/tile-v3.png). Go ahead with version 2, not version 3.`);
  });

  it('the approval is kept on that version, not on the family', async () => {
    await approve('tile.png');
    expect(row().artifacts.approvals.map((a) => a.file)).toEqual(['tile.png']);
    await approve('tile-v3.png');
    expect(row().artifacts.approvals.map((a) => a.file).sort()).toEqual(['tile-v3.png', 'tile.png']);
  });
});

describe('approving the newest', () => {
  it('reads as before', async () => {
    expect(await approve('tile-v3.png')).toBe(true);
    expect(row().answer).toBe(`Approved ${D}/tile-v3.png. Proceed as you proposed.`);
  });

  it('a file with one version is its own newest, whatever was named after it', async () => {
    expect(await approve('badge.png')).toBe(true);
    expect(row().answer).toBe(`Approved ${D}/badge.png. Proceed as you proposed.`);
  });
});
