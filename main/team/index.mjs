// THE TEAM SERVICE: who is signed in on this Mac, their team, and the sync
// that keeps shared projects the same on every teammate's Mac.
//
// It owns one session (Supabase in the app, memory in tests) and, once someone
// is signed in:
//   - stamps every ledger line this Mac writes with their person id, here and
//     in the store server the supervisor starts (AGENTBOX_PERSON_ID);
//   - shows them the invites waiting for their email, and joins one only when
//     they say yes (acceptInvite). Once this Mac is in a team it stays in that
//     team: an invite, or an older team somebody made, never moves it;
//   - syncs every few seconds, and at once when a teammate writes;
//   - answers the window's questions: who am I, who is on my team, what are
//     my teammates' private tasks doing.
import path from 'node:path';
import { createTeamSync, fileSyncState } from './sync.mjs';
import { listSharedProjects, joinSharedProject, markShared, makeDirect } from './projects.mjs';
import { firstSentence } from '../../shared/thread-cards.mjs';
import { cardsFor } from '../../shared/thread-cards.mjs';
import fs from 'node:fs';

const EMPTY = { configured: false, signedIn: false, me: null, team: null, invites: [], people: [], cards: [], lastSyncAt: null, error: null };

export function createTeamService({
  session, store, disk, accountRoot, stateFile, onChange = () => {}, log = () => {}, intervalMs = 5000,
}) {
  let state = { ...EMPTY, configured: !!session?.configured };
  let backend = null;
  let sync = null;
  let timer = null;
  let unsubscribe = null;
  let pending = null;
  // The sync cursors and which team this Mac is in, in one file.
  let local = null;
  const kept = () => (local ??= fileSyncState(stateFile, fs));

  const set = (patch) => { state = { ...state, ...patch }; onChange(); };

  function products() {
    try { return store.listProducts(); } catch { return []; }
  }

  // THE TEAM THIS MAC IS IN IS THE ONE IT REMEMBERS. Found by review
  // 2026-10-01: the app took whichever of your teams was oldest, and joined
  // every team that invited you at each start, so a team made with a
  // backdated created_at and an invite moved your work into it unasked. Now
  // the first team is remembered, and a remembered team you are no longer on
  // leaves you in no team rather than in another one.
  async function refreshTeam() {
    const me = state.me?.id;
    const teams = await backend.myTeams();
    const remembered = me ? kept().getTeam(me) : null;
    const team = remembered ? teams.find((t) => t.id === remembered) ?? null : teams[0] ?? null;
    if (team && !remembered && me) kept().setTeam(me, team.id);
    const people = team ? await backend.teamPeople(team.id) : [];
    const cards = team ? await backend.listCards() : [];
    const invites = team ? [] : await backend.pendingInvites();
    set({ team, people, cards, invites });
  }

  async function syncNow() {
    if (!sync) return null;
    if (pending) return pending;
    pending = (async () => {
      try {
        // An invite sent after this person signed in shows up here, not at
        // their next sign-in. It is offered, never taken up.
        if (!state.team) await refreshTeam();
        const report = await sync.syncOnce();
        // The people are read again on every pass, with the activity, so a
        // teammate who joined after this Mac signed in has a name and a face
        // on the first line of theirs that arrives here.
        const [cards, people] = state.team
          ? await Promise.all([backend.listCards(), backend.teamPeople(state.team.id)])
          : [[], []];
        set({ lastSyncAt: Date.now(), error: null, cards, people });
        if (report.joined.length || report.pulled) log(`team: joined ${report.joined.length}, pulled ${report.pulled}, pushed ${report.pushed}`);
        if (report.notJoined) log(`team: left ${report.notJoined} shared project(s) unjoined, this Mac already holds the most it takes on by itself`);
        return report;
      } catch (err) {
        set({ error: String(err?.message ?? err) });
        return null;
      } finally {
        pending = null;
      }
    })();
    return pending;
  }

  function stopLoop() {
    if (timer) clearInterval(timer);
    timer = null;
    unsubscribe?.();
    unsubscribe = null;
  }

  async function signedIn(b) {
    backend = b;
    const me = await backend.me();
    if (!me) throw new Error('signed in, but no person record came back');
    disk.setLineAuthor(me.id);
    process.env.AGENTBOX_PERSON_ID = me.id;
    set({ signedIn: true, me, error: null });
    await refreshTeam();
    sync = createTeamSync({
      backend,
      disk,
      state: kept(),
      listShared: () => listSharedProjects(products()),
      joinProject: (project) => joinSharedProject(accountRoot, project),
      listCards: () => cardsFor({ products: products(), readItems: (p) => disk.readWorkItems(p.dir) }),
      teamIdOf: () => state.team?.id ?? null,
    });
    stopLoop();
    timer = setInterval(() => { syncNow(); }, intervalMs);
    timer.unref?.();
    unsubscribe = backend.subscribe(() => { syncNow(); });
    await syncNow();
  }

  return {
    state: () => state,

    async start() {
      if (!session?.configured) return state;
      try {
        const b = await session.restore();
        if (b) await signedIn(b);
      } catch (err) {
        set({ error: String(err?.message ?? err) });
      }
      return state;
    },

    async signIn() {
      const b = await session.signIn();
      await signedIn(b);
      return state;
    },

    async signOut() {
      stopLoop();
      await session.signOut?.();
      disk.setLineAuthor(null);
      delete process.env.AGENTBOX_PERSON_ID;
      backend = null;
      sync = null;
      state = { ...EMPTY, configured: !!session?.configured };
      onChange();
      return state;
    },

    async createTeam(name) {
      if (!backend) throw new Error('sign in first');
      const clean = String(name ?? '').trim();
      if (!clean) throw new Error('a team needs a name');
      const made = await backend.createTeam(clean);
      kept().setTeam(state.me.id, made.id);
      await refreshTeam();
      return state;
    },

    // JOIN A TEAM BECAUSE ITS INVITE WAS ANSWERED YES, and only then. A Mac
    // already in a team does not move: that is a choice nobody offers here.
    async acceptInvite(teamId) {
      if (!backend || !state.me) throw new Error('sign in first');
      if (state.team) throw new Error(`this Mac is already in ${state.team.name}`);
      if (!state.invites.some((i) => i.teamId === teamId)) throw new Error('that invite is no longer waiting');
      await backend.acceptInvite(teamId);
      kept().setTeam(state.me.id, teamId);
      await refreshTeam();
      await syncNow();
      return state;
    },

    async invite(email) {
      if (!backend || !state.team) throw new Error('start or join a team first');
      const clean = String(email ?? '').trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) throw new Error(`${clean || 'that'} is not an email address`);
      await backend.invite(state.team.id, clean);
      return state;
    },

    // Share a local project with the whole team or with specific people. The
    // project keeps one cloud id for good (markShared), so changing who sees
    // it is the same project.
    async share(slug, { visibility = 'team', people = [] } = {}) {
      if (!backend || !state.team) throw new Error('start or join a team first');
      const product = products().find((p) => p.slug === slug);
      if (!product) throw new Error(`no project ${slug}`);
      const team = markShared(product.dir, { teamId: state.team.id, visibility, people, sharedBy: state.me.id });
      await backend.shareProject({ id: team.projectId, teamId: state.team.id, name: product.name, visibility: team.visibility, people: team.people });
      onChange();
      await syncNow();
      return state;
    },

    // A MESSAGE TO A PERSON (approved 2026-10-01: people get messages, never
    // tasks). It goes into the record the two of them share, made the first
    // time and reused after, and it waits in their inbox until they answer.
    async message(to, body) {
      if (!backend || !state.team || !state.me) throw new Error('start or join a team first');
      const me = state.me.id;
      if (!to || to === me) throw new Error('pick someone to message');
      if (!state.people.some((p) => p.id === to)) throw new Error('that person is not on your team');
      const text = String(body ?? '').trim();
      if (!text) throw new Error('a message needs some words');
      // THE RECORD IS REUSED ONLY IF IT IS EXACTLY THE TWO OF YOU AND ONE OF
      // YOU MADE IT. Found by review 2026-10-01: a teammate could make a
      // "direct" record holding you and somebody else, and the next message
      // either of you sent the other went into it, where its maker read it.
      const two = new Set([me, to]);
      const justUs = (t) => {
        const on = new Set([...t.people, ...(t.sharedBy ? [t.sharedBy] : [])]);
        return two.has(t.sharedBy) && on.size === 2 && [...on].every((p) => two.has(p));
      };
      let product = products().find((p) => p.team?.direct && justUs(p.team));
      if (!product) {
        const made = makeDirect(accountRoot, { teamId: state.team.id, me, other: to });
        await backend.shareProject({ id: made.projectId, teamId: state.team.id, name: 'Direct', visibility: 'people', people: [to], direct: true });
        product = products().find((p) => p.dir === made.dir) ?? { slug: made.slug, dir: made.dir };
      }
      const title = firstSentence(text, 90) || text.slice(0, 90);
      const item = store.composeItem(product.slug, { title, body: text, assignee: to, people: [me, to] });
      onChange();
      await syncNow();
      return item;
    },

    syncNow,
    stop: stopLoop,
  };
}

// Where the service keeps its sync cursors: beside the store's own records.
export function teamStateFile(storeRoot) {
  return path.join(storeRoot, '.team-sync.json');
}
