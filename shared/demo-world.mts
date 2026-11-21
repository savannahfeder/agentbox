// A WHOLE TEAM THAT IS NOBODY'S, so a demo does not have to be the user's own
// screen.
//
// A demo of Agentbox is the whole product: an inbox where agents and teammates
// both ask for things, a question with options under it, work built and
// waiting on a yes, a thread that belongs with somebody else, a standup nobody
// wrote. So the demo is a small invented company on an ordinary morning.
//
// THIS FILE IS THE CONTENT AND NOTHING ELSE. No disk, no spawn, no Electron:
// `main/demo.mts` lays out the store, `main/demo-team.mts` the team. The
// content is the half somebody will want to change, so it is in one place.
//
// NOTHING HERE IS THE USER'S AND NOTHING HERE IS REAL: one invented company,
// four invented people, one invented morning. Different on purpose from the
// multiplayer launch film, which the people on an onboarding call have seen.

import { envName, nameSlug } from './product-name.mjs';

/**
 * The mark a demo copy carries, so it can tell what it is. Set in the child's
 *  environment by `main/demo.mts` and read by `shared/install-id.mts`. */
export const DEMO_ENV = envName('DEMO');

/**
 * A DEMO IS NOT A PERSON AND IT HAS TO SAY SO: a copy that mints a fresh random
 * install id arrives in the morning brief as a stranger who opened Agentbox
 * once and never came back. So every demo copy sends under this one id. */
export const DEMO_INSTALL_ID = `${nameSlug}-demo`;

/**
 * The account a demo store is laid out under. A demo copy has no config file,
 *  so `main/config.mts` takes this id for it instead of minting one. */
export const DEMO_ACCOUNT = '00000000-0000-4000-8000-000000000000';

/**
 * Is this copy of Agentbox a demo? The environment mark is the answer; there is
 *  no path fallback, because unlike a fresh-user home a demo home is not the
 *  only thing that could ever sit under its folder. */
export function runningAsADemo(env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env) {
  return env?.[DEMO_ENV] === '1';
}

/* -------------------------------- the team -------------------------------- */

// Fixed ids, so the store laid out before the copy opens and the team the copy
// makes when it starts agree on who is who.
const id = (n: string) => `00000000-0000-4000-8000-${n.padStart(12, '0')}`;

export interface DemoPerson { id: string; name: string; email: string; job: string }

export const DEMO_TEAM = { id: id('f001'), name: 'Ferry' };

/** The person the demo copy is signed in as. */
export const DEMO_ME: DemoPerson = { id: id('a1'), name: 'Jamie Park', email: 'jamie@ferry.test', job: 'CTO' };

export const DEMO_TEAMMATES: DemoPerson[] = [
  { id: id('b2'), name: 'Priya Raman', email: 'priya@ferry.test', job: 'Design' },
  { id: id('c3'), name: 'Theo Brandt', email: 'theo@ferry.test', job: 'Sync engine' },
  { id: id('d4'), name: 'Lena Ortiz', email: 'lena@ferry.test', job: 'Growth' },
];
const [PRIYA, THEO, LENA] = DEMO_TEAMMATES;

// TWO PROJECTS, BOTH SHARED WITH THE TEAM. One project reads as furniture in
// the rail and the composer's picker. No `repoPath`: a made-up one either
// shows a stranger's folder name or a warning that the folder is missing.
export const DEMO_PRODUCTS = [
  { slug: 'ferry', name: 'Ferry', oneLiner: 'Moves a team off Dropbox without losing a folder.', projectId: id('f101') },
  { slug: 'website', name: 'Website', oneLiner: 'ferry.test, the launch and the changelog.', projectId: id('f102') },
];

/* ------------------------------ your threads ------------------------------ */

// Six things wait on you when the copy opens: two from teammates
// (`DEMO_MESSAGES`) and four from agents here. Each lands on a screen worth
// showing: options answered with one key, a decision, a thread that belongs
// with a teammate, something blocked on you.
//
// The bodies follow the worker brief: the ask in bold on the first line, then
// the context, then `## Options`, which is what the reply box draws its
// numbered choices from.
const MIN = 60_000;
const HR = 3_600_000;

interface DemoRow {
  product: string;
  id: string;
  kind: string;
  priority: number;
  at: number;
  title: string;
  body?: string;
  bodyBy?: 'founder';
  status?: 'done' | 'blocked';
  statusAt?: number;
  result?: string;
}

function lines(now: number): DemoRow[] {
  return [
    {
      product: 'ferry',
      id: 'w-f1d8a20c41',
      kind: 'review',
      priority: 7,
      at: now - 18 * MIN,
      title: 'The fix for file dates before 2019 is built and tested.',
      body: [
        '**Ship the date fix, or hold it until shared drives are covered too.**',
        '',
        'Files older than 2019 were landing stamped with today. They now keep their real date, on every one of the 3,200 test files I moved, and nothing already moved is touched.',
        '',
        'Shared drives still lose the date, because that path goes through the sync engine. I would ship this now and leave shared drives to the thread that is already on the sync engine.',
        '',
        '## Options',
        '1. Ship it (recommended)',
        '2. Hold it until shared drives work too',
        '3. Ship it and open a thread for shared drives',
      ].join('\n'),
    },
    {
      product: 'ferry',
      id: 'w-f27c9e5b10',
      kind: 'question',
      priority: 5,
      at: now - 47 * MIN,
      title: 'The Google Drive import needs Theo. He owns the sync engine.',
      body: [
        '**Hand this thread to Theo.**',
        '',
        'The import works on personal drives. Shared drives fail inside the sync engine, which Theo is changing this week, so a fix from me would land on the same code as his.',
        '',
        'Everything I found is in this thread: the three failing drives, the error, and where in the engine it happens. He can start from here.',
      ].join('\n'),
    },
    {
      product: 'ferry',
      id: 'w-f3a04d7e62',
      kind: 'question',
      priority: 7,
      at: now - 1.6 * HR,
      title: 'Ferry needs a price before the first team can pay for it.',
      body: [
        '**Say per seat, or one flat price for the whole team.**',
        '',
        'Per seat is what all three trial teams expected, and it grows as they do. A flat price is easier to say out loud, and it is what both competitors charge.',
        '',
        'At the sizes the trial teams are today, per seat earns more from two of the three and less from the biggest.',
        '',
        '## Options',
        '1. Per seat (recommended)',
        '2. One flat price per team',
        '3. Per seat, capped at the flat price',
      ].join('\n'),
    },
    {
      product: 'ferry',
      id: 'w-f4b6e1c093',
      kind: 'task',
      priority: 9,
      at: now - 3.1 * HR,
      status: 'blocked',
      title: 'Payments cannot go live until Stripe verifies the account.',
      body: [
        '**Finish Stripe\'s verification. It needs a bank detail only you have.**',
        '',
        'Checkout is built and passes with the test keys. The live keys are refused until the account is verified, and that form asks for the company\'s bank account.',
        '',
        'Everything else on the paid plan is done and waiting behind it.',
      ].join('\n'),
    },
    {
      product: 'ferry',
      id: 'w-f5c2a8d714',
      kind: 'directive',
      priority: 5,
      at: now - 6 * HR,
      bodyBy: 'founder',
      title: 'A move that stops halfway should pick up where it left off.',
      body: 'When a move stops halfway, from a closed laptop or a dropped connection, it starts again from the first file. Make it pick up where it left off.',
      status: 'done',
      statusAt: now - 4 * HR,
      result: [
        'A move that stops now picks up from the last file it finished. Tested by cutting the connection at 10%, 50% and 90% of a 12,000 file move: each one finished with every file there once and none twice.',
        '',
        'It is shipped. Nothing changes for a move that never stops.',
      ].join('\n'),
    },
    {
      product: 'website',
      id: 'w-e1d93f2a58',
      kind: 'review',
      priority: 2,
      at: now - 22 * HR,
      status: 'done',
      statusAt: now - 20 * HR,
      title: 'The changelog page is live with this month\'s six changes.',
      result: [
        'The changelog page is live, with this month\'s six changes in plain words and a picture for each of the three you can see.',
        '',
        'It loads in 0.4 seconds on a phone, measured on the live page.',
      ].join('\n'),
    },
  ];
}

/* ------------------------------ ledger lines ------------------------------ */

// ONE ROW BECOMES THE LINES IT WOULD REALLY HAVE BEEN WRITTEN AS: filed, said,
// then finished, each with its own time, because the thread view draws them in
// that order. `source` decides who may overwrite what (shared/work-items.mts).
export type DemoLedgerLine = {
  id: string;
  ts: number;
  source: 'system' | 'founder' | 'agent';
  patch: Record<string, unknown>;
};

export function demoLedgerLines(now: number = Date.now()): Record<string, DemoLedgerLine[]> {
  const byProduct: Record<string, DemoLedgerLine[]> = {};
  for (const p of DEMO_PRODUCTS) byProduct[p.slug] = [];

  for (const row of lines(now)) {
    const at = Math.round(row.at);
    const out = byProduct[row.product];
    out.push({
      id: row.id,
      ts: at,
      source: 'system',
      // Seen by the team: a thread made before the copy signed in is otherwise yours alone.
      patch: { title: row.title, status: 'open', kind: row.kind, priority: row.priority, labels: row.bodyBy === 'founder' ? ['founder'] : [], visibility: 'team' },
    });
    if (row.body) {
      out.push({
        id: row.id,
        ts: at + 1,
        source: row.bodyBy === 'founder' ? 'founder' : 'agent',
        patch: { title: row.title, body: row.body },
      });
    }
    if (row.status === 'done') {
      out.push({ id: row.id, ts: Math.round(row.statusAt ?? at + HR), source: 'agent', patch: { status: 'done', result: row.result ?? '' } });
    } else if (row.status === 'blocked') {
      out.push({ id: row.id, ts: at + 2, source: 'agent', patch: { status: 'blocked' } });
    }
  }

  return byProduct;
}

/* ------------------------- what teammates sent you ------------------------ */

// Each is a conversation between one teammate and you, which is how the app
// keeps a message (main/team/index.mts `message`). `given` makes it a task they
// handed you rather than talk. `priority` is set so the copy does not ask a
// model to sort it on a call.
export interface DemoMessage { from: DemoPerson; projectId: string; id: string; at: number; title: string; body: string; priority: number; given?: boolean }

export function demoMessages(now: number = Date.now()): DemoMessage[] {
  return [
    {
      from: LENA,
      // A conversation's folder is named from the first eight of its id.
      projectId: '7c41e2d9-3b8a-4f15-9e62-1d0a5c8b4f21',
      id: 'w-d1a7c3e590',
      at: now - 9 * MIN,
      title: 'Can you read the launch email before 3?',
      body: 'Can you read the launch email before 3? It goes to all 4,000 trial users at 4, and the subject line is the part I am least sure of. It is in the Website project.',
      priority: 7,
    },
    {
      from: PRIYA,
      projectId: 'a93f0b6e-52c7-4d18-8b3e-6f2d9c1e7a54',
      id: 'w-d2b84f6a31',
      at: now - 34 * MIN,
      title: 'Pick one of the three first screens after sign-up',
      body: 'I drew three versions of the first screen after sign-up. Pick the one you would ship and my agent will build it this afternoon. My vote is the second: it starts the first move straight away instead of showing a tour.',
      priority: 5,
      given: true,
    },
  ];
}

/* ---------------------------- what they are on ---------------------------- */

// The cards each teammate's copy would put up: what their threads are doing.
// The Team page, their faces and the Standup are drawn from these.
export interface DemoCard { by: DemoPerson; threadId: string; project: string; title: string; state: 'running' | 'waiting' | 'done'; updatedAt: number; progress?: string; shippedAt?: number }

export function demoCards(now: number = Date.now()): DemoCard[] {
  const done = lastWorkingMorning(now);
  return [
    { by: THEO, threadId: 'w-c3a1e09d42', project: 'Ferry', title: 'Shared drives keep their permissions after a move', state: 'running', updatedAt: now - 12 * MIN, progress: 'Owners and editors carry across\nViewers next, then the 40 drive test' },
    { by: THEO, threadId: 'w-c3b27f8e15', project: 'Ferry', title: 'Uploads retry on a slow connection', state: 'done', updatedAt: done - 19 * HR, shippedAt: done - 19 * HR, progress: 'Retries three times, then says which file' },
    { by: PRIYA, threadId: 'w-b2c4d0a873', project: 'Ferry', title: 'Three first screens after sign-up', state: 'done', updatedAt: done - 40 * MIN, progress: 'Drawn in light and dark' },
    { by: PRIYA, threadId: 'w-b2d91e6c50', project: 'Ferry', title: 'Empty states for the move list', state: 'running', updatedAt: now - 25 * MIN, progress: 'Four states drawn, two to go' },
    { by: LENA, threadId: 'w-d4e8a2f617', project: 'Website', title: 'Launch email for the trial users', state: 'waiting', updatedAt: now - 9 * MIN, progress: 'Written, waiting on a read from Jamie' },
    { by: LENA, threadId: 'w-d4f05c1b98', project: 'Website', title: 'Changelog page', state: 'done', updatedAt: done - 21 * HR, shippedAt: done - 21 * HR, progress: 'Six changes this month' },
    { by: THEO, threadId: 'w-c3c84a1f06', project: 'Ferry', title: 'Folders over 50,000 files move in one go', state: 'done', updatedAt: done - 15 * HR, progress: 'Tested on a 61,000 file folder' },
    { by: PRIYA, threadId: 'w-b2e3f7a915', project: 'Website', title: 'Pricing page in dark mode', state: 'done', updatedAt: done - 17 * HR, progress: 'Checked on a phone and a laptop' },
    { by: LENA, threadId: 'w-d4a96e3c27', project: 'Website', title: 'Trial teams who never started a move', state: 'done', updatedAt: done - 3 * HR, progress: '212 teams, each sent a two line note' },
  ];
}

/**
 * Where finished work is dated back from. On a weekday it is now. On a
 *  weekend the Standup opens on Friday's, which covers Thursday 9:00 to
 *  Friday 9:00, so it is Friday at 8:30 and the work lands inside it. */
export function lastWorkingMorning(now: number): number {
  const d = new Date(now);
  const back = d.getDay() === 6 ? 1 : d.getDay() === 0 ? 2 : 0;
  if (!back) return now;
  d.setDate(d.getDate() - back);
  return d.setHours(8, 30, 0, 0);
}

/* --------------------------------- papers --------------------------------- */

// A document or two per project, so the documents pane is not empty. Short on
// purpose: somebody in the room will start reading a long one.
export const DEMO_DOCS: Record<string, { path: string; title: string; text: string }[]> = {
  ferry: [
    {
      path: 'notes.md',
      title: 'Ferry notes',
      text: [
        '# Ferry',
        '',
        'Moves a team off Dropbox without losing a folder.',
        '',
        'The folder tree is the product. Everything else is speed, and speed is',
        'the second thing anybody asks about.',
        '',
        '## Open',
        '',
        '- A price. Per seat or flat.',
        '- Shared drives lose permissions and dates. Theo has the sync engine.',
        '- Stripe is waiting on the bank details.',
      ].join('\n'),
    },
  ],
  website: [
    {
      path: 'launch-email.md',
      title: 'Launch email',
      text: [
        '# Your whole Dropbox, moved by Friday',
        '',
        'Hi {first name},',
        '',
        'Ferry now moves a whole team across with every folder where you left it,',
        'every file date kept, and a move that picks up where it stopped.',
        '',
        'Start a move from the link below. Most teams are done before lunch.',
        '',
        'Lena, for the Ferry team',
      ].join('\n'),
    },
  ],
};
