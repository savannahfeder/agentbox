// Approving a file an agent made left its thread in Needs you. The thread
// showed "Approved 1-breadcrumb.png", the agent never heard it, and nothing ran
// until a reply was typed as well. Measured with noteToItsAgent on an approve
// mark: it returned false, the row stayed blocked and the supervisor was never
// woken, while a pin on the same file reopened the row and woke it.
//
// Now the approval goes to the agent as your reply, the way a pin does, and the
// thread draws only the approval, not the reply as well.
import { it, expect, beforeEach, describe } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { noteToItsAgent } from '../main/notes-wake.mts';
import { threadEvents } from '../renderer/src/thread-history.ts';

let store, dir, thread, woke;
const supervisor = { sessions: new Map(), wake: () => { woke++; } };
const mark = (m, id = thread.id) => { store.fileMark('website', id, m); return noteToItsAgent({ store, supervisor, product: 'website', id, mark: m }); };
const row = (id = thread.id) => store.readItem('website', id);

beforeEach(async () => {
  disk._internals.forgetFolds();
  woke = 0;
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'approve-wakes-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  dir = path.join(accountRoot, 'website');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'website', name: 'Website' }));
  store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  thread = store.composeItem('website', { title: 'Breadcrumb', body: 'Design the breadcrumb.' });
  disk.updateWorkItem(dir, thread.id, { result: `**Ship this breadcrumb?**\n\ndesigns/${thread.id}/1-breadcrumb.png\n\n## Options\n1. Ship it (recommended)\n2. Try another` }, { source: 'agent' });
  disk.updateWorkItem(dir, thread.id, { status: 'blocked' }, { source: 'system' });
});

describe('approving a file the agent made', () => {
  it('reaches the agent as your reply and opens the thread', async () => {
    expect(await mark({ do: 'approve', file: '1-breadcrumb.png' })).toBe(true);
    const item = row();
    expect(item.status).toBe('open');
    expect(item.answer).toBe(`Approved designs/${thread.id}/1-breadcrumb.png. Proceed as you proposed.`);
    expect(item.wrote.answer.source).toBe('founder');
    expect(woke).toBe(1);
  });

  it('is drawn once in the thread, as the approval', async () => {
    await mark({ do: 'approve', file: '1-breadcrumb.png' });
    const lines = disk.readItemHistory(dir, thread.id);
    const events = threadEvents(lines);
    expect(events.filter((e) => e.fileMark?.kind === 'approved')).toHaveLength(1);
    expect(events.some((e) => String(e.words ?? '').includes('Proceed as you proposed'))).toBe(false);
  });
});

describe('what starts nothing', () => {
  it('taking an approval back', async () => {
    store.fileMark('website', thread.id, { do: 'approve', file: '1-breadcrumb.png' });
    expect(await mark({ do: 'unapprove', file: '1-breadcrumb.png' })).toBe(false);
    expect(row().status).toBe('blocked');
    expect(woke).toBe(0);
  });

  it('approving a picture you attached yourself', async () => {
    const own = store.composeItem('website', { title: 'Logo', body: 'Here: [logo.png](attachments/logo.png)' });
    expect(await mark({ do: 'approve', file: 'logo.png' }, own.id)).toBe(false);
    expect(row(own.id).answer ?? null).toBe(null);
  });

  it('approving a file on a thread you closed', async () => {
    disk.updateWorkItem(dir, thread.id, { status: 'done' }, { source: 'founder' });
    expect(await mark({ do: 'approve', file: '1-breadcrumb.png' })).toBe(false);
    expect(row().status).toBe('done');
    expect(woke).toBe(0);
  });
});

it('an approval from the Files page goes the same way', () => {
  const place = fs.readFileSync(new URL('../main/files-place.mts', import.meta.url), 'utf8');
  const branch = place.slice(place.indexOf("mark.do === 'note' || mark.do === 'approve'"), place.indexOf('} else return'));
  expect(branch).toMatch(/mark\.do !== 'unapprove'/);
});
