// YOUR COMPUTER'S SETTINGS ON YOUR PHONE: the copy the Mac sends, and the
// changes the phone may ask for. The Mac's own handlers (main/settings.mjs)
// still decide every value. This keeps paths and instruction text out of the
// cloud, and refuses any key the phone has no page for.
import { CLAUDE_PERMISSION_MODES } from './work-items.mjs';
import { CODEX_MODE_ORDER } from './codex-modes.mjs';
import { AGENT_MODES } from './agents.mjs';
import { WEB_ALERTS_KEY, WEB_ALERTS_TEST_KEY, webAlertsOk, webAlertsTestOk } from './web-alerts.mjs';
import { isRepeatRule } from './repeats.mjs';

export const SETTINGS_VERSION = 1;

/** A login by the last part of its folder's name; the folder itself stays on the Mac. */
export const accountIdOf = (profile) => (profile === 'default' ? 'default' : String(profile ?? '').split(/[\\/]/).filter(Boolean).pop() ?? '');

const ACCOUNT_ID = /^[\w.-]{1,80}$/;
const SLUG = /^[a-z0-9][\w-]{0,119}$/i;
const bool = (v) => typeof v === 'boolean';
const oneOf = (list) => (v) => list.includes(v);
const count = (v) => Number.isInteger(v) && v >= 1 && v <= 64;
const accountId = (v) => typeof v === 'string' && ACCOUNT_ID.test(v) && v !== '.' && v !== '..';

const WORKSPACE = {
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
  memoryGateSlots: (v) => v === null || count(v),
  agentsFeltSlow: oneOf(['more', 'reset']),
  outsideAgents: oneOf(AGENT_MODES),
  permission: oneOf(CLAUDE_PERMISSION_MODES),
  codexMode: oneOf(CODEX_MODE_ORDER),
  phoneProjects: (v) => !!v && bool(v.all) && Array.isArray(v.except) && v.except.length <= 500 && v.except.every((s) => typeof s === 'string' && SLUG.test(s)),
  activeAccount: (v) => !!v && oneOf(['claude', 'codex'])(v.engine) && (v.account === null || accountId(v.account)),
  // The web app's alerts: kept by the phone pass itself (main/phone-alerts.mjs), never the window's.
  [WEB_ALERTS_KEY]: webAlertsOk,
  [WEB_ALERTS_TEST_KEY]: webAlertsTestOk,
};
const PROJECT = {
  autonomous: bool,
  permission: oneOf(['workspace', ...CLAUDE_PERMISSION_MODES]),
  codexMode: oneOf(['workspace', ...CODEX_MODE_ORDER]),
  account: (v) => v === 'any' || accountId(v),
};

// A pin is one person's list on one computer (main/supervisor.mjs
// threadPins), so it travels as a setting of that computer, not a thread command.
const THREAD = { pinned: bool };
const THREAD_ID = /^[\w-]{1,120}$/;

/** Why the Mac should not carry out this change, or null. */
export function checkSetting(p) {
  if (!p || typeof p !== 'object') return 'not a setting';
  if (p.scope === 'repeat') return checkRepeatChange(p);
  const rules = p.scope === 'workspace' ? WORKSPACE : p.scope === 'project' ? PROJECT : p.scope === 'thread' ? THREAD : null;
  if (!rules || !Object.hasOwn(rules, p.key)) return 'not a setting your phone can change';
  if (p.scope !== 'workspace' && !(typeof p.product === 'string' && SLUG.test(p.product))) return 'that setting needs its project';
  if (p.scope === 'thread' && !(typeof p.item === 'string' && THREAD_ID.test(p.item))) return 'that needs its thread';
  return rules[p.key](p.value) ? null : 'not a value that setting takes';
}

// A REPEATING TASK MADE, CHANGED OR ENDED ON A PHONE, handed to the window's
// own three handlers (main/ipc.mjs), which still gate the engine and model.
const REPEAT_ID = /^[\w-]{1,120}$/;
const REPEAT_FIELDS = {
  title: (v) => typeof v === 'string' && v.trim().length > 0 && v.length <= 500,
  body: (v) => typeof v === 'string' && v.length <= 20_000,
  priority: (v) => Number.isInteger(v) && v >= 0 && v <= 9,
  engine: (v) => v === 'claude' || v === 'codex',
  model: (v) => typeof v === 'string' && v.length > 0 && v.length <= 100,
};
const SCHEDULE = ['every', 'on', 'at'];
const scheduleOf = (v) => ({ every: v.every, ...(v.every === 'week' ? { on: v.on } : {}), at: v.at });

function checkRepeatChange(p) {
  if (!['new', 'change', 'end'].includes(p.key)) return 'not a setting your phone can change';
  if (!(typeof p.product === 'string' && SLUG.test(p.product))) return 'that setting needs its project';
  if (p.key !== 'new' && !(typeof p.id === 'string' && REPEAT_ID.test(p.id))) return 'that needs its repeating task';
  if (p.key === 'end') return p.value === true ? null : 'not a value that setting takes';
  const v = p.value;
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

function repeatRoute(p) {
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

function profileFor(model, engine, id) {
  if (id === null) return null;
  const list = engine === 'codex' ? model?.workspace?.codex?.accounts : model?.workspace?.accounts;
  const hit = (list ?? []).find((a) => accountIdOf(a.profile) === id);
  if (!hit) throw new Error('that account is not on this computer');
  return hit.profile;
}

/** The window's own handler for a checked change, and what to hand it. */
export function settingRoute(p, model) {
  if (p.scope === 'thread') return ['zero:set-thread-pins', { pins: { [p.item]: p.value === true ? true : null } }];
  if (p.scope === 'repeat') return repeatRoute(p);
  if (p.scope === 'project') {
    const value = p.key === 'account' && p.value !== 'any' ? profileFor(model, 'claude', p.value) : p.value;
    return ['zero:settings-set-project', { product: p.product, key: p.key, value }];
  }
  const value = p.key === 'activeAccount' ? { engine: p.value.engine, profile: profileFor(model, p.value.engine, p.value.account) } : p.value;
  return ['zero:settings-set-workspace', { key: p.key, value }];
}

/**
 * What the phone's Settings pages draw, from the Mac's settings model. Null
 * when the Mac could not read its own settings.
 */
export function phoneSettingsOf(model, { version }) {
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
        .map((m) => ({ id: m.id, label: typeof m.label === 'string' ? m.label : m.id, levels: Array.isArray(m.levels) ? m.levels.filter((l) => typeof l === 'string') : [], defaultLevel: typeof m.defaultLevel === 'string' ? m.defaultLevel : null })),
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
        note: a.trouble?.note ?? null, plan: a.plan?.label ?? null, running: a.running ?? 0,
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
