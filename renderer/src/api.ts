import { artifactSampleChange, artifactSampleNotes, reviewSampleChange } from './artifact-fixtures';
import {updateFixture} from './agent-update-fixture';
// One seam between the UI and the world. Real mode talks to the preload
// bridge; fixtures mode (?fixtures=1) serves canned data so the UI can be
// developed, reviewed, and screenshotted without a live store or any agents.

import type { AgentConversation, AnswerMode, DemoOpened, FolderListing, FreshUser, PermissionMode, RepeatRule, RepeatShape, Settings, Snapshot, TeamCallResult, ThreadEditPatch, UpdateState, WorkItem } from './types';
import type { LedgerLine } from './thread-history';
import type { AgentFile as AgentFileRow } from './onboarding';
import type { AgentFolder, SessionThread } from './agent-import-card';
import { fixtureAgents, fixtureSnapshot, fixtureDashboards, fixtureRepeats, fixtureRuns, fixtureMock, fixtureMockDashboards, fixtureTraces, fixtureHistory, fixtureSettings, fixtureConversation, fixtureAgentFiles, fixtureSessionThreads } from './fixtures';
import { fixtureEngineWorld, fixtureEngineSettings, fixtureSecondEngine } from './fixtures';
import { fixtureFolders } from './fixtures';
import { NAME, Name } from '../../shared/product-name.mjs';
// THE SECOND FRONT DOOR, AND IT HAS TO BE BUILT BEFORE THE LINE BELOW RUNS.
// `useFixtures` reads `window.zero` once, at module load, and on the desktop
// preload.cjs has already put it there. In a browser tab nothing has, so this
// builds the same object out of http first. Imports are evaluated before the
// body that imports them, so calling it here means no other file has to
// remember to, and no import order anywhere can get it wrong.
import { installBrowserBridge } from './browser-bridge';

installBrowserBridge();

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
const modelUpdateFixture=updateFixture(params.get('modelUpdates')==='fail');
const useFixtures = params.has('fixtures') || typeof window === 'undefined' || !window.zero;
const emptyFixtures = params.get('fixtures') === 'empty';
// ?working=3 puts three running agents into ?fixtures=empty. The empty
// fixture has an empty inbox AND an empty fleet, and the app draws nothing
// at all when no agent is working, so there is no way to photograph
// "Three agents working." without this.
// The number is hers to pass; nothing else about the fixture changes.
const workingFixtures = Math.max(0, Math.min(99, Number(params.get('working') ?? 0) || 0));
// ?fixtures=crowded reproduces a real crowded picker: twenty two projects,
// duplicates and scratch included. That is the only shape where the composer's
// chips WRAP, and ranking-by-dragging was written against a single row, so it
// silently did nothing across rows. This is the case that catches that.
const crowdedFixtures = params.get('fixtures') === 'crowded';
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
    diagnostics: true, diagnosticsDestination: false, adhdMode: false,
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

function fixtureWrite(scope: 'project' | 'workspace', p: any): Settings {
  const w = fixtureSettingsState.workspace;
  if (scope === 'workspace') {
    if (p.key === 'sessionsAtOnce') {
      w.sessionsAtOnce = Math.max(1, Math.min(w.slotsMax ?? 12, Number(p.value) || 1));
      w.capacity = w.sessionsAtOnce * Math.max(1, w.accounts.length);
    } else if (p.key === 'memoryGate' && w.memoryGate) {
      w.memoryGate = { ...w.memoryGate, on: !!p.value, now: p.value ? 'Memory is fine. Nothing heavy running.' : null };
    } else if (p.key === 'cleanupLeftovers' && w.leftovers) {
      w.leftovers = { on: !!p.value, now: p.value ? 'Finished agents have left 6 programs running. 4 stop in 1 h 40 m; 2 are kept.' : null };
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

export const api = {
  isFixtures: useFixtures,

  async snapshot(): Promise<Snapshot> {
    if (emptyFixtures) {
      const empty = { ...structuredClone(fixtureSnapshot), items: [], approvals: [], supervisor: { paused: false, running: [], capacity: 3 } };
      // AND THE AGENTS THE BAR COUNTS. Real running entries rather than a number
      // poked in, so the bar counts the same array the app counts everywhere
      // else. The inbox stays empty, which is what keeps the idle page up.
      if (workingFixtures) {
        empty.supervisor.running = Array.from({ length: workingFixtures }, (_x, i) => ({
          itemId: `w-working-${i + 1}`, product: 'kestrel', startedAt: Date.now() - (i + 1) * 60_000,
          tail: ['tool: Read'],
        })) as typeof empty.supervisor.running;
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
      // &update=ready|downloading|current|error summons the updater's states.
      // Same reason as &stale above: an update that has downloaded itself is by
      // definition something you cannot make happen on demand, so without this
      // the row she is meant to press could never be looked at before shipping.
      const wanted = params.get('update');
      if (wanted) {
        const shapes: Record<string, Partial<NonNullable<typeof base.update>>> = {
          // `readyAt` is set back on purpose: the inbox row wears it, and a
          // fixture stamped "now" would photograph a time no real update has by
          // the moment she reads it.
          ready: { phase: 'ready', newVersion: '0.2.0', percent: 100, ready: true, readyAt: Date.now() - 62 * 60_000 },
          downloading: { phase: 'downloading', newVersion: '0.2.0', percent: 47 },
          // A copy run from source (main/source-updater.mjs): versions are
          // commit ids, and the row lists what changed.
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
        };
        base.update = {
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
      // The approval queue is opt-in (&approvals): a worker frozen mid-command
      // is a real state worth being able to look at, and it is not the state
      // every other fixtures screenshot wants a card floating over.
      if (!params.has('approvals')) base.approvals = [];
      return fixtureSecondEngine(base, engineFixtures);
    }
    return window.zero!.snapshot();
  },

  // KEEPING AGENTBOX CURRENT. Through the seam like everything else, so both
  // buttons can be built and looked at with no packaged app behind them.
  // Fixtures answer the way a real installed copy would: the check finds
  // something, and the restart reports that it started.
  async updateCheck(): Promise<UpdateState> {
    if (useFixtures) {
      return {
        phase: 'ready', currentVersion: '0.1.0', newVersion: '0.2.0',
        percent: 100, error: null, checkedAt: Date.now(), readyAt: Date.now(), ready: true,
      };
    }
    return window.zero!.updateCheck();
  },

  async updateInstall(): Promise<{ started: boolean }> {
    if (useFixtures) return { started: true };
    return window.zero!.updateInstall();
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
  async itemHistory(p: { product: string; id: string }): Promise<{ ok: boolean; lines: LedgerLine[]; error?: string }> {
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
    if (useFixtures) return ['code-review','simplify','verify'];
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
  // `model` and `effort` are the reply box's drawer: which model picks up the
  // run this reply starts. Undefined means she never opened it and the row
  // keeps what it had; null clears it back to the engine's own choice.
  // `now` cuts the running agent's current step so this message is answered at
  // once instead of after it (main/claude-input.mjs `interrupt`).
  async answer(p: { product: string; id: string; answer?: string; status?: string; priority?: number; permissionMode?: AnswerMode | null; model?: string | null; effort?: string | null; now?: boolean }): Promise<WorkItem | null> {
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
  // A MESSAGE TO A PERSON (people get messages, never tasks).
  async teamMessage(to: string | string[], body: string): Promise<TeamCallResult> { return teamCall(() => window.zero!.teamMessage({ to, body })); },
  // An edit to a thread's summary, visibility or priority, made in place.
  async threadEdit(product: string, id: string, patch: ThreadEditPatch): Promise<{ ok: boolean; error?: string }> {
    if (useFixtures || !window.zero?.threadEdit) return { ok: true };
    try { return await window.zero.threadEdit({ product, id, patch }); } catch (err) { return { ok: false, error: String((err as Error)?.message ?? err) }; }
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

  /* ------------------------------ the first run ---------------------------- */
  // THE WALK'S EXAMPLE TASK IS ANSWERED BY THE APP.Main reads the readme in the
  // folder chosen two screens earlier and writes the result on the real row;
  // there is no session, so this returns in milliseconds and the two second
  // pause in front of it is the walk's, not the work's.
  async firstRunAnswer(p: { product: string; id: string }): Promise<{ line: string; found: boolean } | null> {
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
  async openFreshUser(withAgents = true): Promise<FreshUser> {
    if (useFixtures) return { ok: false, error: 'Not in this preview.' };
    const zero = window.zero as Window['zero'];
    if (!zero?.openFreshUser) {
      return { ok: false, error: `This window is running an older ${NAME}. Quit it and open it again.` };
    }
    try {
      return await zero.openFreshUser({ withAgents });
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
    return zero.projectIcon(p);
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

  async createProduct(p: { name: string; repoPath?: string | null }) {
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
        return { path: null, refused: 'That is your whole home folder. Agents would work across everything on this Mac, and macOS will ask you about Downloads, Music and every app you have. Pick the folder your project\u2019s code is in.' };
      }
      return { path: '/Users/you/Desktop/dev/house' };
    }
    const zero = window.zero as any;
    if (!zero?.chooseFolder) return { path: null };
    const r = await zero.chooseFolder({ startIn });
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

  // Ids only; the thread itself is the main process's own copy, so a row never
  // names a conversation off a screen that has been open since this morning.
  async importThreads(p: { product: string; threads: string[] }): Promise<{ added: number; already: number }> {
    if (useFixtures) return { added: p.threads.length, already: 0 };
    const zero = window.zero as any;
    if (!zero?.importThreads) return { added: 0, already: 0 };
    try {
      const r = await zero.importThreads(p);
      return { added: Number(r?.added ?? 0), already: Number(r?.already ?? 0) };
    } catch { return { added: 0, already: 0 }; }
  },

  async pauseSupervisor(paused: boolean) {
    if (useFixtures) return;
    return window.zero!.pauseSupervisor(paused);
  },

  onChanged(fn: () => void): () => void {
    if (useFixtures) return () => {};
    return window.zero!.onChanged(fn);
  },
};
