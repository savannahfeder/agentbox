// THE SHARED CLOUD, ON SUPABASE. The same calls as memory-cloud.mjs, made
// against the tables in cloud/supabase/migrations, through a supabase-js
// client that is already signed in. Row level security on the server is what
// actually keeps people apart; nothing here is trusted to.
import { asPulled } from '../../shared/team-rules.mjs';

const PAGE = 500;
const PUSH_BATCH = 200;

const personOut = (p) => p && ({ id: p.id, email: p.email, name: p.name, avatarUrl: p.avatar_url ?? null });

function must({ data, error }, what) {
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
}

export function supabaseBackend(client) {
  let personId = null;
  async function myId() {
    if (personId) return personId;
    const { data, error } = await client.auth.getUser();
    if (error || !data?.user) throw new Error('not signed in');
    personId = data.user.id;
    return personId;
  }

  return {
    kind: 'supabase',
    get personId() { return personId; },

    async me() {
      const id = await myId();
      const rows = must(await client.from('people').select('id,email,name,avatar_url').eq('id', id).limit(1), 'reading you');
      return personOut(rows[0]) ?? null;
    },

    // THE INVITES WAITING FOR YOU, to the email Google confirmed. Nothing is
    // joined by reading them: joining is acceptInvite, one team, on a yes.
    async pendingInvites() {
      await myId();
      const rows = must(await client.rpc('pending_invites'), 'reading your invites') ?? [];
      return rows.map((r) => ({ teamId: r.team_id, teamName: r.team_name, invitedBy: r.invited_by ?? null, invitedByName: r.invited_by_name ?? null }));
    },

    async acceptInvite(teamId) {
      await myId();
      must(await client.rpc('accept_invite', { p_team: teamId }), 'joining the team');
      return teamId;
    },

    // Every team you are on, oldest first. Which one this Mac is in is the
    // Mac's own record (main/team/index.mjs), never this order alone.
    async myTeams() {
      const id = await myId();
      const members = must(await client.from('team_members').select('team_id').eq('person_id', id), 'reading your team');
      const ids = members.map((m) => m.team_id);
      if (!ids.length) return [];
      const rows = must(await client.from('teams').select('id,name').in('id', ids).order('created_at'), 'reading your team');
      return rows.map((r) => ({ id: r.id, name: r.name }));
    },

    async myTeam() {
      return (await this.myTeams())[0] ?? null;
    },

    async createTeam(name) {
      const id = await myId();
      const [team] = must(await client.from('teams').insert({ name, created_by: id }).select('id,name'), 'starting a team');
      must(await client.from('team_members').insert({ team_id: team.id, person_id: id, role: 'owner' }), 'joining your new team');
      return team;
    },

    async teamPeople(teamId) {
      await myId();
      const members = must(await client.from('team_members').select('person_id,role').eq('team_id', teamId), 'reading your team');
      const ids = members.map((m) => m.person_id);
      if (!ids.length) return [];
      const roles = new Map(members.map((m) => [m.person_id, m.role]));
      const people = must(await client.from('people').select('id,email,name,avatar_url').in('id', ids), 'reading your teammates');
      return people.map((p) => ({ ...personOut(p), role: roles.get(p.id) ?? 'member' }));
    },

    // TEAM SETTINGS (2026-10-01). The rules are the database's
    // (20261001000600_team_settings.sql): the owner renames, removes and
    // cancels; anyone leaves.
    async renameTeam(teamId, name) {
      await myId();
      const rows = must(await client.from('teams').update({ name: String(name).trim() }).eq('id', teamId).select('id,name'), 'renaming the team');
      if (!rows.length) throw new Error('only the team’s owner can rename it');
      return rows[0];
    },

    async removeMember(teamId, who) {
      await myId();
      const rows = must(await client.from('team_members').delete().eq('team_id', teamId).eq('person_id', who).select('person_id'), 'removing them');
      if (!rows.length) throw new Error('only the team’s owner can remove somebody');
    },

    async listInvites(teamId) {
      await myId();
      const rows = must(await client.from('team_invites').select('email,invited_by').eq('team_id', teamId), 'reading the invites');
      return rows.map((r) => ({ email: r.email, invitedBy: r.invited_by ?? null }));
    },

    async cancelInvite(teamId, email) {
      await myId();
      must(await client.from('team_invites').delete().eq('team_id', teamId).eq('email', String(email).trim()), 'cancelling the invite');
    },

    async invite(teamId, email) {
      const id = await myId();
      const { error } = await client.from('team_invites').upsert(
        { team_id: teamId, email: String(email).trim(), invited_by: id },
        { onConflict: 'team_id,email', ignoreDuplicates: true },
      );
      if (error) throw new Error(`inviting ${email}: ${error.message}`);
    },

    async listProjects() {
      await myId();
      const projects = must(await client.from('projects').select('id,team_id,name,visibility,created_by,direct'), 'reading shared projects');
      const ids = projects.map((p) => p.id);
      const people = ids.length ? must(await client.from('project_people').select('project_id,person_id').in('project_id', ids), 'reading who is on them') : [];
      return projects.map((p) => ({
        id: p.id, teamId: p.team_id, name: p.name, visibility: p.visibility, createdBy: p.created_by, direct: !!p.direct,
        people: people.filter((pp) => pp.project_id === p.id).map((pp) => pp.person_id),
      }));
    },

    async shareProject({ id, teamId, name, visibility = 'team', people = [], direct = false }) {
      const me = await myId();
      must(await client.from('projects').upsert({ id, team_id: teamId, name, visibility, created_by: me, direct: !!direct }, { onConflict: 'id' }), 'sharing the project');
      const current = must(await client.from('project_people').select('person_id').eq('project_id', id), 'reading who is on it');
      const want = new Set(people);
      const have = new Set(current.map((r) => r.person_id));
      const gone = [...have].filter((p) => !want.has(p));
      const added = [...want].filter((p) => !have.has(p));
      if (gone.length) must(await client.from('project_people').delete().eq('project_id', id).in('person_id', gone), 'taking people off it');
      if (added.length) must(await client.from('project_people').insert(added.map((p) => ({ project_id: id, person_id: p }))), 'adding people to it');
      return { id, teamId, name, visibility, createdBy: me, people: [...want] };
    },

    async pushLines(projectId, lines) {
      const me = await myId();
      let added = 0;
      for (let i = 0; i < lines.length; i += PUSH_BATCH) {
        const batch = lines.slice(i, i + PUSH_BATCH).map((line) => {
          if (!line?.uid || line.by !== me) throw new Error('refusing to push a line somebody else wrote');
          return { project_id: projectId, uid: line.uid, by_person: me, body: line };
        });
        const rows = must(await client.from('lines').upsert(batch, { onConflict: 'uid', ignoreDuplicates: true }).select('uid'), 'sending your changes');
        added += rows?.length ?? 0;
      }
      return added;
    },

    async pullLines(projectId, afterSeq = 0, limit = PAGE) {
      const me = await myId();
      const rows = must(await client.from('lines').select('seq,body,by_person,created_at').eq('project_id', projectId).gt('seq', afterSeq).order('seq').limit(limit), 'reading your team\'s changes');
      // WHO WROTE A LINE IS THE COLUMN THE DATABASE CHECKED, never the copy
      // inside the line: row level security makes by_person the signed-in
      // writer, while the body is whatever their Mac sent. A teammate who
      // wrote somebody else's id into a body would otherwise be believed. WHEN
      // is the database's too, and their Mac's lease fields are dropped
      // (shared/team-rules.mjs asPulled).
      return rows.map((r) => ({ seq: Number(r.seq), line: asPulled(r.body, { by: r.by_person, at: Date.parse(r.created_at), me }) }));
    },

    // YOUR CARDS: one per thread worth showing the team (shared/thread-cards.mjs).
    // Upserted whole, and any card of yours the Mac no longer lists is removed,
    // so a thread made private or finished yesterday leaves the board. A card
    // not marked visible never goes up at all, whatever the Mac handed over.
    async putCards(teamId, all) {
      const me = await myId();
      const cards = all.filter((c) => c.visible === true);
      if (cards.length) {
        must(await client.from('thread_cards').upsert(cards.map((c) => ({
          person_id: me, team_id: teamId, thread_id: c.threadId, visible: !!c.visible,
          // WHO IT REACHES: the chosen people, or no list at all for the whole
          // team (w-41ff964775). The read rule on the table does the enforcing.
          people: c.people == null ? null : [...new Set(c.people.filter((p) => typeof p === 'string' && p))],
          title: c.visible ? c.title : null, project: c.visible ? c.project : null, state: c.state,
          priority: Number.isFinite(c.priority) ? c.priority : null,
          problem: c.visible ? c.problem : null, progress: c.visible ? c.progress : null, solution: c.visible ? c.solution : null,
          blocked_by: c.visible ? c.blockedBy ?? [] : [], blocks: c.visible ? c.blocks ?? [] : [],
          updated_at: new Date(c.updatedAt).toISOString(),
        })), { onConflict: 'person_id,thread_id' }), 'sharing your threads with the team');
      }
      let stale = client.from('thread_cards').delete().eq('person_id', me);
      if (cards.length) stale = stale.not('thread_id', 'in', `(${cards.map((c) => `"${c.threadId}"`).join(',')})`);
      must(await stale, 'clearing threads the team no longer needs to see');
    },

    async listCards() {
      await myId();
      const rows = must(await client.from('thread_cards').select('*'), 'reading your team\'s threads');
      return rows.map((r) => ({
        personId: r.person_id, threadId: r.thread_id, visible: r.visible, title: r.title, project: r.project, people: r.people ?? null,
        state: r.state, priority: r.priority, problem: r.problem, progress: r.progress, solution: r.solution,
        blockedBy: r.blocked_by ?? [], blocks: r.blocks ?? [], updatedAt: Date.parse(r.updated_at),
      }));
    },

    subscribe(onChange) {
      const channel = client.channel(`team-${Math.random().toString(36).slice(2)}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'lines' }, () => onChange())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'thread_cards' }, () => onChange())
        .subscribe();
      return () => { client.removeChannel(channel); };
    },
  };
}
