// YOUR COMPUTER'S SETTINGS ON YOUR PHONE: the copy the Mac sends, and the
// changes the phone may ask for. The Mac's own handlers (main/settings.mts)
// still decide every value. This keeps paths and instruction text out of the
// cloud, and refuses any key the phone has no page for.
import { CLAUDE_PERMISSION_MODES } from './work-items.mts';
import { CODEX_MODE_ORDER } from './codex-modes.mts';
import { AGENT_MODES } from './agents.mts';
import { WEB_ALERTS_KEY, WEB_ALERTS_TEST_KEY, webAlertsOk, webAlertsTestOk } from './web-alerts.mts';
import { isRepeatRule } from './repeats.mts';
import { rankProducts } from './rank.mts';

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
    memoryGate?: { on?: boolean; slots?: number | null; slotsAuto?: number | null; slotsMax?: number | null; now?: string | null; reading?: unknown };
    leftovers?: { on?: boolean; now?: string | null };
    accounts?: ClaudeAccountModel[];
    cloudPermission?: unknown;
    cloudCodexMode?: unknown;
    agentsRunning?: boolean;
    productOrder?: unknown;
  };
  projects?: { slug: string; name: string; createdAt?: number | null; onPhone?: boolean; autonomous?: boolean; permission?: string; codexMode?: string; account?: string | null; running?: number }[];
  /** Laid on by the phone pass (main/main.mts phoneSettings). */
  cloud?: CloudModel | null;
  usage?: { claude?: unknown; codex?: unknown } | null;
  links?: readonly (LinkModel | null | undefined)[];
}

/** One usage limit as shared/usage.mts reads it; only its numbers and reset times travel. */
interface UsageLimitModel {
  span?: unknown;
  qualifier?: unknown;
  name?: unknown;
  percent?: unknown;
  resetsText?: unknown;
  resetsOn?: unknown;
  resetsAt?: unknown;
  reset?: unknown;
}

interface CloudAccountModel {
  engine?: unknown;
  state?: unknown;
  inUse?: unknown;
  name?: unknown;
  profile?: unknown;
  plan?: unknown;
  limitedUntil?: unknown;
  readAt?: unknown;
  limits?: unknown;
}

/** The cloud's status as the supervisor reports it (main/supervisor.mts cloudStatus). */
interface CloudModel {
  setUp?: boolean;
  accounts?: unknown;
  mode?: unknown;
  whenOn?: unknown;
}

/** A public link as the cloud lists it; `source`, a path on this computer, never travels. */
interface LinkModel { token?: unknown; name?: unknown; url?: unknown; createdAt?: unknown; updatedAt?: unknown; comments?: unknown }

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';

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

/** The window's own IPC channel for a change, and what it is handed: an object, or a bare value such as Pause's boolean. */
export type SettingRoute = [string, unknown];

/** A login by the last part of its folder's name; the folder itself stays on the Mac. */
export const accountIdOf = (profile: string | null | undefined): string => (profile === 'default' ? 'default' : String(profile ?? '').split(/[\\/]/).filter(Boolean).pop() ?? '');

const ACCOUNT_ID = /^[\w.-]{1,80}$/;
const SLUG = /^[a-z0-9][\w-]{0,119}$/i;
const bool = (v: unknown): v is boolean => typeof v === 'boolean';
const oneOf = (list: readonly unknown[]) => (v: unknown): boolean => list.includes(v);
const count = (v: unknown): boolean => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 64;
const accountId = (v: unknown): boolean => typeof v === 'string' && ACCOUNT_ID.test(v) && v !== '.' && v !== '..';
// main/cloud-permission.mts CLOUD_SAME: the cloud starts in this computer's mode.
const CLOUD_SAME = 'same';
const LINK_TOKEN = /^[\w-]{8,128}$/;
const slugList = (v: unknown): boolean => Array.isArray(v) && v.length >= 1 && v.length <= 500 && v.every((s: unknown) => typeof s === 'string' && SLUG.test(s)) && new Set(v).size === v.length;

const WORKSPACE: Record<string, Rule> = {
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
  cloudRuns: oneOf(['mac', 'full', 'all']),
  cloudPermission: oneOf([CLOUD_SAME, ...CLAUDE_PERMISSION_MODES]),
  cloudCodexMode: oneOf([CLOUD_SAME, ...CODEX_MODE_ORDER]),
  // ⌘K's Pause agents and Resume interrupted agents, which are commands on the
  // desktop; here they ride as settings so the cloud needs no new command kind.
  paused: bool,
  resumeStopped: (v: unknown) => v === true,
  // The whole running order, as the desktop's drag sends it.
  productOrder: slugList,
  // One of the copy's public links, by its token, for the desktop's Stop sharing.
  stopLink: (v: unknown) => typeof v === 'string' && LINK_TOKEN.test(v),
  // The web app's alerts: kept by the phone pass itself (main/phone-alerts.mts), never the window's.
  [WEB_ALERTS_KEY]: webAlertsOk,
  [WEB_ALERTS_TEST_KEY]: webAlertsTestOk,
};
const PROJECT: Record<string, Rule> = {
  autonomous: bool,
  permission: oneOf(['workspace', ...CLAUDE_PERMISSION_MODES]),
  codexMode: oneOf(['workspace', ...CODEX_MODE_ORDER]),
  account: (v: unknown) => v === 'any' || accountId(v),
  name: (v: unknown) => typeof v === 'string' && v.trim().length > 0 && v.length <= 120,
  // Bringing a project back is the desktop's: an archived one is not in the copy.
  archived: (v: unknown) => v === true,
};

// A pin is one person's list on one computer (main/supervisor.mts
// threadPins), so it travels as a setting of that computer, not a thread
// command. The rest of the desktop's thread menu rides here too, so the
// cloud's command table needs no new kind.
const yes = (v: unknown): boolean => v === true;
const THREAD: Record<string, Rule> = {
  pinned: bool,
  label: (v: unknown) => typeof v === 'string' && v.trim().length > 0 && v.length <= 200,
  priority: (v: unknown) => v === null || (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 9),
  shippedAt: (v: unknown) => v === null || (Number.isInteger(v) && (v as number) >= 0),
  visibility: oneOf(['team', 'private']),
  onMac: (v: unknown) => v === true || v === null,
  resume: yes,
  redeliver: yes,
  moveTo: (v: unknown) => typeof v === 'string' && SLUG.test(v),
};
const THREAD_ID = /^[\w-]{1,120}$/;

function threadRoute(p: SettingChange): SettingRoute {
  const at = { product: p.product, id: p.item };
  switch (p.key) {
    case 'pinned': return ['zero:set-thread-pins', { pins: { [p.item!]: p.value === true ? true : null } }];
    case 'onMac': return ['zero:set-thread-on-mac', { onMac: { [p.item!]: p.value === true ? true : null } }];
    case 'resume': return ['zero:resume-items', { ids: [p.item] }];
    case 'redeliver': return ['zero:redeliver', at];
    case 'moveTo': return ['zero:move-item', { ...at, to: p.value }];
    // The desktop's "Not shipped after all" writes 0.
    case 'shippedAt': return ['zero:thread-edit', { ...at, patch: { shippedAt: p.value ?? 0 } }];
    default: return ['zero:thread-edit', { ...at, patch: { [p.key]: p.value } }];
  }
}

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
  if (p.scope === 'thread') return threadRoute(p);
  if (p.scope === 'repeat') return repeatRoute(p as Checked);
  if (p.scope === 'teammate') return teammateRoute(p as Checked);
  if (p.scope === 'project') {
    if (p.key === 'name') return ['zero:project-rename', { product: p.product, name: (p.value as string).trim() }];
    if (p.key === 'archived') return ['zero:project-archive', { product: p.product, archived: true }];
    const value = p.key === 'account' && p.value !== 'any' ? profileFor(model, 'claude', p.value) : p.value;
    return ['zero:settings-set-project', { product: p.product, key: p.key, value }];
  }
  if (p.key === 'paused') return ['zero:supervisor-pause', p.value];
  if (p.key === 'resumeStopped') return ['zero:resume-agents', {}];
  if (p.key === 'stopLink') {
    if (!(model?.links ?? []).some((l) => l?.token === p.value)) throw new Error('that link is not one of your public links');
    return ['zero:file-link-stop', { token: p.value }];
  }
  if (p.key === 'productOrder') {
    const known = new Set((model?.projects ?? []).map((x) => x.slug));
    const order = p.value as string[];
    if (!order.every((s) => known.has(s))) throw new Error('that project is not on this computer');
    return ['zero:set-product-order', { order }];
  }
  const value = p.key === 'activeAccount' ? { engine: (p.value as Fields).engine, profile: profileFor(model, (p.value as Fields).engine, (p.value as Fields).account) } : p.value;
  return ['zero:settings-set-workspace', { key: p.key, value }];
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const short = (v: unknown): string | null => (typeof v === 'string' ? v.slice(0, 60) : null);

/** An account's last usage reading (shared/usage.mts UsageLimit), its numbers and reset times only. */
function usageFor(readings: unknown, profile: string | null | undefined) {
  const list: unknown[] = Array.isArray(readings) ? readings : [];
  const hit = list.find((r): r is Record<string, unknown> => isObject(r) && r.profile === profile);
  return usageOf(hit?.limits, hit?.at);
}

function usageOf(list: unknown, at: unknown) {
  const all: unknown[] = Array.isArray(list) ? list : [];
  const limits = all
    .filter((l): l is UsageLimitModel & { span: string } => isObject(l) && typeof l.span === 'string' && (Number.isFinite(l.percent) || l.reset === true))
    .slice(0, 8)
    .map((l) => ({
      span: l.span, qualifier: short(l.qualifier), name: short(l.name) ?? l.span, percent: num(l.percent),
      resetsText: short(l.resetsText), resetsOn: short(l.resetsOn), resetsAt: num(l.resetsAt), reset: l.reset === true,
    }));
  return limits.length ? { at: num(at), limits } : null;
}

const CLOUD_STATES: readonly unknown[] = ['broken', 'renew', 'stale', 'limited', 'ready'];
const CLOUD_MODES = ['mac', 'full', 'all'] as const;
const isCloudMode = (v: unknown): v is typeof CLOUD_MODES[number] => (CLOUD_MODES as readonly unknown[]).includes(v);
type Engine = 'claude' | 'codex';

/**
 * The cloud as the desktop's agent pages decide it (Settings.tsx `cloudHere`):
 * set up, which agents it has an account for, and each account it counts.
 * `same` is the login here it is the same account as, paired as
 * renderer/src/accounts-once.ts pairs them: Claude by folder, Codex by address too.
 */
function cloudOf(cloud: CloudModel | null | undefined, w: NonNullable<SettingsModel['workspace']>) {
  if (!cloud?.setUp) return null;
  const all: unknown[] = Array.isArray(cloud.accounts) ? cloud.accounts : [];
  const counted = all.filter((a): a is CloudAccountModel & { engine: Engine } => isObject(a) && (a.engine === 'claude' || a.engine === 'codex') && a.state !== 'duplicate');
  const inUse = (engine: Engine): unknown => counted.find((x) => x.engine === engine && x.inUse)?.name ?? null;
  const here: Record<Engine, readonly { profile?: string | null; email?: string | null }[]> = { claude: w.accounts ?? [], codex: w.codex?.accounts ?? [] };
  const sameAs = (a: CloudAccountModel & { engine: Engine }): string | null => {
    const hit = here[a.engine].find((h) => (a.profile && h.profile === a.profile) || (a.engine === 'codex' && a.name && h.email === a.name));
    return hit ? accountIdOf(hit.profile) : null;
  };
  return {
    mode: isCloudMode(cloud.mode) ? cloud.mode : 'mac',
    whenOn: cloud.whenOn === 'all' ? 'all' : 'full',
    engines: (['claude', 'codex'] as const).filter((e) => all.some((a) => isObject(a) && a.engine === e)),
    inUse: { claude: inUse('claude'), codex: inUse('codex') },
    accounts: counted.map((a) => ({
      engine: a.engine,
      email: typeof a.name === 'string' ? a.name : null,
      inUse: a.inUse === true,
      plan: short(a.plan),
      state: typeof a.state === 'string' && CLOUD_STATES.includes(a.state) ? a.state : 'ready',
      limitedUntil: num(a.limitedUntil),
      same: sameAs(a),
      usage: a.readAt ? usageOf(a.limits, a.readAt) : null,
    })),
  };
}

function memoryReadingOf(r: unknown) {
  if (!isObject(r)) return null;
  return {
    heavy: num(r.heavy), waiting: num(r.waiting), pressure: typeof r.pressure === 'string' ? r.pressure : null, usedPct: num(r.usedPct),
    asked: num(r.asked), waited: num(r.waited), refused: num(r.refused), holding: r.holding === true,
  };
}

/**
 * What the phone's Settings pages draw, from the Mac's settings model. Null
 * when the Mac could not read its own settings. `model.cloud` and
 * `model.usage` are laid on by the phone pass (main/main.mts phoneSettings).
 */
export function phoneSettingsOf(model: SettingsModel | null | undefined, { version }: { version?: string | null }) {
  if (!model?.ok || !model.workspace) return null;
  const w = model.workspace;
  const gate = w.memoryGate ?? {};
  const order: string[] = Array.isArray(w.productOrder) ? w.productOrder.filter((s: unknown): s is string => typeof s === 'string') : [];
  const links: readonly (LinkModel | null | undefined)[] = Array.isArray(model.links) ? model.links : [];
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
      cloud: cloudOf(model.cloud, w),
      cloudPermission: typeof w.cloudPermission === 'string' ? w.cloudPermission : null,
      cloudCodexMode: typeof w.cloudCodexMode === 'string' ? w.cloudCodexMode : null,
      paused: w.agentsRunning === false,
      productOrder: order,
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
      memoryGate: { on: !!gate.on, slots: gate.slots ?? null, slotsAuto: gate.slotsAuto ?? null, slotsMax: gate.slotsMax ?? null, now: gate.now ?? null, reading: memoryReadingOf(gate.reading) },
      leftovers: { on: !!w.leftovers?.on, now: w.leftovers?.now ?? null },
      accounts: (w.accounts ?? []).map((a) => ({
        id: accountIdOf(a.profile), email: a.email ?? null, chosen: !!a.chosen, state: a.state,
        note: a.trouble?.note ?? null, resetsAt: a.trouble?.resetsAt ?? null, plan: a.plan?.label ?? null, running: a.running ?? 0,
        usage: usageFor(model.usage?.claude, a.profile),
      })),
      codexAccounts: (w.codex?.accounts ?? []).map((a) => ({
        id: accountIdOf(a.profile), email: a.email ?? null, name: a.name ?? null, plan: a.plan ?? null, signedIn: !!a.signedIn, chosen: !!a.chosen,
        usage: usageFor(model.usage?.codex, a.profile),
      })),
      // Not `source`: it names the file on this computer.
      publicLinks: links
        .filter((l): l is LinkModel & { token: string; url: string } => typeof l?.token === 'string' && LINK_TOKEN.test(l.token) && typeof l.url === 'string')
        .map((l) => ({ token: l.token, name: String(l.name ?? ''), url: l.url, createdAt: num(l.createdAt), updatedAt: num(l.updatedAt), comments: Number(l.comments) || 0 })),
    },
    projects: rankProducts(model.projects ?? [], order).map((p) => ({
      slug: p.slug, name: p.name, onPhone: !!p.onPhone, autonomous: !!p.autonomous,
      permission: p.permission, codexMode: p.codexMode, account: p.account === 'any' ? 'any' : accountIdOf(p.account), running: p.running ?? 0,
    })),
  };
}
