// TWO TEAMMATES, END TO END, THROUGH THE REAL CLOUD.
//
// Everything below the screen, for real: two stores (two "Macs"), each signed
// in through the app's own session code (main/team/session.mjs) to the hosted
// agentbox-team project, each running the app's own team service
// (main/team/index.mjs). Maya starts a team, invites Theo, shares a project
// and hands Theo a task; Theo's Mac joins the project, finds the task in his
// inbox, answers it, and the answer comes back to Maya's inbox. Private work
// shows up on the other Mac as a blank line and nothing more.
//
// It needs the hosted project's service key, used only to make two throwaway
// people (Google sign-in cannot be clicked through by a test) and to delete
// everything they made afterwards:
//   TEAM_SERVICE_KEY=... npx vitest run tests/team-live-two-macs-through-the-cloud.test.mjs
import { it, expect, beforeAll, afterAll, describe } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Store } from '../main/store.mjs';
import * as disk from '../main/store/work-items.mjs';
import { createTeamService } from '../main/team/index.mjs';
import { supabaseSession } from '../main/team/session.mjs';
import { inMyInbox, handedOnByReply } from '../shared/team-rules.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const live = !!process.env.TEAM_SERVICE_KEY;

describe.skipIf(!live)('two Macs through the hosted cloud', () => {
  let admin, cloudConfig;
  const made = [];
  const macs = {};
  const tag = crypto.randomBytes(4).toString('hex');

  async function aMac(name) {
    const email = `team-live-${tag}-${name.toLowerCase()}@example.com`;
    const password = crypto.randomBytes(18).toString('base64url');
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: `${name} Live` } });
    if (error) throw error;
    made.push(data.user.id);
    const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), `team-live-${name.toLowerCase()}-`));
    const accountRoot = path.join(storeRoot, 'accounts', 'a');
    fs.mkdirSync(accountRoot, { recursive: true });
    const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
    const service = createTeamService({
      session: supabaseSession({ cloudConfig, sessionFile: path.join(storeRoot, '.team-session'), openExternal: async () => {}, testLogin: `${email}:${password}` }),
      store, disk, accountRoot, stateFile: path.join(storeRoot, '.team-sync.json'), intervalMs: 3_600_000,
    });
    return { name, email, id: data.user.id, store, service, accountRoot };
  }
  // Writing on one Mac: the store stamps whoever is signed in there.
  const on = (mac, fn) => { disk.setLineAuthor(mac.id); try { return fn(); } finally { disk.setLineAuthor(null); } };

  beforeAll(async () => {
    const { createClient } = await import('@supabase/supabase-js');
    cloudConfig = JSON.parse(fs.readFileSync(path.join(root, 'cloud/team.config.json'), 'utf8'));
    admin = createClient(cloudConfig.url, process.env.TEAM_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    macs.maya = await aMac('Maya');
    macs.theo = await aMac('Theo');
  }, 60_000);

  afterAll(async () => {
    for (const mac of Object.values(macs)) mac.service.stop();
    // CLEAN-UP THAT FAILS LOUDLY. It once failed in silence (the admin role
    // had no table rights) and left seven test people in the real project.
    if (admin) {
      const teams = await admin.from('teams').delete().in('created_by', made);
      if (teams.error) throw new Error(`could not delete the test team: ${teams.error.message}`);
      for (const id of made) {
        const gone = await admin.auth.admin.deleteUser(id);
        if (gone.error) throw new Error(`could not delete test person ${id}: ${gone.error.message}`);
      }
    }
    disk.setLineAuthor(null);
    delete process.env.AGENTBOX_PERSON_ID;
  }, 60_000);

  let website, task;

  it('signs Maya in, starts a team and invites Theo', async () => {
    const { maya, theo } = macs;
    await maya.service.start();
    expect(maya.service.state()).toMatchObject({ signedIn: true, me: { id: maya.id, name: 'Maya Live' } });
    await maya.service.createTeam('Live test');
    await maya.service.invite(theo.email);
    expect(maya.service.state().team.name).toBe('Live test');
  }, 60_000);

  it('shares Maya\'s project and hands Theo a task in it', async () => {
    const { maya, theo } = macs;
    website = maya.store.createProduct({ name: `Website ${tag}` }).slug;
    const home = maya.store.createProduct({ name: `Home ${tag}` }).slug;
    on(maya, () => maya.store.composeItem(home, { title: 'An old private task' }));
    await maya.service.share(website, { visibility: 'team' });
    task = on(maya, () => maya.store.composeItem(website, { title: 'Send Acme the renewal terms', assignee: theo.id, people: [maya.id, theo.id], due: '2026-10-08' }));
    await maya.service.syncNow();
    expect(maya.store.listProducts().find((p) => p.slug === website).team.projectId).toBeTruthy();
  }, 60_000);

  it('puts the project and the task on Theo\'s Mac, in Theo\'s inbox', async () => {
    const { maya, theo } = macs;
    await theo.service.start();
    expect(theo.service.state().team?.name).toBe('Live test');
    const joined = theo.store.listProducts().find((p) => p.team?.projectId);
    expect(joined?.name).toBe(`Website ${tag}`);
    const there = theo.store.listItems().find((i) => i.id === task.id);
    expect(there).toMatchObject({ title: 'Send Acme the renewal terms', assignee: theo.id, due: '2026-10-08', createdBy: maya.id });
    expect(inMyInbox(there, joined, theo.id)).toBe(true);
    expect(inMyInbox(there, joined, maya.id)).toBe(false);
  }, 60_000);

  it('carries Theo\'s answer back to Maya and hands the task back to her', async () => {
    const { maya, theo } = macs;
    const joined = theo.store.listProducts().find((p) => p.team?.projectId);
    on(theo, () => theo.store.answerItem(joined.slug, task.id, { answer: 'Sent them this morning' }));
    const row = theo.store.readItem(joined.slug, task.id);
    const next = handedOnByReply(row, joined, theo.id);
    expect(next).toBe(maya.id);
    on(theo, () => theo.store.teamPatch(joined.slug, task.id, { assignee: next }));
    await theo.service.syncNow();
    await maya.service.syncNow();
    const back = maya.store.readItem(website, task.id);
    expect(back.answer).toBe('Sent them this morning');
    expect(back.wrote.answer.by).toBe(theo.id);
    expect(back.assignee).toBe(maya.id);
    expect(inMyInbox(back, maya.store.listProducts().find((p) => p.slug === website), maya.id)).toBe(true);
  }, 60_000);

  it('shows Maya\'s private work on Theo\'s Mac as a blank line, never its title', async () => {
    const { maya, theo } = macs;
    await maya.service.syncNow();
    await theo.service.syncNow();
    const seen = theo.service.state().activity.filter((a) => a.personId === maya.id);
    expect(seen.length).toBeGreaterThan(0);
    expect(JSON.stringify(seen)).not.toContain('old private task');
    expect(theo.store.listProducts().map((p) => p.name)).not.toContain(maya.store.listProducts().find((p) => !p.team)?.name);
  }, 60_000);
});
