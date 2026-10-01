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

export function createMemoryCloud() {
  return {
    people: new Map(), // id -> { id, email, name, avatarUrl }
    teams: new Map(), // id -> { id, name, createdBy }
    members: [], // { teamId, personId, role }
    invites: [], // { teamId, email }
    projects: new Map(), // id -> { id, teamId, name, visibility, createdBy }
    projectPeople: [], // { projectId, personId }
    lines: [], // { seq, projectId, uid, byPerson, body }
    cards: new Map(), // `${personId}:${threadId}` -> a thread card, as shared/thread-cards.mjs makes them
    seq: 0,
    events: new EventEmitter(),
  };
}

// A sign-in, the way Supabase's trigger turns one into a person.
export function signUpMemory(cloud, { id = crypto.randomUUID(), email, name, avatarUrl = null }) {
  cloud.people.set(id, { id, email, name: name || String(email).split('@')[0], avatarUrl });
  return id;
}

export function memoryBackend(cloud, personId) {
  const myTeams = () => cloud.members.filter((m) => m.personId === personId).map((m) => m.teamId);
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

    async acceptInvites() {
      const me = cloud.people.get(personId);
      for (const inv of cloud.invites) {
        if (me && inv.email.toLowerCase() === me.email.toLowerCase()
          && !cloud.members.some((m) => m.teamId === inv.teamId && m.personId === personId)) {
          cloud.members.push({ teamId: inv.teamId, personId, role: 'member' });
        }
      }
      return myTeams();
    },

    async myTeam() {
      const id = myTeams()[0];
      const team = id ? cloud.teams.get(id) : null;
      return team ? { id: team.id, name: team.name } : null;
    },

    async createTeam(name) {
      const id = crypto.randomUUID();
      cloud.teams.set(id, { id, name, createdBy: personId });
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
        cloud.invites.push({ teamId, email: clean });
      }
    },

    async listProjects() {
      return [...cloud.projects.values()].filter((p) => canSee(p.id)).map(projectOut);
    },

    async shareProject({ id, teamId, name, visibility = 'team', people = [], direct = false }) {
      const existing = cloud.projects.get(id);
      if (existing && existing.createdBy !== personId) refuse('change a project somebody else shared');
      if (!myTeams().includes(teamId)) refuse('share into a team you are not on');
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
        cloud.lines.push({ seq: cloud.seq, projectId, uid: line.uid, byPerson: personId, body: structuredClone(line) });
        added += 1;
      }
      if (added) cloud.events.emit('lines', { projectId });
      return added;
    },

    async pullLines(projectId, afterSeq = 0, limit = 500) {
      if (!canSee(projectId)) return [];
      return cloud.lines.filter((l) => l.projectId === projectId && l.seq > afterSeq)
        .slice(0, limit).map((l) => ({ seq: l.seq, line: structuredClone(l.body) }));
    },

    async putCards(teamId, cards) {
      if (!myTeams().includes(teamId)) throw new Error('not on that team');
      for (const key of [...cloud.cards.keys()]) if (key.startsWith(`${personId}:`)) cloud.cards.delete(key);
      // A private card goes up with no words, whatever the Mac handed over, as
      // supabase-backend does; the database refuses words on one besides.
      const bare = (c) => (c.visible ? structuredClone(c) : { ...structuredClone(c), title: null, project: null, problem: null, progress: null, solution: null, blockedBy: [], blocks: [] });
      for (const c of cards) cloud.cards.set(`${personId}:${c.threadId}`, { ...bare(c), visible: !!c.visible, personId, teamId });
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
