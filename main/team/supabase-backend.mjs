// THE SHARED CLOUD, ON SUPABASE. The same calls as memory-cloud.mjs, made
// against the tables in cloud/supabase/migrations, through a supabase-js
// client that is already signed in. Row level security on the server is what
// actually keeps people apart; nothing here is trusted to.
import { asPulled } from '../../shared/team-rules.mjs';
import { cleanStatus } from '../../shared/team-status.mjs';
import { roomsSupabase } from './rooms-supabase.mjs';

const PAGE = 500;
const PUSH_BATCH = 200;

const PERSON_COLS = 'id,email,name,avatar_url,status_text,status_until';
const personOut = (p) => p && ({
  id: p.id, email: p.email, name: p.name, avatarUrl: p.avatar_url ?? null,
  status: p.status_text ? { text: p.status_text, until: p.status_until ? Date.parse(p.status_until) : null } : null,
});

function must({ data, error }, what) {
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
}

const COMMAND_COLUMNS = 'id,owner,device,project,item,kind,payload,created_at,claimed_at,taken_at,outcome';
// Who claimed (`cloud:<run>`, 20261026000000_phone_carries_on_in_the_cloud.sql),
// asked for only once the database has the column, so a computer that runs
// before the migration is applied still reads its phone.
const CLOUD_COLUMNS = `${COMMAND_COLUMNS},claimed_by`;
const noCloudColumn = (error) => /claimed_by|column .*cloud|cloud.* column/i.test(String(error?.message ?? ''));
const commandOut = (r) => ({ id: r.id, owner: r.owner, device: r.device, project: r.project, item: r.item, kind: r.kind, payload: r.payload ?? {}, createdAt: r.created_at, claimedAt: r.claimed_at ?? null, claimedBy: r.claimed_by ?? null, takenAt: r.taken_at ?? null, outcome: r.outcome ?? null });

export function supabaseBackend(client) {
  let personId = null;
  // Whether the database has the cloud's columns yet; the first refusal says not.
  let cloudColumns = true;
  const commandsWith = async (query, base = COMMAND_COLUMNS) => {
    if (cloudColumns) {
      const out = await query(`${base},claimed_by`);
      if (!out.error || !noCloudColumn(out.error)) return out;
      cloudColumns = false;
    }
    return query(base);
  };
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
      const rows = must(await client.from('people').select(PERSON_COLS).eq('id', id).limit(1), 'reading you');
      return personOut(rows[0]) ?? null;
    },

    // A line you wrote about yourself. The row filter is your own id and
    // people_update_self says the same, so this can only ever be yours.
    async setStatus({ text, until = null, personId: who = null } = {}) {
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
      const people = must(await client.from('people').select(PERSON_COLS).in('id', ids), 'reading your teammates');
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

    // THE FILES A CONVERSATION'S MESSAGES LINK TO (w-140ac855b1). Row level
    // security decides who may read and add one (20261013000000_message_files.sql).
    async hasFiles(projectId, names) {
      if (!names.length) return [];
      const rows = must(await client.from('message_files').select('name').eq('project_id', projectId).in('name', names), 'asking which pictures your team has');
      return rows.map((r) => r.name);
    },

    async getFile(projectId, name) {
      const rows = must(await client.from('message_files').select('data').eq('project_id', projectId).eq('name', name).limit(1), 'taking a picture a teammate sent');
      return rows[0]?.data ?? null;
    },

    async putFile(projectId, name, data) {
      const me = await myId();
      const rows = must(await client.from('message_files').upsert({ project_id: projectId, name, by_person: me, data }, { onConflict: 'project_id,name', ignoreDuplicates: true }).select('name'), 'sending a picture');
      return (rows?.length ?? 0) > 0;
    },

    // HER OWN ROWS FOR HER PHONE (20261014000200_phone_inbox.sql). The owner
    // column defaults to her, and row level security keeps every row hers.
    // Every row names the computer it belongs to (`device`).
    // Each write names who it is for, so a write begun before a sign-out
    // that lands after somebody else signed in is refused by the database
    // (`owner = auth.uid()`) rather than written into their account.
    async putPhoneProject({ owner, device, project, name, cloud }) {
      await myId();
      const row = { ...(owner ? { owner } : {}), device, project, name, updated_at: new Date().toISOString() };
      const put = (r) => client.from('phone_projects').upsert(r, { onConflict: 'owner,device,project' });
      let out = cloud === undefined || !cloudColumns ? await put(row) : await put({ ...row, cloud: !!cloud });
      if (out.error && cloud !== undefined && cloudColumns && noCloudColumn(out.error)) { cloudColumns = false; out = await put(row); }
      must(out, 'putting a project on your phone');
    },
    async dropPhoneProject(device, project, owner) {
      const me = await myId();
      // Its threads go with it (the database cascades).
      must(await client.from('phone_projects').delete().eq('owner', owner ?? me).eq('device', device).eq('project', project), 'taking a project off your phone');
    },
    async putPhoneThreads(device, project, rows, owner) {
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
    async putPhoneFile({ owner, device, name, data, type }) {
      const me = await myId();
      const { error } = await client.storage.from('phone-files').upload(`${owner ?? me}/${device}/${name}`, data, { contentType: type ?? 'application/octet-stream', upsert: false });
      if (error && !/exists|duplicate/i.test(`${error.message} ${error.statusCode ?? ''}`) && String(error.statusCode) !== '409') throw new Error(`sending a file to your phone: ${error.message}`);
    },
    // A picture her phone put in this computer's folder for a reply; null when it is not there.
    async getPhoneFile({ owner, device, name }) {
      const me = await myId();
      const { data, error } = await client.storage.from('phone-files').download(`${owner ?? me}/${device}/${name}`);
      if (error) {
        if (/not.?found/i.test(`${error.message} ${error.error ?? ''}`) || [400, 404].includes(Number(error.statusCode ?? error.status))) return null;
        throw new Error(`taking a picture from your phone: ${error.message}`);
      }
      return Buffer.from(await data.arrayBuffer());
    },
    async dropPhoneFiles({ owner, device, names }) {
      const me = await myId();
      for (let i = 0; i < names.length; i += 100) {
        const { error } = await client.storage.from('phone-files').remove(names.slice(i, i + 100).map((n) => `${owner ?? me}/${device}/${n}`));
        if (error) throw new Error(`clearing old files from your phone: ${error.message}`);
      }
    },
    async dropPhoneThreads(device, project, items, owner) {
      const me = await myId();
      for (let i = 0; i < items.length; i += 100) {
        must(await client.from('phone_threads').delete().eq('owner', owner ?? me).eq('device', device).eq('project', project).in('item', items.slice(i, i + 100)), 'taking threads off your phone');
      }
    },
    // What her phone reads and sends.
    async phoneProjects() {
      const me = await myId();
      const rows = must(await client.from('phone_projects').select('owner,device,project,name').order('name'), 'reading the projects on your phone');
      return (rows ?? []).filter((r) => r.owner === me);
    },
    async phoneThreads() {
      const me = await myId();
      const rows = must(await client.from('phone_threads').select('owner,device,project,item,snapshot,updated_at').order('updated_at', { ascending: false }).limit(1000), 'reading the threads on your phone');
      return (rows ?? []).filter((r) => r.owner === me).map((r) => ({ owner: r.owner, device: r.device, project: r.project, item: r.item, snapshot: r.snapshot, updatedAt: Date.parse(r.updated_at) }));
    },
    // One row per computer (20261023000000_phone_settings.sql).
    async putPhoneSettings({ owner, device, name, settings }) {
      await myId();
      must(await client.from('phone_settings').upsert({ ...(owner ? { owner } : {}), device, name, settings, updated_at: new Date().toISOString() }, { onConflict: 'owner,device' }), 'sending your settings to your phone');
    },
    async phoneSettings() {
      const me = await myId();
      const rows = must(await client.from('phone_settings').select('owner,device,name,settings,updated_at').order('updated_at', { ascending: false }), 'reading your computer\'s settings');
      return (rows ?? []).filter((r) => r.owner === me).map((r) => ({ owner: r.owner, device: r.device, name: r.name, settings: r.settings, updatedAt: Date.parse(r.updated_at) }));
    },
    // The phones her alerts go to (20261025000000_push_devices.sql). The phone writes its own row; this is for tests.
    async putPushDevice({ token, platform, appVersion = null }) {
      await myId();
      must(await client.from('push_devices').upsert({ token, platform, app_version: appVersion, updated_at: new Date().toISOString() }, { onConflict: 'owner,token' }), 'turning on alerts');
    },
    async pushDevices(owner) {
      const me = await myId();
      const rows = must(await client.from('push_devices').select('owner,token,platform,app_version,updated_at').eq('owner', owner ?? me), 'reading the phones to alert');
      return (rows ?? []).map((r) => ({ owner: r.owner, token: r.token, platform: r.platform, appVersion: r.app_version ?? null, updatedAt: Date.parse(r.updated_at) }));
    },
    async dropPushDevice(token, owner) {
      const me = await myId();
      must(await client.from('push_devices').delete().eq('owner', owner ?? me).eq('token', token), 'forgetting a phone');
    },
    async addPhoneCommand({ device, project = null, item = null, kind, payload = {} }) {
      await myId();
      const row = must(await client.from('phone_commands').insert({ device, project, item, kind, payload }).select(COMMAND_COLUMNS).single(), 'sending that to your computer');
      return commandOut(row);
    },
    async phoneCommands() {
      await myId();
      const rows = must(await client.from('phone_commands').select(COMMAND_COLUMNS).order('created_at', { ascending: true }).limit(500), 'reading what your phone sent');
      return (rows ?? []).map(commandOut);
    },
    // This computer's, every one still waiting, oldest first, a page at a time.
    async waitingPhoneCommands(device) {
      await myId();
      const out = [];
      for (let from = 0; ; from += 200) {
        const rows = must(await commandsWith((cols) => client.from('phone_commands').select(cols).eq('device', device).is('taken_at', null).order('created_at', { ascending: true }).range(from, from + 199)), 'reading what your phone sent');
        out.push(...(rows ?? []).map(commandOut));
        if (!rows || rows.length < 200) return out;
      }
    },
    // This computer's commands the cloud claimed since `since`, taken or not,
    // so a computer waking up joins the runs it started (Supervisor#adoptCloudRun).
    async cloudPhoneCommands(device, since) {
      await myId();
      if (!cloudColumns) return [];
      const out = await client.from('phone_commands').select(CLOUD_COLUMNS).eq('device', device).not('claimed_by', 'is', null).gte('created_at', since).order('created_at', { ascending: true }).limit(200);
      if (out.error && noCloudColumn(out.error)) { cloudColumns = false; return []; }
      return (must(out, 'reading what the cloud took from your phone') ?? []).map(commandOut);
    },
    // THE COMPUTER CLAIMS ONE BEFORE IT DOES IT; the phone takes one back only
    // while nobody has (renderer/src/cloud-bridge.ts). The database lets one win.
    async claimPhoneCommand(id, owner) {
      const me = await myId();
      const who = owner ?? me;
      const won = must(await client.from('phone_commands').update({ claimed_at: new Date().toISOString() }).eq('id', id).eq('owner', who).is('taken_at', null).is('claimed_at', null).select('id'), 'starting what your phone sent');
      if (won?.length) return 'claimed';
      const row = must(await commandsWith((cols) => client.from('phone_commands').select(cols).eq('id', id).eq('owner', who).maybeSingle(), 'taken_at,claimed_at'), 'reading what your phone sent');
      // The cloud's claim is the cloud's run: never done here as if it were ours.
      if (row?.claimed_by) return 'cloud';
      return row && !row.taken_at && row.claimed_at ? 'ours' : 'gone';
    },
    async markPhoneCommand(id, outcome, owner) {
      const me = await myId();
      must(await client.from('phone_commands').update({ taken_at: new Date().toISOString(), outcome }).eq('id', id).eq('owner', owner ?? me).is('taken_at', null), 'marking what your phone sent as done');
    },

    subscribe(onChange) {
      const channel = client.channel(`team-${Math.random().toString(36).slice(2)}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'phone_commands' }, () => onChange())
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'lines' }, () => onChange())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'thread_cards' }, () => onChange())
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'people' }, () => onChange())
        .subscribe();
      return () => { client.removeChannel(channel); };
    },

    ...roomsSupabase(client, myId, must),
  };
}
