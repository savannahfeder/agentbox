// THE SHARED CLOUD, ON SUPABASE. The same calls as memory-cloud.mts, made
// against the tables in cloud/supabase/migrations, through a supabase-js
// client that is already signed in. Row level security on the server is what
// actually keeps people apart; nothing here is trusted to.
import type { SupabaseClient } from '@supabase/supabase-js';
import { asPulled } from '../../shared/team-rules.mts';
import { cleanStatus } from '../../shared/team-status.mts';
import type { PersonStatus } from '../../shared/team-status.mts';
import { cleanConnections } from '../../shared/team-connections.mts';
import { cleanMates } from '../../shared/team-departures.mts';
import { roomsSupabase } from './rooms-supabase.mts';
import type { LedgerLine } from './sync.mts';
import type { FileLinkShare, TeamHandover } from './index.mts';

const PAGE = 500;
const PUSH_BATCH = 200;

// A select on a column list held in a variable comes back untyped, so each caller names its rows.
export interface CloudAnswer { data: unknown; error: CloudError | null }
export interface CloudError { message: string; code?: string }

interface StorageFailure { message: string; error?: string; statusCode?: string | number; status?: number }

interface PersonRow { id: string; email: string; name: string; avatar_url: string | null; status_text: string | null; status_until: string | null }

export interface CloudPerson { id: string; email: string; name: string; avatarUrl: string | null; status: PersonStatus | null }

interface CommandRow {
  id: string;
  owner: string;
  device: string;
  project: string | null;
  item: string | null;
  kind: string;
  payload: unknown;
  created_at: string;
  claimed_at: string | null;
  claimed_by?: string | null;
  taken_at: string | null;
  outcome: unknown;
}

export interface CloudPhoneCommand {
  id: string;
  owner: string;
  device: string;
  project: string | null;
  item: string | null;
  kind: string;
  payload: unknown;
  createdAt: string;
  claimedAt: string | null;
  claimedBy: string | null;
  takenAt: string | null;
  outcome: unknown;
}

interface CommentRow { id: string; owner: string; thread_id: string; by_person: string; body: string; created_at: string }

interface CardRow {
  person_id: string;
  thread_id: string;
  visible: boolean;
  title: string | null;
  project: string | null;
  people: string[] | null;
  state: string;
  priority: number | null;
  problem: string | null;
  progress: string | null;
  solution: string | null;
  blocked_by: string[] | null;
  blocks: string[] | null;
  updated_at: string;
  shipped_at?: string | null;
  task?: unknown;
}

export interface CardToPut {
  threadId: string;
  visible?: unknown;
  people?: unknown[] | null;
  title?: unknown;
  project?: unknown;
  state?: unknown;
  priority?: unknown;
  problem?: unknown;
  progress?: unknown;
  solution?: unknown;
  blockedBy?: unknown[];
  blocks?: unknown[];
  // Milliseconds, but the sync's SyncCard says no more than unknown.
  updatedAt?: unknown;
  shippedAt?: unknown;
  task?: unknown;
}

interface FileLinkRow { token: string; version: number; hash: string | null; created_at?: string; updated_at: string; comments: number }
interface LinkViewRow { name: string; kind: string; type: string; body: string; version: number; created_at?: string; updated_at: string; owner_name: string | null; owner_avatar: string | null; mine: boolean }
interface MyFileLinkRow { token: string; source: string; name: string; kind: string; created_at: string; updated_at: string; comments: number }
interface LinkCommentRow { id: string; by_name: string; by_avatar: string | null; body: string; created_at: string; mine: boolean; by_owner: boolean }
interface NewLinkCommentRow { token: string; source: string; name: string; by_name: string; body: string; created_at: string }

const PERSON_COLS = 'id,email,name,avatar_url,status_text,status_until';
const personOut = (p: PersonRow | undefined): CloudPerson | undefined => p && ({
  id: p.id, email: p.email, name: p.name, avatarUrl: p.avatar_url ?? null,
  status: p.status_text ? { text: p.status_text, until: p.status_until ? Date.parse(p.status_until) : null } : null,
});

function must<T>({ data, error }: CloudAnswer, what: string): T {
  if (error) throw new Error(`${what}: ${error.message}`);
  // With no error PostgREST answers rows, or null for a write that asked for none.
  return data as T;
}

export type Must = typeof must;

const COMMAND_COLUMNS = 'id,owner,device,project,item,kind,payload,created_at,claimed_at,taken_at,outcome';
// Who claimed (`cloud:<run>`, 20261026000000_phone_carries_on_in_the_cloud.sql),
// asked for only once the database has the column, so a computer that runs
// before the migration is applied still reads its phone.
const CLOUD_COLUMNS = `${COMMAND_COLUMNS},claimed_by`;
const noCloudColumn = (error: CloudError | null | undefined) => /claimed_by|column .*cloud|cloud.* column/i.test(String(error?.message ?? ''));
const commandOut = (r: CommandRow): CloudPhoneCommand => ({ id: r.id, owner: r.owner, device: r.device, project: r.project, item: r.item, kind: r.kind, payload: r.payload ?? {}, createdAt: r.created_at, claimedAt: r.claimed_at ?? null, claimedBy: r.claimed_by ?? null, takenAt: r.taken_at ?? null, outcome: r.outcome ?? null });

// A time as text or as a Date, to the millisecond (Date.parse of a Date drops them).
const msOf = (v: string | Date) => new Date(v).getTime();
const commentOut = (r: CommentRow) => ({ id: r.id, owner: r.owner, threadId: r.thread_id, by: r.by_person, text: r.body, at: Date.parse(r.created_at) });

export function supabaseBackend(client: SupabaseClient) {
  let personId: string | null = null;
  // Whether the database has the cloud's columns yet; the first refusal says not.
  let cloudColumns = true;
  const commandsWith = async <R extends CloudAnswer>(query: (cols: string) => PromiseLike<R>, base = COMMAND_COLUMNS): Promise<R> => {
    if (cloudColumns) {
      const out = await query(`${base},claimed_by`);
      if (!out.error || !noCloudColumn(out.error)) return out;
      cloudColumns = false;
    }
    return query(base);
  };
  async function myId(): Promise<string> {
    if (personId) return personId;
    const { data, error } = await client.auth.getUser();
    if (error || !data?.user) throw new Error('not signed in');
    personId = data.user.id;
    return personId;
  }

  return {
    kind: 'supabase',
    get personId() { return personId; },
    /** The sign-in the live relay checks against the team, refreshed by the client as it runs out. */
    async liveToken() {
      const { data } = await client.auth.getSession();
      return data?.session?.access_token ?? null;
    },

    async me() {
      const id = await myId();
      const rows = must<PersonRow[]>(await client.from('people').select(PERSON_COLS).eq('id', id).limit(1), 'reading you');
      return personOut(rows[0]) ?? null;
    },

    // A line you wrote about yourself. The row filter is your own id and
    // people_update_self says the same, so this can only ever be yours.
    async setStatus({ text, until = null, personId: who = null }: { text?: unknown; until?: number | null; personId?: string | null } = {}): Promise<PersonStatus | null> {
      const me = await myId();
      if (who && who !== me) throw new Error('refusing to write somebody else\'s status');
      const clean = cleanStatus(text);
      must(await client.from('people').update({
        status_text: clean,
        status_until: clean && until ? new Date(until).toISOString() : null,
      }).eq('id', me), 'saving your status');
      return clean ? { text: clean, until: clean && until ? until : null } : null;
    },

    // THE INVITES WAITING FOR YOU, to the email Google confirmed. Nothing is
    // joined by reading them: joining is acceptInvite, one team, on a yes.
    async pendingInvites() {
      await myId();
      const rows = must<{ team_id: string; team_name: string; invited_by: string | null; invited_by_name: string | null }[]>(await client.rpc('pending_invites'), 'reading your invites') ?? [];
      return rows.map((r) => ({ teamId: r.team_id, teamName: r.team_name, invitedBy: r.invited_by ?? null, invitedByName: r.invited_by_name ?? null }));
    },

    async acceptInvite(teamId: string) {
      await myId();
      must(await client.rpc('accept_invite', { p_team: teamId }), 'joining the team');
      return teamId;
    },

    // Every team you are on, oldest first. Which one this Mac is in is the
    // Mac's own record (main/team/index.mts), never this order alone.
    async myTeams() {
      const id = await myId();
      const members = must<{ team_id: string }[]>(await client.from('team_members').select('team_id').eq('person_id', id), 'reading your team');
      const ids = members.map((m) => m.team_id);
      if (!ids.length) return [];
      const rows = must<{ id: string; name: string }[]>(await client.from('teams').select('id,name').in('id', ids).order('created_at'), 'reading your team');
      return rows.map((r) => ({ id: r.id, name: r.name }));
    },

    async myTeam() {
      return (await this.myTeams())[0] ?? null;
    },

    async createTeam(name: string) {
      const id = await myId();
      const [team] = must<{ id: string; name: string }[]>(await client.from('teams').insert({ name, created_by: id }).select('id,name'), 'starting a team');
      must(await client.from('team_members').insert({ team_id: team.id, person_id: id, role: 'owner' }), 'joining your new team');
      return team;
    },

    async teamPeople(teamId: string) {
      await myId();
      const members = must<{ person_id: string; role: string }[]>(await client.from('team_members').select('person_id,role').eq('team_id', teamId), 'reading your team');
      const ids = members.map((m) => m.person_id);
      if (!ids.length) return [];
      const roles = new Map(members.map((m) => [m.person_id, m.role]));
      const people = must<PersonRow[]>(await client.from('people').select(PERSON_COLS).in('id', ids), 'reading your teammates');
      // Asked apart, so an app newer than the database still reads its team.
      const tools = new Map<string, string[]>();
      try { for (const r of must<{ id: string; connections: string[] | null }[]>(await client.from('people').select('id,connections').in('id', ids), 'reading connections')) tools.set(r.id, r.connections ?? []); } catch { /* nobody's are shown */ }
      return people.map((p) => ({ ...personOut(p)!, role: roles.get(p.id) ?? 'member', connections: tools.get(p.id) ?? [] }));
    },

    async setConnections(ids: unknown) {
      const me = await myId();
      const clean = cleanConnections(ids);
      must(await client.from('people').update({ connections: clean }).eq('id', me), 'saving your connections');
      return clean;
    },

    // TEAM SETTINGS (2026-10-01). The rules are the database's
    // (20261001000600_team_settings.sql): the owner renames, removes and
    // cancels; anyone leaves.
    async renameTeam(teamId: string, name: unknown) {
      await myId();
      const rows = must<{ id: string; name: string }[]>(await client.from('teams').update({ name: String(name).trim() }).eq('id', teamId).select('id,name'), 'renaming the team');
      if (!rows.length) throw new Error('only the team’s owner can rename it');
      return rows[0];
    },

    async removeMember(teamId: string, who: string, handover: TeamHandover | null = null) {
      await myId();
      if (handover) {
        must(await client.rpc('remove_and_hand_over', {
          p_team: teamId, p_who: who, p_to: handover.handTo, p_name: String(handover.name ?? '').slice(0, 120), p_mates: cleanMates(handover.mates),
        }), 'handing over their work');
        return;
      }
      const rows = must<{ person_id: string }[]>(await client.from('team_members').delete().eq('team_id', teamId).eq('person_id', who).select('person_id'), 'removing them');
      if (!rows.length) throw new Error('only the team’s owner can remove somebody');
    },

    async departures(teamId: string) {
      await myId();
      const rows = must<{ person_id: string; name: string; hand_to: string; mates: unknown; left_at: string; left_by: string }[]>(await client.from('team_departures').select('person_id,name,hand_to,mates,left_at,left_by').eq('team_id', teamId), 'reading who left');
      return rows.map((r) => ({ personId: r.person_id, name: r.name, handTo: r.hand_to, mates: cleanMates(r.mates), at: Date.parse(r.left_at), by: r.left_by }));
    },

    async listInvites(teamId: string) {
      await myId();
      const rows = must<{ email: string; invited_by: string | null }[]>(await client.from('team_invites').select('email,invited_by').eq('team_id', teamId), 'reading the invites');
      return rows.map((r) => ({ email: r.email, invitedBy: r.invited_by ?? null }));
    },

    async cancelInvite(teamId: string, email: unknown) {
      await myId();
      must(await client.from('team_invites').delete().eq('team_id', teamId).eq('email', String(email).trim()), 'cancelling the invite');
    },

    async invite(teamId: string, email: unknown) {
      const id = await myId();
      const { error } = await client.from('team_invites').upsert(
        { team_id: teamId, email: String(email).trim(), invited_by: id },
        { onConflict: 'team_id,email', ignoreDuplicates: true },
      );
      if (error) throw new Error(`inviting ${email}: ${error.message}`);
    },

    async listProjects() {
      await myId();
      const projects = must<{ id: string; team_id: string; name: string; visibility: string; created_by: string; direct: boolean | null }[]>(await client.from('projects').select('id,team_id,name,visibility,created_by,direct'), 'reading shared projects');
      const ids = projects.map((p) => p.id);
      const people = ids.length ? must<{ project_id: string; person_id: string }[]>(await client.from('project_people').select('project_id,person_id').in('project_id', ids), 'reading who is on them') : [];
      return projects.map((p) => ({
        id: p.id, teamId: p.team_id, name: p.name, visibility: p.visibility, createdBy: p.created_by, direct: !!p.direct,
        people: people.filter((pp) => pp.project_id === p.id).map((pp) => pp.person_id),
      }));
    },

    async shareProject({ id, teamId, name, visibility = 'team', people = [], direct = false }: { id: string; teamId: string; name: string; visibility?: string; people?: string[]; direct?: boolean }) {
      const me = await myId();
      must(await client.from('projects').upsert({ id, team_id: teamId, name, visibility, created_by: me, direct: !!direct }, { onConflict: 'id' }), 'sharing the project');
      const current = must<{ person_id: string }[]>(await client.from('project_people').select('person_id').eq('project_id', id), 'reading who is on it');
      const want = new Set(people);
      const have = new Set(current.map((r) => r.person_id));
      const gone = [...have].filter((p) => !want.has(p));
      const added = [...want].filter((p) => !have.has(p));
      if (gone.length) must(await client.from('project_people').delete().eq('project_id', id).in('person_id', gone), 'taking people off it');
      if (added.length) must(await client.from('project_people').insert(added.map((p) => ({ project_id: id, person_id: p }))), 'adding people to it');
      return { id, teamId, name, visibility, createdBy: me, people: [...want] };
    },

    async pushLines(projectId: string, lines: LedgerLine[]) {
      const me = await myId();
      let added = 0;
      for (let i = 0; i < lines.length; i += PUSH_BATCH) {
        const batch = lines.slice(i, i + PUSH_BATCH).map((line) => {
          if (!line?.uid || line.by !== me) throw new Error('refusing to push a line somebody else wrote');
          return { project_id: projectId, uid: line.uid, by_person: me, body: line };
        });
        const rows = must<{ uid: string }[]>(await client.from('lines').upsert(batch, { onConflict: 'uid', ignoreDuplicates: true }).select('uid'), 'sending your changes');
        added += rows?.length ?? 0;
      }
      return added;
    },

    async pullLines(projectId: string, afterSeq = 0, limit = PAGE) {
      const me = await myId();
      const rows = must<{ seq: number | string; body: LedgerLine; by_person: string; created_at: string }[]>(await client.from('lines').select('seq,body,by_person,created_at').eq('project_id', projectId).gt('seq', afterSeq).order('seq').limit(limit), 'reading your team\'s changes');
      // WHO WROTE A LINE IS THE COLUMN THE DATABASE CHECKED, never the copy
      // inside the line: row level security makes by_person the signed-in
      // writer, while the body is whatever their Mac sent. A teammate who
      // wrote somebody else's id into a body would otherwise be believed. WHEN
      // is the database's too, and their Mac's lease fields are dropped
      // (shared/team-rules.mts asPulled).
      return rows.map((r) => ({ seq: Number(r.seq), line: asPulled(r.body, { by: r.by_person, at: Date.parse(r.created_at), me }) }));
    },

    // YOUR CARDS: one per thread worth showing the team (shared/thread-cards.mts).
    // Upserted whole, and any card of yours the Mac no longer lists is removed,
    // so a thread made private or finished yesterday leaves the board. A card
    // not marked visible never goes up at all, whatever the Mac handed over.
    async putCards(teamId: string, all: CardToPut[]) {
      const me = await myId();
      const cards = all.filter((c) => c.visible === true);
      if (cards.length) {
        const rows = cards.map((c) => ({
          person_id: me, team_id: teamId, thread_id: c.threadId, visible: !!c.visible,
          // WHO IT REACHES: the chosen people, or no list at all for the whole
          // team (w-41ff964775). The read rule on the table does the enforcing.
          people: c.people == null ? null : [...new Set(c.people.filter((p) => typeof p === 'string' && p))],
          title: c.visible ? c.title : null, project: c.visible ? c.project : null, state: c.state,
          priority: Number.isFinite(c.priority) ? c.priority : null,
          problem: c.visible ? c.problem : null, progress: c.visible ? c.progress : null, solution: c.visible ? c.solution : null,
          blocked_by: c.visible ? c.blockedBy ?? [] : [], blocks: c.visible ? c.blocks ?? [] : [],
          updated_at: new Date(c.updatedAt as number).toISOString(),
          shipped_at: Number.isFinite(c.shippedAt) ? new Date(c.shippedAt as number).toISOString() : null,
          task: c.visible && c.task ? c.task : null,
        }));
        const put = (list: Record<string, unknown>[]) => client.from('thread_cards').upsert(list, { onConflict: 'person_id,thread_id' });
        let res = await put(rows);
        // A cloud from before 20261031000000 has no such column; the cards still go up.
        // A cloud from before 20261103000000 has no task column.
        if (['PGRST204', '42703'].includes(res.error?.code as string)) res = await put(rows.map(({ task: _, ...r }) => r));
        if (['PGRST204', '42703'].includes(res.error?.code as string)) res = await put(rows.map(({ shipped_at: _, task: __, ...r }) => r));
        must(res, 'sharing your threads with the team');
      }
      let stale = client.from('thread_cards').delete().eq('person_id', me);
      if (cards.length) stale = stale.not('thread_id', 'in', `(${cards.map((c) => `"${c.threadId}"`).join(',')})`);
      must(await stale, 'clearing threads the team no longer needs to see');
    },

    async listCards() {
      await myId();
      const rows = must<CardRow[]>(await client.from('thread_cards').select('*'), 'reading your team\'s threads');
      return rows.map((r) => ({
        personId: r.person_id, threadId: r.thread_id, visible: r.visible, title: r.title, project: r.project, people: r.people ?? null,
        state: r.state, priority: r.priority, problem: r.problem, progress: r.progress, solution: r.solution,
        blockedBy: r.blocked_by ?? [], blocks: r.blocks ?? [], updatedAt: Date.parse(r.updated_at),
        ...(r.shipped_at ? { shippedAt: Date.parse(r.shipped_at) } : {}),
        ...(r.task ? { task: r.task } : {}),
      }));
    },

    // A SHARED THREAD'S WORK. Row level security holds the rule: whoever can
    // read the card (20261030120000_shared_threads_carry_their_work.sql).
    async threadWorkHeads() {
      await myId();
      const rows = must<{ person_id: string; thread_id: string; hash: string; updated_at: string }[]>(await client.from('thread_work').select('person_id,thread_id,hash,updated_at'), 'reading what your team has shared');
      return rows.map((r) => ({ personId: r.person_id, threadId: r.thread_id, hash: r.hash, updatedAt: Date.parse(r.updated_at) }));
    },

    async getThreadWork(owner: string, threadId: string) {
      const rows = must<{ work: unknown; hash: string }[]>(await client.from('thread_work').select('work,hash').eq('person_id', owner).eq('thread_id', threadId).limit(1), 'reading a teammate\'s thread');
      return rows[0] ? { work: rows[0].work, hash: rows[0].hash } : null;
    },

    async putThreadWork(teamId: string, { threadId, hash, work }: { threadId: string; hash: string; work: unknown }) {
      const me = await myId();
      must(await client.from('thread_work').upsert({ person_id: me, thread_id: threadId, team_id: teamId, hash, work, updated_at: new Date().toISOString() }, { onConflict: 'person_id,thread_id' }), 'sharing a thread\'s work');
    },

    async threadFileNames(threadId: string) {
      const me = await myId();
      const rows = must<{ name: string }[]>(await client.from('thread_work_files').select('name').eq('person_id', me).eq('thread_id', threadId), 'asking which files are shared');
      return rows.map((r) => r.name);
    },

    async putThreadFile(threadId: string, name: string, data: string) {
      const me = await myId();
      must(await client.from('thread_work_files').upsert({ person_id: me, thread_id: threadId, name, data }, { onConflict: 'person_id,thread_id,name', ignoreDuplicates: true }), 'sharing a file');
    },

    async pruneThreadFiles(threadId: string, keep: string[]) {
      const me = await myId();
      let gone = client.from('thread_work_files').delete().eq('person_id', me).eq('thread_id', threadId);
      if (keep.length) gone = gone.not('name', 'in', `(${keep.map((n) => `"${n}"`).join(',')})`);
      must(await gone, 'clearing files a thread no longer names');
    },

    // A FILE ANYONE WITH ITS LINK CAN READ: only through the functions in
    // 20261105000001_a_file_anyone_with_its_link_can_read.sql.
    async shareFile({ source, name, kind, type, body, version = 1, hash = '' }: FileLinkShare) {
      await myId();
      return must<unknown>(await client.rpc('share_file', { src: source, nm: name, k: kind, typ: type, b: body, v: version, h: hash }), 'sharing the file');
    },

    async fileLinkFor(source: string) {
      await myId();
      const rows = must<FileLinkRow[] | null>(await client.rpc('my_file_link', { src: source }), 'asking for the file\'s link');
      const r = rows?.[0];
      return r ? { token: r.token, version: r.version, hash: r.hash ?? '', createdAt: msOf(r.created_at ?? r.updated_at), updatedAt: msOf(r.updated_at), comments: r.comments } : null;
    },

    async stopFileLink(token: string) {
      await myId();
      must(await client.rpc('stop_file_link', { tok: token }), 'stopping the link');
    },

    // A film's pieces, raw, in the private link-files bucket at <token>/<hash>/<n>
    // (20261109120000_a_film_can_be_shared_by_its_link.sql).
    async putLinkPiece(name: string, bytes: Buffer) {
      await myId();
      const { error }: { error: StorageFailure | null } = await client.storage.from('link-files').upload(name, bytes, { contentType: 'application/octet-stream', upsert: false });
      if (!error || /exists|duplicate/i.test(`${error.message} ${error.error ?? ''}`) || String(error.statusCode ?? error.status) === '409') return;
      throw new Error(`sending a piece of the film: ${error.message}`);
    },

    async linkPiecesHeld(token: string, hash: string) {
      await myId();
      const { data, error }: { data: { name: string }[] | null; error: StorageFailure | null } = await client.storage.from('link-files').list(`${token}/${hash}`, { limit: 1000 });
      if (error) return [];
      return (data ?? []).map((o) => Number(o.name)).filter((n) => Number.isInteger(n));
    },

    async clearLinkPieces(token: string, keep: string | null) {
      await myId();
      const bucket = client.storage.from('link-files');
      const { data: copies }: { data: { name: string }[] | null } = await bucket.list(token, { limit: 100 });
      for (const copy of copies ?? []) {
        if (copy.name === keep) continue;
        const { data: pieces }: { data: { name: string }[] | null } = await bucket.list(`${token}/${copy.name}`, { limit: 1000 });
        const names = (pieces ?? []).map((p) => `${token}/${copy.name}/${p.name}`);
        if (names.length) {
          const { error }: { error: StorageFailure | null } = await bucket.remove(names);
          if (error) throw new Error(`clearing a film's old pieces: ${error.message}`);
        }
      }
    },

    // What anyone with the link reads, so a file shared with this person can be brought in.
    async fileLinkView(token: string) {
      const rows = must<LinkViewRow[] | null>(await client.rpc('file_link_view', { tok: token }), 'reading the shared file');
      const r = rows?.[0];
      if (!r) return { stopped: must<boolean>(await client.rpc('file_link_stopped', { tok: token }), 'reading the shared file') === true, file: null };
      return { stopped: false, file: { name: r.name, kind: r.kind, type: r.type, body: r.body, version: r.version, createdAt: msOf(r.created_at ?? r.updated_at), updatedAt: msOf(r.updated_at), ownerName: r.owner_name ?? null, ownerAvatar: r.owner_avatar ?? null, mine: !!r.mine } };
    },

    async linkPiece(name: string) {
      const { data, error }: { data: Blob | null; error: StorageFailure | null } = await client.storage.from('link-files').download(name);
      if (error) {
        if (/not.?found/i.test(`${error.message} ${error.error ?? ''}`) || [400, 404].includes(Number(error.statusCode ?? error.status))) return null;
        throw new Error(`taking a piece of the film: ${error.message}`);
      }
      return Buffer.from(await data!.arrayBuffer());
    },

    async fileLinkComments(token: string) {
      await myId();
      const rows = must<LinkCommentRow[] | null>(await client.rpc('file_link_comments_of', { tok: token }), 'reading the comments');
      return (rows ?? []).map((c) => ({ id: c.id, byName: c.by_name, byAvatar: c.by_avatar ?? null, text: c.body, at: msOf(c.created_at), mine: !!c.mine, byOwner: !!c.by_owner }));
    },

    async myFileLinks() {
      await myId();
      const rows = must<MyFileLinkRow[] | null>(await client.rpc('my_file_links'), 'reading your public links');
      return (rows ?? []).map((r) => ({ token: r.token, source: r.source, name: r.name, kind: r.kind, createdAt: msOf(r.created_at), updatedAt: msOf(r.updated_at), comments: r.comments }));
    },

    async newLinkComments(since: number) {
      await myId();
      const rows = must<NewLinkCommentRow[] | null>(await client.rpc('new_comments_on_my_links', { since: new Date(since).toISOString() }), 'reading new comments on your links');
      return (rows ?? []).map((c) => ({ token: c.token, source: c.source, name: c.name, byName: c.by_name, text: c.body, at: msOf(c.created_at) }));
    },

    async commentOnFileLink(token: string, text: unknown) {
      await myId();
      return must<unknown>(await client.rpc('comment_on_file_link', { tok: token, b: text }), 'sending your comment');
    },

    async getThreadFile(owner: string, threadId: string, name: string) {
      const rows = must<{ data: string }[]>(await client.from('thread_work_files').select('data').eq('person_id', owner).eq('thread_id', threadId).eq('name', name).limit(1), 'taking a file from a teammate\'s thread');
      return rows[0]?.data ?? null;
    },

    async addThreadComment(owner: string, threadId: string, text: unknown) {
      const me = await myId();
      const rows = must<CommentRow[]>(await client.from('thread_comments').insert({ owner, thread_id: threadId, by_person: me, body: String(text ?? '').trim() }).select('id,owner,thread_id,by_person,body,created_at'), 'sending your comment');
      return commentOut(rows[0]);
    },

    async threadComments() {
      await myId();
      const rows = must<CommentRow[]>(await client.from('thread_comments').select('id,owner,thread_id,by_person,body,created_at'), 'reading comments');
      return rows.map(commentOut);
    },

    // Row level security holds the card's rule (20261030180000_shared_files_carry_their_marks.sql).
    async addFileMark(owner: string, threadId: string, { id, mark }: { id: string; mark?: unknown }) {
      const me = await myId();
      must(await client.from('thread_file_marks').upsert({ owner, thread_id: threadId, by_person: me, id, mark }, { onConflict: 'owner,thread_id,by_person,id', ignoreDuplicates: true }), 'sending your note on a file');
    },

    async fileMarks() {
      await myId();
      const rows = must<{ id: string; owner: string; thread_id: string; by_person: string; mark: unknown; created_at: string }[]>(await client.from('thread_file_marks').select('id,owner,thread_id,by_person,mark,created_at'), 'reading notes on files');
      return rows.map((r) => ({ id: r.id, owner: r.owner, threadId: r.thread_id, by: r.by_person, mark: r.mark, at: Date.parse(r.created_at) }));
    },

    // Row level security holds who reads a folder and a place (20261102000000_a_teams_folders.sql).
    async putFileFolder(teamId: string, { id, project, name, parent = null, people = null, at }: { id: string; project: unknown; name: unknown; parent?: string | null; people?: string[] | null; at: number }) {
      await myId();
      must(await client.from('file_folders').upsert({ id, team_id: teamId, project, name, parent, people, at }, { onConflict: 'id' }), 'saving a folder');
    },

    async fileFolders() {
      await myId();
      const rows = must<{ id: string; team_id: string; project: string; name: string; parent: string | null; people: string[] | null; created_by: string; at: number | string }[]>(await client.from('file_folders').select('id,team_id,project,name,parent,people,created_by,at'), 'reading folders');
      return rows.map((r) => ({ id: r.id, teamId: r.team_id, project: r.project, name: r.name, parent: r.parent, people: r.people, by: r.created_by, at: Number(r.at) }));
    },

    async placeFile(owner: string, threadId: string, { project, family, folder = null, at }: { project: unknown; family: string; folder?: string | null; at: number }) {
      const me = await myId();
      must(await client.from('file_places').upsert({ owner, thread_id: threadId, project, family, folder, by_person: me, at }, { onConflict: 'owner,thread_id,family' }), 'placing a file');
    },

    async filePlaces() {
      await myId();
      const rows = must<{ owner: string; thread_id: string; project: string; family: string; folder: string | null; by_person: string; at: number | string }[]>(await client.from('file_places').select('owner,thread_id,project,family,folder,by_person,at'), 'reading where files sit');
      return rows.map((r) => ({ owner: r.owner, threadId: r.thread_id, project: r.project, family: r.family, folder: r.folder, by: r.by_person, at: Number(r.at) }));
    },

    // The database numbers a version, under a lock per file (20261104000000_one_version_line_per_file.sql).
    async addFileVersion(teamId: string, { file, hash, name, at }: { file: string; hash: string; name: string | null; at: number }) {
      const me = await myId();
      const n = must<number | string>(await client.rpc('add_file_version', { p_team: teamId, p_file: file, p_hash: hash, p_name: name, p_at: at }), 'numbering a version');
      return { file, n: Number(n), hash, name, by: me, at };
    },

    async fileVersions(teamId: string) {
      await myId();
      const rows = must<{ file: string; n: number | string; hash: string; name: string | null; by_person: string | null; at: number | string }[]>(await client.from('file_versions').select('file,n,hash,name,by_person,at').eq('team_id', teamId), 'reading the versions of files');
      return rows.map((r) => ({ file: r.file, n: Number(r.n), hash: r.hash, name: r.name, by: r.by_person, at: Number(r.at) }));
    },

    // Row level security keeps the lines' rule (20261101000000_a_conversation_says_who_has_seen_it.sql).
    async markSeen(projectId: string, itemId: string) {
      const me = await myId();
      must(await client.from('conversation_reads').upsert({ project_id: projectId, item_id: itemId, person_id: me }, { onConflict: 'project_id,item_id,person_id' }), 'saying you have read it');
    },

    async seenMarks() {
      await myId();
      const rows = must<{ project_id: string; item_id: string; person_id: string; seen_at: string }[]>(await client.from('conversation_reads').select('project_id,item_id,person_id,seen_at'), 'reading who has seen what');
      return rows.map((r) => ({ projectId: r.project_id, itemId: r.item_id, personId: r.person_id, at: Date.parse(r.seen_at) }));
    },

    // THE FILES A CONVERSATION'S MESSAGES LINK TO (w-140ac855b1). Row level
    // security decides who may read and add one (20261013000000_message_files.sql).
    async hasFiles(projectId: string, names: string[]) {
      if (!names.length) return [];
      const rows = must<{ name: string }[]>(await client.from('message_files').select('name').eq('project_id', projectId).in('name', names), 'asking which pictures your team has');
      return rows.map((r) => r.name);
    },

    async getFile(projectId: string, name: string) {
      const rows = must<{ data: string }[]>(await client.from('message_files').select('data').eq('project_id', projectId).eq('name', name).limit(1), 'taking a picture a teammate sent');
      return rows[0]?.data ?? null;
    },

    async putFile(projectId: string, name: string, data: string) {
      const me = await myId();
      const rows = must<{ name: string }[] | null>(await client.from('message_files').upsert({ project_id: projectId, name, by_person: me, data }, { onConflict: 'project_id,name', ignoreDuplicates: true }).select('name'), 'sending a picture');
      return (rows?.length ?? 0) > 0;
    },

    // A big file's pieces, raw, in a private bucket under the conversation's
    // folder (20261105000000_a_film_goes_in_pieces_through_storage.sql): as rows
    // of base64 a 625 MB film was 830 MB of database. A piece already there is
    // the same piece, since its name is what is in it.
    async putPiece(projectId: string, name: string, bytes: Buffer) {
      await myId();
      const { error }: { error: StorageFailure | null } = await client.storage.from('message-files').upload(`${projectId}/${name}`, bytes, { contentType: 'application/octet-stream', upsert: false });
      if (!error) return true;
      if (/exists|duplicate/i.test(`${error.message} ${error.error ?? ''}`) || String(error.statusCode ?? error.status) === '409') return false;
      throw new Error(`sending a piece of a file: ${error.message}`);
    },

    async getPiece(projectId: string, name: string) {
      await myId();
      const { data, error }: { data: Blob | null; error: StorageFailure | null } = await client.storage.from('message-files').download(`${projectId}/${name}`);
      if (error) {
        if (/not.?found/i.test(`${error.message} ${error.error ?? ''}`) || [400, 404].includes(Number(error.statusCode ?? error.status))) return null;
        throw new Error(`taking a piece of a file: ${error.message}`);
      }
      // No error is a download.
      return Buffer.from(await data!.arrayBuffer());
    },

    // HER OWN ROWS FOR HER PHONE (20261014000200_phone_inbox.sql). The owner
    // column defaults to her, and row level security keeps every row hers.
    // Every row names the computer it belongs to (`device`).
    // Each write names who it is for, so a write begun before a sign-out
    // that lands after somebody else signed in is refused by the database
    // (`owner = auth.uid()`) rather than written into their account.
    async putPhoneProject({ owner, device, project, name, cloud }: { owner?: string; device: string; project: string; name: string; cloud?: boolean }) {
      await myId();
      const row = { ...(owner ? { owner } : {}), device, project, name, updated_at: new Date().toISOString() };
      const put = (r: Record<string, unknown>) => client.from('phone_projects').upsert(r, { onConflict: 'owner,device,project' });
      let out = cloud === undefined || !cloudColumns ? await put(row) : await put({ ...row, cloud: !!cloud });
      if (out.error && cloud !== undefined && cloudColumns && noCloudColumn(out.error)) { cloudColumns = false; out = await put(row); }
      must(out, 'putting a project on your phone');
    },
    async dropPhoneProject(device: string, project: string, owner?: string) {
      const me = await myId();
      // Its threads go with it (the database cascades).
      must(await client.from('phone_projects').delete().eq('owner', owner ?? me).eq('device', device).eq('project', project), 'taking a project off your phone');
    },
    async putPhoneThreads(device: string, project: string, rows: { item: string; snapshot: unknown }[], owner?: string) {
      await myId();
      const at = new Date().toISOString();
      for (let i = 0; i < rows.length; i += 50) {
        const batch = rows.slice(i, i + 50).map((r) => ({ ...(owner ? { owner } : {}), device, project, item: r.item, snapshot: r.snapshot, updated_at: at }));
        must(await client.from('phone_threads').upsert(batch, { onConflict: 'owner,device,project,item' }), 'sending threads to your phone');
      }
    },
    // Her files for the phone, in her own folder of a private bucket
    // (20261017000000_phone_files.sql). Named by what is in them, so one
    // already there is the same file and is left as it is.
    async putPhoneFile({ owner, device, name, data, type }: { owner?: string; device: string; name: string; data: Buffer; type: string | null }) {
      const me = await myId();
      const { error }: { error: StorageFailure | null } = await client.storage.from('phone-files').upload(`${owner ?? me}/${device}/${name}`, data, { contentType: type ?? 'application/octet-stream', upsert: false });
      if (error && !/exists|duplicate/i.test(`${error.message} ${error.statusCode ?? ''}`) && String(error.statusCode) !== '409') throw new Error(`sending a file to your phone: ${error.message}`);
    },
    // A picture her phone put in this computer's folder for a reply; null when it is not there.
    async getPhoneFile({ owner, device, name }: { owner?: string; device: string; name: string }) {
      const me = await myId();
      const { data, error }: { data: Blob | null; error: StorageFailure | null } = await client.storage.from('phone-files').download(`${owner ?? me}/${device}/${name}`);
      if (error) {
        if (/not.?found/i.test(`${error.message} ${error.error ?? ''}`) || [400, 404].includes(Number(error.statusCode ?? error.status))) return null;
        throw new Error(`taking a picture from your phone: ${error.message}`);
      }
      return Buffer.from(await data!.arrayBuffer());
    },
    async dropPhoneFiles({ owner, device, names }: { owner?: string; device: string; names: string[] }) {
      const me = await myId();
      for (let i = 0; i < names.length; i += 100) {
        const { error } = await client.storage.from('phone-files').remove(names.slice(i, i + 100).map((n) => `${owner ?? me}/${device}/${n}`));
        if (error) throw new Error(`clearing old files from your phone: ${error.message}`);
      }
    },
    async dropPhoneThreads(device: string, project: string, items: string[], owner?: string) {
      const me = await myId();
      for (let i = 0; i < items.length; i += 100) {
        must(await client.from('phone_threads').delete().eq('owner', owner ?? me).eq('device', device).eq('project', project).in('item', items.slice(i, i + 100)), 'taking threads off your phone');
      }
    },
    // What her phone reads and sends.
    async phoneProjects() {
      const me = await myId();
      const rows = must<{ owner: string; device: string; project: string; name: string }[] | null>(await client.from('phone_projects').select('owner,device,project,name').order('name'), 'reading the projects on your phone');
      return (rows ?? []).filter((r) => r.owner === me);
    },
    async phoneThreads() {
      const me = await myId();
      const rows = must<{ owner: string; device: string; project: string; item: string; snapshot: unknown; updated_at: string }[] | null>(await client.from('phone_threads').select('owner,device,project,item,snapshot,updated_at').order('updated_at', { ascending: false }).limit(1000), 'reading the threads on your phone');
      return (rows ?? []).filter((r) => r.owner === me).map((r) => ({ owner: r.owner, device: r.device, project: r.project, item: r.item, snapshot: r.snapshot, updatedAt: Date.parse(r.updated_at) }));
    },
    // One row per computer (20261023000000_phone_settings.sql).
    async putPhoneSettings({ owner, device, name, settings }: { owner?: string; device: string; name: string; settings: unknown }) {
      await myId();
      must(await client.from('phone_settings').upsert({ ...(owner ? { owner } : {}), device, name, settings, updated_at: new Date().toISOString() }, { onConflict: 'owner,device' }), 'sending your settings to your phone');
    },
    async phoneSettings() {
      const me = await myId();
      const rows = must<{ owner: string; device: string; name: string; settings: unknown; updated_at: string }[] | null>(await client.from('phone_settings').select('owner,device,name,settings,updated_at').order('updated_at', { ascending: false }), 'reading your computer\'s settings');
      return (rows ?? []).filter((r) => r.owner === me).map((r) => ({ owner: r.owner, device: r.device, name: r.name, settings: r.settings, updatedAt: Date.parse(r.updated_at) }));
    },
    // The phones her alerts go to (20261025000000_push_devices.sql). The phone writes its own row; this is for tests.
    async putPushDevice({ token, platform, appVersion = null }: { token: string; platform: string; appVersion?: string | null }) {
      await myId();
      must(await client.from('push_devices').upsert({ token, platform, app_version: appVersion, updated_at: new Date().toISOString() }, { onConflict: 'owner,token' }), 'turning on alerts');
    },
    async pushDevices(owner?: string) {
      const me = await myId();
      const rows = must<{ owner: string; token: string; platform: string; app_version: string | null; updated_at: string }[] | null>(await client.from('push_devices').select('owner,token,platform,app_version,updated_at').eq('owner', owner ?? me), 'reading the phones to alert');
      return (rows ?? []).map((r) => ({ owner: r.owner, token: r.token, platform: r.platform, appVersion: r.app_version ?? null, updatedAt: Date.parse(r.updated_at) }));
    },
    async dropPushDevice(token: string, owner?: string) {
      const me = await myId();
      must(await client.from('push_devices').delete().eq('owner', owner ?? me).eq('token', token), 'forgetting a phone');
    },
    async addPhoneCommand({ id = null, device, project = null, item = null, kind, payload = {} }: { id?: string | null; device: string; project?: string | null; item?: string | null; kind: string; payload?: unknown }) {
      await myId();
      const row = must<CommandRow>(await client.from('phone_commands').insert({ ...(id ? { id } : {}), device, project, item, kind, payload }).select(COMMAND_COLUMNS).single(), 'sending that to your computer');
      return commandOut(row);
    },
    async phoneCommands() {
      await myId();
      const rows = must<CommandRow[] | null>(await client.from('phone_commands').select(COMMAND_COLUMNS).order('created_at', { ascending: true }).limit(500), 'reading what your phone sent');
      return (rows ?? []).map(commandOut);
    },
    // This computer's, every one still waiting, oldest first, a page at a time.
    async waitingPhoneCommands(device: string) {
      await myId();
      const out: CloudPhoneCommand[] = [];
      for (let from = 0; ; from += 200) {
        const rows = must<CommandRow[] | null>(await commandsWith((cols) => client.from('phone_commands').select(cols).eq('device', device).is('taken_at', null).order('created_at', { ascending: true }).range(from, from + 199)), 'reading what your phone sent');
        out.push(...(rows ?? []).map(commandOut));
        if (!rows || rows.length < 200) return out;
      }
    },
    // This computer's commands the cloud claimed since `since`, taken or not,
    // so a computer waking up joins the runs it started (Supervisor#adoptCloudRun).
    async cloudPhoneCommands(device: string, since: string) {
      await myId();
      if (!cloudColumns) return [];
      const out = await client.from('phone_commands').select(CLOUD_COLUMNS).eq('device', device).not('claimed_by', 'is', null).gte('created_at', since).order('created_at', { ascending: true }).limit(200);
      if (out.error && noCloudColumn(out.error)) { cloudColumns = false; return []; }
      return (must<CommandRow[] | null>(out, 'reading what the cloud took from your phone') ?? []).map(commandOut);
    },
    // THE COMPUTER CLAIMS ONE BEFORE IT DOES IT; the phone takes one back only
    // while nobody has (renderer/src/cloud-bridge.ts). The database lets one win.
    async claimPhoneCommand(id: string, owner?: string): Promise<'claimed' | 'cloud' | 'ours' | 'gone'> {
      const me = await myId();
      const who = owner ?? me;
      const won = must<{ id: string }[] | null>(await client.from('phone_commands').update({ claimed_at: new Date().toISOString() }).eq('id', id).eq('owner', who).is('taken_at', null).is('claimed_at', null).select('id'), 'starting what your phone sent');
      if (won?.length) return 'claimed';
      const row = must<{ taken_at: string | null; claimed_at: string | null; claimed_by?: string | null } | null>(await commandsWith((cols) => client.from('phone_commands').select(cols).eq('id', id).eq('owner', who).maybeSingle(), 'taken_at,claimed_at'), 'reading what your phone sent');
      // The cloud's claim is the cloud's run: never done here as if it were ours.
      if (row?.claimed_by) return 'cloud';
      return row && !row.taken_at && row.claimed_at ? 'ours' : 'gone';
    },
    async markPhoneCommand(id: string, outcome: unknown, owner?: string) {
      const me = await myId();
      must(await client.from('phone_commands').update({ taken_at: new Date().toISOString(), outcome }).eq('id', id).eq('owner', owner ?? me).is('taken_at', null), 'marking what your phone sent as done');
    },

    subscribe(onChange: () => void) {
      const channel = client.channel(`team-${Math.random().toString(36).slice(2)}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'phone_commands' }, () => onChange())
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'lines' }, () => onChange())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'thread_cards' }, () => onChange())
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'thread_comments' }, () => onChange())
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'people' }, () => onChange())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'conversation_reads' }, () => onChange())
        .subscribe();
      return () => { client.removeChannel(channel); };
    },

    ...roomsSupabase(client, myId, must),
  };
}

export type SupabaseBackend = ReturnType<typeof supabaseBackend>;
