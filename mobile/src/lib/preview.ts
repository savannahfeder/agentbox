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
      thread('agentbox', { id: 'w-8b9c0d1e2f', title: 'Draw three versions of the inbox', status: 'blocked', priority: 5, body: roundAsk, note: roundNote, createdAt: at(70), updatedAt: at(9), wrote: { body: her(at(70)), status: agent(at(9)), note: agent(at(9)) } }, [
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
        cornerTag: true, diagnostics: true, adhdMode: true, alpha: { rooms: true }, outsideAgents: 'waiting',
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
    },
  };
}

const PREVIEW_TEAM = {
  team: { id: 't-preview', name: 'Astral' },
  members: [{ person_id: 'preview', role: 'owner' }, { person_id: 'p-2', role: 'member' }, { person_id: 'p-3', role: 'member' }],
  people: [{ id: 'preview', email: 'you@example.com', name: 'You' }, { id: 'p-2', email: 'sam@example.com', name: 'Sam Rivera' }, { id: 'p-3', email: 'kai@example.com', name: 'Kai Ito' }],
  invites: [{ email: 'lee@example.com' }],
};

/** A stand-in for the sign-in client (renderer/src/cloud-rest.ts), signed in. */
export function previewCloud(now = () => Date.now()) {
  const rows = previewRows(now());
  const settings = previewSettings(now());
  const team = { ...PREVIEW_TEAM, members: [...PREVIEW_TEAM.members], invites: [...PREVIEW_TEAM.invites] };
  let signedIn = true;
  // The Mac takes a change a moment later and sends its settings again.
  const takeSetting = (c: PhoneRows['commands'][number]) => setTimeout(() => {
    const { scope, key, value, product } = c.payload ?? {};
    const w: any = settings.settings.workspace;
    if (scope === 'project') Object.assign(settings.settings.projects.find((p) => p.slug === product) ?? {}, { [key]: value });
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
  const session = () => (signedIn ? { access_token: 'preview', refresh_token: 'preview', expires_at: now() + 3600_000, user: { id: 'preview', email: 'you@example.com' } } : null);
  return {
    session,
    signedIn: () => signedIn,
    generation: () => 0,
    async select(table: string, query: string) {
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
    async rpc() { return []; },
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
