// THE SHARED CLOUD, IN MEMORY, WITH THE SAME RULES AS THE REAL ONE.
//
// The team version talks to Supabase through one small set of calls (see
// supabase-backend.mjs). This is the same set of calls over plain objects, so
// the sync engine and the app can be tested without a network, and so two
// stores in one test can be two teammates. Every rule the database's row level
// security enforces is enforced here too, and tests/team-cloud-backends-agree
// runs one scenario against both to keep them honest.
import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';
import { asPulled } from '../../shared/team-rules.mjs';

export function createMemoryCloud() {
  return {
    people: new Map(), // id -> { id, email, name, avatarUrl }
    teams: new Map(), // id -> { id, name, createdBy }
    members: [], // { teamId, personId, role }
    invites: [], // { teamId, email }
    projects: new Map(), // id -> { id, teamId, name, visibility, createdBy }
    projectPeople: [], // { projectId, personId }
    lines: [], // { seq, projectId, uid, byPerson, body, createdAt }
    cards: new Map(), // `${personId}:${threadId}` -> a thread card, as shared/thread-cards.mjs makes them
    seq: 0,
    teamsMade: 0, // the order teams were made in, which is their age
    now: () => Date.now(), // the server's clock
    events: new EventEmitter(),
  };
}

// A sign-in, the way Supabase's trigger turns one into a person. Google
// confirms the email; `confirmed: false` is somebody who never proved theirs.
export function signUpMemory(cloud, { id = crypto.randomUUID(), email, name, avatarUrl = null, confirmed = true }) {
  cloud.people.set(id, { id, email, name: name || String(email).split('@')[0], avatarUrl });
  if (!confirmed) (cloud.unconfirmed ??= new Set()).add(id);
  return id;
}

export function memoryBackend(cloud, personId) {
  const myTeams = () => cloud.members.filter((m) => m.personId === personId).map((m) => m.teamId)
    .sort((a, b) => (cloud.teams.get(a)?.made ?? 0) - (cloud.teams.get(b)?.made ?? 0));
  // The email the sign-in confirmed, never one a person could have typed.
  const confirmedEmail = () => {
    const me = cloud.people.get(personId);
    return me && !cloud.unconfirmed?.has(personId) ? String(me.email).toLowerCase() : null;
  };
  const canSee = (projectId) => {
    const p = cloud.projects.get(projectId);
    if (!p || !myTeams().includes(p.teamId)) return false;
    return p.visibility === 'team' || p.createdBy === personId
      || cloud.projectPeople.some((pp) => pp.projectId === projectId && pp.personId === personId);
  };
  const projectOut = (p) => ({
    id: p.id, teamId: p.teamId, name: p.name, visibility: p.visibility, createdBy: p.createdBy, direct: !!p.direct,
    people: cloud.projectPeople.filter((pp) => pp.projectId === p.id).map((pp) => pp.personId),
  });
  const refuse = (what) => { throw new Error(`not allowed: ${what}`); };

  return {
    kind: 'memory',
    personId,

    async me() {
      const me = cloud.people.get(personId);
      return me ? { ...me } : null;
    },

    async pendingInvites() {
      const email = confirmedEmail();
      if (!email) return [];
      return cloud.invites
        .filter((inv) => inv.email.toLowerCase() === email && !myTeams().includes(inv.teamId))
        .map((inv) => ({ teamId: inv.teamId, teamName: cloud.teams.get(inv.teamId)?.name ?? '', invitedBy: inv.invitedBy ?? null, invitedByName: cloud.people.get(inv.invitedBy)?.name ?? null }));
    },

    // One team, on a yes, and the invite is used up.
    async acceptInvite(teamId) {
      const email = confirmedEmail();
      if (!email) refuse('join a team without a confirmed email');
      const at = cloud.invites.findIndex((inv) => inv.teamId === teamId && inv.email.toLowerCase() === email);
      if (at < 0) refuse('join a team that did not invite you');
      cloud.invites.splice(at, 1);
      if (!cloud.members.some((m) => m.teamId === teamId && m.personId === personId)) cloud.members.push({ teamId, personId, role: 'member' });
      return teamId;
    },

    async myTeams() {
      return myTeams().map((id) => cloud.teams.get(id)).filter(Boolean).map((t) => ({ id: t.id, name: t.name }));
    },

    async myTeam() {
      return (await this.myTeams())[0] ?? null;
    },

    async createTeam(name) {
      const id = crypto.randomUUID();
      cloud.teamsMade += 1;
      cloud.teams.set(id, { id, name, createdBy: personId, made: cloud.teamsMade });
      cloud.members.push({ teamId: id, personId, role: 'owner' });
      return { id, name };
    },

    async teamPeople(teamId) {
      if (!myTeams().includes(teamId)) return [];
      const ids = cloud.members.filter((m) => m.teamId === teamId).map((m) => m.personId);
      return ids.map((id) => ({ ...cloud.people.get(id) })).filter((p) => p.id);
    },

    async invite(teamId, email) {
      if (!myTeams().includes(teamId)) refuse('invite to a team you are not on');
      const clean = String(email).trim();
      if (!cloud.invites.some((i) => i.teamId === teamId && i.email.toLowerCase() === clean.toLowerCase())) {
        cloud.invites.push({ teamId, email: clean, invitedBy: personId });
      }
    },

    async listProjects() {
      return [...cloud.projects.values()].filter((p) => canSee(p.id)).map(projectOut);
    },

    async shareProject({ id, teamId, name, visibility = 'team', people = [], direct = false }) {
      const existing = cloud.projects.get(id);
      if (existing && existing.createdBy !== personId) refuse('change a project somebody else shared');
      if (!myTeams().includes(teamId)) refuse('share into a team you are not on');
      // A message thread is its maker and one other person, as the database
      // insists (migration 20261001000500_security.sql).
      if (direct && (visibility !== 'people' || new Set(people.filter((p) => p !== personId)).size > 1)) refuse('put a third person on a message thread');
      cloud.projects.set(id, { id, teamId, name, visibility, createdBy: personId, direct: !!direct });
      cloud.projectPeople = cloud.projectPeople.filter((pp) => pp.projectId !== id);
      for (const person of new Set(people)) cloud.projectPeople.push({ projectId: id, personId: person });
      return projectOut(cloud.projects.get(id));
    },

    async pushLines(projectId, lines) {
      if (!canSee(projectId)) refuse('write to a project you cannot see');
      let added = 0;
      for (const line of lines) {
        if (!line?.uid || line.by !== personId) refuse('write a line as somebody else');
        if (cloud.lines.some((l) => l.uid === line.uid)) continue;
        cloud.seq += 1;
        cloud.lines.push({ seq: cloud.seq, projectId, uid: line.uid, byPerson: personId, body: structuredClone(line), createdAt: cloud.now() });
        added += 1;
      }
      if (added) cloud.events.emit('lines', { projectId });
      return added;
    },

    async pullLines(projectId, afterSeq = 0, limit = 500) {
      if (!canSee(projectId)) return [];
      return cloud.lines.filter((l) => l.projectId === projectId && l.seq > afterSeq)
        .slice(0, limit).map((l) => ({ seq: l.seq, line: asPulled(structuredClone(l.body), { by: l.byPerson, at: l.createdAt, me: personId }) }));
    },

    async putCards(teamId, cards) {
      if (!myTeams().includes(teamId)) throw new Error('not on that team');
      for (const key of [...cloud.cards.keys()]) if (key.startsWith(`${personId}:`)) cloud.cards.delete(key);
      // A private card never goes up at all, whatever the Mac handed over, as
      // supabase-backend does; the database refuses words on one besides.
      for (const c of cards) if (c.visible === true) cloud.cards.set(`${personId}:${c.threadId}`, { ...structuredClone(c), personId, teamId });
      cloud.events.emit('cards', {});
    },

    async listCards() {
      const teams = new Set(myTeams());
      return [...cloud.cards.values()].filter((c) => teams.has(c.teamId)).map(({ teamId, ...c }) => structuredClone(c));
    },

    subscribe(onChange) {
      const fire = () => onChange();
      cloud.events.on('lines', fire);
      cloud.events.on('cards', fire);
      return () => { cloud.events.off('lines', fire); cloud.events.off('cards', fire); };
    },
  };
}
