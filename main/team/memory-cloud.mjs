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
import { cleanMates } from '../../shared/team-departures.mjs';
import { cleanStatus } from '../../shared/team-status.mjs';
import { cleanConnections } from '../../shared/team-connections.mjs';
import { PHONE_COMMANDS } from '../../shared/phone-snapshot.mjs';
import { roomsMemory } from './rooms-memory.mjs';
import { appendTo, cleanEntry, foldLine } from '../../shared/version-line.mjs';

// The database's own checks on a message's file (20261013000000_message_files.sql).
const FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,159}$/;
const MAX_FILE_DATA = 14_000_000;
const MAX_PIECE_BYTES = 10 * 1024 * 1024;
const MAX_WORK_BYTES = 1_000_000;
const MAX_COMMENT_CHARS = 4000;
const MAX_MARK_CHARS = 24_000;
const MAX_FOLDER_NAME = 120;

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
    files: new Map(), // `${projectId}:${name}` -> { projectId, name, byPerson, data (base64) }
    pieces: new Map(), // `${projectId}/${name}` -> { projectId, name, byPerson, bytes }
    threadWork: new Map(), // `${personId}:${threadId}` -> { owner, threadId, teamId, hash, work, updatedAt }
    threadFiles: new Map(), // `${personId}:${threadId}:${name}` -> { owner, threadId, name, data (base64) }
    threadComments: [], // { id, owner, threadId, by, text, at }
    fileMarks: [], // { id, owner, threadId, by, mark, at }
    fileFolders: [], // { id, teamId, project, name, parent, people, by, at }
    filePlaces: [], // { owner, threadId, project, family, folder, by, at }
    fileVersions: [], // { teamId, file, n, hash, name, by, at }
    reads: new Map(), // `${projectId}:${itemId}:${personId}` -> { projectId, itemId, personId, at }
    seq: 0,
    teamsMade: 0, // the order teams were made in, which is their age
    now: () => Date.now(), // the server's clock
    events: new EventEmitter(),
  };
}

// A sign-in, the way Supabase's trigger turns one into a person. Google
// confirms the email; `confirmed: false` is somebody who never proved theirs.
export function signUpMemory(cloud, { id = crypto.randomUUID(), email, name, avatarUrl = null, confirmed = true }) {
  cloud.people.set(id, { id, email, name: name || String(email).split('@')[0], avatarUrl, status: null });
  if (!confirmed) (cloud.unconfirmed ??= new Set()).add(id);
  return id;
}

// WHAT THE CLOUD SERVER DOES WITH THE SERVICE ROLE (cloud/gateway/phone.mjs):
// claims a command nobody has for the run it starts, as the database lets one
// claim win. Here so a test can be the server.
export function claimForTheCloud(cloud, id, runId) {
  const c = (cloud.phoneCommands ?? []).find((x) => x.id === id);
  if (!c || c.takenAt || c.claimedAt) return false;
  c.claimedAt = new Date(cloud.now()).toISOString();
  c.claimedBy = `cloud:${runId}`;
  cloud.events.emit('phone', 1);
  return true;
}

export function memoryBackend(cloud, personId) {
  const myTeams = () => cloud.members.filter((m) => m.personId === personId).map((m) => m.teamId)
    .sort((a, b) => (cloud.teams.get(a)?.made ?? 0) - (cloud.teams.get(b)?.made ?? 0));
  // The email the sign-in confirmed, never one a person could have typed.
  const confirmedEmail = () => {
    const me = cloud.people.get(personId);
    return me && !cloud.unconfirmed?.has(personId) ? String(me.email).toLowerCase() : null;
  };
  const owns = (teamId) => cloud.members.some((m) => m.teamId === teamId && m.personId === personId && m.role === 'owner');
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
  // The read rule of `listCards` below, for one card.
  const canReadFolder = (f) => myTeams().includes(f.teamId) && (f.people == null || f.by === personId || f.people.includes(personId));
  const canReadCard = (owner, threadId) => {
    const c = cloud.cards.get(`${owner}:${threadId}`);
    return !!c && myTeams().includes(c.teamId) && (c.people == null || owner === personId || c.people.includes(personId));
  };
  const personOut = (p) => p && ({ id: p.id, email: p.email, name: p.name, avatarUrl: p.avatarUrl ?? null, status: p.status ?? null, connections: p.connections ?? [] });

  return {
    kind: 'memory',
    personId,

    async me() {
      const me = cloud.people.get(personId);
      return me ? personOut(me) : null;
    },

    // A line you wrote about yourself. Only ever your own: the database's
    // people_update_self says the same thing, and the personId argument is
    // here so a test can try to write somebody else's and be refused.
    async setStatus({ text, until = null, personId: who = personId } = {}) {
      if (who !== personId) refuse('write somebody else\'s status');
      const me = cloud.people.get(personId);
      if (!me) refuse('set a status before signing in');
      const clean = cleanStatus(text);
      me.status = clean ? { text: clean, until: until ?? null } : null;
      cloud.events.emit('people', {});
      return me.status;
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
      cloud.events.emit('rooms', { kind: 'membership' });
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
      const rows = cloud.members.filter((m) => m.teamId === teamId);
      return rows.map((m) => ({ ...personOut(cloud.people.get(m.personId)), role: m.role })).filter((p) => p.id);
    },

    // A line you wrote about yourself. Only ever your own: the database's
    // people_update_self says the same thing, and the personId argument is
    // here so a test can try to write somebody else's and be refused.
    async setStatus({ text, until = null, personId: who = personId } = {}) {
      if (who !== personId) refuse('write somebody else\'s status');
      const me = cloud.people.get(personId);
      if (!me) refuse('set a status before signing in');
      const clean = cleanStatus(text);
      me.status = clean ? { text: clean, until: until ?? null } : null;
      cloud.events.emit('people', {});
      return me.status;
    },

    // Only ever your own, as 20261101180000_who_has_which_tool.sql says.
    async setConnections(ids, { personId: who = personId } = {}) {
      if (who !== personId) refuse('write somebody else\'s connections');
      const me = cloud.people.get(personId);
      if (!me) refuse('set connections before signing in');
      me.connections = cleanConnections(ids);
      cloud.events.emit('people', {});
      return me.connections;
    },

    // TEAM SETTINGS (2026-10-01), the same rules as 20261001000600_team_settings.sql.
    async renameTeam(teamId, name) {
      if (!owns(teamId)) refuse('rename a team you do not own');
      const t = cloud.teams.get(teamId);
      t.name = String(name).trim();
      return { id: t.id, name: t.name };
    },

    // `handover` is { handTo, name, mates: [{ id, name, job, to }] }, as
    // remove_and_hand_over in 20261101093000_a_person_who_leaves_hands_over.sql.
    async removeMember(teamId, who, handover = null) {
      if (who !== personId && !owns(teamId)) refuse('remove somebody from a team you do not own');
      if (handover && !owns(teamId)) refuse('hand over work on a team you do not own');
      if (handover) {
        const member = (id) => cloud.members.some((m) => m.teamId === teamId && m.personId === id);
        if (who === personId) refuse('hand over your own work: the owner does that');
        if (!member(who)) refuse('hand over the work of somebody not on the team');
        if (!member(handover.handTo) || handover.handTo === who) refuse('hand work to somebody not on the team');
        const mates = cleanMates(handover.mates);
        if (mates.some((m) => m.to && (!member(m.to) || m.to === who))) refuse('give an AI teammate to somebody not on the team');
        cloud.departures = (cloud.departures ?? []).filter((d) => !(d.teamId === teamId && d.personId === who));
        cloud.departures.push({ teamId, personId: who, name: String(handover.name ?? '').slice(0, 120), handTo: handover.handTo, mates, at: cloud.now(), by: personId });
      }
      cloud.members = cloud.members.filter((m) => !(m.teamId === teamId && m.personId === who));
      cloud.events.emit('rooms', { kind: 'membership' });
    },

    async departures(teamId) {
      if (!myTeams().includes(teamId)) return [];
      return (cloud.departures ?? []).filter((d) => d.teamId === teamId).map(({ teamId: _t, ...d }) => structuredClone(d));
    },

    async listInvites(teamId) {
      if (!myTeams().includes(teamId)) return [];
      return cloud.invites.filter((i) => i.teamId === teamId).map((i) => ({ email: i.email, invitedBy: i.invitedBy ?? null }));
    },

    async cancelInvite(teamId, email) {
      const clean = String(email).trim().toLowerCase();
      const inv = cloud.invites.find((i) => i.teamId === teamId && i.email.toLowerCase() === clean);
      if (!inv) return;
      if (!owns(teamId) && inv.invitedBy !== personId) refuse('cancel an invite you did not send');
      cloud.invites = cloud.invites.filter((i) => i !== inv);
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
      // A test can make the cloud refuse a share, to prove a failed start leaves nothing.
      if (cloud.refuseShares) refuse(cloud.refuseShares);
      // A message thread is its maker and up to eleven others, as the database
      // insists (migration 20261001000700_group_messages.sql).
      if (direct && (visibility !== 'people' || new Set(people.filter((p) => p !== personId)).size > 11)) refuse('put more than twelve people on a message thread');
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
      const had = [...cloud.cards.values()].filter((c) => c.personId === personId).map((c) => c.threadId);
      for (const key of [...cloud.cards.keys()]) if (key.startsWith(`${personId}:`)) cloud.cards.delete(key);
      // A private card never goes up at all, whatever the Mac handed over, as
      // supabase-backend does; the database refuses words on one besides.
      for (const c of cards) {
        if (c.visible !== true) continue;
        // NO LIST IS THE WHOLE TEAM, and an empty one is refused rather than
        // stored, as the table's own check does: it would have to mean both
        // everyone and nobody (20261001000800_chosen_people.sql).
        const people = c.people == null ? null : [...new Set(c.people.filter((p) => typeof p === 'string' && p))];
        if (people && !people.length) refuse('share a thread with nobody');
        cloud.cards.set(`${personId}:${c.threadId}`, { ...structuredClone(c), people, personId, teamId });
      }
      // A thread's work goes with its card (the foreign keys in
      // 20261030120000_shared_threads_carry_their_work.sql).
      for (const threadId of had) {
        if (cloud.cards.has(`${personId}:${threadId}`)) continue;
        cloud.threadWork.delete(`${personId}:${threadId}`);
        for (const [k, f] of [...cloud.threadFiles]) if (f.owner === personId && f.threadId === threadId) cloud.threadFiles.delete(k);
        cloud.threadComments = cloud.threadComments.filter((x) => !(x.owner === personId && x.threadId === threadId));
        cloud.fileMarks = cloud.fileMarks.filter((x) => !(x.owner === personId && x.threadId === threadId));
        cloud.filePlaces = cloud.filePlaces.filter((x) => !(x.owner === personId && x.threadId === threadId));
      }
      cloud.events.emit('cards', {});
    },

    // A CARD REACHES WHOEVER IT NAMES, and everyone on the team when it names
    // nobody (w-41ff964775). The hosted database says the same thing in its
    // own row level security (20261001000800_chosen_people.sql), which is what
    // actually stops a teammate's app asking for a card it was not sent.
    async listCards() {
      const teams = new Set(myTeams());
      return [...cloud.cards.values()]
        .filter((c) => teams.has(c.teamId))
        .filter((c) => c.people == null || c.personId === personId || c.people.includes(personId))
        .map(({ teamId, ...c }) => structuredClone(c));
    },

    // A SHARED THREAD'S WORK. Whoever can read the card can read the work and
    // comment, and nobody else: 20261030120000_shared_threads_carry_their_work.sql.
    async threadWorkHeads() {
      return [...cloud.threadWork.values()].filter((w) => canReadCard(w.owner, w.threadId))
        .map((w) => ({ personId: w.owner, threadId: w.threadId, hash: w.hash, updatedAt: w.updatedAt }));
    },

    async getThreadWork(owner, threadId) {
      const w = cloud.threadWork.get(`${owner}:${threadId}`);
      return w && canReadCard(owner, threadId) ? { work: structuredClone(w.work), hash: w.hash } : null;
    },

    async putThreadWork(teamId, { threadId, hash, work }) {
      if (!myTeams().includes(teamId)) refuse('share into a team you are not on');
      if (!cloud.cards.has(`${personId}:${threadId}`)) refuse('share the work of a thread with no card');
      if (new TextEncoder().encode(JSON.stringify(work)).length > MAX_WORK_BYTES) refuse('a thread that big');
      cloud.threadWork.set(`${personId}:${threadId}`, { owner: personId, threadId, teamId, hash, work: structuredClone(work), updatedAt: cloud.now() });
      cloud.events.emit('work', {});
    },

    async threadFileNames(threadId) {
      return [...cloud.threadFiles.values()].filter((f) => f.owner === personId && f.threadId === threadId).map((f) => f.name);
    },

    async putThreadFile(threadId, name, data) {
      if (!cloud.cards.has(`${personId}:${threadId}`)) refuse('share a file of a thread with no card');
      if (!FILE_NAME.test(name)) refuse('a file name that is not a plain name');
      if (data.length > MAX_FILE_DATA) refuse('a file that big');
      const key = `${personId}:${threadId}:${name}`;
      if (!cloud.threadFiles.has(key)) cloud.threadFiles.set(key, { owner: personId, threadId, name, data });
    },

    async pruneThreadFiles(threadId, keep) {
      for (const [k, f] of [...cloud.threadFiles]) {
        if (f.owner === personId && f.threadId === threadId && !keep.includes(f.name)) cloud.threadFiles.delete(k);
      }
    },

    async getThreadFile(owner, threadId, name) {
      return canReadCard(owner, threadId) ? cloud.threadFiles.get(`${owner}:${threadId}:${name}`)?.data ?? null : null;
    },

    async addThreadComment(owner, threadId, text) {
      if (!canReadCard(owner, threadId)) refuse('comment on a thread you cannot read');
      const clean = String(text ?? '').trim();
      if (!clean || clean.length > MAX_COMMENT_CHARS) refuse('a comment with nothing in it, or that long');
      const row = { id: crypto.randomUUID(), owner, threadId, by: personId, text: clean, at: cloud.now() };
      cloud.threadComments.push(row);
      cloud.events.emit('work', {});
      return { ...row };
    },

    async threadComments() {
      return cloud.threadComments.filter((c) => canReadCard(c.owner, c.threadId)).map((c) => ({ ...c }));
    },

    // WHAT PEOPLE MARK ON A SHARED THREAD'S FILES: the card's rule again, and an
    // id sent twice lands once (20261030180000_shared_files_carry_their_marks.sql).
    async addFileMark(owner, threadId, { id, mark }) {
      if (!canReadCard(owner, threadId)) refuse('mark a file on a thread you cannot read');
      if (!mark || typeof mark !== 'object' || JSON.stringify(mark).length > MAX_MARK_CHARS) refuse('a mark that big');
      if (!cloud.fileMarks.some((m) => m.owner === owner && m.threadId === threadId && m.by === personId && m.id === id)) {
        cloud.fileMarks.push({ id, owner, threadId, by: personId, mark: structuredClone(mark), at: cloud.now() });
        cloud.events.emit('work', {});
      }
    },

    async fileMarks() {
      return cloud.fileMarks.filter((m) => canReadCard(m.owner, m.threadId)).map((m) => structuredClone(m));
    },

    // FOLDERS (20261102000000_a_teams_folders.sql). A folder says who reads it; a
    // file's place hangs on a card, so it reaches only those who may read the
    // file, and goes when the card does.
    async putFileFolder(teamId, { id, project, name, parent = null, people = null, at }) {
      if (!myTeams().includes(teamId)) refuse('make a folder on a team you are not on');
      const clean = String(name ?? '').trim();
      if (!clean || clean.length > MAX_FOLDER_NAME) refuse('a folder with no name, or that long a name');
      if (people && (!people.length || !people.includes(personId))) refuse('share a folder with nobody, or leave yourself out');
      const was = cloud.fileFolders.find((f) => f.id === id);
      if (was && !canReadFolder(was)) refuse('change a folder you cannot read');
      const row = { id, teamId, project: String(project), name: clean, parent: parent ?? null, people: people ?? null, by: was?.by ?? personId, at };
      if (was) Object.assign(was, row); else cloud.fileFolders.push(row);
      cloud.events.emit('work', {});
    },

    async fileFolders() {
      return cloud.fileFolders.filter(canReadFolder).map((f) => structuredClone(f));
    },

    async placeFile(owner, threadId, { project, family, folder = null, at }) {
      if (!canReadCard(owner, threadId)) refuse('place a file on a thread you cannot read');
      if (folder && !cloud.fileFolders.some((f) => f.id === folder && canReadFolder(f))) refuse('place a file in a folder you cannot read');
      const was = cloud.filePlaces.find((p) => p.owner === owner && p.threadId === threadId && p.family === family);
      const row = { owner, threadId, project: String(project), family, folder: folder ?? null, by: personId, at };
      if (was) Object.assign(was, row); else cloud.filePlaces.push(row);
      cloud.events.emit('work', {});
    },

    async filePlaces() {
      return cloud.filePlaces.filter((p) => canReadCard(p.owner, p.threadId)).map((p) => structuredClone(p));
    },

    // THE VERSION LINE (20261104000000_one_version_line_per_file.sql). The cloud
    // gives each new set of bytes a file's next number; the same bytes keep theirs.
    async addFileVersion(teamId, { file, hash, name, at }) {
      if (!myTeams().includes(teamId)) refuse('number a file on a team you are not on');
      const asked = cleanEntry({ file, hash, name, n: 1, at });
      if (!asked) refuse('a version with no file or no bytes');
      const all = (cloud.fileVersions ??= []);
      const line = foldLine(all.filter((v) => v.teamId === teamId && v.file === asked.file)).get(asked.file) ?? [];
      const { entry, added } = appendTo(line, { ...asked, by: personId });
      if (added) { all.push({ teamId, ...entry }); cloud.events.emit('work', {}); }
      const { teamId: _t, ...row } = entry;
      return structuredClone(row);
    },

    async fileVersions(teamId) {
      if (!myTeams().includes(teamId)) return [];
      return (cloud.fileVersions ?? []).filter((v) => v.teamId === teamId).map(({ teamId: _t, ...v }) => structuredClone(v));
    },

    // THE FILES A CONVERSATION'S MESSAGES LINK TO (w-140ac855b1). Read and
    // written by whoever may see the project, each name stored once and never
    // replaced: 20261013000000_message_files.sql.
    // WHO HAS OPENED A CONVERSATION (20261101000000_a_conversation_says_who_has_seen_it.sql).
    async markSeen(projectId, itemId) {
      if (!canSee(projectId)) refuse('mark a conversation you cannot see');
      if (!/^w-[0-9a-f]{10}$/.test(String(itemId))) refuse('mark something that is not a row');
      cloud.reads.set(`${projectId}:${itemId}:${personId}`, { projectId, itemId, personId, at: cloud.now() });
      cloud.events.emit('lines', { projectId });
    },

    async seenMarks() {
      return [...cloud.reads.values()].filter((r) => canSee(r.projectId)).map((r) => ({ ...r }));
    },

    async hasFiles(projectId, names) {
      if (!canSee(projectId)) return [];
      return names.filter((n) => cloud.files.has(`${projectId}:${n}`));
    },

    async getFile(projectId, name) {
      if (!canSee(projectId)) return null;
      return cloud.files.get(`${projectId}:${name}`)?.data ?? null;
    },

    async putFile(projectId, name, data) {
      if (!canSee(projectId)) refuse('send a file to a project you cannot see');
      if (!FILE_NAME.test(name)) refuse('a file name that is not a plain name');
      if (data.length > MAX_FILE_DATA) refuse('a file that big');
      const key = `${projectId}:${name}`;
      if (cloud.files.has(key)) return false;
      cloud.files.set(key, { projectId, name, byPerson: personId, data });
      cloud.events.emit('files', 1);
      return true;
    },

    // A big file's pieces, in the private message-files bucket under the
    // conversation's folder (20261105000000_a_film_goes_in_pieces_through_storage.sql).
    async putPiece(projectId, name, bytes) {
      if (!canSee(projectId)) refuse('send a file to a project you cannot see');
      if (!FILE_NAME.test(name)) refuse('a file name that is not a plain name');
      if (!Buffer.isBuffer(bytes) || bytes.length > MAX_PIECE_BYTES) refuse('a piece that big');
      const key = `${projectId}/${name}`;
      if (cloud.pieces.has(key)) return false;
      cloud.pieces.set(key, { projectId, name, byPerson: personId, bytes: Buffer.from(bytes) });
      cloud.events.emit('files', 1);
      return true;
    },

    async getPiece(projectId, name) {
      if (!canSee(projectId)) return null;
      const got = cloud.pieces.get(`${projectId}/${name}`);
      return got ? Buffer.from(got.bytes) : null;
    },

    // HER OWN ROWS FOR HER PHONE (20261014000200_phone_inbox.sql): every one
    // keyed by its owner and the computer it came from, and only ever that
    // owner's. A command is written once and marked taken once.
    // Each write may name who it is for; a write for somebody other than
    // whoever this backend is signed in as is refused, as the database's
    // `owner = auth.uid()` refuses it.
    async putPhoneProject({ owner, device, project, name, cloud: carriesOn }) {
      if (owner && owner !== personId) refuse('write to somebody else\'s phone');
      const k = `${personId}:${device}:${project}`;
      const was = cloud.phoneProjects?.get(k);
      (cloud.phoneProjects ??= new Map()).set(k, { owner: personId, device, project, name, cloud: carriesOn === undefined ? was?.cloud ?? false : !!carriesOn, updatedAt: cloud.now() });
    },
    async dropPhoneProject(device, project, owner) {
      if (owner && owner !== personId) return;
      cloud.phoneProjects?.delete(`${personId}:${device}:${project}`);
      for (const k of [...(cloud.phoneThreads?.keys() ?? [])]) if (k.startsWith(`${personId}:${device}:${project}:`)) cloud.phoneThreads.delete(k);
    },
    async putPhoneThreads(device, project, rows, owner) {
      if (owner && owner !== personId) refuse('write to somebody else\'s phone');
      cloud.phoneThreads ??= new Map();
      if (!cloud.phoneProjects?.has(`${personId}:${device}:${project}`)) refuse('a thread of a project not on the phone');
      for (const r of rows) {
        if (new TextEncoder().encode(JSON.stringify(r.snapshot)).length > 1_000_000) refuse('a thread copy that big');
      }
      for (const r of rows) {
        cloud.phoneThreads.set(`${personId}:${device}:${project}:${r.item}`, { owner: personId, device, project, item: r.item, snapshot: r.snapshot, updatedAt: cloud.now() });
      }
      cloud.events.emit('phone', 1);
    },
    // Her files for the phone (20261017000000_phone_files.sql): kept under her
    // own id, never replaced, at most the bucket's size.
    async putPhoneFile({ owner, device, name, data, type }) {
      if (owner && owner !== personId) refuse('write to somebody else\'s phone');
      if (!/^[0-9a-f]{64}\.[a-z0-9]{1,8}$/.test(name)) refuse('a file named that');
      if (data.length > 26_214_400) refuse('a file that big');
      const key = `${personId}/${device}/${name}`;
      if (!(cloud.phoneFiles ??= new Map()).has(key)) cloud.phoneFiles.set(key, { data: Buffer.from(data), type });
    },
    async getPhoneFile({ owner, device, name }) {
      if (owner && owner !== personId) refuse('read somebody else\'s phone');
      const f = cloud.phoneFiles?.get(`${personId}/${device}/${name}`);
      return f ? Buffer.from(f.data) : null;
    },
    async dropPhoneFiles({ owner, device, names }) {
      if (owner && owner !== personId) return;
      for (const n of names) cloud.phoneFiles?.delete(`${personId}/${device}/${n}`);
    },
    async dropPhoneThreads(device, project, items, owner) {
      if (owner && owner !== personId) return;
      for (const item of items) cloud.phoneThreads?.delete(`${personId}:${device}:${project}:${item}`);
    },
    async phoneThreads() {
      return [...(cloud.phoneThreads?.values() ?? [])].filter((t) => t.owner === personId);
    },
    async phoneProjects() {
      return [...(cloud.phoneProjects?.values() ?? [])].filter((p) => p.owner === personId);
    },
    // One row per computer (20261023000000_phone_settings.sql).
    async putPhoneSettings({ owner, device, name, settings }) {
      if (owner && owner !== personId) refuse('write to somebody else\'s phone');
      if (!/^[0-9a-f]{12}$/.test(String(device))) refuse('settings for no computer');
      if (new TextEncoder().encode(JSON.stringify(settings)).length > 200_000) refuse('settings that big');
      (cloud.phoneSettings ??= new Map()).set(`${personId}:${device}`, { owner: personId, device, name, settings, updatedAt: cloud.now() });
    },
    async phoneSettings() {
      return [...(cloud.phoneSettings?.values() ?? [])].filter((s) => s.owner === personId).map((s) => ({ ...s }));
    },
    // The phones her alerts go to (20261025000000_push_devices.sql), hers alone.
    async putPushDevice({ token, platform, appVersion = null }) {
      if (!/^ExponentPushToken\[[A-Za-z0-9_-]{10,200}\]$/.test(String(token))) refuse('a phone address that is not Expo\'s');
      if (!['ios', 'android'].includes(platform)) refuse(`a ${platform} phone`);
      (cloud.pushDevices ??= new Map()).set(`${personId}:${token}`, { owner: personId, token, platform, appVersion, updatedAt: cloud.now() });
    },
    async pushDevices(owner) {
      if (owner && owner !== personId) return [];
      return [...(cloud.pushDevices?.values() ?? [])].filter((d) => d.owner === personId).map((d) => ({ ...d }));
    },
    async dropPushDevice(token, owner) {
      if (owner && owner !== personId) return;
      cloud.pushDevices?.delete(`${personId}:${token}`);
    },
    // What her phone does: a command, as herself, for one computer, not yet taken.
    async addPhoneCommand({ id = null, device, project = null, item = null, kind, payload = {} }) {
      if (!/^[0-9a-f]{12}$/.test(String(device))) refuse('a command for no computer');
      if (!PHONE_COMMANDS.includes(kind)) refuse(`a ${kind} command`);
      if ((kind === 'setting') !== (project == null) || (kind === 'setting' && item != null)) refuse(`a ${kind} command for ${project == null ? 'no project' : 'a project'}`);
      if (id && (cloud.phoneCommands ?? []).some((c) => c.id === id)) refuse('a command already sent');
      const row = { id: id || crypto.randomUUID(), owner: personId, device, project, item, kind, payload, createdAt: new Date(cloud.now()).toISOString(), claimedAt: null, claimedBy: null, takenAt: null, outcome: null };
      (cloud.phoneCommands ??= []).push(row);
      cloud.events.emit('phone', 1);
      return { ...row };
    },
    async waitingPhoneCommands(device) {
      return (cloud.phoneCommands ?? []).filter((c) => c.owner === personId && c.device === device && !c.takenAt).map((c) => ({ ...c }));
    },
    async phoneCommands() {
      return (cloud.phoneCommands ?? []).filter((c) => c.owner === personId).map((c) => ({ ...c }));
    },
    async cloudPhoneCommands(device, since) {
      return (cloud.phoneCommands ?? []).filter((c) => c.owner === personId && c.device === device && c.claimedBy && c.createdAt >= since).map((c) => ({ ...c }));
    },
    // THE COMPUTER CLAIMS ONE BEFORE IT DOES IT; the phone takes one back only
    // while nobody has. Exactly one of the two wins, as in the database.
    // 'claimed' is a claim made now, 'ours' one made before (this computer,
    // starting again), 'gone' a command taken back or already done.
    async claimPhoneCommand(id, owner) {
      if (owner && owner !== personId) return 'gone';
      const c = (cloud.phoneCommands ?? []).find((x) => x.id === id && x.owner === personId);
      if (!c || c.takenAt) return 'gone';
      if (c.claimedBy) return 'cloud';
      if (c.claimedAt) return 'ours';
      c.claimedAt = new Date(cloud.now()).toISOString();
      return 'claimed';
    },
    async takeBackPhoneCommand(id, outcome) {
      const c = (cloud.phoneCommands ?? []).find((x) => x.id === id && x.owner === personId);
      if (!c || c.takenAt || c.claimedAt) return false;
      c.takenAt = new Date(cloud.now()).toISOString();
      c.outcome = outcome;
      cloud.events.emit('phone', 1);
      return true;
    },
    async markPhoneCommand(id, outcome, owner) {
      if (owner && owner !== personId) return;
      // Somebody else's command is not there for you, as row level security
      // has it: the mark changes nothing rather than failing. Your own is
      // marked once; a second mark finds nothing waiting and changes nothing,
      // as the real backend's `taken_at is null` filter has it.
      const c = (cloud.phoneCommands ?? []).find((x) => x.id === id && x.owner === personId);
      if (!c || c.takenAt) return;
      c.takenAt = new Date(cloud.now()).toISOString();
      c.outcome = outcome;
      cloud.events.emit('phone', 1);
    },

    subscribe(onChange) {
      const fire = () => onChange();
      cloud.events.on('lines', fire);
      cloud.events.on('cards', fire);
      cloud.events.on('people', fire);
      cloud.events.on('phone', fire);
      cloud.events.on('work', fire);
      return () => { cloud.events.off('lines', fire); cloud.events.off('cards', fire); cloud.events.off('people', fire); cloud.events.off('phone', fire); cloud.events.off('work', fire); };
    },

    ...roomsMemory(cloud, personId, { confirmedEmail, refuse }),
  };
}
