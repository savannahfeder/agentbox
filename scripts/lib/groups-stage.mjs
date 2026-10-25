// A built renderer with a stand-in bridge holding a made-up team, opened in
// headless Chromium at a full-screen window size. Every name is invented.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.json': 'application/json' };

/** The app's own fixture threads, so the sidebar and inbox look lived in. */
function fixtureSnapshot() {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'groups-')), 'fixture.json');
  execFileSync('npx', ['vite-node', path.join(here, 'dump-fixture-snapshot.mts'), out], { cwd: root, stdio: 'ignore' });
  return JSON.parse(fs.readFileSync(out, 'utf8'));
}

/** Photos for some of the made-up people, from `dir/<person id>.jpg`. The repository carries none. */
export function facesIn(dir) {
  const out = {};
  if (!dir || !fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir)) {
    const m = /^(p-[a-z]+)\.(jpe?g|png)$/.exec(f);
    if (m) out[m[1]] = `data:image/${m[2] === 'png' ? 'png' : 'jpeg'};base64,${fs.readFileSync(path.join(dir, f)).toString('base64')}`;
  }
  return out;
}

export function world(now = Date.now(), faces = {}) {
  const min = 60_000;
  const hr = 60 * min;
  const card = (id, name, extra = {}) => ({
    id, me: false, name, avatarUrl: faces[id] ?? null, headline: null, bio: null,
    agents: 0, level: 12, hoursTotal: 80, hoursWeek: 9, hoursToday: 1.5, streak: 4,
    byMonth: [], teammate: false, showActivity: true, activity: null, status: null,
    workingOn: null, workingPrivate: false, ...extra,
  });
  const me = card('p-me', 'Sam Rivera', { me: true, teammate: true, agents: 3, level: 31, workingOn: 'Groups: one place to talk and see work' });
  const maya = card('p-maya', 'Maya Chen', { teammate: true, agents: 5, level: 44, workingOn: 'Billing page moves to Stripe checkout' });
  const theo = card('p-theo', 'Theo Park', { teammate: true, agents: 2, level: 18, workingOn: 'Phone app: reply from the lock screen' });
  const priya = card('p-priya', 'Priya Nair', { teammate: true, agents: 0, level: 27, status: 'In interviews until 3pm' });
  const act = (title, project, state, ago) => ({ title, project, state, at: now - ago });
  const jonah = card('p-jonah', 'Jonah Weiss', { agents: 4, level: 52, workingOn: 'Eval harness for the pricing model', activity: [
    act('Eval harness for the pricing model', 'Pricing', 'running', 70 * min), act('Fix flaky checkout test', 'Pricing', 'done', 3.2 * hr), act('Price page A/B copy', 'Pricing', 'done', 25 * min)] });
  const ines = card('p-ines', 'Ines Duarte', { agents: 1, level: 9, workingOn: 'Landing page copy, round 3', activity: [
    act('Landing page copy, round 3', 'Site', 'running', 35 * min), act('Landing page copy, round 2', 'Site', 'done', 2.4 * hr)] });
  const kai = card('p-kai', 'Kai Moreno', { agents: 6, level: 61, workingOn: 'Migrating the ledger to Postgres', activity: [
    act('Migrating the ledger to Postgres', 'Ledger', 'running', 2.1 * hr), act('Backfill script for old rows', 'Ledger', 'done', 55 * min),
    act('Index on account and day', 'Ledger', 'done', 18 * min), act('Read replica for reports', 'Ledger', 'running', 8 * min)] });
  const lena = card('p-lena', 'Lena Fischer', { agents: 0, level: 15, workingPrivate: true });
  const omar = card('p-omar', 'Omar Haddad', { agents: 2, level: 22, workingOn: 'Onboarding emails', activity: [
    act('Onboarding emails', 'Growth', 'running', 50 * min), act('Welcome email subject lines', 'Growth', 'done', 1.4 * hr)] });
  const team = [me, maya, theo, priya];
  const general = [me, jonah, ines, kai, lena, omar, maya];
  const msg = (id, roomId, by, body, ago, extra = {}) => ({ id, roomId, by, body, inReplyTo: null, mentions: [], at: now - ago, reactions: {}, ...extra });
  const room = (id, name, wall, extra = {}) => ({
    id, name, kind: 'room', teamId: null, listed: false, inviteOnly: false, role: 'member',
    members: wall.length, createdAt: now - 30 * 24 * hr, pinned: false, muted: false, unread: 0, readAt: now - hr,
    markedUnread: false, lastAt: now - 10 * min, agents: wall.reduce((n, c) => n + (c.agents ?? 0), 0), wall,
    people: wall.map((c) => ({ id: c.id, name: c.name, avatarUrl: c.avatarUrl })), ...extra,
  });
  const rooms = [
    room('r-team', 'Northwind', team, { teamId: 't-1', pinned: true, unread: 2 }),
    room('r-general', 'General', general, { listed: true, members: 214 }),
    room('r-founders', 'Founders who ship', [me, jonah, kai, omar], { role: 'owner' }),
    { ...room('r-g1', 'Jonah W.', [me, jonah], { unread: 1 }), kind: 'group', role: 'owner' },
    // A chat with one person, then the same person and another: two chats.
    { ...room('r-g2', 'Maya C.', [me, maya]), kind: 'group', role: 'owner' },
    { ...room('r-g3', 'Maya C., Priya N.', [me, maya, priya], { unread: 1 }), kind: 'group', role: 'owner' },
    { ...room('r-g4', 'Kai M., Omar H.', [me, kai, omar]), kind: 'group', role: 'member' },
    { ...room('r-g5', 'Theo P.', [me, theo]), kind: 'group', role: 'member' },
  ];
  const messages = {
    'r-team': [
      msg('m1', 'r-team', 'p-maya', 'Stripe sandbox is wired. Checkout works end to end on my Mac.', 3 * hr),
      msg('m2', 'r-team', 'p-theo', 'Nice. Is the webhook on the cloud yet or still local?', 2.8 * hr),
      msg('m3', 'r-team', 'p-maya', 'Local for now. My agent is writing the deploy step.', 2.7 * hr),
      msg('m3b', 'r-team', 'p-priya', 'The invoice email reads really well.', 1.8 * hr),
      msg('m4', 'r-team', 'p-me', 'I am folding rooms and messages into one thing. Pictures in a bit.', 40 * min),
      msg('m5', 'r-team', 'p-priya', 'Back at 3. Can someone look at the lock-screen reply PR before then?', 25 * min),
      msg('m6', 'r-team', 'p-theo', 'On it, @Priya', 12 * min, { mentions: ['p-priya'] }),
      msg('m7', 'r-team', 'p-maya', '@Sam can you approve the Stripe keys before 5? The webhook is waiting on them.', 6 * min, { mentions: ['p-me'] }),
    ],
    'r-general': [
      msg('g1', 'r-general', 'p-kai', 'Anyone running more than 10 agents at once on one Mac? Mine starts swapping around 8.', 5 * hr),
      msg('g2', 'r-general', 'p-jonah', 'I cap at 6 and run the rest in the cloud.', 4.6 * hr),
      msg('g3', 'r-general', 'p-ines', 'First week here. What do people use for long evals?', 50 * min),
      msg('g4', 'r-general', 'p-omar', 'Cloud runs. Leave them overnight.', 30 * min),
    ],
    'r-founders': [
      msg('f1', 'r-founders', 'p-jonah', 'Demo day dry run Thursday?', 26 * hr),
      msg('f2', 'r-founders', 'p-kai', 'Yes. 4pm.', 25 * hr),
    ],
    'r-g1': [
      msg('d1', 'r-g1', 'p-jonah', 'Can I borrow your eval prompt for the pricing model?', 2 * hr),
      msg('d2', 'r-g1', 'p-me', 'Sure, sending it over.', 1.9 * hr),
      msg('d3', 'r-g1', 'p-jonah', 'Thanks. It caught two regressions already.', 15 * min),
    ],
    'r-g2': [
      msg('e1', 'r-g2', 'p-me', 'Can you look at the refund copy before you log off?', 70 * min),
      msg('e2', 'r-g2', 'p-maya', 'Yes, after the webhook lands. Twenty minutes.', 62 * min),
    ],
    'r-g3': [
      msg('h1', 'r-g3', 'p-me', 'Pulling you both in. Billing launch on Monday, who owns the email?', 48 * min),
      msg('h2', 'r-g3', 'p-maya', 'I can draft it. Priya, can you check the legal line?', 41 * min),
      msg('h3', 'r-g3', 'p-priya', 'Yes, back from interviews at 3.', 20 * min),
    ],
    'r-g4': [
      msg('k1', 'r-g4', 'p-kai', 'Want to compare cloud bills? Ours tripled.', 3 * hr),
      msg('k2', 'r-g4', 'p-omar', 'Same. Long evals mostly.', 2.6 * hr),
    ],
    'r-g5': [
      msg('t1', 'r-g5', 'p-theo', 'Lock-screen reply works on my phone. Want a build?', 26 * hr),
    ],
  };
  const profile = {
    person_id: 'p-me', display_name: 'Sam R.', avatar_url: faces['p-me'] ?? null, headline: null, bio: null,
    show_working: 'everyone', show_agents: true, show_level: true, show_status: true, show_activity: true,
    invisible_until: null, status_text: null, status_until: null,
  };
  const people = team.map((c) => ({ id: c.id, email: `${c.id.slice(2)}@example.com`, name: c.name, avatarUrl: c.avatarUrl, role: c.me ? 'owner' : 'member' }));
  // `startedAt` is the fixture's own: a real thread card carries no start time yet.
  const tc = (personId, threadId, title, state, project, ago, startedAgo = ago + 40 * min) => ({
    personId, threadId, visible: true, title, project, state, priority: null, problem: null, progress: null, solution: null,
    blockedBy: [], blocks: [], people: null, updatedAt: now - ago, startedAt: now - startedAgo,
  });
  const cards = [
    tc('p-maya', 'w-a1', 'Billing page moves to Stripe checkout', 'running', 'Northwind', 5 * min, 31 * min),
    tc('p-maya', 'w-a2', 'Webhook deploy step for the cloud', 'running', 'Northwind', 9 * min, 2.6 * hr),
    tc('p-maya', 'w-a3', 'Refund flow copy', 'waiting', 'Northwind', 50 * min),
    tc('p-maya', 'w-a4', 'Invoice email template', 'done', 'Northwind', 1.9 * hr),
    tc('p-maya', 'w-a5', 'Stripe sandbox keys in the cloud', 'done', 'Northwind', 3.1 * hr),
    tc('p-theo', 'w-b1', 'Phone app: reply from the lock screen', 'running', 'Phone', 3 * min, 47 * min),
    tc('p-theo', 'w-b2', 'Push notification sound', 'done', 'Phone', 2 * hr),
    tc('p-theo', 'w-b3', 'Badge count on the dock icon', 'done', 'Phone', 58 * min),
    tc('p-priya', 'w-c1', 'Interview loop scorecards', 'waiting', 'Hiring', 3 * hr),
    tc('p-priya', 'w-c2', 'Offer letter draft', 'done', 'Hiring', 2.3 * hr),
    tc('p-me', 'w-d1', 'Groups: one place to talk and see work', 'running', 'Northwind', 4 * min, 1.1 * hr),
    tc('p-me', 'w-d2', 'Rooms board keeps its faces', 'done', 'Northwind', 1.5 * hr),
  ];
  // A teammate's direct record: the conversation the team version already had, which opens in its own view.
  const products = [{ slug: 'direct-priya', dir: '/fixtures/direct-priya', name: 'Direct', oneLiner: '', repoPath: null,
    team: { projectId: 'tp-priya', teamId: 't-1', direct: true, people: ['p-priya'], sharedBy: 'p-me' } }];
  const items = [{
    id: 'w-dm1', product: 'direct-priya', productName: 'Direct', status: 'open', kind: 'directive', labels: [], priority: 2, epoch: 1, claim: null,
    title: 'Legal line for the billing email', body: 'Can you check the legal line on the billing email before Monday?',
    answer: 'Yes, back from interviews at 3. Send it over and I will read it then.', people: ['p-me', 'p-priya'], createdBy: 'p-me',
    createdAt: now - 70 * min, updatedAt: now - 22 * min,
    wrote: { body: { ts: now - 70 * min, by: 'p-me' }, answer: { ts: now - 22 * min, by: 'p-priya' } },
  }];
  return {
    products, items,
    alpha: { rooms: true },
    team: {
      configured: true, started: true, since: now - 40 * 24 * hr, signedIn: true, signingIn: null,
      me: people[0], team: { id: 't-1', name: 'Northwind' }, invites: [], people, cards, lastSyncAt: now, error: null, sent: [],
      rooms: { on: true, ready: true, rooms, messages, me: profile, ranks: { 'p-me': 812, 'p-maya': 233 }, invites: [], error: null,
        mentions: [{ id: 'mn1', messageId: 'm7', roomId: 'r-team', roomName: 'Northwind', by: 'p-maya', byName: 'Maya Chen', body: '@Sam can you approve the Stripe keys before 5? The webhook is waiting on them.', at: now - 6 * min }] },
    },
  };
}

/** Serve `dist` and open it; `init` is put in localStorage before the app runs.
 *  The page's clock is held at `at`, an afternoon, so "today" means the same thing in every picture. */
export async function openStage({ dist, width = 1512, height = 945, theme = 'dark', init = {}, at = Date.parse('2026-10-22T17:40:00'), tweak, door = null }) {
  const { chromium } = require('playwright');
  const base = fixtureSnapshot();
  const made = world(at, facesIn(process.env.GROUPS_FACES));
  tweak?.(made, at);
  const snap = { ...base, approvals: [], ...made, products: [...base.products, ...(made.products ?? [])], items: [...base.items, ...(made.items ?? [])] };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    let file = path.join(dist, decodeURIComponent(url.pathname));
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, 'index.html');
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: process.env.GROUPS_CHROME || undefined });
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, colorScheme: theme });
  await ctx.addInitScript(({ snap, theme, init, door }) => {
    window.__SNAP__ = snap;
    // The phone door marks the page as the app's phone build does.
    if (door) document.documentElement.dataset.door = door;
    window.__ERRS__ = [];
    for (const [k, v] of Object.entries(init)) localStorage.setItem(k, v);
    localStorage.setItem('zero.theme', theme);
    localStorage.setItem('zero.onboarded', '1');
    // Reads answer from the snapshot; anything else answers "no" and changes nothing.
    const known = {
      snapshot: async () => window.__SNAP__,
      rooms: async () => ({ ok: true, value: null, rooms: window.__SNAP__.team.rooms }),
      // A thread's own conversation, out of the app's fixtures; nothing else a thread asks for answers.
      itemHistory: async (p) => ({ ok: true, lines: window.__SNAP__.__history?.[p.id] ?? [] }),
      sessionTrace: async (p) => ({ sessions: window.__SNAP__.__traces?.[p.id] ?? [] }),
      compactionStatus: async () => null,
      remoteControl: async () => null,
      repeats: async () => [],
      olderItems: async () => ({ items: [], more: false }),
      // The one document the fixtures link to, which the build carries under /fixtures.
      openArtifact: async (p) => (String(p?.src ?? '').endsWith('the-first-row.html')
        ? { ok: true, opened: p.src, url: '/fixtures/onboard/designs/w-n13/the-first-row.html' } : { ok: false }),
      dashboard: async () => ({ ok: false }),
      engineSetup: async () => ({ ok: true, phase: 'ready', found: true, signedIn: true }),
    };
    window.zero = new Proxy(known, {
      get(t, k) {
        if (k in t) return t[k];
        if (typeof k !== 'string') return undefined;
        if (k.startsWith('on')) return () => () => {};
        return async () => ({ ok: false });
      },
    });
    window.addEventListener('error', (e) => window.__ERRS__.push(String(e.message)));
    window.addEventListener('unhandledrejection', (e) => window.__ERRS__.push('rejection: ' + String(e.reason?.message ?? e.reason)));
  }, { snap, theme, init, door });
  await ctx.clock.setFixedTime(at);
  const page = await ctx.newPage();
  await page.goto(origin);
  await page.waitForTimeout(1500);
  return {
    page,
    click: async (sel) => { await page.locator(sel).first().click(); await page.waitForTimeout(600); },
    shot: async (file) => { await page.mouse.move(2, height - 2); await page.waitForTimeout(700); await page.screenshot({ path: file }); return file; },
    errors: () => page.evaluate(() => window.__ERRS__),
    close: async () => { await browser.close(); server.close(); },
  };
}
