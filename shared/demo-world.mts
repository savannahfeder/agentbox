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

/** `face`: a photo in shared/demo-faces, of nobody: each was made by an image model. */
export interface DemoPerson { id: string; name: string; email: string; job: string; face: string }

export const DEMO_TEAM = { id: id('f001'), name: 'Shuttle' };

/** The person the demo copy is signed in as. */
export const DEMO_ME: DemoPerson = { id: id('a1'), name: 'Jamie Park', email: 'jamie@shuttle.test', job: 'CTO', face: 'jamie.jpg' };

export const DEMO_TEAMMATES: DemoPerson[] = [
  { id: id('b2'), name: 'Priya Raman', email: 'priya@shuttle.test', job: 'Design', face: 'priya.jpg' },
  { id: id('c3'), name: 'Theo Brandt', email: 'theo@shuttle.test', job: 'Sync engine', face: 'theo.jpg' },
  { id: id('d4'), name: 'Lena Ortiz', email: 'lena@shuttle.test', job: 'Growth', face: 'lena.jpg' },
];
const [PRIYA, THEO, LENA] = DEMO_TEAMMATES;

// TWO PROJECTS, BOTH SHARED WITH THE TEAM. One project reads as furniture in
// the rail and the composer's picker. No `repoPath`: a made-up one either
// shows a stranger's folder name or a warning that the folder is missing.
export const DEMO_PRODUCTS = [
  { slug: 'shuttle', name: 'Shuttle', oneLiner: 'Moves a team off Dropbox without losing a folder.', projectId: id('f101') },
  { slug: 'website', name: 'Website', oneLiner: 'The site, the launch email and the changelog.', projectId: id('f102') },
];

/* ------------------------------ your threads ------------------------------ */

// Six things wait on you when the copy opens: four threads an agent has
// answered, each with a picture of the work and options under it, and two from
// teammates (`demoMessages`). The two Claude Code threads are newest, so they
// sit on top: a call shows the inbox first and teammates second.
//
// EACH IS SHAPED LIKE A REAL THREAD: your ask, then the agent's answer, its
// summary (`problem` and `progress`, drawn as Context and Done) and its short
// name. The name is written here so the copy never asks a model for one, which
// would spend a plan and give a different name on every open (main/row-label.mts).
// The answers follow the worker brief: the ask in bold on the first line, then
// plain sentences, then `## Options`, which the reply box draws as choices.
const MIN = 60_000;
const HR = 3_600_000;

interface DemoRow {
  product: string;
  id: string;
  engine: 'claude' | 'codex';
  priority: number;
  at: number;
  /** Your words, which open the thread. */
  ask: string;
  label: string;
  problem: string;
  progress: string[];
  /** The agent's answer, written when it finished. */
  result: string;
  answeredAt: number;
  status?: 'done';
  doneAt?: number;
  /** A task asked for in a chat: its label naming the chat, and only the chat's people see it. */
  askedIn?: { slug: string; id: string; people: string[] };
}

function lines(now: number): DemoRow[] {
  return [
    {
      product: 'shuttle',
      id: 'w-f0c7e31b52',
      engine: 'claude',
      priority: 7,
      at: now - 25 * MIN,
      answeredAt: now - 6 * MIN,
      ask: 'Add Sign in with Google to the sign-in page, beside email.',
      label: 'Sign in with Google',
      problem: 'You wanted people to sign in to Shuttle with their Google account as well as with email.',
      progress: [
        'Added Sign in with Google above the email box',
        'Signed in with 3 test Google accounts, each landed on its own moves',
        'Someone who signed up by email keeps one account, not two',
      ],
      result: [
        '**Google sign-in is built. Turn it on for everyone?**',
        '',
        'designs/sign-in-with-google.png',
        '',
        'It sits above the email box on the sign-in page. I signed in with 3 test Google accounts and each one landed on its own moves. Someone who already signed up by email with the same address keeps one account, not two.',
        '',
        '## Options',
        '1. Turn it on for everyone (recommended)',
        '2. Trial teams first, everyone next week',
      ].join('\n'),
    },
    {
      product: 'shuttle',
      id: 'w-f1d8a20c41',
      engine: 'claude',
      priority: 7,
      at: now - 50 * MIN,
      answeredAt: now - 14 * MIN,
      ask: 'Files older than 2019 arrive in Google Drive stamped with today\'s date. Fix it so they keep their real date.',
      label: 'Old file dates after a move',
      problem: 'You wanted files older than 2019 to keep their real date after a move. They were arriving in Google Drive stamped with today\'s date.',
      progress: [
        'Found why. Drive refused the old dates and used today\'s',
        'Carried each file\'s real date across in its details instead',
        'Moved 3,200 test files from 2004 to 2018, every date kept',
        'Shared drives still lose the date, inside the sync engine',
      ],
      result: [
        '**Ship the date fix now, or hold it until shared drives work too?**',
        '',
        'designs/old-dates-before-and-after.png',
        '',
        'Files older than 2019 now keep their real date. I moved 3,200 test files dated 2004 to 2018 and every one arrived with its date. Nothing already moved is touched.',
        '',
        'Shared drives still lose the date, because they go through the sync engine, which Theo is changing this week. I would ship this now and leave shared drives to his work.',
        '',
        '## Options',
        '1. Ship it now (recommended)',
        '2. Hold it until shared drives work too',
      ].join('\n'),
    },
    {
      product: 'shuttle',
      id: 'w-f27c9e5b10',
      engine: 'codex',
      priority: 7,
      at: now - 3.5 * HR,
      answeredAt: now - 47 * MIN,
      ask: 'Add OneDrive as a place to move to, beside Google Drive.',
      label: 'OneDrive as a destination',
      problem: 'You wanted Shuttle to move teams to OneDrive as well as Google Drive. Small moves work. Large ones stall in the sync engine, which Theo owns.',
      progress: [
        'Built OneDrive as a second destination',
        'Moved 9,400 files across 4 test accounts, folders and dates intact',
        'Moves over 20,000 files stall in the sync engine',
      ],
      result: [
        '**Small moves to OneDrive work. Large ones stall in Theo\'s sync engine.**',
        '',
        'designs/onedrive-test-moves.png',
        '',
        'I moved 9,400 files across 4 test accounts and every folder and date arrived intact. Three larger moves, of 24,000, 31,000 and 58,000 files, each stopped at 20,000, when the engine\'s upload queue ran out of memory.',
        '',
        'Theo is rewriting that queue this week, so a fix from me would land on top of his. I would hand this to him.',
        '',
        '## Options',
        '1. Hand it to Theo (recommended)',
        '2. Ship OneDrive for moves under 20,000 files',
        '3. Hold it until Theo\'s rewrite lands',
      ].join('\n'),
    },
    {
      product: 'shuttle',
      id: 'w-f3a04d7e62',
      engine: 'claude',
      priority: 7,
      at: now - 5 * HR,
      answeredAt: now - 1.6 * HR,
      ask: 'We need a price before the first trial team pays. Read the trial team interviews, look at what similar tools charge, and recommend one.',
      label: 'Shuttle pricing',
      problem: 'You wanted a price for Shuttle before the first trial team pays. It comes down to per seat or one flat price per team.',
      progress: [
        'Read the interview notes from three trial teams',
        'Compared what two similar tools charge',
        'Worked out what each team would pay under each price',
      ],
      result: [
        '**Per seat, or one flat price per team?**',
        '',
        'designs/what-each-team-would-pay.png',
        '',
        'All three trial teams you interviewed expected to pay per seat, and per seat grows as a team does. Both similar tools charge one flat price per team, which is easier to say out loud.',
        '',
        'Those three teams have 6, 18 and 40 people. At $8 a seat, two of them would pay more than a $99 flat price and the smallest would pay less.',
        '',
        '## Options',
        '1. Per seat, $8 a month (recommended)',
        '2. One flat price, $99 a month per team',
        '3. Per seat, never more than $99 a team',
      ].join('\n'),
    },
    {
      product: 'shuttle',
      id: 'w-f5c2a8d714',
      engine: 'claude',
      priority: 5,
      at: now - 9 * HR,
      answeredAt: now - 6 * HR,
      status: 'done',
      doneAt: now - 5.5 * HR,
      ask: 'When a move stops halfway, from a closed laptop or a dropped connection, it starts again from the first file. Make it pick up where it left off.',
      label: 'Resume a stopped move',
      problem: 'You wanted a move that stops halfway to pick up where it left off, not start again from the first file.',
      progress: [
        'Shuttle now remembers the last file each move finished',
        'Cut the connection at 10%, 50% and 90% of a 12,000 file move',
        'Each one finished with every file there once',
      ],
      result: [
        'A move that stops now picks up from the last file it finished.',
        '',
        'I cut the connection at 10%, 50% and 90% of a 12,000 file move. Each one finished with every file there once and none twice. A move that never stops works as before.',
      ].join('\n'),
    },
    {
      product: 'website',
      id: SUBJECT_TASK,
      engine: 'claude',
      priority: 5,
      at: now - 1.9 * HR,
      answeredAt: now - 1.87 * HR,
      status: 'done',
      doneAt: now - 1.85 * HR,
      askedIn: { ...LENA_THREAD, people: [DEMO_ME.id, LENA.id] },
      ask: 'Can you write three other subject lines for this and say which reads clearest?',
      label: 'Subject lines for the launch email',
      problem: 'You asked in Lena\'s launch email thread for three other subject lines, and which one reads clearest.',
      progress: [
        'Read the launch email and its subject line',
        'Wrote three other subject lines',
        'Picked the clearest one',
      ],
      result: [
        'Three other subject lines, and the one I would send.',
        '',
        '1. Move your whole team off Dropbox this week',
        '2. Every folder, right where you left it',
        '3. Your Dropbox, in Google Drive by lunch',
        '',
        'I would send the second. It names what people are most afraid of losing in a move, and it is the shortest of the four.',
      ].join('\n'),
    },
    {
      product: 'website',
      id: 'w-e1d93f2a58',
      engine: 'codex',
      priority: 2,
      at: now - 26 * HR,
      answeredAt: now - 22 * HR,
      status: 'done',
      doneAt: now - 21 * HR,
      ask: 'Make a changelog page for the site with this month\'s changes, in plain words.',
      label: 'Changelog page',
      problem: 'You wanted a changelog page on the site with this month\'s changes, in plain words.',
      progress: [
        'Wrote this month\'s six changes in plain words',
        'Added a picture for each of the three you can see',
        'Published it and checked it on a phone',
      ],
      result: [
        'The changelog page is live, with this month\'s six changes in plain words and a picture for each of the three you can see.',
        '',
        'It loads in 0.4 seconds on a phone, measured on the live page.',
      ].join('\n'),
    },
  ];
}

/* ------------------------------ ledger lines ------------------------------ */

// ONE ROW BECOMES THE LINES IT WOULD REALLY HAVE BEEN WRITTEN AS, each with its
// own time, the way the app writes them (main/store.mts `composeItem`, then the
// agent's summary and answer): the thread view draws them in that order.
// `source` decides who may overwrite what (shared/work-items.mts).
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
    const answered = Math.round(row.answeredAt);
    const out = byProduct[row.product];
    // Seen by the team: a thread made before the copy signed in is otherwise yours alone.
    const seen = row.askedIn ? { labels: ['founder', `asked-in:${row.askedIn.slug}/${row.askedIn.id}`], visibility: 'people', visibleTo: row.askedIn.people } : { labels: ['founder'], visibility: 'team' };
    out.push({ id: row.id, ts: at, source: 'system', patch: { title: row.ask, kind: 'directive', priority: row.priority, status: 'open', ...seen } });
    out.push({ id: row.id, ts: at + 1, source: 'founder', patch: { title: row.ask, body: row.ask, engine: row.engine } });
    out.push({ id: row.id, ts: at + 2, source: 'agent', patch: { label: row.label } });
    out.push({ id: row.id, ts: answered - 1, source: 'agent', patch: { problem: row.problem, progress: row.progress.join('\n') } });
    out.push({ id: row.id, ts: answered, source: 'agent', patch: { result: row.result } });
    if (row.status === 'done') out.push({ id: row.id, ts: Math.round(row.doneAt ?? answered + 1), source: 'founder', patch: { status: 'done' } });
  }

  return byProduct;
}

/* ------------------------- what teammates sent you ------------------------ */

// Each is a conversation between one teammate and you, which is how the app
// keeps a message (main/team/index.mts `message`). `given` makes it a task they
// handed you rather than talk. `priority` is set so the copy does not ask a
// model to sort it on a call.
export interface DemoFile { path: string; title: string; text: string }
/** `given`: a task they handed you. `subject`: a message about one piece of work, which gets a row of its own named by `title`. */
/** `replies`: what was said after, in order; the last word is theirs, so it still waits on you. */
export interface DemoMessage {
  from: DemoPerson; projectId: string; id: string; at: number; title: string; body: string; priority: number;
  given?: boolean; subject?: boolean; file?: DemoFile; due?: string;
  replies?: { by: 'me' | 'them'; at: number; text: string }[];
}

// THE AGENT BROUGHT INTO LENA'S THREAD with an @-mention, written the way the
// reply box writes one (renderer/src/team/agent-mentions.ts): the words in a
// link whose address names the agent, the project and the task that answered.
export const LENA_THREAD = { slug: 'direct-7c41e2d9', id: 'w-d1a7c3e590' };
export const SUBJECT_TASK = 'w-e4a1b7c392';
const SUBJECT_ASK = `[@Claude Code in Website](agentbox-agent:claude?project=website&task=${SUBJECT_TASK}) can you write three other subject lines for this and say which reads clearest?`;

/** A message's file, linked under its words the way the reply box links one. */
export const withFile = (m: DemoMessage) => (m.file ? `${m.body}\n\n[${m.file.path}](attachments/${m.file.path})` : m.body);

export function demoMessages(now: number = Date.now()): DemoMessage[] {
  return [
    {
      from: LENA,
      // A conversation's folder is named from the first eight of its id.
      projectId: '7c41e2d9-3b8a-4f15-9e62-1d0a5c8b4f21',
      id: LENA_THREAD.id,
      at: now - 2.1 * HR,
      title: 'Launch email',
      body: 'Can you read the launch email today? It goes to all 4,000 trial users tomorrow morning, and the subject line is the part I am least sure of.',
      priority: 5,
      subject: true,
      file: LAUNCH_EMAIL,
      replies: [
        { by: 'me', at: now - 1.9 * HR, text: SUBJECT_ASK },
        { by: 'them', at: now - 1.1 * HR, text: 'The second one is great, going with it. Can you still read the rest before it goes out tomorrow?' },
      ],
    },
    {
      from: PRIYA,
      projectId: 'a93f0b6e-52c7-4d18-8b3e-6f2d9c1e7a54',
      id: 'w-d2b84f6a31',
      at: now - 1.3 * HR,
      title: 'Approve the words on the sign-up screens',
      body: 'Can you read the words for the three sign-up screens and say yes, or change what you would? My agent builds the screens as soon as you do.',
      priority: 5,
      given: true,
      due: dayIn(now, 0),
      file: SIGN_UP_WORDS,
    },
  ];
}

/* ------------------------- the chat with each teammate ------------------------- */

// A teammate's page opens on your chat with them (a group of the two of you),
// which was empty. One short exchange each, answered by you.
/** `at` is a time on the day before the demo opens, so a chat never reads as said at midnight. */
export interface DemoChat { with: DemoPerson; said: { by: 'them' | 'me'; at: [number, number]; text: string }[] }

/** That moment, the day before `now`, in local time. */
export function yesterdayAt(now: number, [h, m]: [number, number]): number {
  const d = new Date(now);
  d.setDate(d.getDate() - 1);
  return d.setHours(h, m, 0, 0);
}

export const DEMO_CHATS: DemoChat[] = [
  {
    with: THEO,
    said: [
      { by: 'them', at: [10, 12], text: 'I start rewriting the sync engine tomorrow. Anything big that touches it, send my way first.' },
      { by: 'me', at: [10, 31], text: 'Will do. The OneDrive work will hit it, so that one comes to you.' },
    ],
  },
  {
    with: LENA,
    said: [
      { by: 'them', at: [13, 40], text: 'The comparison page is live and linked from pricing.' },
      { by: 'me', at: [13, 58], text: 'Read it. Clear, and fair to both of them.' },
    ],
  },
  {
    with: PRIYA,
    said: [
      { by: 'them', at: [16, 5], text: 'The pricing page works in dark mode now. Checked on a phone and a laptop.' },
      { by: 'me', at: [16, 22], text: 'Looks great, thank you.' },
    ],
  },
];

/* ------------------------------ the team's group ------------------------------ */

// What the team said in its group this morning, oldest first, beside the Team
// look Priya filled in. `hoursAgo` is from the moment the demo was seeded.
export const DEMO_GROUP_POSTS: { by: DemoPerson; hoursAgo: number; body: string }[] = [
  { by: THEO, hoursAgo: 2.5, body: 'The sync engine rewrite is on a branch. Large moves now go in batches of 5,000 files, and a 60,000 file test finished in 41 minutes instead of stalling.' },
  { by: LENA, hoursAgo: 1.2, body: 'Launch email is written. It goes to all 4,000 trial users tomorrow morning, once Jamie has read it.' },
  { by: PRIYA, hoursAgo: 0.6, body: 'Sign-up screens are drawn in light and dark. The words are with Jamie, then my agent builds them.' },
];

/** The Team look, filled in, so the one file every agent reads is not a blank form. */
export const DEMO_TEAM_LOOK = [
  '# Team look',
  '',
  'What every agent on the team reads before it makes a design, a page, a picture or a film. Anyone on the team can edit it.',
  '',
  '## Colours',
  '',
  '- Main: #2F6FEB, the blue of the Shuttle mark',
  '- Text: #1B1F24',
  '- Background: #F7F8FA',
  '',
  '## Fonts',
  '',
  '- Headings: Inter, semibold',
  '- Body: Inter, regular',
  '',
  '## Logo',
  '',
  'The Shuttle mark sits top left on every page, never smaller than 24 pixels.',
  '',
  '## Voice',
  '',
  'Plain and short. Say what moved and how long it took. No exclamation marks.',
  '',
].join('\n');

/* ---------------------------- what they are on ---------------------------- */

// The cards each teammate's copy would put up: what their threads are doing.
// The Team page, their faces and the Standup are drawn from these.
/** `task`: a task somebody gave them, due at the end of the day `dueInDays` from today. `blockedOn`: who it waits on. */
export interface DemoCard {
  by: DemoPerson; threadId: string; project: string; title: string; state: 'running' | 'waiting' | 'done'; updatedAt: number; progress?: string; shippedAt?: number;
  task?: { from: DemoPerson; dueInDays: number }; blockedOn?: DemoPerson;
}

/**
 * What a teammate's thread holds when you open it from the Standup or the Team
 * page: their words to their agent, what it is about, and the agent's answer.
 * Without it the page said "Priya's app has not shared these messages yet"
 * (founder, on a call, 2026-11-21). A thread still running has no answer yet.
 */
export interface DemoThreadWords { ask: string; about: string; said?: string }

export const DEMO_THREAD_WORDS: Record<string, DemoThreadWords> = {
  'w-c3a1e09d42': {
    ask: 'Rewrite the sync engine so a move over 20,000 files does not stall.',
    about: 'Theo wanted large moves to stop stalling. The engine kept every file in one upload queue, which ran out of memory past 20,000 files.',
  },
  'w-c3b27f8e15': {
    ask: 'When the connection drops for a second, a move fails outright. Make it try again.',
    about: 'Theo wanted a move to survive a connection that drops for a moment, instead of failing on the first error.',
    said: 'A move now tries a file three times before it gives up, and when it does it names the file. I dropped the connection 50 times during a 9,000 file move and it finished every time.',
  },
  'w-c3c84a1f06': {
    ask: 'Shared folders lose who can edit what. Carry the permissions across.',
    about: 'Theo wanted the people on a shared folder to keep the same access after a move.',
    said: 'Owners, editors and viewers now carry across to Google Drive. I checked 120 shared folders after a test move and every person had the access they had in Dropbox.',
  },
  'w-c3d51b7e29': {
    ask: 'Listing a big Dropbox takes six minutes before the move starts. Make it faster.',
    about: 'Theo wanted a shorter wait before a move starts on a large Dropbox.',
    said: 'A 100,000 file Dropbox now lists in 40 seconds instead of 6 minutes. It asks Dropbox for 8 folders at a time, which stays under its rate limit.',
  },
  'w-c3e95a2b70': {
    ask: 'Jamie asked for old file dates to survive on shared drives. Carry them through the new engine.',
    about: 'Jamie gave Theo this task. Files moved to shared drives arrive with today\'s date instead of their real one.',
  },
  'w-b2c4d0a873': {
    ask: 'Draw the three sign-up screens in light and dark, and send Jamie the words to approve.',
    about: 'Priya wanted the sign-up screens drawn and their words approved before her agent builds them.',
    said: 'The three sign-up screens are drawn in light and dark. I sent Jamie the words to approve, and I will build the screens as soon as they say yes.',
  },
  'w-b2d91e6c50': {
    ask: 'Draw what the move list shows when there is nothing in it yet, for each of the six cases.',
    about: 'Priya wanted the move list to say something useful when it is empty, in each of the six ways it can be.',
  },
  'w-b2e3f7a915': {
    ask: 'Make the pricing page work in dark mode.',
    about: 'Priya wanted the pricing page to read properly for people whose computer is set to dark.',
    said: 'The pricing page now follows dark mode. I checked it on a phone and a laptop, and every price and button keeps its contrast.',
  },
  'w-b2f60c4d18': {
    ask: 'Rewrite every error message in plain words, each saying what to do next.',
    about: 'Priya wanted the error messages to stop reading like code and to tell people what to do.',
    said: 'All 23 error messages are rewritten. Each says what went wrong in one sentence and what to do next, such as "Dropbox stopped answering. Shuttle will try again in a minute."',
  },
  'w-b2a78e3f51': {
    ask: 'Show a progress bar on every move, with the files moved and the time left.',
    about: 'Priya wanted people to see how far a move has got and how long is left.',
    said: 'Every move now shows a progress bar with the files moved and the time left. The estimate settles in the first minute and stays within 10% after that.',
  },
  'w-b2c07d5e94': {
    ask: 'Lena needs four screenshots for the launch email. Take them from the new sign-up screens.',
    about: 'Lena gave Priya this task for the launch email. It was due yesterday, and two of the four are taken.',
  },
  'w-d4e8a2f617': {
    ask: 'Write the launch email for all 4,000 trial users and send it to Jamie to read.',
    about: 'Lena wanted the launch email written for every trial user, and read by Jamie before it goes out.',
    said: 'The launch email is written for all 4,000 trial users and sent to Jamie to read. It goes out tomorrow morning.',
  },
  'w-d4b37e0c84': {
    ask: 'Write the five welcome emails a new team gets in its first two weeks.',
    about: 'Lena wanted a new team to hear from Shuttle at the right moments in its first two weeks.',
  },
  'w-d4e61f9a03': {
    ask: 'Draft the pricing page for the per-seat plan.',
    about: 'Lena wanted the pricing page ready for the new plan. It waits on Jamie choosing the price.',
    said: 'Both versions of the pricing page are drafted, one at $8 a seat and one at $99 a team. It waits on Jamie choosing the price.',
  },
  'w-d4f05c1b98': {
    ask: 'Write a page comparing Shuttle with moving files by hand.',
    about: 'Lena wanted a page showing what Shuttle saves over moving files by hand.',
    said: 'The comparison page is live and linked from the pricing page.',
  },
  'w-d4a96e3c27': {
    ask: 'Write to the trial teams that signed up and never started a move.',
    about: 'Lena wanted to reach the trial teams that signed up but never moved a file.',
    said: '212 teams got a two line note with a link straight to their first move. 31 of them have started one since.',
  },
  'w-d4c19a6b02': {
    ask: 'Write up the first team that moved, for the site.',
    about: 'Lena wanted a short story about the first team to move with Shuttle, for the site.',
    said: 'The story is up. 14 people moved 18,000 files and were done by lunch, and their lead says nothing went missing.',
  },
};

/** The end of the day `days` from today, local time, which is when a task due that day is late. */
export function endOfDayIn(now: number, days: number): number {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days + 1).getTime();
}

/** A day `days` from today as the due field writes it. */
export function dayIn(now: number, days: number): string {
  const d = new Date(endOfDayIn(now, days) - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function demoCards(now: number = Date.now()): DemoCard[] {
  const done = lastWorkingMorning(now);
  return [
    { by: THEO, threadId: 'w-c3a1e09d42', project: 'Shuttle', title: 'Sync engine rewrite for large moves', state: 'running', updatedAt: now - 12 * MIN, progress: 'Batches of 5,000 files instead of one queue\n60,000 file test finished in 41 minutes\nShared drives next' },
    { by: THEO, threadId: 'w-c3b27f8e15', project: 'Shuttle', title: 'Retries on a slow connection', state: 'done', updatedAt: done - 19 * HR, shippedAt: done - 19 * HR, progress: 'Retries three times, then says which file' },
    { by: THEO, threadId: 'w-c3c84a1f06', project: 'Shuttle', title: 'Permissions on shared drives', state: 'done', updatedAt: done - 15 * HR, shippedAt: done - 15 * HR, progress: 'Owners, editors and viewers carry across' },
    { by: THEO, threadId: 'w-c3d51b7e29', project: 'Shuttle', title: 'Faster listing of a Dropbox', state: 'done', updatedAt: done - 8 * HR, shippedAt: done - 8 * HR, progress: 'A 100,000 file Dropbox lists in 40 seconds, not 6 minutes' },
    { by: PRIYA, threadId: 'w-b2c4d0a873', project: 'Shuttle', title: 'Sign-up screens', state: 'done', updatedAt: done - 40 * MIN, progress: 'Drawn in light and dark\nWords sent to Jamie for a yes' },
    { by: PRIYA, threadId: 'w-b2d91e6c50', project: 'Shuttle', title: 'Empty states for the move list', state: 'running', updatedAt: now - 25 * MIN, progress: 'Four states drawn, two to go' },
    { by: PRIYA, threadId: 'w-b2e3f7a915', project: 'Website', title: 'Pricing page in dark mode', state: 'done', updatedAt: done - 17 * HR, shippedAt: done - 17 * HR, progress: 'Checked on a phone and a laptop' },
    { by: PRIYA, threadId: 'w-b2f60c4d18', project: 'Shuttle', title: 'Error messages in plain words', state: 'done', updatedAt: done - 11 * HR, shippedAt: done - 11 * HR, progress: 'All 23 rewritten, each says what to do next' },
    { by: PRIYA, threadId: 'w-b2a78e3f51', project: 'Shuttle', title: 'A progress bar for every move', state: 'done', updatedAt: done - 4 * HR, shippedAt: done - 4 * HR, progress: 'Shows files moved and time left' },
    { by: LENA, threadId: 'w-d4e8a2f617', project: 'Website', title: 'Launch email for the trial users', state: 'done', updatedAt: done - 1.3 * HR, progress: 'For all 4,000 trial users\nSent to Jamie to read' },
    { by: LENA, threadId: 'w-d4b37e0c84', project: 'Website', title: 'Welcome emails for new teams', state: 'running', updatedAt: now - 6 * MIN, progress: 'Three of the five emails written' },
    // The team's tasks: one late, one blocked on you, one ahead.
    { by: PRIYA, threadId: 'w-b2c07d5e94', project: 'Website', title: 'Screenshots for the launch email', state: 'running', updatedAt: now - 50 * MIN, progress: 'Two of the four taken', task: { from: LENA, dueInDays: -1 } },
    { by: LENA, threadId: 'w-d4e61f9a03', project: 'Website', title: 'Pricing page for the per-seat plan', state: 'waiting', updatedAt: now - 1.4 * HR, progress: 'Drafted both versions\nWaiting on the price from Jamie', task: { from: DEMO_ME, dueInDays: 1 }, blockedOn: DEMO_ME },
    { by: THEO, threadId: 'w-c3e95a2b70', project: 'Shuttle', title: 'Dates on shared drives', state: 'running', updatedAt: now - 30 * MIN, progress: 'Old dates carried through the new engine\nTesting on 40 shared drives', task: { from: DEMO_ME, dueInDays: 3 } },
    { by: LENA, threadId: 'w-d4f05c1b98', project: 'Website', title: 'Comparison page', state: 'done', updatedAt: done - 21 * HR, shippedAt: done - 21 * HR, progress: 'Live, linked from pricing' },
    { by: LENA, threadId: 'w-d4a96e3c27', project: 'Website', title: 'A note to trial teams that never started a move', state: 'done', updatedAt: done - 3 * HR, shippedAt: done - 3 * HR, progress: '212 teams, each sent a two line note' },
    { by: LENA, threadId: 'w-d4c19a6b02', project: 'Website', title: 'Story of the first team to move', state: 'done', updatedAt: done - 7 * HR, shippedAt: done - 7 * HR, progress: '14 people, 18,000 files, done by lunch' },
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

// The files the messages carry, and a document or two per project. Short on
// purpose: somebody in the room will start reading a long one.
const SIGN_UP_WORDS: DemoFile = {
  path: 'sign-up-screens.md',
  title: 'Sign-up screens',
  text: [
    '# Sign-up screens',
    '',
    'The words on the three screens after somebody signs up. Priya\'s drawings',
    'use these exactly.',
    '',
    '## 1. Where are your files now?',
    '',
    'Pick the Dropbox you are moving from. Shuttle only reads it. Nothing in it',
    'changes until you say so.',
    '',
    '## 2. Where should they go?',
    '',
    'Pick the Google Drive they should land in. Every folder arrives where',
    'you left it.',
    '',
    '## 3. Start your first move',
    '',
    'Most teams are done before lunch. You can close your laptop, and Shuttle',
    'picks up where it left off.',
  ].join('\n'),
};

const LAUNCH_EMAIL: DemoFile = {
  path: 'launch-email.md',
  title: 'Launch email',
  text: [
    '# Your whole Dropbox, moved by Friday',
    '',
    'Hi {first name},',
    '',
    'Shuttle now moves your whole team to Google Drive with every folder where',
    'you left it. Close your laptop halfway and the move picks up where it',
    'stopped.',
    '',
    'Start a move at shuttle.test/start. Most teams are done before lunch.',
    '',
    'Lena, for the Shuttle team',
  ].join('\n'),
};

export const DEMO_DOCS: Record<string, DemoFile[]> = {
  shuttle: [
    SIGN_UP_WORDS,
    {
      path: 'notes.md',
      title: 'Shuttle notes',
      text: [
        '# Shuttle',
        '',
        'Moves a team off Dropbox without losing a folder.',
        '',
        'The folder tree is the product. Everything else is speed, and speed is',
        'the second thing anybody asks about.',
        '',
        '## Open',
        '',
        '- A price. Per seat or one flat price per team.',
        '- Large moves stall in the sync engine. Theo is rewriting it.',
      ].join('\n'),
    },
  ],
  website: [LAUNCH_EMAIL],
};
