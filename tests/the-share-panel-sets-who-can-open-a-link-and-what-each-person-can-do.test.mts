// THE SHARE PANEL SETS WHO CAN OPEN A LINK AND WHAT EACH PERSON CAN DO.
//
// Asked for 2026-11-12 (w-926a6814a5): the owner of a shared document could
// not choose whether people may edit it, or share it with certain people only.
// Measured on the calls the share panel makes (main/team/index.mts through
// main/ipc.mts), on the memory cloud and on the real backend's database calls
// with a stand-in client: what the link says about itself, the access and
// level it is set to, people added, changed and taken off by email, and a link
// from a database that predates all this still reading as it did.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createTeamService } from '../main/team/index.mts';
import { memorySession } from '../main/team/session.mts';
import { supabaseBackend } from '../main/team/supabase-backend.mts';
import { REQUEST_CHANNELS as BRIDGE } from '../shared/bridge-map.mts';

const SOURCE = 'proj/w-1/plan/plan.md';
const file = { source: SOURCE, name: 'plan.md', kind: 'markdown', type: 'text/markdown', body: '# Plan', version: 1, hash: 'h1' };

type Cloud = ReturnType<typeof createMemoryCloud>;
async function aMac(cloud: Cloud, personId: string) {
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'link-access-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  fs.mkdirSync(accountRoot, { recursive: true });
  const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  const mac = createTeamService({
    session: memorySession(() => memoryBackend(cloud, personId)),
    store, disk, accountRoot, stateFile: path.join(storeRoot, '.team-sync.json'), intervalMs: 3_600_000,
    shareSite: 'https://app.agentbox.ac',
  });
  await mac.signIn();
  return mac;
}

describe('on the memory cloud', () => {
  let cloud: Cloud;
  let maya: Awaited<ReturnType<typeof aMac>>;
  let theoId: string;
  let token: string;
  beforeEach(async () => {
    disk._internals.forgetFolds();
    cloud = createMemoryCloud();
    maya = await aMac(cloud, signUpMemory(cloud, { email: 'maya@lumen.test', name: 'Maya Chen' }));
    theoId = signUpMemory(cloud, { email: 'Theo@Lumen.test', name: 'Theo' });
    token = (await maya.shareFile(file)).link!.token;
  });

  it('a new link is open to anyone with it, who can comment, as links always were', async () => {
    expect((await maya.fileLink(SOURCE)).link).toMatchObject({ access: 'anyone', can: 'comment', rev: 1, changedOnWeb: false, changedByName: null });
  });

  it('access and level are set, and a level nobody knows is refused', async () => {
    await maya.setFileLinkAccess(token, 'people', 'view');
    expect((await maya.fileLink(SOURCE)).link).toMatchObject({ access: 'people', can: 'view' });
    await expect(maya.setFileLinkAccess(token, 'everyone', 'edit')).rejects.toThrow();
  });

  it('people are added by email in any case, changed, named when they have an account, and taken off', async () => {
    expect(await maya.setFileLinkPerson(token, ' THEO@lumen.test ', 'edit')).toEqual([{ email: 'theo@lumen.test', can: 'edit', name: 'Theo', avatar: null }]);
    await maya.setFileLinkPerson(token, 'new@nowhere.test', 'view');
    expect((await maya.fileLinkPeople(token)).map((p) => [p.email, p.can, p.name])).toEqual([['theo@lumen.test', 'edit', 'Theo'], ['new@nowhere.test', 'view', null]]);
    await maya.setFileLinkPerson(token, 'theo@lumen.test', 'comment');
    expect((await maya.fileLinkPeople(token))[0].can).toBe('comment');
    expect(await maya.setFileLinkPerson(token, 'theo@lumen.test', null)).toEqual([{ email: 'new@nowhere.test', can: 'view', name: null, avatar: null }]);
    await expect(maya.setFileLinkPerson(token, 'not an address', 'view')).rejects.toThrow(/email address/);
  });

  it('a person only on the list opens a link for the people added; a stranger does not', async () => {
    await maya.setFileLinkAccess(token, 'people', 'view');
    const jun = signUpMemory(cloud, { email: 'jun@else.test', name: 'Jun' });
    expect((await memoryBackend(cloud, jun).fileLinkView!(token)).file).toBeNull();
    await maya.setFileLinkPerson(token, 'theo@lumen.test', 'view');
    expect((await memoryBackend(cloud, theoId).fileLinkView!(token)).file).toMatchObject({ body: '# Plan' });
  });

  it('only the owner changes who can open it', async () => {
    await expect(memoryBackend(cloud, theoId).setFileLinkAccess!(token, 'anyone', 'edit')).rejects.toThrow();
    await expect(memoryBackend(cloud, theoId).setFileLinkPerson!(token, 'theo@lumen.test', 'edit')).rejects.toThrow();
  });
});

describe('on the real backend', () => {
  const calls: [string, unknown][] = [];
  const answers: Record<string, unknown> = {};
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'me' } }, error: null }), getSession: async () => ({ data: { session: { user: { id: 'me' } } }, error: null }) },
    rpc: async (name: string, args: unknown) => { calls.push([name, args]); return { data: answers[name] ?? null, error: null }; },
  };
  const backend = supabaseBackend(client as unknown as Parameters<typeof supabaseBackend>[0]);
  beforeEach(() => { calls.length = 0; });

  it('asks the database by the names and argument names the migration gives', async () => {
    await backend.setFileLinkAccess!('t', 'people', 'edit');
    await backend.setFileLinkPerson!('t', 'a@b.test', null);
    answers.file_link_people_of = [{ email: 'a@b.test', can: 'view', name: null, avatar: null, added_at: '2026-11-12T10:00:00Z' }];
    expect(await backend.fileLinkPeople!('t')).toEqual([{ email: 'a@b.test', can: 'view', name: null, avatar: null }]);
    await backend.fileLinkBroughtHome!('t', 4, 3);
    expect(calls).toEqual([
      ['set_file_link_access', { tok: 't', acc: 'people', c: 'edit' }],
      ['set_file_link_person', { tok: 't', mail: 'a@b.test', c: null }],
      ['file_link_people_of', { tok: 't' }],
      ['file_link_brought_home', { tok: 't', r: 4, v: 3 }],
    ]);
  });

  it('reads a link from a database before this change as open to anyone who can comment', async () => {
    answers.my_file_link = [{ token: 't', version: 1, hash: 'h', updated_at: '2026-11-12T10:00:00Z', comments: 0 }];
    expect(await backend.fileLinkFor!('s')).toMatchObject({ access: 'anyone', can: 'comment', rev: 1, changedOnWeb: false, changedByName: null });
    answers.my_file_link = [{ token: 't', version: 1, hash: 'h', updated_at: '2026-11-12T10:00:00Z', comments: 0, access: 'people', can: 'edit', rev: 4, changed_on_web: true, changed_by_name: 'Theo' }];
    expect(await backend.fileLinkFor!('s')).toMatchObject({ access: 'people', can: 'edit', rev: 4, changedOnWeb: true, changedByName: 'Theo' });
  });

  it('lists the links changed on the web', async () => {
    answers.my_links_changed_on_web = [{ token: 't', source: 's', name: 'a.md', rev: 3, hash: 'h', version: 2, changed_by_name: 'Theo' }];
    expect(await backend.linksChangedOnWeb!()).toEqual([{ token: 't', source: 's', name: 'a.md', rev: 3, hash: 'h', version: 2, byName: 'Theo' }]);
  });
});

describe('the bridge', () => {
  it('carries the three new calls to their handlers', () => {
    expect(BRIDGE).toMatchObject({ fileLinkAccess: 'zero:file-link-access', fileLinkPeople: 'zero:file-link-people', fileLinkPerson: 'zero:file-link-person' });
    const ipc = fs.readFileSync(path.join(import.meta.dirname, '..', 'main/ipc.mts'), 'utf8');
    for (const ch of ['zero:file-link-access', 'zero:file-link-people', 'zero:file-link-person']) expect(ipc).toContain(`'${ch}'`);
  });
});
