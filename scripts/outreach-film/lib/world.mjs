// One company's film file becomes the world the app draws: its projects, its
// threads (waiting on you, running, done), its team and their threads.
const MIN = 60_000;

function resultOf(t) {
  const out = [`**${t.ask}**`, '', ...(t.context ?? []).flatMap((p) => [p, ''])];
  if (t.picture) out.push(`![${t.picture.alt ?? ''}]({ORIGIN}/pics/${t.picture.file})`, '');
  if (t.options?.length) {
    out.push('## Options');
    t.options.forEach((o, i) => out.push(`${i + 1}. ${o}${i === 0 && !t.noRecommend ? ' (recommended)' : ''}`));
  }
  return out.join('\n').trim();
}

// Chats: the team's rooms and their messages, when the film asks for them.
function roomsOf(film, now) {
  const chats = film.chats; if (!chats) return null;
  const card = (p, me = false) => ({ id: p.id, me, name: p.name, avatarUrl: p.avatar ?? null, headline: null, bio: null, agents: 2, hoursTotal: 120, hoursWeek: 14, hoursToday: 3, streak: 4,
    byMonth: [], teammate: false, showActivity: false, activity: null, away: false, status: null, workingOn: null, workingPrivate: false });
  const everyone = [film.team.me, ...film.team.people];
  const rooms = [], messages = {};
  chats.forEach((c, i) => {
    const id = `room-${i}`;
    const members = c.people ? everyone.filter((p) => p.id === 'me' || c.people.includes(p.id)) : everyone;
    const msgs = c.messages.map((m, k) => ({ id: `${id}-m${k}`, roomId: id, by: m.by, body: m.text, inReplyTo: null, mentions: [], at: now - m.ago * 60_000 }));
    messages[id] = msgs;
    rooms.push({ id, name: c.name, kind: c.kind ?? 'room', teamId: 'team-1', listed: true, inviteOnly: false, role: 'owner', members: members.length, createdAt: now - 20 * 86_400_000,
      pinned: false, muted: false, unread: c.unread ?? 0, readAt: now - 3 * 3_600_000, lastAt: msgs.at(-1)?.at ?? now, agents: 0,
      wall: members.map((p) => card(p, p.id === 'me')), people: members.map((p) => ({ id: p.id, name: p.name, avatarUrl: p.avatar ?? null })) });
  });
  return { on: true, ready: true, rooms, messages, decisions: {}, me: { person_id: 'me', display_name: film.team.me.name, avatar_url: film.team.me.avatar ?? null, headline: null, bio: null,
    show_working: 'team', show_agents: true, show_level: false, show_status: true, invisible_until: null, status_text: null, status_until: null }, ranks: {}, invites: [], mentions: [], error: null };
}

export function buildWorld(film, now = Date.now()) {
  const everyone = film.team ? ['me', ...film.team.people.map((p) => p.id)] : [];
  const products = film.projects.map((p) => ({ slug: p.slug, name: p.name, oneLiner: film.company.oneLiner ?? '', dir: `/demo/${p.slug}`, repoPath: `/Users/you/dev/${p.slug}`,
    ...(p.shared && film.team ? { team: { projectId: `tp-${p.slug}`, teamId: 'team-1', visibility: 'team', people: everyone, sharedBy: 'me' } } : {}) }));
  const nameOf = (slug) => products.find((p) => p.slug === slug)?.name ?? slug;
  const items = [];
  const running = [];
  let n = 0;
  const id = () => `w-${(0x5a1c0de000 + n++ * 7919).toString(16)}`;
  const byKey = {};

  film.needsYou.forEach((t, i) => {
    const at = now - (4 + i * 7) * MIN;
    const created = at - (22 + i * 9) * MIN;
    const item = {
      id: t.id ?? id(), product: t.project, productName: nameOf(t.project), status: 'open', kind: t.kind ?? 'question',
      title: t.title, body: t.title, result: resultOf(t), labels: ['founder'], priority: t.priority ?? 5, epoch: 2, claim: null,
      problem: t.summary ?? undefined, progress: t.progress?.join('\n') ?? undefined,
      engine: t.engine ?? 'claude',
      createdAt: created, updatedAt: at,
      wrote: {
        title: { ts: created, source: 'founder' }, body: { ts: created, source: 'founder' },
        result: { ts: at, source: 'agent' }, status: { ts: at, source: 'agent' },
        ...(t.summary ? { problem: { ts: at, source: 'agent' } } : {}),
        ...(t.progress ? { progress: { ts: at, source: 'agent' } } : {}),
      },
    };
    if (t.from) { item.runner = t.from; item.createdBy = t.from; item.wrote.title.by = t.from; item.wrote.body.by = t.from; if (t.body) item.body = t.body; }
    if (t.assignee) { item.assignee = t.assignee; item.people = t.people ?? [t.from, t.assignee]; }
    if (t.key) byKey[t.key] = item.id;
    items.push(item);
  });

  film.running.forEach((t, i) => {
    const created = now - (2 + i * 3) * MIN;
    const item = {
      id: t.id ?? id(), product: t.project, productName: nameOf(t.project), status: 'claimed', kind: 'directive',
      title: t.title, body: t.title, labels: ['founder'], priority: t.priority ?? 5, epoch: 1, claim: null,
      engine: t.engine ?? (i % 3 === 1 ? 'codex' : 'claude'),
      createdAt: created, updatedAt: created,
      wrote: { title: { ts: created, source: 'founder' }, body: { ts: created, source: 'founder' } },
    };
    if (t.key) byKey[t.key] = item.id;
    items.push(item);
    running.push({ itemId: item.id, product: t.project, startedAt: created, tail: t.activity ? [t.activity] : [], engine: item.engine, ...(t.cloud ? { where: 'cloud' } : {}) });
  });

  film.done.forEach((t, i) => {
    const at = now - (80 + i * 35) * MIN;
    const created = at - 40 * MIN;
    items.push({
      id: id(), product: t.project, productName: nameOf(t.project), status: 'done', kind: 'directive',
      title: t.title, body: t.title, result: t.result, answer: 'Close it', labels: ['founder'], priority: 5, epoch: 3, claim: null,
      closed: true, createdAt: created, updatedAt: at,
      wrote: { title: { ts: created, source: 'founder' }, result: { ts: at - MIN, source: 'agent' }, answer: { ts: at, source: 'founder' }, status: { ts: at, source: 'founder' } },
    });
  });

  // The team: you and the people on it, each with the threads they share.
  const team = film.team ?? null;
  let teamState = null;
  if (team) {
    const person = (p) => ({ id: p.id, email: `${p.id}@${film.company.domain}`, name: p.name, avatarUrl: p.avatar ?? null, role: p.role ?? 'member', ...(p.status ? { status: { text: p.status, until: null } } : {}) });
    const people = [person(team.me), ...team.people.map(person)];
    const cards = team.people.flatMap((p) => (p.threads ?? []).map((t, i) => ({
      personId: p.id, threadId: t.id ?? `w-${p.id}-${i}`, visible: true, title: t.title, project: t.project ?? null,
      state: t.state ?? 'running', priority: t.priority ?? null, problem: t.problem ?? null, progress: t.progress ?? null, solution: null,
      blockedBy: [], blocks: [], people: null, updatedAt: now - (3 + i * 11) * MIN,
    })));
    // A week of finished work per person, so Home's bars and the Team page's
    // Done lists show what each of them got through. week is oldest day first.
    const today = new Date(now); today.setHours(0, 0, 0, 0);
    for (const p of team.people) {
      const titles = p.doneTitles ?? [];
      let k = 0;
      (p.week ?? []).forEach((count, d) => {
        const day = today.getTime() - (6 - d) * 86_400_000;
        for (let j = 0; j < count; j += 1) {
          const title = titles[k % Math.max(1, titles.length)] ?? `Finished task ${k + 1}`;
          // Spread over working hours; today's stay before now.
          let at = day + (9.5 + ((j * 2.3 + d * 0.7) % 8)) * 3_600_000;
          if (d === 6) at = Math.min(at, now - (25 + j * 47) * MIN);
          cards.push({ personId: p.id, threadId: `w-${p.id}-d${k}`, visible: true, title, project: p.doneProject ?? null, state: 'done', priority: null,
            problem: null, progress: null, solution: null, blockedBy: [], blocks: [], people: null, updatedAt: at });
          k += 1;
        }
      });
    }
    teamState = {
      configured: true, started: true, canSignIn: true, settling: false, since: now - 30 * 86_400_000,
      signedIn: true, signingIn: null, me: person(team.me), team: { id: 'team-1', name: film.company.name },
      invites: [], people, cards, teamMates: [], sharedFileNews: [], seen: {}, lastSyncAt: now - 20_000, error: null, rooms: roomsOf(film, now),
    };
  }

  return {
    products, items, approvals: [],
    supervisor: {
      paused: false, pausedProducts: [], running, stalled: [], queued: [], scheduled: [],
      productOrder: [], hiddenProducts: [], personalProducts: [], capacity: 40,
    },
    team: teamState,
    cloud: { setUp: true, managed: true, mode: 'all', running: running.filter((r) => r.where === 'cloud').length, month: { runs: 214, agentHours: 61, estimatedCost: 0, costPerAgentHour: null }, accounts: [], health: 'ok', plan: 'team', projects: products.map((p) => p.slug), keys: [], movable: [] },
    teammates: team ? { list: [], chat: [], runs: [] } : null,
    alpha: team ? { rooms: !!film.chats, teammates: true, multiplayer: true } : undefined,
    byKey,
  };
}
