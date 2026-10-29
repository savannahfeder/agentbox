import { artifactSampleChange, artifactSampleNotes, reviewSampleChange } from './artifact-fixtures';
import {updateFixture} from './agent-update-fixture';
// One seam between the UI and the world. Real mode talks to the preload
// bridge; fixtures mode (?fixtures=1) serves canned data so the UI can be
// developed, reviewed, and screenshotted without a live store or any agents.

import type { AccountUsageReading, AgentConversation, CloudPlan, AnswerMode, CodexModeId, DemoOpened, FolderListing, FreshUser, PermissionMode, PhoneLink, PhoneRoute, RepeatRule, RepeatShape, RoomsResult, Settings, Snapshot, TeammatesResult, TeamCallResult, TeamMessageFile, ThreadEditPatch, UpdateState, Usage, UsageLimit, WorkItem } from './types';
import type { LedgerLine } from './thread-history';
import type { AgentFile as AgentFileRow } from './onboarding';
import type { AgentFolder, SessionThread } from './agent-import-card';
import type { EngineSetupState } from './plan-setup';
import { fixtureAgents, fixtureSnapshot, fixtureDashboards, fixtureRepeats, fixtureRuns, fixtureMock, fixtureMockDashboards, fixtureTraces, fixtureHistory, fixtureSettings, fixtureConversation, fixtureAgentFiles, fixtureSessionThreads, fixtureSearchableThreads } from './fixtures';
import { fixtureEngineWorld, fixtureEngineSettings, fixtureSecondEngine } from './fixtures';
import { fixtureFolders } from './fixtures';
import { NAME, Name } from '../../shared/product-name.mjs';
import { checkProjectFolder } from '../../shared/project-folder-check.mjs';
import { whileSystemWindowIsOpen } from './system-window';
import { USAGE_UNREADABLE } from '../../shared/usage.mjs';
import { accountSentence } from '../../shared/spawn-trouble.mjs';
import { MOVE_SAY } from '../../shared/where-it-runs-from.mjs';
import { cardsInFront } from '../../shared/which-card-is-in-front.mjs';
// THE SECOND FRONT DOOR, AND IT HAS TO BE BUILT BEFORE THE LINE BELOW RUNS.
// `useFixtures` reads `window.zero` once, at module load, and on the desktop
// preload.cjs has already put it there. In a browser tab nothing has, so this
// builds the same object out of http first. Imports are evaluated before the
// body that imports them, so calling it here means no other file has to
// remember to, and no import order anywhere can get it wrong.
import { installBrowserBridge } from './browser-bridge';
import { installCloudBridge } from './cloud-bridge';

// The Mac's own page first; the phone with the Mac shut only on its own site.
if (!installBrowserBridge()) installCloudBridge();

// A team call, in words: a build or a window with no team door says so rather
// than throwing somewhere the person cannot see. Below the bridge's install,
// like every other read of window.zero in this file.
async function teamCall(fn: () => Promise<TeamCallResult>): Promise<TeamCallResult> {
  if (!window.zero?.teamSignIn) return { ok: false, error: 'This build has no team cloud set up.' };
  try { return await fn(); } catch (err) { return { ok: false, error: String((err as Error)?.message ?? err) }; }
}

// READ SAFELY, BECAUSE THIS MODULE IS NOW REACHED FROM A COMPONENT THE TESTS
// RENDER WITHOUT A WINDOW. The walk's last card is <ImportAgents> now, so
// importing Onboarding.tsx imports this file, and two suites draw the whole
// walk through react-dom/server where `location` does not exist. It threw on
// the import rather than on a call, which fails a file before a single test in
// it runs.
const search = typeof location === 'undefined' ? '' : location.search;
const params = new URLSearchParams(search);
const modelUpdateFixture=updateFixture(params.get('modelUpdates')==='fail',['claude','codex'].includes(params.get('modelUpdates')??'')?params.get('modelUpdates'):null);
const useFixtures = params.has('fixtures') || typeof window === 'undefined' || !window.zero;
const emptyFixtures = params.get('fixtures') === 'empty';
// ?working=3 puts three running agents into ?fixtures=empty. The empty
// fixture has an empty inbox AND an empty fleet, and the app draws nothing
// at all when no agent is working, so there is no way to photograph
// "Three agents working." without this.
// The number is hers to pass; nothing else about the fixture changes.
const workingFixtures = Math.max(0, Math.min(99, Number(params.get('working') ?? 0) || 0));
// ?waiting=2 puts two threads in Needs you with nothing running, which is
// where a first task sits once its agent has finished and asked a question.
// Without it the In progress tab's empty line, all of F-142, cannot be
// photographed: the empty fixture has no inbox and the full one is never idle.
const waitingFixtures = Math.max(0, Math.min(99, Number(params.get('waiting') ?? 0) || 0));
// ?fixtures=crowded reproduces a real crowded picker: twenty two projects,
// duplicates and scratch included. That is the only shape where the composer's
// chips WRAP, and ranking-by-dragging was written against a single row, so it
// silently did nothing across rows. This is the case that catches that.
const crowdedFixtures = params.get('fixtures') === 'crowded';
// The thread on screen, in fixtures only: see `lookingAt` below.
let fixtureLooking: { product: string | null; id: string } | null = null;
// ?fixtures=mock is the reference design, with its own copy, so the built
// app can be put beside the picture and measured rather than remembered.
const mockFixtures = params.get('fixtures') === 'mock';
// ?engines=missing|claude|codex IS THE SECOND CODING AGENT, AND IT IS A
// MODIFIER RATHER THAN A WORLD so it layers over whichever world is up: the
// engine clause against wrapping chips needs ?fixtures=crowded, and the corner
// naming an agent on the idle page needs ?fixtures=empty. Absent is the Mac she
// runs -- one agent, nothing new drawn anywhere -- which is what every shot
// script already photographs and is the rule it records. The four
// machines and the whole argument are in ./fixtures, beside the data.
const engineFixtures = fixtureEngineWorld(params.get('engines'));
// Twenty-two names, because the point of this world is a sidebar with more in it
// than fits. The duplicates and the "(2)" suffixes are the shape that matters,
// not the words: near-copies of one product are what make a crowded sidebar
// hard to read, so one name still repeats here.
const CROWDED_NAMES = [
  'Crown', 'Meadow', 'Delete', 'Cascade', 'Orchard', 'Kestrel', 'Kestrel (2)',
  'Harbour', 'Harbour (2)', 'Harbour (3)', 'Harbour (empty duplicate)',
  'Harbour (empty duplicate 2)', 'Harbour (New)', 'Lantern', 'Personal',
  'Repro Product', 'Repro Product (2)', 'Repro Product (3)', 'Test', 'Test (2)',
  'The Frontier', 'Untitled',
];

// A page can outrun the main process it is attached to: ⌘R reloads the window
// and keeps the running process, so a build carrying new IPC channels can be
// talking to one that has never heard of them. Everything below says this
// instead of repeating Electron's sentence about registered handlers.
// Exported so Settings can leave it unsaid: a released app updates its window
// and its process in one restart, so only a window reloaded onto a newer build
// in development can reach this, and there it is not worth a banner.
export const RESTART_NOTE = `quit and reopen ${NAME} to change settings`;

const emptySettings: Settings = {
  ok: true,
  workspace: {
    agentsRunning: true, sessionsAtOnce: 0, capacity: 0, running: 0, model: null,
    permission: 'custom', codexMode: 'auto' as const, permissionArgs: [], outsideAgents: 'off', accounts: [], accountsNote: null,
    // A screen that could not reach the main process says the switch is on and
    // that there is nowhere to send to, which is the truth about a copy that
    // cannot even read its own settings.
    diagnostics: true, diagnosticsDestination: false, adhdMode: false, importNew: false, cornerTag: true,
    storePath: '', homePath: '', claudeBin: '', claudeFound: false, claudeCertain: false, claudeInstallUrl: '',
    standingLines: 0,
    messageRulesLines: 0, projectsWithInstructions: 0, projectCount: 0,
  },
  projects: [],
};

// Fixtures keep ONE settings object for the life of the page, so a switch she
// moves stays moved while she looks at the rest of the screen. It is memory and
// nothing else: there is no disk under fixtures, and no answer from here ever
// claims a save.
const fixtureSettingsState: any = structuredClone(fixtureSettings);
// AND WHICH OF THE FOUR MACHINES THOSE SETTINGS BELONG TO. Applied once, here,
// so that a switch she moves on the screen moves against the world she asked
// for -- including the Coding agent row itself, which is a real control in
// fixtures and rewrites `engine` through `fixtureWrite` below. Null for the Mac
// she runs, which leaves the object exactly as ./fixtures wrote it.
const engineSettings = fixtureEngineSettings(engineFixtures);
if (engineSettings) Object.assign(fixtureSettingsState.workspace, structuredClone(engineSettings));
// &codexPlan=free is a Mac whose Codex logins are all on ChatGPT's free plan,
// the paid one having ended Oct 18 2026: the three models that plan lists
// (w-62f14f8b3e).
if (params.get('codexPlan') === 'free') {
  Object.assign(fixtureSettingsState.workspace, {
    codexModels: [
      { id: 'gpt-6-luna', label: 'GPT-6-Luna', levels: ['low', 'medium', 'high', 'xhigh'], defaultLevel: 'medium' },
      { id: 'gpt-5.6-terra', label: 'GPT-5.6-Terra', levels: ['low', 'medium', 'high', 'xhigh'], defaultLevel: 'medium' },
      { id: 'gpt-5.6-luna', label: 'GPT-5.6-Luna', levels: ['low', 'medium', 'high', 'xhigh'], defaultLevel: 'medium' },
    ],
    codexModelDefault: 'gpt-6-luna',
    codexFreePlan: { endedAt: Date.parse('2026-10-18T19:00:00Z') },
  });
}
// The Codex page as it was reported on 2026-10-25, with ?engines=codex:
// &codexaccounts=two is two logins here with the free one in use,
// &codextrouble a Codex that is found but failing, and &codexmonth a free
// plan's monthly reading.
if (params.get('codexaccounts') === 'two' && fixtureSettingsState.workspace.codex) {
  fixtureSettingsState.workspace.codex.accounts = [
    { profile: 'default', email: 'work@example.com', name: null, plan: 'Free', accountId: null, signedIn: true, chosen: true },
    { profile: 'codex-2', email: 'you@example.com', name: null, plan: 'Plus', accountId: null, signedIn: true, chosen: false },
  ];
}
if (params.has('codextrouble') && fixtureSettingsState.workspace.codex) {
  fixtureSettingsState.workspace.codex.trouble = `Codex sessions are dying on arrival, so its tasks are not moving. ${NAME} keeps trying.`;
}
const codexMonth = params.has('codexmonth')
  ? [{ span: 'month', qualifier: null, name: 'This month', percent: 27, resetsText: null, resetsOn: null, resetsAt: Date.now() + (24 * 24 + 4) * 3_600_000, zone: null }] as unknown as UsageLimit[]
  : null;
// &memory=held draws the Running page the way it read when memory ran out on
// 2026-10-11 (w-ec27ff1a51): six running, memory tight, commands waiting, and
// new agents held. &memory=fine is the same page with memory back to normal.
if (params.get('memory')) {
  const held = params.get('memory') === 'held';
  Object.assign(fixtureSettingsState.workspace, { running: 6, capacity: 6, agentsTotal: 6, agentsAuto: true });
  fixtureSettingsState.workspace.memoryGate = {
    ...fixtureSettingsState.workspace.memoryGate, on: true,
    reading: {
      heavy: held ? 0 : 1, waiting: held ? 3 : 0, pressure: held ? 'tight' : 'normal', usedPct: held ? 74 : 48,
      asked: 488, waited: 36, refused: 0, holding: held,
    },
  } as any;
}
// ?account=org-blocked or ?account=subscription-ended: the second account
// picked as In use and unable to run, so the usage box that says why can be seen.
const accountTroubleNotes: Record<string, string> = {
  'org-blocked': 'Signed in, but its organization has turned Claude Code off. Only an admin of that workspace can turn it back on.',
  'subscription-ended': 'Signed in, but its Claude subscription has ended. Renew it at claude.ai to use this account again.',
};
// ?account=unreadable: the second account in use with nothing known wrong, and
// every Refresh coming back empty, for the sentence a cause we cannot name gets.
const accountTrouble = params.get('account') ?? '';
if (accountTrouble === 'unreadable') {
  const [first, second] = fixtureSettingsState.workspace.accounts;
  if (first) first.chosen = false;
  if (second) second.chosen = true;
}
if (accountTroubleNotes[accountTrouble]) {
  const [first, second] = fixtureSettingsState.workspace.accounts;
  if (first) first.chosen = false;
  if (second) Object.assign(second, {
    chosen: true, live: false, state: accountTrouble,
    trouble: { cause: accountTrouble, since: Date.now(), note: accountTroubleNotes[accountTrouble] },
    ...(accountTrouble === 'subscription-ended' ? { plan: { label: 'Subscription ended', max: false } } : {}),
  });
}

// ?accounts=two: two logins, the second picked and nearly empty, the first full,
// and the cloud's two unnamed logins at their limit (2026-10-16).
const twoLogins = params.get('accounts') === 'two';
if (twoLogins) {
  const [first, second] = fixtureSettingsState.workspace.accounts;
  if (first) first.chosen = false;
  if (second) second.chosen = true;
  // &cloudperm=<mode> and &cloudcodexmode=<mode> draw the cloud on its own
  // permission modes; unset, on the cloud's defaults.
  fixtureSettingsState.workspace.permission = 'auto';
  fixtureSettingsState.workspace.cloudPermission = (params.get('cloudperm') as PermissionMode | 'same' | null) || 'bypassPermissions';
  fixtureSettingsState.workspace.cloudCodexMode = (params.get('cloudcodexmode') as CodexModeId | 'same' | null) || 'full-access';
  // &account=at-limit: the full first login also carries main's at-limit trouble, as it does once a run on it hits the limit.
  if (accountTrouble === 'at-limit' && first) {
    first.trouble = { cause: 'at-limit', since: Date.now(), note: accountSentence('at-limit') };
  }
}

function fixtureAccountUsage(): AccountUsageReading[] {
  const now = Date.now();
  const at = (h: number, m = 0) => { const d = new Date(now); d.setHours(h, m, 0, 0); return d.getTime(); };
  const limit = (span: 'session' | 'week', percent: number, resetsText: string, resetsAt: number, qualifier: string | null = null) => ({
    span, qualifier, percent, resetsText, resetsOn: span === 'week' ? 'Oct 22' : null, resetsAt, zone: null,
    name: span === 'session' ? 'This session' : qualifier === 'Fable' ? 'This week, Fable' : 'This week',
  });
  const [first, second] = fixtureSettingsState.workspace.accounts;
  const week = now + 6 * 86_400_000;
  // &usagefail: the first login's last refresh failed, so it keeps a reading two hours old.
  const failed = params.has('usagefail') ? { at: now - 2 * 3_600_000, error: USAGE_UNREADABLE } : { at: now - 60_000 };
  // &fablefull: the first login has room in its session and week and none left on Fable.
  const firstLimits = params.has('fablefull')
    ? [limit('session', 30, '5:09pm', at(17, 9)), limit('week', 60, '11:59am', week, 'all models'), limit('week', 100, '11:59am', week, 'Fable')]
    : [limit('session', twoLogins ? 100 : 42, '5:09pm', at(17, 9)), limit('week', 15, '11:59am', week, 'all models'), limit('week', 24, '11:59am', week, 'Fable')];
  return [
    { profile: first.profile, ...failed, limits: firstLimits },
    { profile: second.profile, at: now - 60_000, limits: [limit('session', 5, '8pm', at(20)), limit('week', 9, '4pm', week, 'all models'), limit('week', 6, '4pm', week, 'Fable')] },
  ];
}

// &codexaccounts=two: the Plus login not in use has its own session and week.
function fixtureCodexAccountUsage(): AccountUsageReading[] {
  if (params.get('codexaccounts') !== 'two') return [];
  const now = Date.now();
  const window = (span: 'session' | 'week', percent: number, resetsAt: number) => ({
    span, qualifier: null, name: span === 'session' ? 'This session' : 'This week', percent, resetsText: null, resetsOn: null, resetsAt, zone: null,
  });
  return [
    ...(codexMonth ? [{ profile: 'default', limits: codexMonth, at: now }] : []),
    { profile: 'codex-2', at: now - 3 * 3_600_000, limits: [window('session', 12, now + 2 * 3_600_000), window('week', 31, now + 4 * 86_400_000)] },
  ];
}

function fixtureWrite(scope: 'project' | 'workspace', p: any): Settings {
  const w = fixtureSettingsState.workspace;
  if (scope === 'workspace') {
    if (p.key === 'sessionsAtOnce') {
      w.sessionsAtOnce = Math.max(1, Math.min(w.slotsMax ?? 12, Number(p.value) || 1));
      w.capacity = w.sessionsAtOnce;
      w.agentsAuto = false;
    } else if (p.key === 'memoryGate' && w.memoryGate) {
      w.memoryGate = { ...w.memoryGate, on: !!p.value, now: p.value ? 'Memory is fine. Nothing heavy running.' : null };
    } else if (p.key === 'cleanupLeftovers' && w.leftovers) {
      w.leftovers = { on: !!p.value, now: p.value ? 'Finished agents have left 6 programs running. 4 stop when you close their tasks; 2 are kept.' : null };
    } else if (p.key === 'memoryGateSlots' && w.memoryGate) {
      w.memoryGate = { ...w.memoryGate, slots: p.value === null ? null : Math.max(1, Math.min(w.memoryGate.slotsMax, Number(p.value) || 1)) };
    } else if (p.key === 'activeAccount') {
      // The account picked is the one marked chosen, as main/settings.mjs
      // answers it, so the In use row can be seen in a preview.
      const list = p.value?.engine === 'codex' ? w.codex?.accounts ?? [] : w.accounts;
      for (const a of list) a.chosen = a.profile === p.value?.profile;
    } else w[p.key] = p.value;
  } else {
    const project = fixtureSettingsState.projects.find((x: any) => x.slug === p.product);
    if (project) project[p.key] = p.value;
  }
  fixtureSettingsState.workspace.projectsWithInstructions =
    fixtureSettingsState.projects.filter((x: any) => x.instructions.trim()).length;
  return structuredClone(fixtureSettingsState) as Settings;
}

/**
 * THE UPDATER'S STATES, SUMMONED BY NAME (?update=ready, &update=source, …).
 *
 *  An update that has downloaded itself is by definition something you cannot
 *  make happen on demand, so every screen that mentions one, the sidebar card,
 *  the ⌘K restart and the Updates row in Settings, would otherwise be
 *  unreviewable until it happened to a real install.
 *
 *  ONE SHAPE SERVES THE SNAPSHOT AND THE CHECK. `api.updateCheck()` answers
 *  the world the page was opened in, because a Check button that always found
 *  version 0.2.0 whatever world it was pressed in is a button that cannot
 *  photograph the ordinary answer: nothing new.
 */
export function updateShape(wanted: string): UpdateState {
  const shapes: Record<string, Partial<UpdateState>> = {
    // `readyAt` is set back on purpose: the sidebar card wears it, and a
    // fixture stamped "now" would photograph a time no real update has by the
    // moment it is read.
    ready: { phase: 'ready', newVersion: '0.2.0', percent: 100, ready: true, readyAt: Date.now() - 62 * 60_000 },
    downloading: { phase: 'downloading', newVersion: '0.2.0', percent: 47 },
    // A copy run from source (main/source-updater.mjs): versions are commit
    // ids, and the row lists what changed.
    source: {
      phase: 'ready', ready: true, source: true, currentVersion: '5c6afa7', newVersion: '9e1b204',
      changes: ['Teammates get a restart prompt when main moves', 'The Team page loads faster', 'Sign-in retries once on a slow network'],
      behind: 4, percent: null, readyAt: Date.now() - 12 * 60_000,
    },
    installing: {
      phase: 'installing', ready: false, installing: true, source: true, currentVersion: '5c6afa7', newVersion: '9e1b204',
      changes: ['Teammates get a restart prompt when main moves'], behind: 1, readyAt: Date.now() - 12 * 60_000,
    },
    current: { phase: 'current' },
    error: { phase: 'error', error: 'Could not reach the internet.' },
    // A COPY THAT CANNOT UPDATE ITSELF FROM WHERE IT IS
    // (shared/where-it-runs-from.mjs). This is the state two real installs
    // were in for a week, and the only way to look at the card and the row
    // without a disk image and a packaged build.
    'disk-image': { phase: 'error', error: MOVE_SAY.cannotUpdateHere, canMove: true, place: 'disk-image' },
    translocated: { phase: 'error', error: MOVE_SAY.cannotUpdateHere, canMove: true, place: 'translocated' },
    'move-failed': {
      phase: 'error', error: MOVE_SAY.cannotUpdateHere, canMove: true, place: 'disk-image',
      moveError: 'The move did not work.',
    },
    // WHY A COPY DOES NOT UPDATE ITSELF AT ALL, which is the state most
    // teammates' checkouts are actually in (main/source-updater.mjs SAY).
    unsupported: {
      phase: 'unsupported', source: true, currentVersion: '5c6afa7',
      error: 'This folder has changes of your own in it, so it does not update itself.',
    },
  };
  return {
    phase: 'idle',
    currentVersion: '0.1.0',
    newVersion: null,
    percent: null,
    error: null,
    checkedAt: Date.now() - 4 * 60_000,
    readyAt: null,
    ready: false,
    ...(shapes[wanted] ?? {}),
  };
}

export const api = {
  isFixtures: useFixtures,

  // IS A SCREEN READER RUNNING. Asked by the terminal pane before it builds an
  // xterm, so the accessibility tree is built for the people it is for rather
  // than for everybody (main/ipc.mjs 'zero:assistiveTech').
  //
  // Every failure is "no": fixtures, a preload from before this channel
  // existed, or a refused call. A terminal that cannot ask the question still
  // has to open, and this is awaited inside the effect that builds one.
  async assistiveTech(): Promise<boolean> {
    if (useFixtures) return false;
    try { return !!(await window.zero?.assistiveTech?.()); } catch { return false; }
  },
  async snapshot(): Promise<Snapshot> {
    if (emptyFixtures) {
      const empty = { ...structuredClone(fixtureSnapshot), items: [], approvals: [], supervisor: { paused: false, running: [], capacity: 3 } };
      // ?noProjects IS A STORE NOBODY HAS USED, which is the only world the
      // first run draws in: it opens on a count of projects, and the empty
      // fixture still carries Kestrel and the rest.
      if (params.has('noProjects')) empty.products = [];
      // AND THE AGENTS THE BAR COUNTS. Real running entries rather than a number
      // poked in, so the bar counts the same array the app counts everywhere
      // else. The inbox stays empty, which is what keeps the idle page up.
      if (workingFixtures) {
        empty.supervisor.running = Array.from({ length: workingFixtures }, (_x, i) => ({
          itemId: `w-working-${i + 1}`, product: 'kestrel', startedAt: Date.now() - (i + 1) * 60_000,
          tail: ['tool: Read'],
        })) as typeof empty.supervisor.running;
      }
      if (waitingFixtures) {
        const now = Date.now();
        empty.items = Array.from({ length: waitingFixtures }, (_x, i) => ({
          id: `w-waiting-${i + 1}`, product: 'kestrel', productName: 'Kestrel',
          status: 'open', kind: 'task', title: 'README usage section with example call',
          labels: [], priority: 1, epoch: 1, claim: null,
          result: 'Which name and email should the commit use?',
          createdAt: now - (i + 1) * 60_000, updatedAt: now - (i + 1) * 60_000,
        })) as typeof empty.items;
      }
      // AND THE SECOND CODING AGENT, LAST, OVER WHICHEVER WORLD IS UP. It is
      // applied at all four exits rather than once around them because each
      // builds its own object; layering it here is what lets
      // ?fixtures=empty&engines=codex photograph the corner naming an agent on
      // the idle page. A world of `null` hands the snapshot straight back.
      return fixtureSecondEngine(empty, engineFixtures);
    }
    if (mockFixtures) return fixtureSecondEngine(structuredClone(fixtureMock), engineFixtures);
    if (crowdedFixtures) {
      const base = structuredClone(fixtureSnapshot);
      base.products = CROWDED_NAMES.map((name) => ({
        slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
        dir: `/fixtures/${name}`,
        name,
        oneLiner: '',
        repoPath: null,
      }));
      base.supervisor.productOrder = base.products.map((p) => p.slug);
      // &hidden=slug,slug seeds the hidden set, so the filtered picker, the
      // "N hidden" pill and the revealed state can all be looked at without a
      // live supervisor to write to.
      base.supervisor.hiddenProducts = (params.get('hidden') ?? '').split(',').filter(Boolean);
      if (!params.has('approvals')) base.approvals = [];
      return fixtureSecondEngine(base, engineFixtures);
    }
    if (useFixtures) {
      const base = structuredClone(fixtureSnapshot);
      // The runs behind the fixture repeating tasks, so the run log has
      // something true to draw. They are ordinary items, which is the point.
      base.items = [...base.items, ...structuredClone(fixtureRuns) as unknown as typeof base.items];
      // Her Claude Code sessions, so the rail's "Active agents" section draws.
      // Without them every fixtures screenshot showed that panel as nothing at
      // all, which is how it went unreviewed until.
      base.agents = structuredClone(fixtureAgents);
      // &stale shows the restart bar. The state it reports is invisible by
      // definition (an app running code that no longer exists), so without a
      // way to summon it the one banner that exists to be noticed could never
      // be looked at.
      if (params.has('stale')) {
        base.restartNeeded = {
          files: ['main/supervisor.mjs', 'main/ipc.mjs', 'preload.cjs', 'shared/rank.mjs'],
          since: Date.now() - 2.9 * 24 * 3_600_000,
        };
      }
      // &update=... summons the updater's states (`updateShape`). Same reason
      // as &stale above: an update that has downloaded itself is by definition
      // something you cannot make happen on demand, so without this the row
      // she is meant to press could never be looked at before shipping.
      const wanted = params.get('update');
      if (wanted) base.update = updateShape(wanted);
      // The approval queue is opt-in (&approvals): a worker frozen mid-command
      // is a real state worth being able to look at, and it is not the state
      // every other fixtures screenshot wants a card floating over.
      if (!params.has('approvals')) base.approvals = [];
      else base.approvals = cardsInFront(base.approvals, fixtureLooking);
      // &cloud=mac|full|all draws the cloud button set up, two accounts in,
      // three threads running there, so its menu can be looked at.
      const cloud = params.get('cloud');
      if (params.get('accounts') === 'two') {
        const until = new Date(); until.setHours(17, 10, 0, 0);
        // A cloud reading carries the instant of each reset and no text (readReplyHeaders).
        const on = (days: number, h: number, m = 0) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(h, m, 0, 0); return d.getTime(); };
        // &cloudread draws the cloud logins as they will read once the cloud
        // reports each one's email and usage; without it, as they read today.
        const read = params.has('cloudread');
        base.cloud = {
          // &cloudmode=mac draws the same accounts with the cloud turned off.
          setUp: true, mode: params.get('cloudmode') === 'mac' ? 'mac' : params.get('cloudmode') === 'all' ? 'all' : 'full', whenOn: 'full', running: 0,
          month: { runs: 14, agentHours: 1.2, estimatedCost: 0.16, costPerAgentHour: 0.13 },
          accounts: [
            {
              // Read two hours ago, as the reported screenshot's was; the same login here was read since.
              engine: 'claude', key: 'a1', name: read ? 'you@example.com' : null, plan: read ? 'Max 20x' : null, ready: false, state: 'limited' as any, limitedUntil: until.getTime(),
              profile: read ? fixtureSettingsState.workspace.accounts[0]?.profile ?? null : null, readAt: read ? Date.now() - 2 * 3_600_000 : null,
              limits: read ? [
                { span: 'session', qualifier: null, name: 'This session', percent: 100, resetsText: null, resetsOn: null, resetsAt: until.getTime(), zone: null },
                { span: 'week', qualifier: 'all models', name: 'This week', percent: 31, resetsText: null, resetsOn: null, resetsAt: on(2, 11, 59), zone: null },
              ] : null,
            },
            {
              engine: 'claude', key: 'a2', name: read ? 'work@example.com' : null, plan: read ? 'Max 20x' : null, ready: true, state: 'ready',
              profile: read ? fixtureSettingsState.workspace.accounts[1]?.profile ?? null : null, readAt: read ? Date.now() - 3 * 60_000 : null,
              limits: read ? [
                { span: 'session', qualifier: null, name: 'This session', percent: 12, resetsText: null, resetsOn: null, resetsAt: on(0, 20), zone: null },
                { span: 'week', qualifier: 'all models', name: 'This week', percent: 9, resetsText: null, resetsOn: null, resetsAt: on(2, 16), zone: null },
              ] : null,
            },
            // &cloudcodex adds a Codex login in the cloud, so the Codex page draws its cloud rows.
            // &cloudcodex=<email> names it.
            ...(params.has('cloudcodex') ? [{ engine: 'codex' as const, key: 'c1', name: params.get('cloudcodex') || null, ready: true, state: 'ready' as const }] : []),
            // &cloudonly adds a Claude login signed in nowhere here, whose last look failed.
            // Its email is unknown: the cloud's token cannot read it, and no folder here names it.
            ...(params.has('cloudonly') ? [{
              engine: 'claude' as const, key: 'a3', name: null, plan: null, ready: true, state: 'ready' as const, profile: null,
              readAt: Date.now() - 2 * 3_600_000, readError: 'The cloud could not be reached. Try again.',
              limits: [
                { span: 'session' as const, qualifier: null, name: 'This session', percent: 40, resetsText: null, resetsOn: null, resetsAt: on(0, 23), zone: null },
                { span: 'week' as const, qualifier: 'all models', name: 'This week', percent: 22, resetsText: null, resetsOn: null, resetsAt: on(2, 16), zone: null },
              ],
            }] : []),
            // &cloudmissing leaves the work login out of the cloud, so it is only on this computer
            // (&cloudmissing=a1 the other one). &cloudstopped has the work login's cloud sign-in stop working.
          ].filter((a) => !(params.has('cloudmissing') && a.key === (params.get('cloudmissing') || 'a2')))
            .map((a) => (params.has('cloudstopped') && a.key === 'a2' ? { ...a, ready: false, state: 'broken' as const } : a))
            // Marked as the app marks it (Supervisor#_cloudAccounts): the first of each engine that still works.
            .map((a, _, all) => ({ ...a, inUse: all.find((b) => b.engine === a.engine && b.state !== 'broken') === a })),
          // &cloudsigning has a Claude sign-in waiting on its code, as Add to cloud leaves one.
          signIns: params.has('cloudsigning')
            ? [{ engine: 'claude' as const, key: 'acct-new', state: 'needs-code' as const, url: 'https://claude.ai/oauth/authorize', code: null, message: null, attempt: 'signin-1' }]
            : [],
        } as typeof base.cloud;
      } else if (cloud === 'new') {
        // &cloud=new draws Agentbox Cloud offered with nobody signed in: the
        // button's dot, its invitation, and the sign-in page it opens.
        base.cloud = { setUp: false, offered: true, mode: 'full', whenOn: 'full', running: 0, month: { runs: 0, agentHours: 0, estimatedCost: 0, costPerAgentHour: 0 }, accounts: [], signIns: [] } as typeof base.cloud;
      } else if (cloud === 'mac' || cloud === 'full' || cloud === 'all') {
        base.cloud = {
          setUp: true, mode: cloud, whenOn: cloud === 'all' ? 'all' : 'full', running: 3, projects: base.products.map((p) => p.slug),
          month: { runs: 6, agentHours: 2.4, estimatedCost: 0.31, costPerAgentHour: 0.13 },
          accounts: [
            { engine: 'claude', key: 'a1', name: 'me@example.com', ready: true, state: 'ready' },
            { engine: 'claude', key: 'a2', name: null, ready: true, state: 'ready' },
          ],
          signIns: [],
        } as typeof base.cloud;
        // And the first running thread is one of the three in the cloud.
        if (base.supervisor.running[0]) (base.supervisor.running[0] as { where?: string }).where = 'cloud';
        // &cloudlimit draws both cloud accounts at their usage limit for two hours.
        if (params.has('cloudlimit') && base.cloud) {
          base.cloud.running = 0;
          base.cloud.accounts = (base.cloud.accounts ?? []).map((a) => ({ ...a, ready: false, state: 'limited' as const, limitedUntil: Date.now() + 2 * 3600_000 }));
        }
        // &dup draws the second cloud account as the same account as the first.
        const accounts = base.cloud?.accounts;
        if (params.has('dup') && accounts?.[1]) {
          accounts[1] = { ...accounts[1], ready: false, state: 'duplicate' as const, duplicateOf: accounts[0].key };
        }
        // &kept draws that thread kept on this Mac instead.
        const first = base.supervisor.running[0];
        if (params.has('kept') && first) {
          delete (first as { where?: string }).where;
          const kept = base.items.find((i) => i.id === first.itemId);
          if (kept) kept.onMac = true;
        }
        // &needs draws the top thread in Needs you handed back for a key only this Mac has.
        if (params.has('needs')) {
          const first = base.items.find((i) => /^The first row a new project/.test(i.title));
          if (first) Object.assign(first, { onMac: true, needsMac: 'your Stripe key' });
        }
        // &moving draws the other running threads on this Mac, all of which the cloud could take now.
        if (params.has('moving') && base.cloud) {
          const here = base.supervisor.running.filter((r) => (r as { where?: string }).where !== 'cloud').map((r) => r.itemId);
          base.cloud.movable = here;
          if (cloud === 'all') base.supervisor.whyNotCloud = Object.fromEntries(here.map((id) => [id, { at: 'mac' as const, why: 'moving' }]));
        }
      }
      // &cloud=managed draws Agentbox Cloud signed in through its server, and
      // &noroom=hours|agents the server saying it had no room a moment ago.
      if (cloud === 'managed') {
        base.cloud = { setUp: true, managed: true, mode: 'full', whenOn: 'full', running: 0, month: { runs: 4, agentHours: 1.6, estimatedCost: 0, costPerAgentHour: 0 }, accounts: [{ engine: 'claude', key: 'a1', name: 'me@example.com', ready: true, state: 'ready' }], signIns: [] } as typeof base.cloud;
      }
      const room = params.get('noroom');
      if (base.cloud && (room === 'hours' || room === 'agents')) base.cloud.noRoom = { error: room, message: null };
      // &macfull draws this Mac running all it can, two threads queued behind it.
      if (params.has('macfull')) {
        const queued = base.items.filter((i) => /^(Can the welcome email|Bring back a list)/.test(i.title)).map((i) => i.id);
        base.supervisor.queued = queued;
        base.supervisor.capacity = base.supervisor.running.filter((r) => (r as { where?: string }).where !== 'cloud').length;
      }
      return fixtureSecondEngine(base, engineFixtures);
    }
    return window.zero!.snapshot();
  },

  // WHERE YOU ARE, FOR THE ONE THING THAT DEPENDS ON IT: the approval card in
  // front is the open thread's own, and the chord that answers it is caught in
  // the main process. A build with no such channel keeps the oldest card in
  // front, which is what it did before.
  async lookingAt(at: { product: string | null; id: string } | null): Promise<void> {
    // Fixtures have no main process to order the cards, and ?approvals is how
    // this card is reviewed, so the same shared rule is applied here.
    if (useFixtures) { fixtureLooking = at; return; }
    try { await window.zero?.looking?.({ product: at?.product ?? null, id: at?.id ?? null }); } catch { /* the card simply stays where it was */ }
  },

  async refreshUsage(engine: 'claude' | 'codex' = 'claude'): Promise<{ ok: boolean; reading?: Usage; error?: string }> {
    if (useFixtures) {
      if (params.get('account') === 'unreadable') return { ok: false, error: USAGE_UNREADABLE };
      if (codexMonth && engine === 'codex') return { ok: true, reading: { engine, limits: codexMonth, profile: 'default', at: Date.now() } };
      const reading = fixtureSnapshot.usageByEngine?.find(r => r.engine === engine) ?? (fixtureSnapshot.usage?.engine === engine ? fixtureSnapshot.usage : null);
      return reading ? { ok: true, reading: { ...structuredClone(reading), profile: 'default', at: Date.now() } } : { ok: false, error: 'No usage reading yet.' };
    }
    if (!window.zero?.refreshUsage) return { ok: false, error: RESTART_NOTE };
    try { return await window.zero.refreshUsage({ engine }); }
    catch { return { ok: false, error: USAGE_UNREADABLE }; }
  },

  /** Every Claude or Codex login's own usage, for Settings. Empty from a main process that predates it. */
  async accountUsage(p: { refresh?: boolean; engine?: 'claude' | 'codex' } = {}): Promise<AccountUsageReading[]> {
    if (useFixtures) return p.engine === 'codex' ? fixtureCodexAccountUsage() : fixtureAccountUsage();
    if (!window.zero?.accountUsage) return [];
    try { return (await window.zero.accountUsage(p)).readings ?? []; } catch { return []; }
  },

  // THE NEXT PAGE OF FINISHED THREADS THE SNAPSHOT LEFT OUT (w-fda2165ec6),
  // asked for at the foot of Done and All. Fixtures have none: their ledgers
  // are small, which is what an app with nothing cut off answers.
  async olderItems(offset: number, limit = 50): Promise<{ items: WorkItem[]; more: boolean }> {
    if (useFixtures || !window.zero?.olderItems) return { items: [], more: false };
    return window.zero.olderItems({ offset, limit });
  },

  // KEEPING AGENTBOX CURRENT. Through the seam like everything else, so both
  // buttons can be built and looked at with no packaged app behind them.
  // Fixtures answer the way a real installed copy would: the check finds
  // something, and the restart reports that it started.
  async updateCheck(): Promise<UpdateState> {
    // The world the page was opened in, answered as a real check would answer
    // it; with no world named, a check that finds a new version, because that
    // is the state worth looking at.
    if (useFixtures) return updateShape(params.get('update') || 'ready');
    return window.zero!.updateCheck();
  },

  async updateInstall(): Promise<{ started: boolean }> {
    if (useFixtures) return { started: true };
    return window.zero!.updateInstall();
  },

  // MOVING THE APP INTO APPLICATIONS, for a copy that cannot update itself
  // from where it is (shared/where-it-runs-from.mjs). A real move relaunches
  // the app, so fixtures answer the only interesting half: `?update=move-failed`
  // is the refusal, which is the one state that has anything left to draw.
  async updateMove(): Promise<{ moved: boolean; error: string | null }> {
    if (useFixtures) {
      return params.get('update') === 'move-failed'
        ? { moved: false, error: 'The move did not work.' }
        : { moved: true, error: null };
    }
    return window.zero!.updateMove();
  },

  // THE USER'S WORDS, INTO ONE OF THEIR OWN RUNNING AGENTS. Through the seam like
  // everything else, so the reply box can be built and looked at without a live
  // session to type into. Fixtures answer sent-and-working, which is the good
  // case; &agentUnsure draws the failure, which is the one worth looking at.
  async agentReply(p: { pid: number; text: string }): Promise<{ ok: boolean; delivered?: boolean; working?: boolean; name?: string; reason?: string; key?: string; at?: number }> {
    if (useFixtures) {
      if (params.has('agentUnsure')) return { ok: false, reason: 'That agent is not listening any more.' };
      return { ok: true, delivered: true, working: true };
    }
    return (window.zero as any)?.agentReply?.(p) ?? { ok: false, reason: 'The message could not be handed over.' };
  },

  async agentReveal(p: { pid: number }): Promise<{ ok: boolean; name?: string; reason?: string }> {
    if (useFixtures) return { ok: true, name: 'CNVS' };
    return (window.zero as any)?.agentReveal?.(p) ?? { ok: false, reason: `${Name} cannot tell which window it is running in.` };
  },

  // WHAT THE TWO OF THEM SAID, read only when she presses the line. The main
  // process streams it off the transcript she already has; nothing is sent and
  // no model sees a word of it. `whole` is her pressing the gap line: send the
  // middle back too.
  async agentConversation(p: { pid: number; sessionId: string | null; cwd: string; whole?: boolean }): Promise<AgentConversation> {
    if (useFixtures) return fixtureConversation();
    return (window.zero as any)?.agentConversation?.(p) ?? { ok: false, reason: 'That conversation could not be read.' };
  },

  // The session traces behind the working notes. It comes through the seam
  // like everything else, so the notes can be built, reviewed and screenshotted
  // from fixtures instead of only against a live fleet.
  async sessionTrace(p: { product: string; id: string }): Promise<{ sessions: Array<{ startedAt: number; text: string }> }> {
    if (useFixtures) return { sessions: (fixtureTraces as any)[p.id] ?? [] };
    return (window.zero as any)?.sessionTrace?.(p) ?? { sessions: [] };
  },

  // THE DOCUMENT PANE'S THREE. All of them go through the app's own finder in
  // the main process, so the pane opens exactly the file a click on the same
  // path opens, and a path written against a root that does not exist here says
  // so instead of drawing a blank page.
  //
  // There is no fixtures branch on any of them, and that is deliberate: a
  // document pane with an invented document in it is the one picture that could
  // lie. A shot script hands in its own bridge with the real finder's answers
  // (scripts/shot-doc-pane.mjs), and a copy with no bridge at all draws the
  // sentence rather than a blank page.
  // `url` comes back for an html page only: it is the astral-doc:// address
  // the pane points its frame at, so the page's own pictures load (main/
  // doc-scheme.mjs). An older preload has no such field, and the pane says so
  // rather than drawing a page with holes in it.
  async resolveDoc(p: { product: string; src: string }): Promise<{ ok: boolean; opened?: string; url?: string; error?: string }> {
    if (useFixtures && ['artifact-layout-sample.change', 'review-bundle.change'].includes(p.src)) return { ok: true, opened: p.src };
    if (useFixtures && p.src === 'artifact-layout-sample.md') return { ok: true, opened: p.src };
    if (useFixtures && p.product === 'onboard' && ['designs/w-n13/the-first-row.html', '/fixtures/onboard/designs/w-n13/the-first-row.html'].includes(p.src)) return { ok: true, opened: p.src, url: '/fixtures/onboard/designs/w-n13/the-first-row.html' };
    const zero = window.zero as any;
    if (!zero?.openArtifact) return { ok: false, error: `quit and reopen ${NAME} to open documents here` };
    return zero.openArtifact({ ...p, mode: 'resolve' });
  },

  async readDoc(p: { product: string; src: string }): Promise<{ ok: boolean; text?: string; mtime?: number; error?: string }> {
    if (useFixtures && p.src === 'artifact-layout-sample.md') return {ok:true,text:artifactSampleNotes,mtime:0};
    const zero = window.zero as any;
    if (!zero?.readDoc) return { ok: false, error: `quit and reopen ${NAME} to open documents here` };
    return zero.readDoc(p);
  },

  // THE CHANGE A RUN MADE, read out of the conversation rather than out of
  // git.
  //
  // An older preload has never heard of it, and then the pane says so rather
  // than drawing an empty change.
  async codeChange(p: { product: string; src: string }): Promise<{ ok: boolean; change?: unknown; error?: string }> {
    if (useFixtures && p.src === 'review-bundle.change') return {ok:true,change:reviewSampleChange};
    if (useFixtures && p.src === 'artifact-layout-sample.change') return {ok:true,change:artifactSampleChange};
    const zero = window.zero as any;
    if (!zero?.codeChange) return { ok: false, error: `quit and reopen ${NAME} to open changes here` };
    return zero.codeChange(p);
  },

  // ONE FILE OF A CHANGE, READ AND WRITTEN.The screen only ever held a few
  // hunks, so the whole file comes back here and the splice happens in
  // renderer/src/code-edit.ts before anything is written.
  async codeFile(p: { product: string; src: string; path: string }): Promise<{ ok: boolean; text?: string; mtime?: number; path?: string; error?: string }> {
    const zero = window.zero as any;
    if (!zero?.codeFile) return { ok: false, error: `quit and reopen ${NAME} to edit files here` };
    return zero.codeFile(p);
  },

  async saveCodeFile(p: { product: string; src: string; path: string; text: string; mtime: number }): Promise<{ ok: boolean; mtime?: number; path?: string; stale?: boolean; error?: string }> {
    const zero = window.zero as any;
    if (!zero?.saveCodeFile) return { ok: false, error: `quit and reopen ${NAME} to save this file` };
    return zero.saveCodeFile(p);
  },

  async writeDoc(p: { product: string; src: string; text: string; mtime: number }): Promise<{ ok: boolean; mtime?: number; error?: string }> {
    const zero = window.zero as any;
    if (!zero?.writeDoc) return { ok: false, error: `quit and reopen ${NAME} to save this file` };
    return zero.writeDoc(p);
  },

  // HER SIDEBAR NOTE, read and written. One file per product, picked by the
  // slug in the main process; the renderer never names a path. An older
  // preload has neither, and then the panel simply does not draw the note
  // rather than offering a box that quietly throws the user's words away.
  async railNote(product: string): Promise<{ ok: boolean; text?: string; mtime?: number; error?: string }> {
    const zero = window.zero as any;
    if (!zero?.railNote) return { ok: false, error: `quit and reopen ${NAME} to keep a note here` };
    return zero.railNote({ product });
  },

  async saveRailNote(p: { product: string; text: string }): Promise<{ ok: boolean; mtime?: number; error?: string }> {
    const zero = window.zero as any;
    if (!zero?.saveRailNote) return { ok: false, error: `quit and reopen ${NAME} to save this note` };
    return zero.saveRailNote(p);
  },

  // Hand a file to the operating system, the way every link on a card already
  // does. The pane's first mark, and what a png or a pdf still does.
  async openArtifactExternally(p: { product: string; src: string }): Promise<{ ok: boolean; error?: string }> {
    const zero = window.zero as any;
    if (!zero?.openArtifact) { window.open(p.src, '_blank'); return { ok: true }; }
    return zero.openArtifact(p);
  },

  // Everything that happened on one task: the raw ledger lines, which the
  // renderer turns into sentences (thread-history.ts). Behind the same seam as
  // the trace, so the history can be built and shot from fixtures too.
  //
  // A page can outrun the main process it is attached to (⌘R keeps the running
  // one), so a build carrying this channel can be talking to a process that has
  // never heard of it. That answers empty rather than throwing: the door says
  // the app needs reopening, and nothing else on the task is affected.
  // `before` keeps only the lines written at or before that moment, so a
  // thread's history as it stood when another was filed from it is not cut off
  // by the 400 newest lines (renderer/src/recap.ts, recapFor).
  async itemHistory(p: { product: string; id: string; before?: number }): Promise<{ ok: boolean; lines: LedgerLine[]; error?: string }> {
    if (useFixtures) return { ok: true, lines: (fixtureHistory as any)[p.id] ?? [] };
    const zero = window.zero as any;
    if (!zero?.itemHistory) return { ok: false, lines: [], error: `quit and reopen ${NAME} to see this` };
    return zero.itemHistory(p);
  },

  async dashboard(slug: string): Promise<any> {
    if (mockFixtures) return (fixtureMockDashboards as any)[slug] ?? null;
    if (useFixtures) return (fixtureDashboards as any)[slug] ?? null;
    return window.zero!.dashboard(slug);
  },

  async agentUpdate(engine:string,action:'check'|'recheck'|'start'|'status'|'refresh'):Promise<any>{
    if(useFixtures)return params.has('modelUpdates')?modelUpdateFixture.action(engine,action):{engine,state:'current'};
    if(!window.zero?.agentUpdate)return {engine,state:'unknown'};
    return window.zero.agentUpdate({engine,action});
  },
  async terminal(p: Parameters<NonNullable<Window['zero']>['terminal']>[0]): Promise<any> {
    if(useFixtures&&p.product==='@agent-update'&&params.has('modelUpdates'))return modelUpdateFixture.terminal(p);
    if(useFixtures) throw new Error('Terminal requires the desktop app and a real task.');
    if(!window.zero?.terminal) throw new Error(`Restart ${NAME} to use the terminal.`);
    return window.zero.terminal(p);
  },
  async commandCatalog(p: {product: string; id: string}): Promise<string[]> {
    if (useFixtures) return ['code-review','loop','simplify','verify'];
    return window.zero!.commandCatalog(p);
  },
  async command(p: {product: string; id: string; text: string}): Promise<{state: string; at: number; text?: string; name?: string}> {
    if (useFixtures) return {state: 'done', at: Date.now(), text: 'Command completed.', name: p.text};
    return window.zero!.command(p);
  },
  async compact(p: { product: string; id: string }): Promise<{ state: string; at: number }> {
    if (useFixtures) return { state: 'done', at: Date.now() };
    return window.zero!.compact(p);
  },
  async remoteControl(p: {product: string; id: string; action?: string}) {
    if (useFixtures) return null;
    return window.zero!.remoteControl(p);
  },
  async compactionStatus(p: { product: string; id: string }): Promise<{ state: string; at: number } | null> {
    if (useFixtures) {
      const state = params.get('command-state');
      return state && state !== 'menu' ? { state, at: Date.now() } : null;
    }
    return window.zero!.compactionStatus(p);
  },
  // `engine`, `model` and `effort` are which coding agent and which model pick
  // up the run this reply starts. Undefined means the drawer was never opened
  // and the row keeps what it had; null clears it back to the engine's own
  // choice. `engine` is set by ⌘K (w-c9da359466) and by the reply box's menu,
  // which lists both agents' models (w-e1a42f6b21).
  // `now` cuts the running agent's current step so this message is answered at
  // once instead of after it (main/claude-input.mjs `interrupt`).
  // `inReplyTo` is the uid of the message a reply in a thread answers
  // (w-920461cbe6); main keeps it only in a conversation between people.
  async answer(p: { product: string; id: string; answer?: string; status?: string; priority?: number; permissionMode?: AnswerMode | null; engine?: string | null; model?: string | null; effort?: string | null; now?: boolean; inReplyTo?: string; closeUnshipped?: boolean }): Promise<WorkItem | null> {
    if (useFixtures) return null;
    return window.zero!.answer(p);
  },
  // The same cut, for a message of hers already waiting on the agent.
  async sendNow(p: { product: string; id: string }): Promise<{ ok: boolean; interrupted: boolean }> {
    if (useFixtures) return { ok: true, interrupted: true };
    return window.zero!.sendNow(p);
  },

  /* --------------------------------- feedback ------------------------------- */
  // Answers { ok } or { ok: false, error } in words (main/feedback.mjs).
  async sendFeedback(p: { text: string; files: { name: string; type: string; size: number; data: string }[] }): Promise<{ ok: boolean; error?: string }> {
    if (useFixtures) return { ok: true };
    if (!window.zero?.sendFeedback) return { ok: false, error: `Restart ${Name} to send feedback.` };
    return window.zero.sendFeedback(p);
  },

  /* --------------------------------- the team ------------------------------- */
  // Every call answers { ok, team } or { ok: false, error } in words.
  async teamSignIn(): Promise<TeamCallResult> { return teamCall(() => window.zero!.teamSignIn()); },
  async teamSignInCancel(): Promise<TeamCallResult> { return teamCall(() => window.zero!.teamSignInCancel()); },
  async teamSignInReopen(): Promise<TeamCallResult> { return teamCall(() => window.zero!.teamSignInReopen()); },
  async teamSignOut(): Promise<TeamCallResult> { return teamCall(() => window.zero!.teamSignOut()); },
  async teamSignInEmail(email: string, password: string): Promise<TeamCallResult> { return teamCall(() => window.zero!.teamSignInEmail({ email, password })); },
  async teamSignUp(name: string, email: string, password: string): Promise<TeamCallResult> { return teamCall(() => window.zero!.teamSignUp({ name, email, password })); },
  async teamCreate(name: string): Promise<TeamCallResult> { return teamCall(() => window.zero!.teamCreate({ name })); },
  async teamAcceptInvite(teamId: string): Promise<TeamCallResult> { return teamCall(() => window.zero!.teamAcceptInvite({ teamId })); },
  async teamInvite(email: string): Promise<TeamCallResult> { return teamCall(() => window.zero!.teamInvite({ email })); },
  async teamRename(name: string): Promise<TeamCallResult> { return teamCall(() => window.zero!.teamRename({ name })); },
  async teamRemoveMember(personId: string): Promise<TeamCallResult> { return teamCall(() => window.zero!.teamRemoveMember({ personId })); },
  async teamLeave(): Promise<TeamCallResult> { return teamCall(() => window.zero!.teamLeave()); },
  async teamCancelInvite(email: string): Promise<TeamCallResult> { return teamCall(() => window.zero!.teamCancelInvite({ email })); },
  // A line you write about yourself. Saying nothing clears it.
  async teamStatus(p: { text: string; hold: string; until?: number }): Promise<TeamCallResult> { return teamCall(() => window.zero!.teamStatus(p)); },
  async teamShare(p: { product: string; visibility: 'team' | 'people' | 'private'; people?: string[] }): Promise<TeamCallResult> { return teamCall(() => window.zero!.teamShare(p)); },
  async teamSync(): Promise<TeamCallResult> { return teamCall(() => window.zero!.teamSync()); },
  // A task somebody gave you: to an agent (on your Mac), keep it, or hand it back.
  async teamRoute(p: { product: string; id: string; route: 'agent' | 'me' | 'back' }): Promise<TeamCallResult> { return teamCall(() => window.zero!.teamRoute(p)); },
  // A chip put on or taken off one message. `on` is the uid of the ledger line
  // the message was written as (w-560647d4db).
  async teamReact(p: { product: string; id: string; on: string; emoji: string; off?: boolean }): Promise<TeamCallResult> { return teamCall(() => window.zero!.teamReact(p)); },
  async teamEdit(p: { product: string; id: string; on: string; text?: string; gone?: boolean }): Promise<TeamCallResult> { return teamCall(() => window.zero!.teamEdit(p)); },
  // A MESSAGE TO A PERSON (people get messages, never tasks), at the level the
  // sender picked. The level counts on the first message of a conversation and
  // is ignored after, which is the main process's rule (main/team/index.mjs).
  // And the files the card carries, saved into the conversation once the main
  // process knows which one it is.
  async teamMessage(to: string | string[], body: string, priority?: number, files?: TeamMessageFile[]): Promise<TeamCallResult> { return teamCall(() => window.zero!.teamMessage({ to, body, priority, files })); },
  // Rooms (alpha): every call goes through one door (main/ipc.mjs ROOM_OPS).
  async teammates<T = unknown>(op: string, args: Record<string, unknown> = {}): Promise<TeammatesResult<T>> {
    if (!window.zero?.teammates) return { ok: false, error: 'Teammates are not available here.' };
    try { return (await window.zero.teammates({ op, args })) as TeammatesResult<T>; } catch (err) { return { ok: false, error: String((err as Error)?.message ?? err) }; }
  },
  async rooms<T = unknown>(op: string, ...args: unknown[]): Promise<RoomsResult<T>> {
    if (!window.zero?.rooms) return { ok: false, error: 'This build has no team cloud set up.' };
    try { return (await window.zero.rooms({ op, args })) as RoomsResult<T>; } catch (err) { return { ok: false, error: String((err as Error)?.message ?? err) }; }
  },
  // An edit to a thread's summary, visibility or priority, made in place.
  async threadEdit(product: string, id: string, patch: ThreadEditPatch): Promise<{ ok: boolean; error?: string }> {
    if (useFixtures || !window.zero?.threadEdit) return { ok: true };
    try { return await window.zero.threadEdit({ product, id, patch }); } catch (err) { return { ok: false, error: String((err as Error)?.message ?? err) }; }
  },
  // Move a thread to another project (shared/move-thread.mjs). Answers with
  // the row it became there, or with the reason in words: only a thread
  // nothing has ever run on can go, and main asks that again before it writes.
  async moveItem(product: string, id: string, to: string): Promise<{ ok: boolean; error?: string; item?: WorkItem; from?: string; to?: string }> {
    if (useFixtures || !window.zero?.moveItem) return { ok: false, error: `Quit and reopen ${NAME} to move a thread.` };
    try { return await window.zero.moveItem({ product, id, to }); } catch (err) { return { ok: false, error: String((err as Error)?.message ?? err) }; }
  },
  // Threads dragged to a place of their own in the list (w-6e5b532a95).
  async setThreadPlaces(places: Record<string, number | null>): Promise<void> {
    if (useFixtures || !window.zero?.setThreadPlaces) return;
    await window.zero.setThreadPlaces({ places });
  },
  // Threads pinned to the top of the list (w-20323283e6). Optional on the
  // bridge: an older main process under a newer window has no such door.
  async setThreadPins(pins: Record<string, true | null>): Promise<void> {
    if (useFixtures || !window.zero?.setThreadPins) return;
    await window.zero.setThreadPins({ pins });
  },

  /** Keep a thread on this Mac whatever the cloud is set to, or let it go again. */
  async setThreadOnMac(onMac: Record<string, true | null>): Promise<void> {
    if (useFixtures || !window.zero?.setThreadOnMac) return;
    await window.zero.setThreadOnMac({ onMac });
  },

  /**
   * Move runs on this Mac to the cloud as it has room; how many will go. One
   * thread names its project too, which the phone's command needs.
   */
  async moveToCloud(ids: string[], product?: string): Promise<number> {
    if (useFixtures || !window.zero?.moveToCloud) return 0;
    const out = await window.zero.moveToCloud({ ids, ...(product && ids.length === 1 ? { product, id: ids[0] } : {}) });
    // The phone leaves a command for the computer, which says nothing back yet.
    return out?.moving ?? (out?.ok ? ids.length : 0);
  },

  async compose(p: { product: string; title: string; body?: string; kind?: string; priority?: number; runAt?: number; start?: 'later' | 'now'; labels?: string[]; model?: string; engine?: string; effort?: string; assignee?: string; due?: string; visibility?: 'team' | 'people' | 'private'; visibleTo?: string[] }): Promise<WorkItem | null> {
    // FIXTURES ANSWER WITH THE TASK, the way the real store does. Returning
    // null here meant the send had nothing to point at, and the caller reads
    // that as "no task was made" and puts no way back on the undo pile — so the
    // one path this mode exists to let us press and photograph, Z after a send,
    // was dead in fixtures and alive in her app. A mode that quietly disagrees
    // with the real one about whether an action happened is worse than no mode
    // at all.
    if (useFixtures) {
      const now = Date.now();
      return {
        id: `w-fixture${now.toString(36)}`,
        product: p.product,
        productName: fixtureSnapshot.products.find((x) => x.slug === p.product)?.name ?? p.product,
        status: 'open', title: p.title, body: p.body, kind: p.kind ?? 'directive',
        labels: ['founder'], priority: p.priority ?? 5, epoch: 1, claim: null,
        ...(p.runAt ? { runAt: p.runAt } : {}),
        ...(p.model ? { model: p.model } : {}),
        // AND THE ENGINE, WHICH THIS DROPPED ON THE FLOOR. `engine` was not even
        // in the param type above, so a card that visibly picked Codex made a
        // fixture row that had never heard of it: the one mode this app has for
        // looking at things could not produce the row it was there to look at,
        // and the byline over it read Claude Code. Same rule the model beside it
        // follows -- written only when she picked one, so an ordinary card is
        // the row it has always been.
        ...(p.engine ? { engine: p.engine } : {}),
        createdAt: now, updatedAt: now,
      };
    }
    return window.zero!.compose(p);
  },

  /** Who takes a thread sent to Auto: 'agent' or a teammate as 'mate:<id>' (shared/auto-route.mjs). */
  async routeThread(p: { product: string; id: string; to: string }): Promise<void> {
    if (useFixtures || !window.zero?.routeThread) return;
    await window.zero.routeThread(p);
  },

  /* ------------------------------ the first run ---------------------------- */
  // THE WALK'S EXAMPLE TASK IS ANSWERED BY THE APP.Main reads the readme in the
  // folder chosen two screens earlier and writes the result on the real row;
  // there is no session, so this returns in milliseconds and the two second
  // pause in front of it is the walk's, not the work's.
  // `round` is how many times she has replied to it; past the first, the
  // answer is the changed summary (2026-10-06).
  async firstRunAnswer(p: { product: string; id: string; round?: number }): Promise<{ line: string; found: boolean } | null> {
    // Fixtures have no disk under them, so the walk gets a line that is true
    // about the fixtures rather than a pretend one about her Mac.
    if (useFixtures) return { line: 'A fixture project, with no folder under it to read.', found: false };
    const zero = window.zero as Window['zero'];
    if (!zero?.firstRunAnswer) return null;
    return zero.firstRunAnswer(p);
  },

  // BEAT EIGHT'S THREE EXAMPLE ROWS, written into the project she just made and
  // handed back by id so the walk knows which three rows are its own.
  async firstRunExamples(p: { product: string }): Promise<{ ids: string[] } | null> {
    if (useFixtures) return null;
    const zero = (window as unknown as {
      zero?: { firstRunExamples?: (p: { product: string }) => Promise<{ ids: string[] }> };
    }).zero;
    if (!zero?.firstRunExamples) return null;
    return zero.firstRunExamples(p);
  },

  // THE PRACTICE PROJECT.Made when the hand-off screen is pressed and handed
  // back with the ids of the three rows already waiting in it.
  //
  // NULL IS A REAL ANSWER AND THE WALK HANDLES IT. Fixtures have no main
  // process behind them, and a build old enough not to have the handler is the
  // ordinary case for anybody who opens a stale window: both give null, and the
  // walk carries on in the project they made rather than stopping.
  async firstRunPractice(): Promise<{ slug: string; examples: string[]; backdrop?: string[] } | null> {
    if (useFixtures) return null;
    const zero = (window as unknown as {
      zero?: { firstRunPractice?: () => Promise<{ slug: string; examples: string[]; backdrop?: string[] }> };
    }).zero;
    if (!zero?.firstRunPractice) return null;
    return zero.firstRunPractice();
  },

  // AND OFF THE SCREEN AGAIN AT THE END. Archived, never deleted: everything
  // pressed during the walk is really on the ledger and an onboarding does not
  // remove directories from somebody's store.
  async firstRunPracticeEnd(): Promise<void> {
    if (useFixtures) return;
    const zero = (window as unknown as {
      zero?: { firstRunPracticeEnd?: () => Promise<unknown> };
    }).zero;
    try { await zero?.firstRunPracticeEnd?.(); } catch { /* the walk still ends */ }
  },

  // AND NOTHING ELSE STARTS WHILE THE WALK IS UP.The hold lives in the main
  // process, in memory, and expires on its own; see
  // supervisor.firstRunWalking.
  async firstRunWalking(walking: boolean): Promise<void> {
    if (useFixtures) return;
    const zero = window.zero as Window['zero'];
    if (!zero?.firstRunWalking) return;
    try { await zero.firstRunWalking({ walking }); } catch { /* an old main process simply does not hold */ }
  },

  // BEING A BRAND NEW USER ON THE APP SHE DOWNLOADED.A second Agentbox opens in
  // a throwaway home beside hers; nothing of hers is deleted and her own
  // window keeps running (main/fresh-user.mjs).
  //
  // IT SAYS WHY IT COULD NOT RATHER THAN FALLING BACK QUIETLY. A missing
  // channel here means a main process older than this build, which is exactly
  // the case a ⌘R-kept page hits, and a row that appeared to work and opened
  // nothing would be the worst version of this.
  async openFreshUser(withAgents = true, withTools = true): Promise<FreshUser> {
    if (useFixtures) return { ok: false, error: 'Not in this preview.' };
    const zero = window.zero as Window['zero'];
    if (!zero?.openFreshUser) {
      return { ok: false, error: `This window is running an older ${NAME}. Quit it and open it again.` };
    }
    try {
      return await zero.openFreshUser({ withAgents, withTools });
    } catch (err) {
      return { ok: false, error: (err as Error)?.message ?? 'It could not be opened.' };
    }
  },

  // THE DEMO INBOX.A second Agentbox in a throwaway home with an invented studio
  // in its store, beside the user's own, which keeps running.
  //
  // It says why it could not rather than falling back quietly, for the same
  // reason as the row above: a missing channel means a main process older than
  // this build, and a row that appeared to work and opened nothing is the worst
  // version of this one, because she would find out in front of a room.
  async openDemo(): Promise<DemoOpened> {
    if (useFixtures) return { ok: false, error: 'Not in this preview.' };
    const zero = window.zero as Window['zero'];
    if (!zero?.openDemo) {
      return { ok: false, error: `This window is running an older ${NAME}. Quit it and open it again.` };
    }
    try {
      return await zero.openDemo();
    } catch (err) {
      return { ok: false, error: (err as Error)?.message ?? 'It could not be opened.' };
    }
  },

  // Defer an item to a moment. 0 clears the schedule and makes it available now.
  async schedule(p: { product: string; id: string; runAt: number }): Promise<WorkItem | null> {
    if (useFixtures) return null;
    return window.zero!.schedule(p);
  },

  async snooze(p: { product: string; id: string; snoozedUntil: number }): Promise<WorkItem | null> {
    if (useFixtures) return null;
    if (!window.zero?.snooze) throw new Error('Restart the app to use Later');
    return window.zero.snooze(p);
  },

  // Defer an AGENT to a moment: the same gesture, on a row that lives in no
  // ledger. Nothing is sent and no process is touched — the moment says when
  // her inbox raises the agent again, and 0 brings it back now. The key is the
  // agent's, not the row's, because the row's id carries a pid and a pid is not
  // an identity (shared/agents.mjs).
  async scheduleAgent(p: { key: string; runAt: number }): Promise<{ ok: boolean; runAt: number }> {
    if (useFixtures) return { ok: true, runAt: p.runAt };
    const out = await (window.zero as any)?.scheduleAgent?.(p);
    // The picker announces AFTER the write, so a bridge that is not there has
    // to fail loudly rather than let a toast promise a moment nobody kept.
    if (!out?.ok) throw new Error('the app could not keep that moment');
    return out;
  },

  // Takes the row back out of In progress. It cannot un-send the message — that
  // is in somebody else's terminal — and the toast says so.
  async unreplyAgent(p: { key: string }): Promise<{ ok: boolean; repliedAt: number }> {
    if (useFixtures) return { ok: true, repliedAt: 0 };
    const out = await (window.zero as any)?.unreplyAgent?.(p);
    return out ?? { ok: false, repliedAt: 0 };
  },

  async closeAgent(p: { key: string; through: number }): Promise<{ ok: boolean; doneThrough: number }> {
    if (useFixtures) return { ok: true, doneThrough: p.through };
    const out = await (window.zero as any)?.closeAgent?.(p);
    if (!out?.ok) throw new Error('the app could not close that row');
    return out;
  },

  /* ---------------------------- repeating tasks --------------------------- */
  // Rules, not items, so they arrive on their own channel and none of the item
  // list rules can accidentally put one in the inbox.
  async repeats(): Promise<RepeatRule[]> {
    if (emptyFixtures) return [];
    if (useFixtures) return fixtureRepeats as unknown as RepeatRule[];
    return window.zero!.repeats();
  },

  // Throws when the schedule cannot be kept. The caller SHOWS that and keeps
  // the draft: a refused rule that also eats what the user typed is two failures.
  // `engine` and `model` ride beside the rule rather than inside it: they are
  // hers about the WORK, not about the schedule, and `isRepeatRule` in
  // shared/repeats.mjs validates the schedule shape and would refuse a rule
  // object carrying anything else.
  async composeRepeat(p: {
    product: string; title: string; body?: string; priority?: number; rule: RepeatShape;
    engine?: string; model?: string;
  }): Promise<RepeatRule | null> {
    if (useFixtures) return null;
    return window.zero!.composeRepeat(p);
  },

  async setRepeat(p: { product: string; id: string; rule: Partial<RepeatShape & { title: string; body: string; priority: number }> }): Promise<RepeatRule | null> {
    // FIXTURES CAN CHANGE A RULE, because changing one is now a thing she does
    // on screen rather than a thing that only happens on disk. It used to
    // answer null, so in the fixture app the box would take the words, close,
    // and redraw the old instruction — a demo of the fix that showed the bug.
    // There is no store behind this and nothing claims there is; the fold is
    // the same one main/repeats.mjs does.
    if (useFixtures) {
      const rule = (fixtureRepeats as unknown as RepeatRule[]).find((r) => r.id === p.id);
      if (!rule) return null;
      Object.assign(rule, p.rule);
      return rule;
    }
    return window.zero!.setRepeat(p);
  },

  async endRepeat(p: { product: string; id: string }): Promise<RepeatRule | null> {
    if (useFixtures) return null;
    return window.zero!.endRepeat(p);
  },

  /* ------------------------------- settings ------------------------------- */
  // The whole screen in one read, and every write answers with the whole screen
  // again: the settings the main process now believes, not what the click
  // assumed. A switch that draws itself on and turns out not to have landed is
  // the one failure a settings screen can have.
  async settings(): Promise<Settings> {
    if (useFixtures) return structuredClone(fixtureSettingsState) as Settings;
    const zero = window.zero as any;
    // ⌘R keeps the running main process, so a page built after these channels
    // existed can be attached to one that has never heard of them. Say what to
    // do about it rather than repeating Electron's sentence.
    if (!zero?.settingsRead) return { ...emptySettings, ok: false, error: RESTART_NOTE };
    return zero.settingsRead();
  },

  // LOOK FOR CLAUDE CODE AGAIN. The install Claude Code, press the button, and
  // the search runs from scratch rather than off the thirty second memory of
  // the shell answer.
  //
  // An answer this cannot get is not an answer that anybody is missing
  // anything: `certain: false` is what leaves the card silent, and a page that
  // could not reach the main process at all knows nothing about this Mac.
  async recheckClaude(): Promise<{ found: boolean; certain: boolean; url: string }> {
    const url = 'https://code.claude.com/docs/en/setup';
    if (useFixtures) {
      const w = fixtureSettingsState.workspace;
      return { found: !!w.claudeFound, certain: !!w.claudeCertain, url: w.claudeInstallUrl || url };
    }
    const zero = window.zero as any;
    if (!zero?.claudeRecheck) return { found: false, certain: false, url };
    try {
      const r = await zero.claudeRecheck();
      if (!r?.ok) return { found: false, certain: false, url };
      return {
        found: !!r.workspace?.claudeFound,
        certain: r.workspace?.claudeCertain === true,
        url: r.workspace?.claudeInstallUrl || url,
      };
    } catch {
      return { found: false, certain: false, url };
    }
  },

  // AND LOOK FOR CODEX AGAIN, from the Codex card on Settings. Same shape and
  // same failure answer as its sibling above, and the same reason for existing:
  // "install it, then check again" is a promise, and a button that reads a
  // thirty second old memory of a shell does not keep it.
  //
  // It is worth pressing for one more thing than Claude Code's is. What the
  // search finds is written onto `config.codexBin` in the main process, which
  // is the fact the Coding agent row is drawn from, so a press that finds Codex
  // is also what makes that row appear.
  /* * ADD A CODEX ACCOUNT. Main makes the folder and registers the
     login; what comes back is the one line the built-in terminal has to run,
     which is the browser sign in and is genuinely hers.
  */
  async addCodexAccount(): Promise<{ ok: boolean; command?: string; home?: string; error?: string }> {
    if (useFixtures) return { ok: true, command: 'CODEX_HOME=/tmp/.codex-2 codex login', home: '/tmp/.codex-2' };
    const zero = window.zero as any;
    if (!zero?.codexAddAccount) return { ok: false, error: RESTART_NOTE };
    try {
      const r = await zero.codexAddAccount();
      return r ?? { ok: false, error: 'could not add an account' };
    } catch (err) {
      return { ok: false, error: String((err as Error)?.message ?? err) };
    }
  },

  /* * AND A CLAUDE ACCOUNT, the same way (w-3498e0cad2). The two are separate
     calls rather than one call taking an engine because the folder each makes
     is a different kind of thing, and main is the only place that knows how
     either is named.
  */
  async addClaudeAccount(): Promise<{ ok: boolean; command?: string; home?: string; error?: string }> {
    if (useFixtures) return { ok: true, command: 'CLAUDE_CONFIG_DIR=/tmp/.claude-2 claude auth login', home: '/tmp/.claude-2' };
    const zero = window.zero as any;
    if (!zero?.claudeAddAccount) return { ok: false, error: RESTART_NOTE };
    try {
      const r = await zero.claudeAddAccount();
      return r ?? { ok: false, error: 'could not add an account' };
    } catch (err) {
      return { ok: false, error: String((err as Error)?.message ?? err) };
    }
  },

  async recheckCodex(): Promise<{ found: boolean; certain: boolean }> {
    if (useFixtures) {
      const codex = fixtureSettingsState.workspace.codex;
      return { found: !!codex?.found, certain: !!codex?.certain };
    }
    const zero = window.zero as any;
    if (!zero?.codexRecheck) return { found: false, certain: false };
    try {
      const r = await zero.codexRecheck();
      if (!r?.ok) return { found: false, certain: false };
      return { found: !!r.workspace?.found, certain: r.workspace?.certain === true };
    } catch {
      return { found: false, certain: false };
    }
  },

  /* * POINT AT THE CODING AGENT YOURSELF, when neither search can find it
     (w-ce8c1a9275). The picker opens in the main process and the choice is
     applied in the same call, so this call hands over WHICH agent and nothing
     else: no path off anybody's disk is ever passed back to be trusted.

     `search` is the way out of a wrong choice, and it needs no picker: it takes
     the path out of the config and lets the search have it again.

     A refusal is WORDS, not an error. Picking a folder, or a file that cannot
     be run, is an ordinary mistake at a file panel and the row prints what came
     back. Cancelling the panel is neither: `ok` with nothing changed.
  */
  async engineBin(engine: 'claude' | 'codex', action?: 'search'): Promise<Settings & { canceled?: boolean; refused?: string }> {
    if (useFixtures) return { ...emptySettings, ok: true, canceled: true };
    const zero = window.zero as any;
    if (!zero?.engineBin) return { ...emptySettings, ok: false, error: RESTART_NOTE };
    try {
      return await whileSystemWindowIsOpen(() => zero.engineBin({ engine, ...(action ? { action } : {}) }));
    } catch (err) {
      return { ...emptySettings, ok: false, error: String((err as Error)?.message ?? err) };
    }
  },

  // SETTING UP THEIR PLAN FOR THEM (w-9f6975906c): install a coding agent and
  // start its own sign-in. A page that cannot reach the main process answers
  // READY, because a walk that asks a question it can do nothing about is a
  // walk that traps somebody; the inbox's own checks still stand behind it.
  async engineSetup(action: 'ready' | 'start' | 'status' | 'again' | 'cancel', engine: 'claude' | 'codex'): Promise<EngineSetupState> {
    const assumeReady: EngineSetupState = { engine, phase: 'ready', error: null, log: '', found: true, signedIn: true };
    /*
     * A FIXTURE WORLD THAT SAYS THE COMPUTER IS EMPTY IS ANSWERED THAT WAY
     * (w-ce8c1a9275, 2026-10-09). The plan question runs this probe on arrival
     * now, so `assumeReady` below walked every fixture copy straight past the
     * one screen a brand new person meets and there was no url that could draw
     * it. `engines=nowhere` is exactly the machine it is for.
     */
    if (useFixtures && engineFixtures === 'nowhere') {
      return { engine, phase: 'idle', error: null, log: '', found: false, signedIn: false };
    }
    // AND THE SAME MACHINE WITH AN INSTALL RUNNING ON IT. The first probe is
    // `ready`, which has to answer empty or the gate never opens; every action
    // after it is the press, and it stays where it is so the screen can be
    // photographed waiting.
    if (useFixtures && engineFixtures === 'installing') {
      return { engine, phase: action === 'ready' ? 'idle' : 'installing', error: null, log: '', found: false, signedIn: false };
    }
    /*
     * AND THE MACHINE MOST PEOPLE ARRIVE ON (w-e217e577e5): Claude signed in
     * already, nothing else here. Every fixture copy answers `assumeReady` for
     * BOTH agents, which is a machine almost nobody has, so the screen that
     * says what was found could only ever be photographed saying it found two.
     */
    if (useFixtures && engineFixtures === 'ready') {
      const mine = engine === 'claude';
      return { engine, phase: mine ? 'ready' : 'idle', error: null, log: '', found: mine, signedIn: mine };
    }
    // AND THE MACHINE THAT MUST NOT BE SIGNED IN FOR: Codex on the disk, signed
    // out. `afterCheck` reads this as `found`, which draws and starts nothing.
    if (useFixtures && engineFixtures === 'signedout') {
      return { engine, phase: 'idle', error: null, log: '', found: engine === 'codex', signedIn: false };
    }
    const zero = window.zero as any;
    if (!zero?.engineSetup) return assumeReady;
    try {
      const r = await zero.engineSetup({ action, engine });
      // A PROBE THAT DID NOT RUN IS NOT A COMPUTER WITH NOTHING ON IT. The
      // setup card reads this as failed and says so; the inbox bar reads
      // `certain` and stays down.
      if (!r?.ok) return { ...assumeReady, phase: 'failed', found: false, signedIn: false, certain: false, error: r?.error ?? 'Setup could not start.' };
      return {
        engine, phase: r.phase ?? 'idle', error: r.error ?? null, log: r.log ?? '',
        found: !!r.found, signedIn: !!r.signedIn, certain: r.certain !== false,
        bin: r.bin ?? null, already: !!r.already,
      };
    } catch (e) {
      return { ...assumeReady, phase: 'failed', found: false, signedIn: false, certain: false, error: String((e as Error)?.message ?? e) };
    }
  },

  async setProjectSetting(p: { product: string; key: string; value: unknown }): Promise<Settings> {
    // Fixtures have no disk. The control still works and the page still
    // redraws; nothing claims anything was saved.
    if (useFixtures) return fixtureWrite('project', p);
    const zero = window.zero as any;
    if (!zero?.setProjectSetting) return { ...emptySettings, ok: false, error: RESTART_NOTE };
    return zero.setProjectSetting(p);
  },

  /* ---------------- what a project is called, and its mark ---------------- */
  // Both of these write the project's OWN project.json, so each hands back a
  // whole fresh settings model, exactly like every switch on the page does.
  //
  // A main process too old for the channel says so in the same sentence every
  // other missing handler uses rather than failing quietly. That sentence is why
  // RESTART_NOTE exists: this app gets edited while it is running.
  async renameProject(p: { product: string; name: string }): Promise<Settings> {
    if (useFixtures) return fixtureWrite('project', { product: p.product, key: 'name', value: p.name });
    const zero = window.zero as any;
    if (!zero?.projectRename) return { ...emptySettings, ok: false, error: RESTART_NOTE };
    return zero.projectRename(p);
  },

  // Opens the native picker in the main process and copies what she chose into
  // the project folder. `canceled` rides back on the model so the screen can
  // tell "she closed the panel" from "it worked", and say neither wrongly.
  async pickProjectIcon(p: { product: string }): Promise<Settings & { canceled?: boolean }> {
    if (useFixtures) return { ...emptySettings, ok: true, canceled: true };
    const zero = window.zero as any;
    if (!zero?.projectIcon) return { ...emptySettings, ok: false, error: RESTART_NOTE };
    return whileSystemWindowIsOpen(() => zero.projectIcon(p));
  },

  async clearProjectIcon(p: { product: string }): Promise<Settings> {
    if (useFixtures) return { ...emptySettings, ok: true };
    const zero = window.zero as any;
    if (!zero?.projectIconClear) return { ...emptySettings, ok: false, error: RESTART_NOTE };
    return zero.projectIconClear(p);
  },

  // Who sees a project's threads on the Team page (w-b989839656). The
  // snapshot that follows carries it back, so this answers only whether it
  // landed.
  async setProjectSeenBy(p: { product: string; who: 'private' | 'team' | 'people'; people?: string[] }): Promise<{ ok: boolean; error?: string }> {
    const zero = window.zero as any;
    if (!zero?.projectSeenBy) return { ok: false, error: RESTART_NOTE };
    return zero.projectSeenBy(p);
  },

  // Archive a project (off every list, files kept) or bring one back.
  async archiveProject(p: { product: string; archived: boolean }): Promise<Settings> {
    if (useFixtures) {
      // Moved between the two lists in memory, so the page can be clicked through.
      const s = fixtureSettingsState;
      s.archivedProjects ??= [];
      if (p.archived) {
        // ?fixtures=crowded lists projects Settings has no row for; they are
        // found by the same slug the crowded snapshot gives them.
        const crowded = CROWDED_NAMES
          .map((name) => ({ slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''), name, dir: `/fixtures/${name}` }))
          .find((x) => x.slug === p.product);
        const project = s.projects.find((x: any) => x.slug === p.product) ?? crowded;
        if (project && !s.archivedProjects.some((x: any) => x.slug === p.product)) {
          s.projects = s.projects.filter((x: any) => x.slug !== p.product);
          s.archivedProjects.push({ slug: project.slug, name: project.name, dir: project.dir });
        }
      } else {
        const back = s.archivedProjects.find((x: any) => x.slug === p.product);
        const original = fixtureSettings.projects.find((x: any) => x.slug === p.product);
        s.archivedProjects = s.archivedProjects.filter((x: any) => x !== back);
        if (back && original) s.projects.push(structuredClone(original));
      }
      return structuredClone(s) as Settings;
    }
    const zero = window.zero as any;
    if (!zero?.projectArchive) return { ...emptySettings, ok: false, error: RESTART_NOTE };
    return zero.projectArchive(p);
  },

  // TAKING THE AGENTS OFF THE FINISH CARD. One call, because the ticks and the
  // rows are one act: what she ticked is what arrives.
  //
  // A main process too old to have the channel still saves the ticks, so an app
  // whose window has been open across an upgrade behaves exactly as it did
  // before rather than throwing on the last press of the walk. `already` rides
  // back with it for the ⌘K card. The store has always counted it — a ticked
  // agent that already has a row is filed no second time (`agentsNeedingRows`)
  // — and the walk had no use for the number because in a walk nothing is ever
  // already there. Out of the walk, pressing this twice is the ORDINARY case:
  // the card opens with what was taken last time still ticked. A press that
  // reports three imports over a store that did not move is the exact defect
  // the import had before 2026-08-23.
  async importAgents(p: { product: string; agents: string[] }): Promise<{ added: number; already: number }> {
    if (useFixtures) return { added: p.agents.length, already: 0 };
    const zero = window.zero as any;
    if (!zero?.importAgents) {
      if (zero?.setProjectSetting) {
        try { await zero.setProjectSetting({ product: p.product, key: 'agents', value: p.agents }); } catch { /* nothing here is worth stopping the walk for */ }
      }
      return { added: 0, already: 0 };
    }
    try {
      const r = await zero.importAgents(p);
      return { added: Number(r?.added ?? 0), already: Number(r?.already ?? 0) };
    } catch {
      return { added: 0, already: 0 };
    }
  },

  /** The cloud menu's sign-in for one account, made in the cloud: start, paste Claude's code, or cancel. */
  async cloudSignIn(p: { action: 'start' | 'code' | 'cancel' | 'remove'; engine: 'claude' | 'codex'; key?: string | null; code?: string }): Promise<{ ok: boolean; key?: string | null; error?: string }> {
    const zero = window.zero as any;
    if (!zero?.cloudSignIn) return { ok: false, error: RESTART_NOTE };
    return zero.cloudSignIn(p);
  },

  /** Signing in to Agentbox Cloud itself, on the app's sign-in page: Google, email, a new account and its link again, or a password reset. */
  async cloudAccountSignIn(p: { method: 'google' | 'email' | 'sign-up' | 'resend' | 'agree' | 'reset' | 'reset-wait' | 'new-password'; email?: string; password?: string; name?: string; acceptTerms?: boolean }): Promise<{ ok: boolean; confirm?: boolean; needsTerms?: boolean; sent?: boolean; opened?: boolean; error?: string; cancelled?: boolean }> {
    const zero = window.zero as any;
    if (!zero?.cloudAccountSignIn) return { ok: false, error: RESTART_NOTE };
    return zero.cloudAccountSignIn(p);
  },
  async cloudAccountCancel(): Promise<void> { await (window.zero as any)?.cloudAccountCancel?.(); },
  async cloudAccountReopen(): Promise<void> { await (window.zero as any)?.cloudAccountReopen?.(); },
  async cloudAccountSignOut(): Promise<void> { await (window.zero as any)?.cloudAccountSignOut?.(); },
  async cloudAccountPlan(): Promise<CloudPlan> {
    // &cloudplan=pro draws someone on Pro, 6 running and 88 of 400 hours used.
    if (useFixtures) return params.get('cloudplan') === 'pro'
      ? { signedIn: true, plan: 'pro', unlimited: false, agents: 10, hoursPerMonth: 400, running: 6, usedSeconds: 88 * 3600 }
      : { signedIn: true, plan: 'none', unlimited: false, agents: 0, hoursPerMonth: 0, running: 0, usedSeconds: 0 };
    return (await (window.zero as any)?.cloudAccountPlan?.()) ?? { signedIn: false };
  },
  async cloudAccountPay(plan: 'pro' | 'plus' | 'max'): Promise<{ ok: boolean; where?: 'checkout' | 'billing'; error?: string; message?: string }> {
    const zero = window.zero as any;
    if (!zero?.cloudAccountPay) return { ok: false, message: RESTART_NOTE };
    return zero.cloudAccountPay({ plan });
  },
  async cloudAccountBilling(): Promise<{ ok: boolean; error?: string; message?: string }> {
    const zero = window.zero as any;
    if (!zero?.cloudAccountBilling) return { ok: false, message: RESTART_NOTE };
    return zero.cloudAccountBilling();
  },

  /** Claude's sign-in code from the clipboard, while a sign-in waits for one; else null. */
  async cloudClipboardCode(): Promise<string | null> {
    const zero = window.zero as any;
    if (!zero?.cloudClipboardCode) return null;
    try { return (await zero.cloudClipboardCode())?.code ?? null; } catch { return null; }
  },

  async setWorkspaceSetting(p: { key: string; value: unknown }): Promise<Settings> {
    if (useFixtures) return fixtureWrite('workspace', p);
    const zero = window.zero as any;
    if (!zero?.setWorkspaceSetting) return { ...emptySettings, ok: false, error: RESTART_NOTE };
    return zero.setWorkspaceSetting(p);
  },

  async projectInstructions(product: string): Promise<{ ok: boolean; text: string; error?: string }> {
    if (useFixtures) {
      const p = fixtureSettingsState.projects.find((x: any) => x.slug === product);
      return { ok: true, text: p?.instructions ?? '' };
    }
    const zero = window.zero as any;
    if (!zero?.projectInstructionsRead) return { ok: false, text: '', error: RESTART_NOTE };
    return zero.projectInstructionsRead({ product });
  },

  async writeProjectInstructions(product: string, text: string): Promise<{ ok: boolean; error?: string }> {
    if (useFixtures) {
      const p = fixtureSettingsState.projects.find((x: any) => x.slug === product);
      if (p) p.instructions = text;
      return { ok: false, error: 'fixtures have nowhere to save this' };
    }
    const zero = window.zero as any;
    if (!zero?.projectInstructionsWrite) return { ok: false, error: RESTART_NOTE };
    return zero.projectInstructionsWrite({ product, text });
  },

  // `ofMany` says this one is part of a press that connects several folders and
  // will count itself once (main/ipc.mjs); it changes nothing about the project.
  async createProduct(p: { name: string; repoPath?: string | null; ofMany?: boolean }) {
    if (useFixtures) return null;
    return window.zero!.createProduct(p);
  },

  // The Mac's own folder chooser. Null means "nothing picked", which covers
  // both a cancelled dialog and a main process too old to have this channel;
  // neither is an error and neither changes what the card is already holding.
  // AND IT CAN COME BACK WITH A REFUSAL. The home folder, the seven folders
  // macOS guards and the system's own directories are not projects, and a
  // worker started in one of them is the run of permission panels a tester
  // walked into. Main turns those down and sends back the sentence instead of
  // the path; a screen shows it and stays where it is.
  async chooseFolder(startIn?: string): Promise<{ path: string | null; refused?: string; browse?: boolean }> {
    // Fixtures cannot open a Mac dialog, so they answer as if she had picked
    // one. This is what lets the card's "pointed at a folder that already
    // exists" state be SHOT IN THE REAL APP rather than hand drawn.
    if (useFixtures) {
      if (params.has('refusedFolder')) {
        const turnedDown = checkProjectFolder('~');
        return { path: null, refused: turnedDown.ok ? undefined : turnedDown.say };
      }
      // A browser tab's answer, so the picker the app draws can be shot too.
      if (params.has('drawnPicker')) return { path: null, browse: true };
      return { path: '/Users/you/Desktop/dev/house' };
    }
    const zero = window.zero as any;
    if (!zero?.chooseFolder) return { path: null };
    // Nothing typed at the chooser is typed into the screen behind it. See
    // renderer/src/system-window.ts: on Linux the keys came through.
    const r = await whileSystemWindowIsOpen<{ path?: string | null; refused?: string; browse?: boolean }>(
      () => zero.chooseFolder({ startIn }),
    );
    // `browse` is a tab with no Mac dialog behind it. It is not a refusal and
    // it is not a cancel: the screen opens <FolderPicker> instead, which walks
    // this machine's disk through listFolders below and comes back with a real
    // path. Nothing else about the card changes.
    return { path: r?.path ?? null, refused: r?.refused ?? undefined, browse: r?.browse === true };
  },

  // ONE FOLDER'S WORTH OF THE DISK, for the picker the app draws itself.
  //
  // `refused` is about the folder she is STANDING IN, not the ones listed: it
  // says whether choosing this one would be turned down, so the picker can grey
  // its own button rather than let her press it and be told no afterwards.
  async listFolders(at?: string | null, showHidden = false): Promise<FolderListing> {
    if (useFixtures) return fixtureFolders(at ?? '~');
    const zero = window.zero as any;
    if (!zero?.listFolders) {
      return { at: at ?? '~', parent: null, home: '~', folders: [], unreadable: RESTART_NOTE };
    }
    const r = await zero.listFolders({ at, showHidden });
    return {
      at: r?.at ?? at ?? '~',
      parent: r?.parent ?? null,
      home: r?.home ?? '~',
      folders: Array.isArray(r?.folders) ? r.folders : [],
      refused: r?.refused ?? null,
      unreadable: r?.unreadable ?? undefined,
    };
  },

  // Whether the card's sentence may say "a new folder". Unknown reads as
  // "already there", because the quiet claim is the safe one: proposing to
  // make a folder that turns out to exist is the mistake worth avoiding.
  async folderExists(p: string): Promise<boolean> {
    if (useFixtures) return false;
    const zero = window.zero as any;
    if (!zero?.folderExists) return true;
    const r = await zero.folderExists({ path: p });
    return !!r?.exists;
  },

  // HER CLAUDE CODE AGENTS, for the last screen of the first run. Both scopes,
  // and whatever this project already took. A main process too old to have the
  // channel answers as if she had none, which lets the screen say the one true
  // thing it has for that case rather than hanging on a promise that never
  // settles.
  async agentFiles(p: { folder: string | null; product: string | null }): Promise<{
    user: AgentFileRow[]; project: AgentFileRow[]; chosen: string[] | null;
  }> {
    if (useFixtures) {
      const f = fixtureAgentFiles();
      // Two cases a developer's own Mac may not show, on the same fixture switch
      // every other screen here uses. `?fixtures=empty` is a Mac with no agent
      // files at all; `?noProjectAgents` is the ordinary case of a project
      // folder that has none of its own, which is most dev folders. Both are
      // drawn rather than argued about.
      if (emptyFixtures) return { user: [], project: [], chosen: null };
      if (params.has('noProjectAgents')) return { ...f, project: [] };
      return f;
    }
    const zero = window.zero as any;
    if (!zero?.agentFiles) return { user: [], project: [], chosen: null };
    try {
      const r = await zero.agentFiles(p);
      return { user: r?.user ?? [], project: r?.project ?? [], chosen: r?.chosen ?? null };
    } catch {
      return { user: [], project: [], chosen: null };
    }
  },

  // THE FOLDERS WITH AGENTS THAT ARE NOT PROJECTS YET.
  //
  // A folder's agents only work in that folder, so the card can never file them
  // elsewhere. What it can do is offer to make the project that keeps them
  // where they are, and this is the list of folders that offer is about.
  //
  // An empty list is the ordinary answer and the right one to fall back to: a
  // main process too old to have the channel, or a scan that threw on a folder
  // it could not read, both mean the card draws exactly what it drew before.
  async agentFolders(): Promise<AgentFolder[]> {
    if (useFixtures) {
      if (emptyFixtures || params.has('noOtherFolders')) return [];
      // WITH THE AGENTS IN IT, not just how many. The card draws a folder as a
      // section with its own agents ticked under it, so a fixture that carried
      // a count would draw a heading over nothing.
      return [{
        folder: '/home/dev/sidecar-desktop',
        short: '~/Desktop/dev/sidecar-desktop',
        name: 'sidecar-desktop',
        count: 4,
        agents: fixtureAgentFiles().project.map((a) => ({
          ...a, path: `/home/dev/sidecar-desktop/.claude/agents/${a.name}.md`,
        })),
      }];
    }
    const zero = window.zero as any;
    if (!zero?.agentFolders) return [];
    try {
      const r = await zero.agentFolders();
      return Array.isArray(r?.folders) ? r.folders : [];
    } catch { return []; }
  },

  // HER OWN CLAUDE CODE THREADS.
  //
  // Empty is the ordinary fallback and the right one, exactly as it is for
  // `agentFolders`: a main process too old to have the channel, or a walk that
  // threw on a folder it could not read, both mean the card draws the agent
  // files it always drew and says nothing it cannot back up.
  async agentThreads(): Promise<SessionThread[]> {
    if (useFixtures) {
      if (emptyFixtures || params.has('noThreads')) return [];
      return fixtureSessionThreads();
    }
    const zero = window.zero as any;
    if (!zero?.agentThreads) return [];
    try {
      const r = await zero.agentThreads();
      return Array.isArray(r?.threads) ? r.threads : [];
    } catch { return []; }
  },

  /**
   * EVERYTHING THE NAME FIELD CAN FIND, which is a year rather than ten days.
   *
   *  Taken once, the first time somebody types into the field, and held by the
   *  main process for the life of the window, so the keystrokes after it cost
   *  nothing. `reached` is the moment the read gave up at and zero when it got
   *  through the lot; the card prints it rather than answering "no such chat"
   *  over a read that stopped months ago. */
  async searchAgentThreads(p: { again?: boolean } = {}): Promise<{ threads: SessionThread[]; reached: number }> {
    if (useFixtures) {
      if (emptyFixtures || params.has('noThreads')) return { threads: [], reached: 0 };
      return { threads: fixtureSearchableThreads(), reached: 0 };
    }
    const zero = window.zero as any;
    if (!zero?.searchAgentThreads) return { threads: [], reached: 0 };
    try {
      const r = await zero.searchAgentThreads(p);
      return { threads: Array.isArray(r?.threads) ? r.threads : [], reached: Number(r?.reached ?? 0) };
    } catch { return { threads: [], reached: 0 }; }
  },

  // Ids only; the thread itself is the main process's own copy, so a row never
  // names a conversation off a screen that has been open since this morning.
  async importThreads(p: { product: string; threads: string[]; land?: 'sorted' | 'inbox' }): Promise<{ added: number; already: number; done: number }> {
    if (useFixtures) return { added: p.threads.length, already: 0, done: 0 };
    const zero = window.zero as any;
    if (!zero?.importThreads) return { added: 0, already: 0, done: 0 };
    try {
      const r = await zero.importThreads(p);
      // `done` is how many were filed in Done; an older main sends none.
      return { added: Number(r?.added ?? 0), already: Number(r?.already ?? 0), done: Number(r?.done ?? 0) };
    } catch { return { added: 0, already: 0, done: 0 }; }
  },

  async pauseSupervisor(paused: boolean) {
    if (useFixtures) return;
    return window.zero!.pauseSupervisor(paused);
  },

  onChanged(fn: () => void): () => void {
    if (useFixtures) return () => {};
    return window.zero!.onChanged(fn);
  },

  /** The phone door (main/phone-link.mjs). Null where there is none: the
   *  fixtures, and a browser tab, whose server has no such channel. */
  async phoneLink(p: { action: 'status' | 'on' | 'off' | 'reset' | 'via' | 'stop-alerts'; via?: PhoneRoute; device?: string }): Promise<PhoneLink | null> {
    if (useFixtures) return null;
    const zero = window.zero as any;
    if (!zero?.phoneLink) return null;
    try { return await zero.phoneLink(p); } catch { return null; }
  },

  onPhoneChanged(fn: () => void): () => void {
    const zero = window.zero as any;
    if (useFixtures || !zero?.onPhoneChanged) return () => {};
    return zero.onPhoneChanged(fn);
  },
};
