// THE IN-MEMORY CLOUD AND THE REAL ONE BEHAVE THE SAME.
//
// The sync engine and the app are tested against main/team/memory-cloud.mjs,
// because a test that needs the network is a test nobody runs. That is only
// worth anything if the memory cloud keeps the real database's rules. So one
// scenario (a team forms, a project is shared, lines go back and forth,
// private work is published) runs against both.
//
// The memory run is always on. The live run needs the hosted project's
// service key in TEAM_SERVICE_KEY, which it uses only to make three
// throwaway people and to delete everything they made afterwards:
//   TEAM_SERVICE_KEY=... npx vitest run tests/team-cloud-backends-agree.test.mjs
import { it, expect, describe, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mjs';
import { supabaseBackend } from '../main/team/supabase-backend.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function memoryWorld() {
  const cloud = createMemoryCloud();
  const people = {};
  for (const [name, email] of [['Maya', 'maya@northwind.test'], ['Theo', 'theo@northwind.test'], ['Jun', 'jun@elsewhere.test']]) {
    people[name.toLowerCase()] = memoryBackend(cloud, signUpMemory(cloud, { email, name }));
  }
  return { ...people, emails: { theo: 'theo@northwind.test' }, cleanup: async () => {} };
}

async function liveWorld() {
  const { createClient } = await import('@supabase/supabase-js');
  const config = JSON.parse(fs.readFileSync(path.join(root, 'cloud/team.config.json'), 'utf8'));
  const admin = createClient(config.url, process.env.TEAM_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const tag = crypto.randomBytes(4).toString('hex');
  const made = [];
  const people = {};
  const emails = {};
  for (const name of ['Maya', 'Theo', 'Jun']) {
    const email = `team-test-${tag}-${name.toLowerCase()}@example.com`;
    const password = crypto.randomBytes(18).toString('base64url');
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: `${name} Test` } });
    if (error) throw error;
    made.push(data.user.id);
    const client = createClient(config.url, config.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const signed = await client.auth.signInWithPassword({ email, password });
    if (signed.error) throw signed.error;
    people[name.toLowerCase()] = supabaseBackend(client);
    emails[name.toLowerCase()] = email;
  }
  return {
    ...people, emails,
    // Fails loudly: a silent failure here once left test people in the
    // real project (the admin role had no table rights).
    cleanup: async () => {
      const teams = await admin.from('teams').delete().in('created_by', made);
      if (teams.error) throw new Error(`could not delete the test team: ${teams.error.message}`);
      for (const id of made) {
        const gone = await admin.auth.admin.deleteUser(id);
        if (gone.error) throw new Error(`could not delete test person ${id}: ${gone.error.message}`);
      }
    },
  };
}

const worlds = [['in memory', memoryWorld, true], ['on the hosted project', liveWorld, !!process.env.TEAM_SERVICE_KEY]];

for (const [where, makeWorld, enabled] of worlds) {
  describe.skipIf(!enabled)(`the shared cloud ${where}`, () => {
    let w;
    let team;
    const shared = crypto.randomUUID();
    const secret = crypto.randomUUID();
    const line = (who, n) => ({ id: 'w-abcdef', ts: n, source: 'founder', by: who.personId, uid: `l-${shared.slice(0, 8)}-${n}`, patch: { note: `n${n}` } });

    beforeAll(async () => {
      w = await makeWorld();
      await w.maya.me();
      await w.theo.me();
      await w.jun.me();
      team = await w.maya.createTeam('Northwind');
      await w.maya.invite(team.id, w.emails.theo.toUpperCase());
      await w.theo.acceptInvites();
    }, 60_000);
    afterAll(async () => { await w?.cleanup(); }, 60_000);

    it('puts an invited teammate on the team and leaves a stranger off it', async () => {
      expect((await w.theo.myTeam())?.id).toBe(team.id);
      expect((await w.theo.teamPeople(team.id)).map((p) => p.name).sort()).toEqual(['Maya', 'Theo'].map((n) => expect.stringContaining(n)));
      expect(await w.jun.myTeam()).toBeNull();
    });

    it('shows a project shared with the team to the team and nobody else', async () => {
      await w.maya.shareProject({ id: shared, teamId: team.id, name: 'Website', visibility: 'team' });
      expect((await w.theo.listProjects()).map((p) => p.id)).toContain(shared);
      expect(await w.jun.listProjects()).toEqual([]);
    });

    it('carries lines across in order, and a line pushed twice once', async () => {
      expect(await w.maya.pushLines(shared, [line(w.maya, 1), line(w.maya, 2)])).toBe(2);
      expect(await w.maya.pushLines(shared, [line(w.maya, 1)])).toBe(0);
      const all = await w.theo.pullLines(shared, 0);
      expect(all.map((r) => r.line.patch.note)).toEqual(['n1', 'n2']);
      const after = await w.theo.pullLines(shared, all[0].seq);
      expect(after.map((r) => r.line.patch.note)).toEqual(['n2']);
    });

    it('refuses a line pushed as somebody else', async () => {
      await expect(w.theo.pushLines(shared, [line(w.maya, 3)])).rejects.toThrow();
    });

    it('keeps a project shared with specific people from the rest of the team', async () => {
      await w.maya.shareProject({ id: secret, teamId: team.id, name: 'Board deck', visibility: 'people', people: [] });
      expect((await w.theo.listProjects()).map((p) => p.id)).not.toContain(secret);
      await w.maya.shareProject({ id: secret, teamId: team.id, name: 'Board deck', visibility: 'people', people: [w.theo.personId] });
      expect((await w.theo.listProjects()).find((p) => p.id === secret)?.people).toEqual([w.theo.personId]);
    });

    it('publishes a thread card to the team, sends a private one without words, and can take it back', async () => {
      const card = { threadId: 'w-1', visible: true, title: 'Acme renewal terms', project: 'Northwind', state: 'running', priority: 7, problem: 'P', progress: 'Q', solution: null, blockedBy: [], blocks: [], updatedAt: 1_790_000_000_000 };
      await w.theo.putCards(team.id, [card, { threadId: 'w-2', visible: false, title: null, project: null, state: 'waiting', priority: null, problem: null, progress: null, solution: null, blockedBy: [], blocks: [], updatedAt: 1_790_000_000_000 }]);
      const seen = (await w.maya.listCards()).filter((c) => c.personId === w.theo.personId).sort((a, b) => a.threadId.localeCompare(b.threadId));
      expect(seen.map((c) => [c.threadId, c.visible, c.title, c.state])).toEqual([['w-1', true, 'Acme renewal terms', 'running'], ['w-2', false, null, 'waiting']]);
      expect(await w.jun.listCards()).toEqual([]);
      await w.theo.putCards(team.id, [{ ...card, threadId: 'w-3', visible: false }]);
      const bare = (await w.maya.listCards()).find((c) => c.threadId === 'w-3');
      expect([bare.visible, bare.title, bare.project, bare.problem, bare.progress]).toEqual([false, null, null, null, null]);
      await w.theo.putCards(team.id, []);
      expect((await w.maya.listCards()).filter((c) => c.personId === w.theo.personId)).toEqual([]);
    });
  });
}
