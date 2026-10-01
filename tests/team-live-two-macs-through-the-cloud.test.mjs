// TWO TEAMMATES, END TO END, THROUGH THE REAL CLOUD.
//
// Everything below the screen, for real: two stores (two "Macs"), each signed
// in through the app's own session code (main/team/session.mjs) to the hosted
// agentbox-team project, each running the app's own team service
// (main/team/index.mjs). Maya starts a team and invites Theo; Theo says yes,
// his Mac joins the project Maya shares, Maya's message lands in his inbox,
// he answers it, and the answer comes back to Maya's inbox. Private work does
// not reach the other Mac at all.
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

  let website, message;

  it('signs Maya in, starts a team and invites Theo', async () => {
    const { maya, theo } = macs;
    await maya.service.start();
    expect(maya.service.state()).toMatchObject({ signedIn: true, me: { id: maya.id, name: 'Maya Live' } });
    await maya.service.createTeam('Live test');
    await maya.service.invite(theo.email);
    expect(maya.service.state().team.name).toBe('Live test');
  }, 60_000);

  // Since a review on 2026-10-01 an invite is asked, never taken up on its own.
  it('asks Theo to join, and puts him on the team when he says yes', async () => {
    const { maya, theo } = macs;
    await theo.service.start();
    expect(theo.service.state().team).toBeNull();
    const [invite] = theo.service.state().invites;
    expect(invite).toMatchObject({ teamName: 'Live test', invitedByName: 'Maya Live' });
    await theo.service.acceptInvite(invite.teamId);
    expect(theo.service.state().team?.id).toBe(maya.service.state().team.id);
  }, 60_000);

  it('shares Maya\'s project, and it appears on Theo\'s Mac', async () => {
    const { maya, theo } = macs;
    website = maya.store.createProduct({ name: `Website ${tag}` }).slug;
    const home = maya.store.createProduct({ name: `Home ${tag}` }).slug;
    on(maya, () => maya.store.composeItem(home, { title: 'An old private task', visibility: 'private' }));
    await maya.service.share(website, { visibility: 'team' });
    await theo.service.syncNow();
    expect(theo.store.listProducts().find((p) => p.team?.projectId && !p.team.direct)?.name).toBe(`Website ${tag}`);
  }, 60_000);

  // A teammate's words reach you as a message, never as a task in a shared
  // project (shared/team-rules.mjs whatATeammateMaySet).
  it('carries Maya\'s message to Theo\'s inbox and his answer back to hers', async () => {
    const { maya, theo } = macs;
    disk.setLineAuthor(maya.id);
    try { message = await maya.service.message(theo.id, 'Can you send Acme the renewal terms?'); } finally { disk.setLineAuthor(null); }
    await theo.service.syncNow();
    const direct = theo.store.listProducts().find((p) => p.team?.direct);
    const there = theo.store.listItems().find((i) => i.id === message.id);
    expect(there).toMatchObject({ title: 'Can you send Acme the renewal terms?', assignee: theo.id, createdBy: maya.id });
    expect(inMyInbox(there, direct, theo.id)).toBe(true);
    on(theo, () => theo.store.answerItem(direct.slug, message.id, { answer: 'Sent them this morning' }));
    const next = handedOnByReply(theo.store.readItem(direct.slug, message.id), direct, theo.id);
    expect(next).toBe(maya.id);
    on(theo, () => theo.store.teamPatch(direct.slug, message.id, { assignee: next }));
    await theo.service.syncNow();
    await maya.service.syncNow();
    const back = maya.store.listItems().find((i) => i.id === message.id);
    expect(back.answer).toBe('Sent them this morning');
    expect(back.wrote.answer.by).toBe(theo.id);
    expect(back.assignee).toBe(maya.id);
  }, 60_000);

  // A private thread publishes no card at all (decided 2026-10-01).
  it('publishes nothing of Maya\'s private work to Theo', async () => {
    const { maya, theo } = macs;
    await maya.service.syncNow();
    await theo.service.syncNow();
    expect(theo.service.state().cards.filter((c) => c.personId === maya.id && !c.visible)).toEqual([]);
    expect(JSON.stringify(theo.service.state().cards)).not.toContain('old private task');
    expect(theo.store.listProducts().map((p) => p.name)).not.toContain(maya.store.listProducts().find((p) => !p.team)?.name);
  }, 60_000);
});
