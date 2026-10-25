// YOUR COMPUTER'S SETTINGS ON YOUR PHONE: the copy the Mac sends, and the
// changes the phone may ask for. The Mac's own handlers (main/settings.mjs)
// still decide every value. This keeps paths and instruction text out of the
// cloud, and refuses any key the phone has no page for.
import { CLAUDE_PERMISSION_MODES } from './work-items.mjs';
import { CODEX_MODE_ORDER } from './codex-modes.mjs';
import { AGENT_MODES } from './agents.mjs';

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
};
const PROJECT = {
  autonomous: bool,
  permission: oneOf(['workspace', ...CLAUDE_PERMISSION_MODES]),
  codexMode: oneOf(['workspace', ...CODEX_MODE_ORDER]),
  account: (v) => v === 'any' || accountId(v),
};

/** Why the Mac should not carry out this change, or null. */
export function checkSetting(p) {
  if (!p || typeof p !== 'object') return 'not a setting';
  const rules = p.scope === 'workspace' ? WORKSPACE : p.scope === 'project' ? PROJECT : null;
  if (!rules || !Object.hasOwn(rules, p.key)) return 'not a setting your phone can change';
  if (p.scope === 'project' && !(typeof p.product === 'string' && SLUG.test(p.product))) return 'that setting needs its project';
  return rules[p.key](p.value) ? null : 'not a value that setting takes';
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
      cornerTag: !!w.cornerTag,
      diagnostics: !!w.diagnostics,
      adhdMode: !!w.adhdMode,
      alpha: { rooms: !!w.alpha?.rooms },
      outsideAgents: w.outsideAgents,
      permission: w.permission,
      codexMode: w.codexMode ?? null,
      engines: (w.engineChoices ?? []).map((e) => e.id),
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
