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
import { hasLapsed, statusEnds } from '../../shared/team-status.mjs';

// `signingIn` is { url } while a Google sign-in waits on the browser, so the
// page can offer that link again rather than a button that does nothing.
const EMPTY = { configured: false, started: false, signedIn: false, signingIn: null, me: null, team: null, invites: [], sent: [], people: [], cards: [], lastSyncAt: null, error: null };

export function createTeamService({
  session, store, disk, accountRoot, stateFile, onChange = () => {}, log = () => {}, intervalMs = 5000, startRetryMs = 1500,
  // The clock, so a test can move past the moment a status runs out.
  now = Date.now,
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

  // A status the owner set has run out: wipe it where it is stored, so old
  // text does not sit in the cloud. Everyone who READS it already saw it go,
  // on their own clock (shared/team-status.mjs); this is the tidying.
  async function clearLapsedStatus() {
    if (!backend || !hasLapsed(state.me?.status, now())) return;
    await backend.setStatus({ text: null, until: null });
    set({ me: { ...state.me, status: null } });
  }

  // THE MESSAGE RECORD OF EXACTLY TWO PEOPLE, made by one of them (see
  // `message` below for why both halves matter).
  // `to` is one person or several (2026-10-01: messages to a few people at
  // once). The record must hold EXACTLY you and them, and one of you made it.
  function directWith(me, to) {
    const two = new Set([me, ...[].concat(to)]);
    const justUs = (t) => {
      const on = new Set([...t.people, ...(t.sharedBy ? [t.sharedBy] : [])]);
      return two.has(t.sharedBy) && on.size === two.size && [...on].every((p) => two.has(p));
    };
    // ONE RECORD FOR THE TWO OF YOU, THE SAME ONE ON BOTH MACS. Two people who
    // write each other first within the same second each make one (measured
    // 2026-10-01 on two test copies), and each Mac then kept writing into its
    // own. Both now settle on the record with the lowest id, so the talk
    // comes back together the moment both records are known.
    return products().filter((p) => p.team?.direct && justUs(p.team))
      .sort((a, b) => String(a.team.projectId).localeCompare(String(b.team.projectId)))[0] ?? null;
  }

  // THE CONVERSATION IN A MESSAGE RECORD: its most recently touched row. Older
  // records may hold one row per message, from before a message continued the
  // conversation, and the newest of those is where the talk is.
  function conversationIn(slug) {
    let rows = [];
    try { rows = store.listItems().filter((i) => i.product === slug && !i.agent); } catch { rows = []; }
    return rows.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0] ?? null;
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
    // '' is "left a team, and joins nothing until asked": never quietly the next one.
    const team = remembered === '' ? null : remembered ? teams.find((t) => t.id === remembered) ?? null : teams[0] ?? null;
    if (team && !remembered && me) kept().setTeam(me, team.id);
    // The moment sharing starts on this Mac, kept so it never moves later.
    if (team && me && !kept().getSince(me)) kept().setSince(me, Date.now());
    const people = team ? await backend.teamPeople(team.id) : [];
    const cards = team ? await backend.listCards() : [];
    // An invite lookup that fails (an older cloud, a dropped request) leaves
    // you signed in with nothing offered, never signed out.
    const invites = team ? [] : await backend.pendingInvites().catch((err) => { log(`team: invites: ${err.message}`); return []; });
    // The invites this team has out, so the settings page can say who has not
    // joined yet and let them be cancelled.
    const sent = team && backend.listInvites ? await backend.listInvites(team.id).catch(() => []) : [];
    set({ team, people, cards, invites, sent, since: me ? kept().getSince(me) : null });
  }

  async function syncNow() {
    if (!sync) return null;
    if (pending) return pending;
    // THE BODY WAITS A MICROTASK, SO `pending` IS SET BEFORE ANY OF IT RUNS.
    // Written as `pending = (async () => {...})()` the body's synchronous
    // prefix runs BEFORE the assignment, so `pending` was still null while it
    // ran. That was harmless until a pass wrote to the cloud: clearing a
    // lapsed status makes the memory cloud emit, the emit calls back into
    // syncNow, the guard is still null, and it recurses until the stack ends.
    // Measured on the first run of the lapse test: a stack overflow, every
    // frame this function.
    pending = Promise.resolve().then(async () => {
      try {
        // An invite sent after this person signed in shows up here, not at
        // their next sign-in. It is offered, never taken up.
        if (!state.team) await refreshTeam();
        await clearLapsedStatus();
        const report = await sync.syncOnce();
        // The people are read again on every pass, with the activity, so a
        // teammate who joined after this Mac signed in has a name and a face
        // on the first line of theirs that arrives here.
        const [cards, people, me] = state.team
          ? await Promise.all([backend.listCards(), backend.teamPeople(state.team.id), backend.me()])
          : [[], [], state.me];
        set({ lastSyncAt: Date.now(), error: null, cards, people, me: me ?? state.me });
        if (report.joined.length || report.pulled) log(`team: joined ${report.joined.length}, pulled ${report.pulled}, pushed ${report.pushed}`);
        if (report.notJoined) log(`team: left ${report.notJoined} shared project(s) unjoined, this Mac already holds the most it takes on by itself`);
        return report;
      } catch (err) {
        set({ error: String(err?.message ?? err) });
        return null;
      } finally {
        pending = null;
      }
    });
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
      // ARCHIVED ONES COUNT AS HERE. Asked of the visible list, a shared
      // project you archived read as missing and was joined again beside it.
      listShared: () => { try { return listSharedProjects(store.listProducts({ includeArchived: true })); } catch { return []; } },
      joinProject: (project) => joinSharedProject(accountRoot, project),
      listCards: () => cardsFor({ products: products(), readItems: (p) => disk.readWorkItems(p.dir), since: state.me ? kept().getSince(state.me.id) : null }),
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

    // THREE TRIES AT START, because one dropped request left the app signed
    // out until it was restarted (measured 2026-10-01 on a loaded Mac: the
    // sign-in went through and the very next call failed). A session that is
    // simply not there is not an error and is not retried.
    // `started` says the first look for a saved sign-in is over, so the window
    // can tell "signed out" from "still finding out" and never flashes the
    // sign-in page at somebody who is signed in.
    async start() {
      if (!session?.configured) return state;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const b = await session.restore();
          if (b) await signedIn(b);
          set({ started: true });
          return state;
        } catch (err) {
          set({ error: String(err?.message ?? err) });
          if (attempt < 2) await new Promise((r) => setTimeout(r, startRetryMs * (attempt + 1)));
        }
      }
      set({ started: true });
      return state;
    },

    async signIn() {
      let b;
      try {
        b = await session.signIn({ onUrl: (url) => set({ signingIn: { url } }), log });
      } finally {
        if (state.signingIn) set({ signingIn: null });
      }
      await signedIn(b);
      return state;
    },

    /** Open the waiting Google sign-in's own link again. False if none waits. */
    async reopenSignIn() {
      const url = state.signingIn?.url;
      if (!url || !session?.reopen) return false;
      log('team: Google sign-in: opening the browser again');
      await session.reopen(url);
      return true;
    },

    cancelSignIn() {
      return session?.cancelSignIn?.() ?? false;
    },

    async signInWithEmail(email, password) {
      if (!session?.signInWithPassword) throw new Error('this build cannot sign in with email');
      const b = await session.signInWithPassword(email, password);
      await signedIn(b);
      return state;
    },

    /** A new account: signed in at once, or { confirm: true } until the email is confirmed. */
    async signUp(email, password, name) {
      if (!session?.signUp) throw new Error('this build cannot make accounts');
      const out = await session.signUp({ email, password, name });
      if (out?.backend) { await signedIn(out.backend); return state; }
      return { ...state, confirm: true };
    },

    async signOut() {
      stopLoop();
      await session.signOut?.();
      disk.setLineAuthor(null);
      delete process.env.AGENTBOX_PERSON_ID;
      backend = null;
      sync = null;
      // Signed out is a known answer, so the window shows the sign-in page at once.
      state = { ...EMPTY, configured: !!session?.configured, started: true };
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

    // TEAM SETTINGS (2026-10-01): an invite page and team settings beside it.
    // The database decides who may (owners rename,
    // remove and cancel; anyone leaves); these only ask it and say what it said.
    async renameTeam(name) {
      if (!backend || !state.team) throw new Error('start or join a team first');
      const clean = String(name ?? '').trim();
      if (!clean) throw new Error('a team needs a name');
      await backend.renameTeam(state.team.id, clean);
      await refreshTeam();
      return state;
    },

    // A line you write about yourself, held until the end of today, tomorrow
    // or this week, or until you clear it. Saying nothing clears it.
    async setStatus({ text, hold = 'open', until } = {}) {
      if (!backend) throw new Error('sign in first');
      const status = await backend.setStatus({ text, until: statusEnds({ hold, until }, now()) });
      set({ me: { ...state.me, status } });
      return state;
    },

    async removeMember(personId) {
      if (!backend || !state.team) throw new Error('start or join a team first');
      if (personId === state.me?.id) throw new Error('to leave the team, use Leave team');
      await backend.removeMember(state.team.id, personId);
      await refreshTeam();
      return state;
    },

    async leaveTeam() {
      if (!backend || !state.team || !state.me) throw new Error('you are not on a team');
      await backend.removeMember(state.team.id, state.me.id);
      kept().setTeam(state.me.id, '');
      await refreshTeam();
      return state;
    },

    async cancelInvite(email) {
      if (!backend || !state.team) throw new Error('start or join a team first');
      await backend.cancelInvite(state.team.id, email);
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
      // So the settings page lists it as invited straight away.
      await refreshTeam().catch(() => {});
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
    /** The conversation in a message record: its newest row, if it has one. */
    conversation(to) {
      const me = state.me?.id;
      if (!me || !to) return null;
      const product = directWith(me, to);
      const convo = product ? conversationIn(product.slug) : null;
      return convo ? { product: product.slug, id: convo.id } : null;
    },

    async message(toIn, body) {
      if (!backend || !state.team || !state.me) throw new Error('start or join a team first');
      const me = state.me.id;
      // One person or a few: the same conversation for the same people.
      const others = [...new Set([].concat(toIn ?? []).filter((p) => p && p !== me))].sort();
      if (!others.length) throw new Error('pick someone to message');
      if (others.length > 11) throw new Error('a message goes to at most eleven people');
      if (others.some((p) => !state.people.some((q) => q.id === p))) throw new Error('that person is not on your team');
      const to = others.length === 1 ? others[0] : others;
      const text = String(body ?? '').trim();
      if (!text) throw new Error('a message needs some words');
      // THE RECORD IS REUSED ONLY IF IT IS EXACTLY THE TWO OF YOU AND ONE OF
      // YOU MADE IT. Found by review 2026-10-01: a teammate could make a
      // "direct" record holding you and somebody else, and the next message
      // either of you sent the other went into it, where its maker read it.
      let product = directWith(me, to);
      // Before making a record, look once more: the other person may have just
      // made one, and the pull is what brings it here.
      if (!product) { await syncNow(); product = directWith(me, to); }
      if (!product) {
        const made = makeDirect(accountRoot, { teamId: state.team.id, me, others });
        // A START THAT FAILS LEAVES NOTHING BEHIND. A record shared only in
        // part (the cloud refused its people) was reused by the next send and
        // never reached anyone (found 2026-10-01 on a test copy).
        try {
          await backend.shareProject({ id: made.projectId, teamId: state.team.id, name: 'Direct', visibility: 'people', people: others, direct: true });
        } catch (err) {
          try { fs.rmSync(made.dir, { recursive: true, force: true }); } catch { /* the error below still says what failed */ }
          throw err;
        }
        product = products().find((p) => p.dir === made.dir) ?? { slug: made.slug, dir: made.dir };
      }
      // ONE CONVERSATION PER PERSON (decided 2026-10-01 from user research:
      // people expect to click a name and see what was said before, and a
      // subject line on every message between two coworkers makes talking
      // feel like filing tickets). So a message goes on the end of the
      // conversation the two of you already have, reopened if it was put away,
      // and only the first message ever starts one. Work stays in threads; this
      // is talk.
      const title = firstSentence(text, 90) || text.slice(0, 90);
      const convo = conversationIn(product.slug);
      if (convo) {
        store.answerItem(product.slug, convo.id, { answer: text });
        // Who answers next is whoever did not speak last (shared/team-rules.mjs,
        // `inMyInbox`); the assignee stays for a Mac on an older build.
        store.teamPatch(product.slug, convo.id, { assignee: others[0] });
        onChange();
        await syncNow();
        return store.readItem(product.slug, convo.id);
      }
      const item = store.composeItem(product.slug, { title, body: text, assignee: others[0], people: [me, ...others] });
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
