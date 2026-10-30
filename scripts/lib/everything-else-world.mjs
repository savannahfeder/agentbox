// An invented team for photographing Everything else: you, two people, six AI
// teammates, a team chat and two group chats, and about ninety threads spread
// the way a busy day spreads them. Nobody here is real.
export const NOW = Date.parse('2026-10-28T14:30:00-07:00');
const min = 60_000;
const hour = 60 * min;

const products = [
  { slug: 'agentbox-team', dir: '/x/agentbox-team', name: 'Agentbox Team', oneLiner: '', repoPath: null },
  { slug: 'agentbox', dir: '/x/agentbox', name: 'Agentbox', oneLiner: '', repoPath: null },
  { slug: 'personal', dir: '/x/personal', name: 'My workspace', oneLiner: '', repoPath: null },
];
const nameOf = Object.fromEntries(products.map((p) => [p.slug, p.name]));

// Most people on a team have a photo, so these get a drawn head and shoulders. Nobody's face.
const portrait = (bg, skin, hair) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${bg}"/><ellipse cx="32" cy="62" rx="24" ry="16" fill="${hair}" opacity=".85"/><circle cx="32" cy="27" r="13" fill="${skin}"/><path d="M19 25c0-9 6-14 13-14s13 5 13 14c-3-5-8-7-13-7s-10 2-13 7z" fill="${hair}"/></svg>`)}`;
const ME = { id: 'p-me', email: 'you@example.com', name: 'Alex Rivera', avatarUrl: portrait('#5b6b73', '#e0b49a', '#3a2a22'), role: 'owner' };
const MAYA = { id: 'p-maya', email: 'maya@example.com', name: 'Maya Chen', avatarUrl: portrait('#7a6252', '#efc8a8', '#1f1a18'), role: 'member' };
const JUN = { id: 'p-jun', email: 'jun@example.com', name: 'Jun Park', avatarUrl: null, role: 'member' };
// Shares nothing and has no chat with you yet.
const PRIYA = { id: 'p-priya', email: 'priya@example.com', name: 'Priya Shah', avatarUrl: portrait('#5d6658', '#c99878', '#2b201b'), role: 'member' };

let n = 0;
const item = (o) => {
  n += 1;
  const product = o.product ?? 'agentbox-team';
  return {
    id: o.id ?? `w-${String(n).padStart(4, '0')}ev`, product, productName: nameOf[product],
    status: 'open', kind: 'task', labels: [], priority: 2, epoch: 1, claim: null,
    createdAt: NOW - 6 * hour, updatedAt: NOW - 30 * min, ...o,
  };
};

const RUNNING = [
  'Fix mobile inbox crowding', 'Board columns keep their scroll on reply', 'Cloud runs survive a laptop sleep',
  'Search finds a thread by its summary', 'Phone notifications for a teammate message', 'Speed up the first paint on a cold start',
  'Import Codex threads from last week', 'Approval cards stack by thread', 'Draft the October changelog',
  'Price page copy for teams', 'Retry a cloud start after a network drop', 'Team chat reads as read on the phone',
  'Shorten the setup screens', 'Hold a thread that keeps dying at start', 'Weekly usage email for owners',
  'Voice note waveform on light themes', 'Sort Later by when it comes back', 'Make a thread private from its menu',
  'Show who shipped what on the release page', 'Trim the sidebar on narrow windows',
];
const LATER = [
  ['Daily Agentbox analytics report', 26], ['Everything Else page redesign', 24], ['Voice notes cut off on input blur', 41],
  ['Ask Jun about group sharing', 23.5], ['Renew the domain before it lapses', 42], ['Demo videos for the landing page', 48],
  ['Revisit the onboarding checklist', 70], ['Billing page shows the wrong seat count', 30], ['Write the cloud pricing FAQ', 54],
  ['Move the release notes into the app', 96], ['Codex login runs out mid-thread', 28], ['Keyboard map for the board', 75],
  ['Draft the hiring page', 120], ['Compare the three logo rounds', 32], ['Audit every network call for a deadline', 50],
  ['Light theme contrast pass', 66], ['Teammate playbooks share across projects', 100], ['Old threads archive after 90 days', 140],
  ['Linux launcher icon is blurry', 36], ['Dock badge counts only Needs you', 44], ['Search inside a voice note', 160],
  ['A thread can wait on two others', 80], ['Undo a close from the phone', 58], ['Export a thread as a doc', 110],
  ['Plan the November launch post', 130], ['Second Claude login for heavy days', 62], ['Recurring standup summary', 18],
  ['Clean up the old Chats page code', 90], ['Ask Maya for the brand colours', 27], ['Customer interview notes into one doc', 74],
];
const DONE = [
  'Sign-in screen remembers the last email', 'Hidden cards list by name', 'Cards stop at two rows', 'Resize handle stays visible',
  'Cloud button says Sign in again', 'Phone stays current with the computer shut', 'Answer moves the agent row', 'Typing owns the keyboard',
  'Fix the double ship gate', 'Group chat unread dot', 'Approval card leaves the toast alone', 'Repeat rule shows its next time',
  'Board walks in drawn order', 'Thread opens on what you asked', 'Release feed signed', 'Teammate says what it is working on',
  'Private threads keep their lock on the board', 'Fold state is remembered', 'Mention a teammate from the reply box', 'Rooms invite email copy',
  'Stop the start loop on a dead login', 'Usage meter reads both accounts', 'Every network call has a deadline', 'Codex model picker',
  'Shortcuts page lists the board keys', 'Dark theme hairlines', 'Cold start under two seconds', 'Weekly report goes to owners', 'Hide a chat card',
];
const NEEDS = [
  'Which of the three pricing pages do you want?', 'The cloud bill doubled this week. Pause the second machine?',
  'Approve the October changelog', 'Jun asked for access to the Agentbox repo',
  'Two logo rounds are ready to compare', 'The ship failed on a red test',
];

// What each running agent is doing this minute, as its session's newest line says.
const DOING = [
  'Running the test suite', 'Reading the board column code', 'Editing the cloud start retry', 'Searching thread summaries',
  'Writing the notification copy', 'Profiling the first paint', 'Importing 41 Codex threads', 'Grouping approval cards',
  'Drafting the changelog', 'Writing three price page versions', 'Waiting on a network retry', 'Checking read state on the phone',
  'Cutting two setup screens', 'Reading the start log', 'Laying out the usage email', 'Drawing the waveform on Paper',
];
const projOf = (i) => (i % 5 === 3 ? 'agentbox' : i % 9 === 4 ? 'personal' : 'agentbox-team');
const items = [];
const running = [];
const queued = [];
RUNNING.forEach((title, i) => {
  const started = NOW - (i * 11 + 4) * min;
  const it = item({ title, product: projOf(i), status: 'claimed', priority: i % 4 === 0 ? 3 : 2, createdAt: started - 2 * min, updatedAt: NOW - (i * 7 + 2) * min,
    claim: { holder: 'x', leaseUntil: NOW + hour }, labels: ['founder'] });
  items.push(it);
  if (i < 16) running.push({ itemId: it.id, product: it.product, startedAt: started, tail: [DOING[i]], activity: [{ id: `a${i}`, label: DOING[i], detail: '', startedAt: NOW - min }] });
  else queued.push(it.id);
});
LATER.forEach(([title, hrs], i) => {
  items.push(item({ title, product: projOf(i + 1), status: 'open', runAt: NOW + hrs * hour, priority: i % 6 === 5 ? 3 : 2, updatedAt: NOW - (i + 1) * hour,
    labels: ['founder'], wrote: { runAt: { ts: NOW - hour, source: 'founder' } } }));
});
DONE.forEach((title, i) => {
  const at = NOW - (i * 13 + 5) * min;
  items.push(item({ title, product: projOf(i + 2), status: 'done', createdAt: at - (25 + (i * 37) % 70) * min, updatedAt: at, labels: ['founder'],
    wrote: { status: { ts: at, source: 'agent' } } }));
});
// Yesterday, for a day to set today against.
for (let i = 0; i < 21; i += 1) {
  const at = NOW - 24 * hour - (i * 19 + 40) * min;
  items.push(item({ title: `Yesterday's thread ${i + 1}`, status: 'done', createdAt: at - 40 * min, updatedAt: at, labels: ['founder'], wrote: { status: { ts: at, source: 'agent' } } }));
}
NEEDS.forEach((title, i) => {
  items.push(item({ title, product: projOf(i), status: 'open', kind: 'question', priority: i === 1 ? 4 : 2, updatedAt: NOW - (i * 23 + 4) * min,
    result: 'Ready for you.', labels: [] }));
});

// Six AI teammates. Their threads carry the `teammate:<id>` label.
const mate = (o) => ({
  role: null, job: null, goal: null, counted: null, asksFirst: null, works: null, worksLabel: null,
  product: 'agentbox-team', engine: null, model: null, effort: null, limit: 2, paused: false, status: 'active', memory: [], createdAt: NOW - 20 * 24 * hour,
  waiting: [], now: null, running: null, queued: 0, done: [], runsThisWeek: 4, ...o,
});
const mates = [
  mate({ id: 'm-growth', name: 'Growth marketer', letter: 'G', role: 'Posts and outreach', now: 'Waiting on you', question: true }),
  mate({ id: 'm-lead', name: 'Growth lead', letter: 'L', role: 'Weekly plan', status: 'draft', now: null }),
  mate({ id: 'm-qa', name: 'QA tester', letter: 'Q', role: 'Tests every ship', now: 'Testing the board keys' }),
  mate({ id: 'm-support', name: 'Support', letter: 'S', role: 'Answers the inbox', now: 'Replying to 3 emails' }),
  mate({ id: 'm-notes', name: 'Release notes', letter: 'N', role: 'Writes the changelog', now: 'Nothing to write today' }),
  mate({ id: 'm-design', name: 'Designer', letter: 'D', role: 'Draws options', now: 'Drawing the price page', paused: false }),
];
const mateRuns = [['m-qa', 'Test the board keyboard map', 'Pressing J and K on a full board', 14], ['m-support', 'Reply to the billing emails', 'Answering the second email', 31], ['m-design', 'Five price page options', 'Drawing option four', 52]];
for (const [id, title, doing, ago] of mateRuns) {
  const it = item({ title, status: 'claimed', labels: [`teammate:${id}`], claim: { holder: 'x', leaseUntil: NOW + hour }, createdAt: NOW - (ago + 1) * min, updatedAt: NOW - 3 * min });
  items.push(it);
  running.push({ itemId: it.id, product: it.product, startedAt: NOW - ago * min, tail: [doing], activity: [{ id: `m${ago}`, label: doing, detail: '', startedAt: NOW - min }] });
  const m = mates.find((t) => t.id === id);
  m.running = { id: it.id, product: it.product };
}
for (const [id, title, ago] of [['m-qa', 'Test the sign-in screen', 95], ['m-qa', 'Test the cloud button', 210], ['m-support', 'Reply to the refund email', 140], ['m-notes', 'Write Tuesday\'s notes', 400], ['m-design', 'Three hero options', 260]]) {
  items.push(item({ title, status: 'done', labels: [`teammate:${id}`], createdAt: NOW - (ago + 30) * min, updatedAt: NOW - ago * min, wrote: { status: { ts: NOW - ago * min, source: 'agent' } } }));
}
mates.find((t) => t.id === 'm-growth').waiting = [{ id: 'w-gm1', product: 'agentbox-team', title: 'Post A is ready to send' }];

// Maya shares her threads with the team; Jun is not on Rooms yet.
const card = (personId, title, state, ago, project = 'Agentbox Team') => ({
  personId, threadId: `t-${personId}-${title.length}-${ago}`, visible: true, title, project, state, priority: 2,
  problem: null, progress: null, solution: null, blockedBy: [], blocks: [], people: null, updatedAt: NOW - ago * min,
});
const cards = [
  card('p-maya', 'Brand colours for the launch', 'running', 4), card('p-maya', 'Customer call notes, week 43', 'running', 22),
  card('p-maya', 'Sales deck for the team plan', 'running', 40), card('p-maya', 'Hiring page draft', 'scheduled', 90),
  card('p-maya', 'Press list for November', 'done', 60), card('p-maya', 'Pricing survey results', 'waiting', 15),
  card('p-maya', 'Launch email, second draft', 'done', 150), card('p-maya', 'Competitor pricing table', 'done', 230), card('p-maya', 'Webinar outline', 'done', 330),
  card('p-maya', 'Case study with the design agency', 'scheduled', 600),
];
// Jun shares no threads with the team, as many people won't.

const wallCard = (p, o) => ({
  id: p.id, me: p.id === ME.id, name: p.name, avatarUrl: p.avatarUrl, headline: null, bio: null, agents: 0, level: null,
  hoursTotal: 120, hoursWeek: 22, hoursToday: 4, streak: 6, byMonth: [], teammate: true, showActivity: true, activity: null,
  status: null, workingOn: null, workingPrivate: false, ...o,
});
const teamRoom = {
  id: 'r-team', name: 'Northwind', kind: 'room', teamId: 't-1', listed: true, inviteOnly: false, role: 'owner', members: 3,
  createdAt: NOW - 30 * 24 * hour, pinned: true, muted: false, unread: 2, readAt: NOW - 2 * hour, lastAt: NOW - 18 * min, agents: 19,
  wall: [
    wallCard(ME, { agents: 16, level: 53, workingOn: 'Fix mobile inbox crowding', hoursToday: 41, hoursWeek: 236, streak: 19 }),
    wallCard(MAYA, { agents: 3, level: 31, workingOn: 'Brand colours for the launch', hoursToday: 9, hoursWeek: 58, streak: 7 }),
    wallCard(JUN, { away: true, agents: null, hoursToday: 0, hoursWeek: 12, streak: 0 }),
  ],
  people: [ME, MAYA, JUN].map((p) => ({ id: p.id, name: p.name, avatarUrl: p.avatarUrl })),
};
const group = (id, name, people, last, ago, unread) => ({
  id, name, kind: 'group', teamId: null, listed: false, inviteOnly: true, role: 'member', members: people.length,
  createdAt: NOW - 9 * 24 * hour, pinned: false, muted: false, unread, readAt: NOW - 3 * hour, lastAt: NOW - ago * min, agents: 0,
  wall: people.map((p) => wallCard(p, {})), people: people.map((p) => ({ id: p.id, name: p.name, avatarUrl: p.avatarUrl })),
  _last: last,
});
const groups = [
  group('r-launch', 'Launch crew', [ME, MAYA, JUN], 'Maya: the deck is in the shared folder', 48, 1),
  group('r-design', 'Design review', [ME, MAYA], 'You: looks good, ship it', 300, 0),
  group('r-jun', 'Jun Park', [ME, JUN], 'Jun: can I get access to the repo today?', 35, 1),
];
const msg = (roomId, by, body, ago) => ({ id: `${roomId}-${ago}`, roomId, by, body, inReplyTo: null, mentions: [], at: NOW - ago * min });
const messages = {
  'r-team': [msg('r-team', 'p-me', 'On it after lunch', 70), msg('r-team', 'p-maya', 'Pushed the new colours, can someone look before 4?', 18)],
  'r-launch': [msg('r-launch', 'p-maya', 'the deck is in the shared folder', 48)],
  'r-design': [msg('r-design', 'p-me', 'looks good, ship it', 300)],
  'r-jun': [msg('r-jun', 'p-me', 'Welcome aboard. Shout if anything is blocked', 400), msg('r-jun', 'p-jun', 'Thanks! Setting up the new laptop now', 120), msg('r-jun', 'p-jun', 'Can I get access to the repo today?', 35)],
};
for (const g of groups) delete g._last;

const profile = {
  person_id: ME.id, display_name: ME.name, avatar_url: null, headline: null, bio: null, show_working: 'team', show_agents: true,
  show_level: true, show_status: true, show_activity: true, invisible_until: null, status_text: null, status_until: null,
};

export const world = {
  products, items, approvals: [],
  supervisor: {
    paused: false, pausedProducts: [], running, stalled: [], queued, scheduled: [],
    productOrder: ['agentbox-team', 'agentbox', 'personal'], hiddenProducts: [], personalProducts: ['personal'], capacity: 20,
  },
  restartNeeded: null,
  config: {},
  alpha: { rooms: true, teammates: true, multiplayer: true },
  teammates: { list: mates, chat: [], runs: [], playbooks: [] },
  team: {
    configured: true, started: true, canSignIn: true, settling: false, since: NOW - 30 * 24 * hour, sent: [],
    signedIn: true, signingIn: null, me: ME, team: { id: 't-1', name: 'Northwind' }, invites: [],
    people: [ME, MAYA, JUN, PRIYA], cards, lastSyncAt: NOW - min, error: null,
    rooms: { on: true, ready: true, rooms: [teamRoom, ...groups], messages, me: profile, ranks: {}, invites: [], mentions: [], error: null },
  },
};
