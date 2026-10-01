// THE TEAM SERVICE: who is signed in on this Mac, their team, and the sync
// that keeps shared projects the same on every teammate's Mac.
//
// It owns one session (Supabase in the app, memory in tests) and, once someone
// is signed in:
//   - stamps every ledger line this Mac writes with their person id, here and
//     in the store server the supervisor starts (AGENTBOX_PERSON_ID);
//   - joins any team that invited their email;
//   - syncs every few seconds, and at once when a teammate writes;
//   - answers the window's questions: who am I, who is on my team, what are
//     my teammates' private tasks doing.
import path from 'node:path';
import { createTeamSync, fileSyncState } from './sync.mjs';
import { listSharedProjects, joinSharedProject, markShared } from './projects.mjs';
import { cardsFor } from '../../shared/thread-cards.mjs';
import fs from 'node:fs';

const EMPTY = { configured: false, signedIn: false, me: null, team: null, people: [], cards: [], lastSyncAt: null, error: null };

export function createTeamService({
  session, store, disk, accountRoot, stateFile, onChange = () => {}, log = () => {}, intervalMs = 5000,
}) {
  let state = { ...EMPTY, configured: !!session?.configured };
  let backend = null;
  let sync = null;
  let timer = null;
  let unsubscribe = null;
  let pending = null;

  const set = (patch) => { state = { ...state, ...patch }; onChange(); };

  function products() {
    try { return store.listProducts(); } catch { return []; }
  }

  async function refreshTeam() {
    const team = await backend.myTeam();
    const people = team ? await backend.teamPeople(team.id) : [];
    const cards = team ? await backend.listCards() : [];
    set({ team, people, cards });
  }

  async function syncNow() {
    if (!sync) return null;
    if (pending) return pending;
    pending = (async () => {
      try {
        // An invite sent after this person signed in is taken up here, not at
        // their next sign-in.
        if (!state.team) { await backend.acceptInvites(); await refreshTeam(); }
        const report = await sync.syncOnce();
        // The people are read again on every pass, with the activity, so a
        // teammate who joined after this Mac signed in has a name and a face
        // on the first line of theirs that arrives here.
        const [cards, people] = state.team
          ? await Promise.all([backend.listCards(), backend.teamPeople(state.team.id)])
          : [[], []];
        set({ lastSyncAt: Date.now(), error: null, cards, people });
        if (report.joined.length || report.pulled) log(`team: joined ${report.joined.length}, pulled ${report.pulled}, pushed ${report.pushed}`);
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
    await backend.acceptInvites();
    set({ signedIn: true, me, error: null });
    await refreshTeam();
    sync = createTeamSync({
      backend,
      disk,
      state: fileSyncState(stateFile, fs),
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
      await backend.createTeam(clean);
      await refreshTeam();
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

    syncNow,
    stop: stopLoop,
  };
}

// Where the service keeps its sync cursors: beside the store's own records.
export function teamStateFile(storeRoot) {
  return path.join(storeRoot, '.team-sync.json');
}
