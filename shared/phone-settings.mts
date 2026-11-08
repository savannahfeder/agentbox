// YOUR COMPUTER'S SETTINGS ON YOUR PHONE: the copy the Mac sends, and the
// changes the phone may ask for. The Mac's own handlers (main/settings.mts)
// still decide every value. This keeps paths and instruction text out of the
// cloud, and refuses any key the phone has no page for.
import { CLAUDE_PERMISSION_MODES } from './work-items.mts';
import { CODEX_MODE_ORDER } from './codex-modes.mts';
import { AGENT_MODES } from './agents.mts';
import { WEB_ALERTS_KEY, WEB_ALERTS_TEST_KEY, webAlertsOk, webAlertsTestOk } from './web-alerts.mts';
import { isRepeatRule } from './repeats.mts';

export const SETTINGS_VERSION = 1;

/** A setting change as the phone sends it. Every field is only the phone's word until `checkSetting` agrees. */
export type SettingChange = {
  scope: string;
  key: string;
  value?: unknown;
  product?: string;
  item?: string;
  id?: string;
};

/** A value the phone sent, read field by field once it is known to be an object. */
type Fields = Record<string, unknown>;

// A method's type, so a rule that reads fields can name them and still take whatever the phone sent.
type Rule = { check(value: unknown): boolean }['check'];

/** The parts of the Mac's settings model (main/settings.mts) the phone's copy is made from. */
export interface SettingsModel {
  ok?: boolean;
  workspace?: {
    cloudPlan?: unknown;
    cornerTag?: boolean;
    diagnostics?: boolean;
    adhdMode?: boolean;
    alpha?: { rooms?: boolean; teammates?: boolean; multiplayer?: boolean };
    importNew?: boolean;
    outsideAgents?: string;
    permission?: string;
    codexMode?: string | null;
    engineChoices?: { id: string }[];
    claudeModels?: { id: string; label: string; model: string; defaultLevel?: string | null }[];
    codexFreePlan?: boolean;
    engine?: unknown;
    codexModels?: { id?: string; label?: unknown; levels?: unknown; defaultLevel?: unknown }[];
    codexModelDefault?: unknown;
    claudeFound?: boolean;
    codex?: { found?: boolean; accounts?: CodexAccountModel[] };
    agentsAuto?: boolean;
    sessionsAtOnce?: number;
    agentsTotal?: number;
    agentsAutoTotal?: number;
    agentsNudge?: number;
    slotsMax?: number;
    slotsSuggested?: number;
    running?: number;
    memoryGate?: { on?: boolean; slots?: number | null; slotsAuto?: number | null; slotsMax?: number | null; now?: string | null };
    leftovers?: { on?: boolean; now?: string | null };
    accounts?: ClaudeAccountModel[];
  };
  projects?: { slug: string; name: string; onPhone?: boolean; autonomous?: boolean; permission?: string; codexMode?: string; account?: string | null; running?: number }[];
}

interface ClaudeAccountModel {
  profile?: string | null;
  email?: string | null;
  chosen?: boolean;
  state?: string;
  trouble?: { note?: string | null; resetsAt?: number | null } | null;
  plan?: { label?: string | null } | null;
  running?: number;
}

interface CodexAccountModel {
  profile?: string | null;
  email?: string | null;
  name?: string | null;
  plan?: string | null;
  signedIn?: boolean;
  chosen?: boolean;
}

/** The window's own IPC channel for a change, and what it is handed. */
export type SettingRoute = [string, Record<string, unknown>];

/** A login by the last part of its folder's name; the folder itself stays on the Mac. */
export const accountIdOf = (profile: string | null | undefined): string => (profile === 'default' ? 'default' : String(profile ?? '').split(/[\\/]/).filter(Boolean).pop() ?? '');

const ACCOUNT_ID = /^[\w.-]{1,80}$/;
const SLUG = /^[a-z0-9][\w-]{0,119}$/i;
const bool = (v: unknown): v is boolean => typeof v === 'boolean';
const oneOf = (list: readonly unknown[]) => (v: unknown): boolean => list.includes(v);
const count = (v: unknown): boolean => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 64;
const accountId = (v: unknown): boolean => typeof v === 'string' && ACCOUNT_ID.test(v) && v !== '.' && v !== '..';

const WORKSPACE: Record<string, Rule> = {
  cornerTag: bool,
  diagnostics: bool,
  adhdMode: bool,
  alphaRooms: bool,
  alphaTeammates: bool,
  alphaMultiplayer: bool,
  importNew: bool,
  agentsAuto: bool,
  memoryGate: bool,
  cleanupLeftovers: bool,
  sessionsAtOnce: count,
  memoryGateSlots: (v: unknown) => v === null || count(v),
  agentsFeltSlow: oneOf(['more', 'reset']),
  outsideAgents: oneOf(AGENT_MODES),
  permission: oneOf(CLAUDE_PERMISSION_MODES),
  codexMode: oneOf(CODEX_MODE_ORDER),
  phoneProjects: (v: Fields | null) => !!v && bool(v.all) && Array.isArray(v.except) && v.except.length <= 500 && v.except.every((s: unknown) => typeof s === 'string' && SLUG.test(s)),
  activeAccount: (v: Fields | null) => !!v && oneOf(['claude', 'codex'])(v.engine) && (v.account === null || accountId(v.account)),
  // The web app's alerts: kept by the phone pass itself (main/phone-alerts.mts), never the window's.
  [WEB_ALERTS_KEY]: webAlertsOk,
  [WEB_ALERTS_TEST_KEY]: webAlertsTestOk,
};
const PROJECT: Record<string, Rule> = {
  autonomous: bool,
  permission: oneOf(['workspace', ...CLAUDE_PERMISSION_MODES]),
  codexMode: oneOf(['workspace', ...CODEX_MODE_ORDER]),
  account: (v: unknown) => v === 'any' || accountId(v),
};

// A pin is one person's list on one computer (main/supervisor.mts
// threadPins), so it travels as a setting of that computer, not a thread command.
const THREAD: Record<string, Rule> = { pinned: bool };
const THREAD_ID = /^[\w-]{1,120}$/;

/** Why the Mac should not carry out this change, or null. */
export function checkSetting(p: SettingChange | null | undefined): string | null {
  if (!p || typeof p !== 'object') return 'not a setting';
  if (p.scope === 'repeat') return checkRepeatChange(p);
  if (p.scope === 'teammate') return checkTeammateAsk(p);
  const rules = p.scope === 'workspace' ? WORKSPACE : p.scope === 'project' ? PROJECT : p.scope === 'thread' ? THREAD : null;
  if (!rules || !Object.hasOwn(rules, p.key)) return 'not a setting your phone can change';
  if (p.scope !== 'workspace' && !(typeof p.product === 'string' && SLUG.test(p.product))) return 'that setting needs its project';
  if (p.scope === 'thread' && !(typeof p.item === 'string' && THREAD_ID.test(p.item))) return 'that needs its thread';
  return rules[p.key](p.value) ? null : 'not a value that setting takes';
}

// A REPEATING TASK MADE, CHANGED OR ENDED ON A PHONE, handed to the window's
// own three handlers (main/ipc.mts), which still gate the engine and model.
const REPEAT_ID = /^[\w-]{1,120}$/;
const REPEAT_FIELDS: Record<string, Rule> = {
  title: (v: unknown) => typeof v === 'string' && v.trim().length > 0 && v.length <= 500,
  body: (v: unknown) => typeof v === 'string' && v.length <= 20_000,
  priority: (v: unknown) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 9,
  engine: (v: unknown) => v === 'claude' || v === 'codex',
  model: (v: unknown) => typeof v === 'string' && v.length > 0 && v.length <= 100,
};
const SCHEDULE = ['every', 'on', 'at'];
const scheduleOf = (v: Fields) => ({ every: v.every, ...(v.every === 'week' ? { on: v.on } : {}), at: v.at });

function checkRepeatChange(p: SettingChange): string | null {
  if (!['new', 'change', 'end'].includes(p.key)) return 'not a setting your phone can change';
  if (!(typeof p.product === 'string' && SLUG.test(p.product))) return 'that setting needs its project';
  if (p.key !== 'new' && !(typeof p.id === 'string' && REPEAT_ID.test(p.id))) return 'that needs its repeating task';
  if (p.key === 'end') return p.value === true ? null : 'not a value that setting takes';
  const v = p.value as Fields | null | undefined;
  if (!v || typeof v !== 'object' || Array.isArray(v)) return 'not a value that setting takes';
  const keys = Object.keys(v);
  if (keys.some((k) => !Object.hasOwn(REPEAT_FIELDS, k) && !SCHEDULE.includes(k))) return 'not a value that setting takes';
  if (p.key === 'new' && !REPEAT_FIELDS.title(v.title)) return 'a repeating task needs its words';
  if (keys.some((k) => REPEAT_FIELDS[k] && !REPEAT_FIELDS[k](v[k]))) return 'not a value that setting takes';
  // The schedule is whole or absent: half of one cannot be checked.
  const timed = keys.some((k) => SCHEDULE.includes(k));
  if ((p.key === 'new' || timed) && !isRepeatRule(v)) return 'not a schedule this computer can keep';
  if (p.key === 'change' && !keys.length) return 'not a value that setting takes';
  return null;
}

/** A change `checkSetting` let through, whose value has the fields its key's rule read. */
type Checked = SettingChange & { value: Fields };

function repeatRoute(p: Checked): SettingRoute {
  if (p.key === 'end') return ['zero:end-repeat', { product: p.product, id: p.id }];
  const { title, body, priority, engine, model } = p.value;
  const timed = SCHEDULE.some((k) => Object.hasOwn(p.value, k));
  if (p.key === 'change') {
    const rule = Object.fromEntries(Object.entries({ title, body, priority, engine, model }).filter(([, v]) => v !== undefined));
    return ['zero:set-repeat', { product: p.product, id: p.id, rule: timed ? { ...rule, ...scheduleOf(p.value) } : rule }];
  }
  return ['zero:compose-repeat', {
    product: p.product, title, body: body ?? '', priority: priority ?? 5, rule: scheduleOf(p.value),
    ...(engine ? { engine } : {}), ...(model ? { model } : {}),
  }];
}

// WHAT THE PHONE MAY ASK OF YOUR AI TEAMMATES, handed to the window's own door
// (main/ipc.mts `zero:teammates`), which still refuses with teammates off. It
// rides as a setting so the cloud's command table needs no new kind.
const MATE_ID = /^t-[\w-]{1,60}$/;
const words = (v: unknown, n: number): boolean => typeof v === 'string' && v.trim().length > 0 && v.length <= n;
const TEAMMATE_ASKS: Record<string, Rule> = {
  // A message in your chat with one or more of them; `answers` picks among its questions' options.
  post: (v: Fields) => words(v.text, 8000) && Array.isArray(v.to) && v.to.length >= 1 && v.to.length <= 10 && v.to.every((x: string) => MATE_ID.test(x))
    && (v.fresh === undefined || typeof v.fresh === 'boolean')
    && (v.answers === undefined || (!!v.answers && typeof v.answers === 'object' && !Array.isArray(v.answers)
      && Object.entries(v.answers).length <= 20 && Object.entries(v.answers).every(([q, a]) => /^[\w-]{1,80}$/.test(q) && words(a, 2000)))),
  // Pause or resume one, the window's own Pause switch.
  pause: (v: Fields) => typeof v.id === 'string' && MATE_ID.test(v.id) && typeof v.paused === 'boolean',
  // Someone new, from one of the starters or your own words, working in one of your projects.
  describe: (v: Fields) => (words(v.text, 8000) || (typeof v.starter === 'string' && /^[a-z]{1,40}$/.test(v.starter)))
    && typeof v.product === 'string' && SLUG.test(v.product),
  // Your yes to work held after too many hand-offs.
  // `test` reads a missing id as "undefined", which no id matches.
  goAhead: (v: Fields) => MATE_ID.test(v.id as string) && typeof v.ref === 'string' && /^[\w-]{1,80}$/.test(v.ref),
};
function checkTeammateAsk(p: SettingChange): string | null {
  if (!Object.hasOwn(TEAMMATE_ASKS, p.key)) return 'not something your phone can ask a teammate';
  const v = p.value;
  if (!v || typeof v !== 'object' || Array.isArray(v)) return 'not a value that takes';
  return TEAMMATE_ASKS[p.key](v) ? null : 'not a value that takes';
}
function teammateRoute(p: Checked): SettingRoute {
  const v = p.value;
  if (p.key === 'post') return ['zero:teammates', { op: 'post', args: { text: v.text, to: v.to, ...(v.fresh ? { fresh: true } : {}), ...(v.answers ? { answers: v.answers } : {}) } }];
  if (p.key === 'pause') return ['zero:teammates', { op: 'update', args: { id: v.id, patch: { paused: v.paused } } }];
  if (p.key === 'describe') return ['zero:teammates', { op: 'describe', args: { ...(v.starter ? { starter: v.starter } : { text: v.text }), greeted: true, product: v.product } }];
  return ['zero:teammates', { op: 'goAhead', args: { id: v.id, ref: v.ref } }];
}

function profileFor(model: SettingsModel | null | undefined, engine: unknown, id: unknown): string | null | undefined {
  if (id === null) return null;
  const list: { profile?: string | null }[] | undefined = engine === 'codex' ? model?.workspace?.codex?.accounts : model?.workspace?.accounts;
  const hit = (list ?? []).find((a) => accountIdOf(a.profile) === id);
  if (!hit) throw new Error('that account is not on this computer');
  return hit.profile;
}

/** The window's own handler for a change `checkSetting` let through, and what to hand it. */
export function settingRoute(p: SettingChange, model: SettingsModel | null | undefined): SettingRoute {
  if (p.scope === 'thread') return ['zero:set-thread-pins', { pins: { [p.item!]: p.value === true ? true : null } }];
  if (p.scope === 'repeat') return repeatRoute(p as Checked);
  if (p.scope === 'teammate') return teammateRoute(p as Checked);
  if (p.scope === 'project') {
    const value = p.key === 'account' && p.value !== 'any' ? profileFor(model, 'claude', p.value) : p.value;
    return ['zero:settings-set-project', { product: p.product, key: p.key, value }];
  }
  const value = p.key === 'activeAccount' ? { engine: (p.value as Fields).engine, profile: profileFor(model, (p.value as Fields).engine, (p.value as Fields).account) } : p.value;
  return ['zero:settings-set-workspace', { key: p.key, value }];
}

/**
 * What the phone's Settings pages draw, from the Mac's settings model. Null
 * when the Mac could not read its own settings.
 */
export function phoneSettingsOf(model: SettingsModel | null | undefined, { version }: { version?: string | null }) {
  if (!model?.ok || !model.workspace) return null;
  const w = model.workspace;
  const gate = w.memoryGate ?? {};
  return {
    v: SETTINGS_VERSION,
    version: String(version ?? ''),
    workspace: {
      // What the web app gives a paid plan, dictation (renderer/src/web-speech.ts).
      plan: typeof w.cloudPlan === 'string' ? w.cloudPlan : null,
      cornerTag: !!w.cornerTag,
      diagnostics: !!w.diagnostics,
      adhdMode: !!w.adhdMode,
      alpha: { rooms: !!w.alpha?.rooms, teammates: !!w.alpha?.teammates, multiplayer: !!w.alpha?.multiplayer },
      importNew: w.importNew === true,
      outsideAgents: w.outsideAgents,
      permission: w.permission,
      codexMode: w.codexMode ?? null,
      engines: (w.engineChoices ?? []).map((e) => e.id),
      claudeModels: (w.claudeModels ?? []).map(({ id, label, model, defaultLevel }) => ({ id, label, model, defaultLevel })),
      codexFreePlan: !!w.codexFreePlan,
      // WHAT To AND Model OFFER ON THE PHONE AND THE WEB (w-24119e8784): the
      // agent a thread runs on when nobody picks, and Codex's models with their
      // own levels. Names and words only, never a path.
      engine: typeof w.engine === 'string' ? w.engine : null,
      codexModels: (Array.isArray(w.codexModels) ? w.codexModels : [])
        .filter((m) => typeof m?.id === 'string' && m.id)
        .map((m) => ({ id: m.id, label: typeof m.label === 'string' ? m.label : m.id, levels: Array.isArray(m.levels) ? m.levels.filter((l: unknown) => typeof l === 'string') : [], defaultLevel: typeof m.defaultLevel === 'string' ? m.defaultLevel : null })),
      codexModelDefault: typeof w.codexModelDefault === 'string' && w.codexModelDefault ? w.codexModelDefault : null,
      claude: { found: !!w.claudeFound },
      codex: { found: !!w.codex?.found },
      agentsAuto: !!w.agentsAuto,
      sessionsAtOnce: w.sessionsAtOnce,
      agentsTotal: w.agentsTotal,
      agentsAutoTotal: w.agentsAutoTotal,
      agentsNudge: w.agentsNudge ?? 0,
      slotsMax: w.slotsMax,
      slotsSuggested: w.slotsSuggested,
      running: w.running,
      memoryGate: { on: !!gate.on, slots: gate.slots ?? null, slotsAuto: gate.slotsAuto ?? null, slotsMax: gate.slotsMax ?? null, now: gate.now ?? null },
      leftovers: { on: !!w.leftovers?.on, now: w.leftovers?.now ?? null },
      accounts: (w.accounts ?? []).map((a) => ({
        id: accountIdOf(a.profile), email: a.email ?? null, chosen: !!a.chosen, state: a.state,
        note: a.trouble?.note ?? null, resetsAt: a.trouble?.resetsAt ?? null, plan: a.plan?.label ?? null, running: a.running ?? 0,
      })),
      codexAccounts: (w.codex?.accounts ?? []).map((a) => ({
        id: accountIdOf(a.profile), email: a.email ?? null, name: a.name ?? null, plan: a.plan ?? null, signedIn: !!a.signedIn, chosen: !!a.chosen,
      })),
    },
    projects: (model.projects ?? []).map((p) => ({
      slug: p.slug, name: p.name, onPhone: !!p.onPhone, autonomous: !!p.autonomous,
      permission: p.permission, codexMode: p.codexMode, account: p.account === 'any' ? 'any' : accountIdOf(p.account), running: p.running ?? 0,
    })),
  };
}
