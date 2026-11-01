// THE APP WITH NO ACCOUNT BEHIND IT, for drawing its screens in a browser
// (EXPO_PUBLIC_PREVIEW=1). Made-up threads in the shape a Mac sends, and a
// stand-in for the cloud that keeps what the phone sends in memory.
import type { PhoneRows } from '../../../renderer/src/phone-rows';
import { PREVIEW_ATTACHED, previewLink } from './preview-files.mjs';

const DEV = '0a1b2c3d4e5f';
const MIN = 60_000;
const her = (ts: number) => ({ ts, source: 'founder' });
const agent = (ts: number) => ({ ts, source: 'agent' });

export function previewRows(now = Date.now()): PhoneRows {
  const at = (m: number) => now - m * MIN;
  const iso = (ms: number) => new Date(ms).toISOString();
  const thread = (project: string, item: any, history: any[], extra: Record<string, unknown> = {}) => ({
    device: DEV, project, item: item.id, updated_at: iso(item.updatedAt),
    snapshot: { v: 3, item: { kind: 'directive', labels: ['founder'], priority: 0, ...item }, history: history.map((l) => ({ id: item.id, ...l })), olderLines: 0, ...extra },
  });
  const planAsk = 'Plan the phone app. I want alerts that reach my lock screen and a way to reply without opening the Mac.';
  const planResult = 'The plan is ready and Codex has reviewed it.\n\nThe first version signs you in, shows your inbox and lets you reply. Alerts come next, then messages between people.\n\n![The inbox on the phone](designs/w-1a2b3c4d5e/inbox.png)\n\n**Getting it approved** is mostly about two things: deleting an account has to delete what you shared, and messages need a report button.\n\n## Options\n1. Start building the first version (recommended)\n2. Wait until the Apple account is checked';
  // The files a Mac lists for a project, as main/phone-inbox.mjs sends them.
  const attached = PREVIEW_ATTACHED;
  const roundAsk = 'Draw three versions of the inbox for the phone.';
  const roundNote = "Three versions of the inbox are in the folder below. I'd go with the quiet one: it reads fastest at arm's length.\n\n~/docs/agentbox/designs/w-8b9c0d1e2f/\n\nWhat each one changes is in `designs/w-8b9c0d1e2f/inbox-versions.md`, and `designs/w-8b9c0d1e2f/compare.html` sets them side by side.\n\nThe walk-through is a short film: `designs/w-8b9c0d1e2f/walkthrough.mp4`\n\nThe full recording, `recordings/session.mov`, is too big for the phone.\n\n## Options\n1. Go with the quiet one (recommended)\n2. Try a fourth version";
  const stuckAsk = 'Threads stuck on a Codex limit should land in Needs you.';
  const stuckNote = 'I found where a run that hits its limit is put back. Two ways to fix it:\n\n- Mark it stopped, so it shows in Needs you with the reason.\n- Retry on another account first, and only then show it.\n\n## Options\n1. Mark it stopped (recommended)\n2. Retry on another account first';
  const meterResult = 'Shipped. Each account meter now ends with its reset time, like 6:19pm.\n\n## Options\n1. Close this task';
  const qualityNote = '**Sign-up fails on a slow connection.**\n\nOn a throttled connection the email step gives up after 10 seconds and the form clears what you typed. The fix keeps your words and waits 30 seconds.\n\n## Options\n1. Ship the fix (recommended)\n2. Show me the steps first';
  return {
    projects: [
      { device: DEV, project: 'agentbox', name: 'Agentbox', updated_at: iso(at(1)) },
      { device: DEV, project: 'film', name: 'Launch film', updated_at: iso(at(1)) },
      { device: DEV, project: 'site', name: 'Website', updated_at: iso(at(1)) },
    ],
    threads: [
      thread('agentbox', { id: 'w-1a2b3c4d5e', title: 'Plan the phone app', status: 'done', priority: 7, body: planAsk, result: planResult, createdAt: at(300), updatedAt: at(6), wrote: { body: her(at(300)), status: agent(at(6)), result: agent(at(6)) } }, [
        { ts: at(300), source: 'founder', patch: { body: planAsk } },
        { ts: at(120), source: 'agent', patch: { note: 'Read the phone site and the team messaging code. Checking what App Review asks of an app like this next.' } },
        { ts: at(6), source: 'agent', patch: { status: 'done', result: planResult } },
      ], { attached }),
      thread('agentbox', { id: 'w-2b3c4d5e6f', title: 'Stuck threads should land in Needs you', status: 'blocked', priority: 5, body: stuckAsk, note: stuckNote, createdAt: at(90), updatedAt: at(14), wrote: { body: her(at(90)), status: agent(at(14)), note: agent(at(14)) } }, [
        { ts: at(90), source: 'founder', patch: { body: stuckAsk } },
        { ts: at(14), source: 'agent', patch: { status: 'blocked', note: stuckNote } },
      ]),
      thread('agentbox', { id: 'w-8b9c0d1e2f', title: 'Draw three versions of the inbox', status: 'blocked', pinned: true, priority: 5, body: roundAsk, note: roundNote, createdAt: at(70), updatedAt: at(9), wrote: { body: her(at(70)), status: agent(at(9)), note: agent(at(9)) } }, [
        { ts: at(70), source: 'founder', patch: { body: roundAsk } },
        { ts: at(9), source: 'agent', patch: { status: 'blocked', note: roundNote } },
      ], { attached }),
      thread('site', { id: 'w-3c4d5e6f7a', title: 'Show when each account limit resets', status: 'done', priority: 0, body: 'I need to see when my limits reset.', result: meterResult, createdAt: at(200), updatedAt: at(52), wrote: { body: her(at(200)), status: agent(at(52)), result: agent(at(52)) } }, [
        { ts: at(200), source: 'founder', patch: { body: 'I need to see when my limits reset.' } },
        { ts: at(52), source: 'agent', patch: { status: 'done', result: meterResult } },
      ]),
      thread('agentbox', { id: 'w-4d5e6f7a8b', title: 'Draw the sign-in screen', status: 'claimed', priority: 5, body: 'Draw five sign-in screens on the real app.', createdAt: at(40), updatedAt: at(2), wrote: { body: her(at(40)) } }, [
        { ts: at(40), source: 'founder', patch: { body: 'Draw five sign-in screens on the real app.' } },
      ], {
        live: { since: at(12), at: at(0.5), where: 'cloud', doing: [{ label: 'Read the sign-in page', startedAt: at(9) }, { label: 'Wrote the five screens', startedAt: at(6) }, { label: 'Ran the screenshot script', startedAt: at(3) }, { label: 'Drawing the third screen', startedAt: at(1) }] },
        // A permission it is waiting on, as main/phone-inbox.mjs sends one (shared/phone-snapshot.mjs `phoneApproval`).
        approvals: [{ id: 'ap-preview-1', at: at(1), tool: 'Bash', input: { command: 'npx eas-cli init --non-interactive', description: 'Link this folder to the Expo project' }, card: 'cHJldmlldy1jYXJk' }],
      }),
      // Two threads the phone plan filed: one waiting on you, one finished.
      thread('agentbox', { id: 'w-a1b2c3d4e6', parent: 'w-1a2b3c4d5e', labels: [], title: 'Add a report button to messages', status: 'open', priority: 5, body: 'App Review asks that people can report a message. Add a Report row to the message menu that files it for review.', createdAt: at(5), updatedAt: at(5), wrote: { body: agent(at(5)) } }, [
        { ts: at(5), source: 'agent', patch: { body: 'App Review asks that people can report a message. Add a Report row to the message menu that files it for review.' } },
      ]),
      thread('agentbox', { id: 'w-b2c3d4e5f7', parent: 'w-1a2b3c4d5e', labels: [], title: 'Check what App Review asks of a messaging app', status: 'done', priority: 5, body: 'Read the App Review rules for apps where people message each other.', result: 'Two rules apply: a way to report a message, and a way to block someone.', createdAt: at(110), updatedAt: at(80), wrote: { body: agent(at(110)), status: agent(at(80)), result: agent(at(80)) } }, [
        { ts: at(110), source: 'agent', patch: { body: 'Read the App Review rules for apps where people message each other.' } },
        { ts: at(80), source: 'agent', patch: { status: 'done', result: 'Two rules apply: a way to report a message, and a way to block someone.' } },
      ]),
      // A conversation long enough that its middle is left out, put off after its answer.
      thread('agentbox', { id: 'w-c3d4e5f6a8', title: 'Move the inbox to the cloud', status: 'open', priority: 5, body: 'Move the inbox to the cloud, one table at a time.', result: 'All four tables are in the cloud and the Mac reads them from there.', snoozedUntil: now + 26 * 60 * MIN, createdAt: at(2400), updatedAt: at(28), wrote: { body: her(at(2400)), result: agent(at(30)), snoozedUntil: her(at(28)) } }, [
        { ts: at(2400), source: 'founder', patch: { body: 'Move the inbox to the cloud, one table at a time.' } },
        ...Array.from({ length: 24 }, (_, n) => [
          { ts: at(2300 - n * 90), source: 'agent', patch: { note: `Step ${n + 1} is done. Next it moves ${['the rows', 'the commands', 'the files', 'the alerts'][n % 4]}.` } },
          { ts: at(2255 - n * 90), source: 'founder', patch: { answer: `Good, carry on with step ${n + 2}.` } },
        ]).flat(),
        { ts: at(30), source: 'agent', patch: { result: 'All four tables are in the cloud and the Mac reads them from there.' } },
        { ts: at(28), source: 'founder', patch: { snoozedUntil: now + 26 * 60 * MIN } },
      ]),
      thread('film', { id: 'w-5e6f7a8b9c', title: 'Write the launch script', status: 'open', priority: 0, body: 'A script for the launch film.', answer: 'Shorter, and open with the inbox.', createdAt: at(500), updatedAt: at(25), wrote: { body: her(at(500)), answer: her(at(25)), result: agent(at(60)) }, result: 'Here is a first draft.' }, [
        { ts: at(500), source: 'founder', patch: { body: 'A script for the launch film.' } },
        { ts: at(60), source: 'agent', patch: { result: 'Here is a first draft.' } },
        { ts: at(25), source: 'founder', patch: { answer: 'Shorter, and open with the inbox.' } },
      ], {
        approvals: [{ id: 'ap-preview-2', at: at(0.5), tool: 'Bash', input: { command: 'ffmpeg -i draft.mov -vf scale=1080:-2 draft-1080.mp4', description: 'Make a 1080p copy of the draft', cwd: '~/dev/launch-film' }, card: 'cHJldmlldy1jYXJkLTI' }],
      }),
      thread('site', { id: 'w-6f7a8b9c0d', title: 'Try a light theme for the phone', status: 'open', priority: 0, body: 'Try a light theme.', snoozedUntil: now + 20 * 60 * MIN, createdAt: at(800), updatedAt: at(700), wrote: { body: her(at(800)), snoozedUntil: her(at(700)) } }, [
        { ts: at(800), source: 'founder', patch: { body: 'Try a light theme.' } },
      ]),
      // Two runs of the daily report (previewSettings' repeating tasks): one quiet, one with news.
      thread('agentbox', { id: 'w-r1a2b3c4d5', title: 'Daily report', labels: ['repeat:r-preview-1', 'clean'], status: 'done', priority: 5, body: 'Write the daily report.', result: 'Nothing new since yesterday.', createdAt: at(26 * 60), updatedAt: at(26 * 60 - 6), wrote: { status: agent(at(26 * 60 - 6)) } }, []),
      thread('agentbox', { id: 'w-r2b3c4d5e6', title: 'Daily report', labels: ['repeat:r-preview-1'], status: 'done', priority: 5, body: 'Write the daily report.', result: 'Two sign-ups failed at the email step. The fix is in its own thread.', createdAt: at(120), updatedAt: at(112), wrote: { status: agent(at(112)) } }, []),
      // Two teammates' runs (previewTeammates): one waiting on you, signed; one working.
      thread('agentbox', { id: 'w-t2b3c4d5e6', title: 'Try sign-up the way a new user would', labels: ['founder', 'teammate:t-quality001'], status: 'blocked', priority: 5, body: 'Try sign-up the way a new user would, on a slow connection.', note: qualityNote, createdAt: at(45), updatedAt: at(30), wrote: { body: agent(at(45)), status: agent(at(30)), note: agent(at(30)) } }, [
        { ts: at(45), source: 'agent', patch: { body: 'Try sign-up the way a new user would, on a slow connection.' } },
        { ts: at(30), source: 'agent', patch: { status: 'blocked', note: qualityNote } },
      ]),
      thread('film', { id: 'w-t1a2b3c4d5', title: 'Cut the launch film to 60 seconds', labels: ['founder', 'teammate:t-launch0001'], status: 'claimed', priority: 5, body: 'Cut the launch film to 60 seconds. Open on the inbox.', createdAt: at(21), updatedAt: at(1), wrote: { body: agent(at(21)) } }, [
        { ts: at(21), source: 'agent', patch: { body: 'Cut the launch film to 60 seconds. Open on the inbox.' } },
      ], { live: { since: at(20), at: at(0.5), where: 'mac', doing: [{ label: 'Trimmed the middle', startedAt: at(8) }, { label: 'Rendering the 60-second cut', startedAt: at(2) }] } }),
      thread('agentbox', { id: 'w-7a8b9c0d1e', title: 'Rename the Display menu', status: 'done', priority: 0, body: 'Rename it to View.', result: 'Renamed.', createdAt: at(3000), updatedAt: at(1500), wrote: { body: her(at(3000)), result: agent(at(1600)), status: her(at(1500)) } }, [
        { ts: at(3000), source: 'founder', patch: { body: 'Rename it to View.' } },
        { ts: at(1600), source: 'agent', patch: { result: 'Renamed.' } },
      ]),
    ],
    // A reply to the running agent its Mac has not taken yet.
    commands: [{ id: 'c-preview-1', device: DEV, project: 'agentbox', item: 'w-4d5e6f7a8b', kind: 'reply', payload: { text: 'Use the dark wall on all five.' }, created_at: iso(at(0.4)), claimed_at: null, taken_at: null, outcome: null }],
  };
}

/** Settings as a Mac sends them (shared/phone-settings.mjs phoneSettingsOf). */
export function previewSettings(now = Date.now()) {
  return {
    device: DEV, name: 'Studio', updated_at: new Date(now - MIN).toISOString(),
    settings: {
      v: 1, version: '0.9.4',
      workspace: {
        cornerTag: true, diagnostics: true, adhdMode: true, alpha: { rooms: true, teammates: true }, outsideAgents: 'waiting',
        permission: 'auto', codexMode: 'auto', engines: ['claude', 'codex'], claude: { found: true }, codex: { found: true },
        agentsAuto: true, sessionsAtOnce: 4, agentsTotal: 6, agentsAutoTotal: 6, agentsNudge: 0, slotsMax: 12, slotsSuggested: 6, running: 3,
        memoryGate: { on: true, slots: null, slotsAuto: 2, slotsMax: 8, now: 'Memory is fine. Nothing heavy running.' },
        leftovers: { on: false, now: null },
        accounts: [
          { id: 'default', email: 'you@example.com', chosen: false, state: 'live', note: null, plan: 'Max 20x', running: 2 },
          { id: '.claude-work', email: 'you@work.example', chosen: false, state: 'limited', note: 'Out of usage until 6:19pm.', plan: 'Max 5x', running: 1 },
        ],
        codexAccounts: [{ id: 'default', email: 'you@example.com', name: 'You', plan: 'Plus', signedIn: true, chosen: false }],
      },
      projects: [
        { slug: 'agentbox', name: 'Agentbox', onPhone: true, autonomous: true, permission: 'workspace', codexMode: 'workspace', account: 'any', running: 2 },
        { slug: 'film', name: 'Launch film', onPhone: true, autonomous: false, permission: 'plan', codexMode: 'workspace', account: 'any', running: 1 },
        { slug: 'site', name: 'Website', onPhone: true, autonomous: false, permission: 'workspace', codexMode: 'workspace', account: 'any', running: 0 },
      ],
      // The repeating tasks a Mac sends with its settings (shared/phone-snapshot.mjs phoneRepeatsOf).
      repeats: [
        { product: 'agentbox', id: 'r-preview-1', title: 'Daily report', body: 'Write the daily report: sign-ups, failed runs, and anything that needs me. Say "nothing new" if nothing changed.', priority: 5, every: 'weekday', at: '09:00', createdAt: now - 9 * 24 * 60 * MIN, served: '', lastOccurrence: 'w-r2b3c4d5e6' },
        { product: 'site', id: 'r-preview-2', title: 'Check the launch page numbers', body: 'Check the launch page numbers and tell me what moved.', priority: 5, every: 'week', on: 4, at: '08:00', createdAt: now - 20 * 24 * 60 * MIN, served: '' },
      ],
      teammates: previewTeammates(now),
    },
  };
}

/** Your AI teammates as a Mac sends them (shared/phone-snapshot.mjs phoneTeammatesOf). Every name is made up. */
export function previewTeammates(now = Date.now()) {
  const at = (m: number) => now - m * MIN;
  const morning = new Date(now).setHours(9, 0, 0, 0);
  const mate = (id: string, name: string, letter: string, more: Record<string, unknown> = {}) => ({
    id, name, letter, role: null, job: null, primary: false, paused: false, status: 'active', product: 'agentbox', engine: 'claude', model: 'opus',
    now: null, queued: 0, runsThisWeek: 3, worksLabel: null, createdAt: at(14 * 24 * 60), running: null, waiting: [], duties: [], ...more,
  });
  return {
    list: [
      mate('t-chief00001', 'Chief of staff', 'C', {
        primary: true, runsThisWeek: 6, job: 'Be the one I talk to. Take whatever I send, hand it to the teammate whose job it is, and check in each weekday with what needs me.',
        duties: [{ id: 'd-1', what: 'Check in with what needs you', when: 'Weekdays at 9am' }],
      }),
      mate('t-launch0001', 'Launch lead', 'L', { product: 'film', now: 'Cut the launch film to 60 seconds', running: { id: 'w-t1a2b3c4d5', product: 'film', title: '' } }),
      mate('t-quality001', 'Quality lead', 'Q', { now: 'Waiting on you', waiting: [{ id: 'w-t2b3c4d5e6', product: 'agentbox', title: 'Sign-up fails on a slow connection' }] }),
      mate('t-growth0001', 'Growth lead', 'G', { paused: true, product: 'site', runsThisWeek: 0 }),
    ],
    chat: [
      { id: 'm-p1', kind: 'msg', from: 'you', to: ['t-chief00001'], text: 'Keep an eye on the launch and tell me only what needs me.', ts: at(26 * 60) },
      { id: 'm-p2', kind: 'msg', from: 't-chief00001', to: ['you'], text: 'Will do. I will check in each weekday at 9 with what is waiting on you, most urgent first.', ts: at(26 * 60 - 1) },
      { id: 'm-p3', kind: 'act', from: 't-chief00001', verb: 'learned', text: 'Keeps check-ins short', ts: at(26 * 60 - 2) },
      { id: 'm-p4', kind: 'pass', from: 't-chief00001', to: 't-launch0001', title: 'Cut the launch film to 60 seconds', ts: Math.min(morning + 2 * MIN, at(40)) },
      { id: 'm-p5', kind: 'msg', from: 't-chief00001', to: ['you'], text: 'Morning check-in.\n\n- **Quality lead** found sign-ups failing on a slow connection. The fix needs your yes.\n- **Launch lead** is cutting the film to 60 seconds.\n\nNothing else needs you.', ts: Math.min(morning, at(42)) },
      { id: 'm-p6', kind: 'msg', from: 't-chief00001', to: ['you'], text: 'One question for the film: should it open on the inbox or on the phone?', options: ['The inbox', 'The phone'], ts: at(12) },
    ],
    runs: [
      { id: 'run-p1', kind: 'run', teammate: 't-chief00001', item: 'w-t3c4d5e6f7', product: 'agentbox', title: 'Write the morning check-in', verb: 'finished', ts: Math.min(morning + MIN, at(41)) },
      { id: 'run-p2', kind: 'run', teammate: 't-quality001', item: 'w-t2b3c4d5e6', product: 'agentbox', title: 'Sign-up fails on a slow connection', verb: 'sent', waiting: true, ts: at(30) },
      { id: 'run-p3', kind: 'run', teammate: 't-launch0001', item: 'w-t1a2b3c4d5', product: 'film', title: 'Cut the launch film to 60 seconds', verb: 'picked', ts: at(20) },
    ],
  };
}

const PREVIEW_TEAM = {
  team: { id: 't-preview', name: 'Astral' },
  members: [{ person_id: 'preview', role: 'owner' }, { person_id: 'p-2', role: 'member' }, { person_id: 'p-3', role: 'member' }],
  people: [{ id: 'preview', email: 'you@example.com', name: 'You' }, { id: 'p-2', email: 'sam@example.com', name: 'Sam Rivera' }, { id: 'p-3', email: 'kai@example.com', name: 'Kai Ito' }],
  invites: [{ email: 'lee@example.com' }],
};

/** Groups as the cloud keeps them (20261021000000_rooms.sql), for the Groups tab. Every name is made up. */
export function previewGroups(now = Date.now()) {
  const iso = (ms: number) => new Date(ms).toISOString();
  const at = (m: number) => iso(now - m * MIN);
  const yesterday = new Date(now).setHours(0, 0, 0, 0) - 7 * 60 * MIN;
  const rooms = [
    { id: 'r-team', name: 'Astral', kind: 'room', team_id: 't-preview', listed: false, invite_only: false, role: 'member', members: 3, created_at: at(90 * 24 * 60) },
    { id: 'r-launch', name: 'Launch week', kind: 'room', team_id: null, listed: false, invite_only: false, role: 'owner', members: 4, created_at: at(9 * 24 * 60) },
    { id: 'r-maya', name: 'Maya C.', kind: 'group', team_id: null, listed: false, invite_only: false, role: 'owner', members: 2, created_at: at(3 * 24 * 60) },
  ];
  const members: Record<string, string[]> = { 'r-team': ['preview', 'p-2', 'p-3'], 'r-launch': ['preview', 'p-2', 'p-4', 'p-5'], 'r-maya': ['preview', 'p-4'] };
  const profile = (id: string, name: string, extra: Record<string, unknown> = {}) => ({ person_id: id, display_name: name, avatar_url: null, show_working: 'everyone', show_agents: true, show_level: true, show_status: true, ...extra });
  const profiles = [
    profile('preview', 'Ada L.'), profile('p-2', 'Sam R.'), profile('p-3', 'Kai I.', { show_working: 'team' }),
    profile('p-4', 'Maya C.'), profile('p-5', 'Lee P.', { status_text: 'In interviews until 3' }),
  ];
  const presence = [
    ['preview', 2, 'Plan the phone app', 410], ['p-2', 2, 'Draw the sign-in screen', 640], ['p-3', 1, null, 95], ['p-4', 3, 'Cut the launch film to 60 seconds', 1900], ['p-5', 0, null, 30],
  ].map(([id, agents, on, hours]) => ({ person_id: id, device: 'a1b2c3d4e5f6', agents_running: agents, working_on: on, working_private: false, working_at: at(4), hours_total: hours, updated_at: at(1) }));
  let n = 0;
  const msg = (room: string, by: string, when: string, body: string, extra: Record<string, unknown> = {}) =>
    ({ id: `gm-${++n}`, room_id: room, by_person: by, body, in_reply_to: null, mentions: [], created_at: when, edited_at: null, deleted_at: null, ...extra });
  const messages = [
    msg('r-team', 'p-2', iso(yesterday), 'Pushed the new sign-in screens. Five versions in the designs folder.'),
    msg('r-team', 'preview', iso(yesterday + 4 * MIN), 'Looking now. The quiet one reads best on a phone.'),
    msg('r-team', 'p-3', at(52), 'The login meter shows the reset time now. Can someone check it on a Max account?'),
    msg('r-team', 'p-2', at(49), 'On it.'),
    msg('r-team', 'preview', at(31), 'Morning. I am moving the inbox to the cloud today, one table at a time.'),
    msg('r-team', 'p-3', at(12), 'Nice. Shout if the phone commands table gets in your way, I touched it last week.'),
    msg('r-team', 'p-2', at(4), 'Sign-in screen is down to two. @Ada L. which do you want?', { mentions: ['preview'] }),
    msg('r-launch', 'p-4', at(300), 'First cut of the film is up. Ninety seconds, needs to be sixty.'),
    msg('r-launch', 'p-5', at(240), 'Open on the inbox, not the logo.'),
    msg('r-launch', 'preview', at(200), 'Agreed. And end on the phone.'),
    msg('r-launch', 'p-4', at(18), 'Sixty-second cut is rendering now.'),
    msg('r-maya', 'p-4', at(140), 'Can I borrow your voice for the last line of the film?'),
    msg('r-maya', 'preview', at(132), 'Yes. Send me the line.'),
  ];
  const sentence = messages.find((m) => m.body.startsWith('The login meter'))!;
  messages.push(msg('r-team', 'p-2', at(47), 'Checked: it says 6:19pm, which is right.', { in_reply_to: sentence.id }));
  messages.push(msg('r-team', 'p-3', at(46), 'Thanks.', { in_reply_to: sentence.id }));
  const reads = [{ room_id: 'r-team', read_at: at(20) }, { room_id: 'r-launch', read_at: at(100) }, { room_id: 'r-maya', read_at: at(130) }];
  messages.push(msg('r-launch', 'p-4', at(16), 'Here is the frame I mean. ![The opening frame](attachments/opening-frame.png)\n\nThe notes are in [cut-notes.pdf](attachments/cut-notes.pdf).'));
  const cards = [
    { person_id: 'p-3', thread_id: 'w-card-1', title: 'Fix the login meter', project: 'Agentbox', state: 'running', priority: 5, problem: 'The meter shows the wrong reset time on Max accounts.', progress: 'Found where the time is read.', solution: null, visible: true, updated_at: at(10) },
    { person_id: 'p-2', thread_id: 'w-card-2', title: 'Pick the sign-in screen', project: 'Website', state: 'waiting', priority: 5, problem: 'Two sign-in screens are left.', progress: null, solution: null, visible: true, updated_at: at(25) },
  ];
  const names: Record<string, string> = { preview: 'Ada Lovelace', 'p-2': 'Sam Rivera', 'p-3': 'Kai Ito', 'p-4': 'Maya Chen', 'p-5': 'Lee Park' };
  return {
    rpc(name: string, args: Record<string, any>) {
      if (name === 'my_rooms') return rooms;
      if (name === 'room_people') return members[args.r] ?? [];
      if (name === 'room_names') return (members[args.r] ?? []).map((id) => ({ person_id: id, name: profiles.find((p) => p.person_id === id)?.display_name ?? names[id], avatar_url: null, has_card: true }));
      if (name === 'mark_room_read') { const r = reads.find((x) => x.room_id === args.r); if (r && args.at > r.read_at) r.read_at = args.at; return null; }
      return [];
    },
    select(table: string, query: string) {
      const q = new URLSearchParams(query);
      if (table === 'room_profiles') return profiles;
      if (table === 'room_presence') return presence;
      if (table === 'room_reads') return reads;
      if (table === 'thread_cards') return cards;
      // A small drawing of a screen, as a stored file comes back.
      if (table === 'room_files') return [{ data: 'iVBORw0KGgoAAAANSUhEUgAAADAAAAAkCAIAAABAJy5dAAAAXElEQVR42u3VsQ0AEBBAUWNYQcRORlGoLKqQsIJGIdpDJH7y68srLnfKWfNUChAgQIBGreSjAQIEiDsESApKMQibp1WvlwBtB+0N0AWQfIfmAF0A8ToAAQL0K6gDciTequifOckAAAAASUVORK5CYII=' }];
      if (table !== 'room_messages') return null;
      let rows = [...messages];
      const room = q.get('room_id')?.slice(3);
      if (room) rows = rows.filter((m) => m.room_id === room);
      if (q.get('mentions')) rows = rows.filter((m) => (m.mentions as string[]).includes('preview'));
      const when = q.get('created_at');
      if (when?.startsWith('gt.')) rows = rows.filter((m) => m.created_at > when.slice(3));
      if (when?.startsWith('lt.')) rows = rows.filter((m) => m.created_at < when.slice(3));
      return rows.sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, Number(q.get('limit') ?? 200));
    },
    send(row: Record<string, any>) {
      const made = msg(row.room_id, 'preview', new Date().toISOString(), row.body, { in_reply_to: row.in_reply_to ?? null, mentions: row.mentions ?? [] });
      messages.push(made);
      return made;
    },
  };
}

/** A stand-in for the sign-in client (renderer/src/cloud-rest.ts), signed in. */
export function previewCloud(now = () => Date.now()) {
  const rows = previewRows(now());
  // `?scene=clear` draws an empty inbox, `?scene=connect` an account no computer has joined, `?scene=signed-out` the sign-in page.
  const scene = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('scene');
  if (scene === 'clear' || scene === 'connect') { rows.threads = []; rows.commands = []; }
  if (scene === 'connect') rows.projects = [];
  // `?scene=queued`: a reply on a thread nothing is running, which reads Queued.
  if (scene === 'queued') rows.commands.push({ id: 'c-preview-q', device: DEV, project: 'film', item: 'w-5e6f7a8b9c', kind: 'reply', payload: { text: 'Open on the inbox.' }, created_at: new Date(now() - 30_000).toISOString(), claimed_at: null, taken_at: null, outcome: null } as PhoneRows['commands'][number]);
  let signedIn = scene !== 'signed-out';
  const settings = previewSettings(now());
  const team = { ...PREVIEW_TEAM, members: [...PREVIEW_TEAM.members], invites: [...PREVIEW_TEAM.invites] };
  // The Mac takes a change a moment later and sends its settings again.
  const takeSetting = (c: PhoneRows['commands'][number]) => setTimeout(() => {
    const { scope, key, value, product } = c.payload ?? {};
    const w: any = settings.settings.workspace;
    const repeats: any[] = (settings.settings as any).repeats;
    const mates: any = (settings.settings as any).teammates;
    if (scope === 'teammate' && key === 'post') {
      mates.chat.push({ id: `m-${c.id}`, kind: 'msg', from: 'you', to: value.to, text: value.text, ...(value.answers ? { answers: value.answers } : {}), ts: now() });
      // The teammate answers a moment later, as a run of it would.
      setTimeout(() => {
        mates.chat.push({ id: `m-${c.id}-r`, kind: 'msg', from: value.to[0], to: ['you'], text: 'Got it. I will tell you when it is done.', ts: now() });
        settings.updated_at = new Date(now()).toISOString();
      }, 4000);
    } else if (scope === 'teammate' && key === 'describe') {
      mates.list.push({ id: `t-${c.id}`, name: 'New teammate', letter: 'N', role: null, job: value.text ?? value.starter, primary: false, paused: false, status: 'draft', product: value.product, waiting: [], running: null, duties: [], runsThisWeek: 0 });
    } else if (scope === 'thread') { const t = rows.threads.find((r) => r.project === product && r.item === c.payload.item); if (t) { t.snapshot.item.pinned = value || undefined; t.updated_at = new Date(now() + 1).toISOString(); } }
    else if (scope === 'repeat' && key === 'end') (settings.settings as any).repeats = repeats.filter((r) => !(r.product === product && r.id === c.payload.id));
    else if (scope === 'repeat' && key === 'change') Object.assign(repeats.find((r) => r.product === product && r.id === c.payload.id) ?? {}, value);
    else if (scope === 'repeat' && key === 'new') repeats.push({ product, id: `r-${c.id}`, priority: 5, createdAt: now(), served: '', ...value });
    else if (scope === 'project') Object.assign(settings.settings.projects.find((p) => p.slug === product) ?? {}, { [key]: value });
    else if (key === 'alphaRooms') w.alpha.rooms = value;
    else if (key === 'memoryGate') w.memoryGate.on = value;
    else if (key === 'memoryGateSlots') w.memoryGate.slots = value;
    else if (key === 'cleanupLeftovers') w.leftovers.on = value;
    else if (key === 'sessionsAtOnce') Object.assign(w, { sessionsAtOnce: value, agentsAuto: false });
    else if (key === 'activeAccount') (value.engine === 'codex' ? w.codexAccounts : w.accounts).forEach((a: any) => { a.chosen = a.id === value.account; });
    else if (key === 'phoneProjects') settings.settings.projects.forEach((p) => { p.onPhone = value.all && !value.except.includes(p.slug); });
    else if (key !== 'agentsFeltSlow') w[key] = value;
    Object.assign(c, { taken_at: new Date(now()).toISOString(), outcome: 'done' });
    settings.updated_at = new Date(now()).toISOString();
  }, 1500);
  const devices = new Map<string, Record<string, any>>();
  const groups = previewGroups(now());
  const session = () => (signedIn ? { access_token: 'preview', refresh_token: 'preview', expires_at: now() + 3600_000, user: { id: 'preview', email: 'you@example.com' } } : null);
  return {
    session,
    signedIn: () => signedIn,
    generation: () => 0,
    async select(table: string, query: string) {
      const group = groups.select(table, query);
      if (group) return group;
      if (table === 'phone_projects') return rows.projects;
      if (table === 'phone_threads') return rows.threads;
      if (table === 'phone_commands') return /taken_at=is\.null/.test(query) ? rows.commands.filter((c) => !c.taken_at) : rows.commands.filter((c) => c.taken_at);
      if (table === 'phone_settings') return [structuredClone(settings)];
      if (table === 'team_members') return /person_id=eq/.test(query) ? [{ team_id: team.team.id }] : team.members;
      if (table === 'teams') return [team.team];
      if (table === 'people') return team.people.filter((p) => team.members.some((m) => m.person_id === p.id));
      if (table === 'team_invites') return team.invites;
      return [];
    },
    async insert(table: string, row: Record<string, any>) {
      if (table === 'room_messages') return groups.send(row);
      if (table === 'team_invites' && !team.invites.some((i) => i.email === row.email)) team.invites.push({ email: row.email });
      return row;
    },
    async upsert(table: string, row: Record<string, any>) {
      if (table === 'push_devices') devices.set(row.token, row);
      return row;
    },
    async remove(table: string, query: string) {
      const eq = (k: string) => decodeURIComponent(new RegExp(`${k}=eq\\.([^&]+)`).exec(query)?.[1] ?? '');
      if (table === 'push_devices') devices.delete(eq('token'));
      if (table === 'team_invites') team.invites = team.invites.filter((i) => i.email !== eq('email'));
      if (table === 'team_members') { const gone = team.members.filter((m) => m.person_id === eq('person_id')); team.members = team.members.filter((m) => m.person_id !== eq('person_id')); return gone; }
      return [];
    },
    async rpc(name: string, args: Record<string, any> = {}) { return groups.rpc(name, args); },
    async listFiles() { return []; },
    async removeFiles() {},
    async update(_table: string, query: string, patch: Record<string, unknown>) {
      const id = decodeURIComponent(/id=eq\.([^&]+)/.exec(query)?.[1] ?? '');
      const at = rows.commands.findIndex((c) => c.id === id && !c.taken_at && !c.claimed_at);
      if (at < 0) return [];
      rows.commands[at] = { ...rows.commands[at], ...patch } as PhoneRows['commands'][number];
      return [rows.commands[at]];
    },
    async signFiles(_bucket: string, paths: string[]) {
      return new Map(paths.map((p) => [p, previewLink(p.slice(p.lastIndexOf('/') + 1))]));
    },
    async insertCommand(row: Record<string, any>) {
      const made = { id: `c-${rows.commands.length + 1}`, payload: {}, item: null, ...row, created_at: new Date(now()).toISOString(), claimed_at: null, taken_at: null, outcome: null } as PhoneRows['commands'][number];
      rows.commands.push(made);
      if (made.kind === 'setting') takeSetting(made);
      return made;
    },
    async signInWithPassword() { signedIn = true; return session()!; },
    async signInWithIdToken() { signedIn = true; return session()!; },
    async signUp() { signedIn = true; return { confirm: false }; },
    async putFile() {},
    async googleUrl() { return ''; },
    async finishGoogle() { signedIn = true; return session()!; },
    signOut() { signedIn = false; },
  };
}
