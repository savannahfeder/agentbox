// What a Settings row reads while a change from the phone or the web app is on
// its way: the copy the computer sent (shared/phone-settings.mts), with the
// commands left for it laid over it until a newer copy arrives.
import type { PhoneRows } from './phone-rows';
import type { AgentMode, CodexModeId, PermissionMode, RepeatRule, TeamChatLine, Teammate, TeamRunLine, UsageLimit } from './types';
import type { CloudMode } from './cloud-menu';

type Engine = 'claude' | 'codex';
type UsageCopy = { at: number | null; limits: UsageLimit[] } | null;
/** One cloud login as shared/phone-settings.mts cloudOf sends it. */
export interface CloudLoginCopy { engine: Engine; email: string | null; inUse: boolean; plan: string | null; state: string; limitedUntil: number | null; same: string | null; usage: UsageCopy }
export interface CloudCopy { mode: CloudMode; whenOn: 'all' | 'full'; engines: Engine[]; inUse: Partial<Record<Engine, string | null>>; accounts: CloudLoginCopy[] }
export interface PublicLinkCopy { token: string; name: string; url: string; createdAt: number; updatedAt: number; comments: number }

export interface Change { scope: 'workspace' | 'project'; key: string; value?: unknown; product?: string }

/** A computer's workspace settings as it sends them (shared/phone-settings.mts phoneSettingsOf). */
export interface PhoneWorkspaceCopy {
  plan: string | null;
  cornerTag: boolean;
  diagnostics: boolean;
  adhdMode: boolean;
  alpha: { rooms: boolean; teammates: boolean; multiplayer: boolean };
  importNew: boolean;
  outsideAgents: AgentMode;
  permission: PermissionMode;
  codexMode: CodexModeId | null;
  engines: string[];
  claudeModels: { id: string; label: string; model: string; defaultLevel?: string | null }[];
  codexFreePlan: boolean;
  engine: string | null;
  codexModels: { id: string; label: string; levels: string[]; defaultLevel: string | null }[];
  codexModelDefault: string | null;
  claude: { found: boolean };
  codex: { found: boolean };
  agentsAuto: boolean;
  sessionsAtOnce: number;
  agentsTotal: number;
  agentsAutoTotal: number;
  agentsNudge: number;
  slotsMax: number;
  slotsSuggested: number;
  running: number;
  memoryGate: { on: boolean; slots: number | null; slotsAuto: number; slotsMax: number; now: string | null };
  leftovers: { on: boolean; now: string | null };
  accounts: { id: string; email: string | null; chosen: boolean; state?: string; note: string | null; resetsAt: number | null; plan: string | null; running: number }[];
  codexAccounts: { id: string; email: string | null; name: string | null; plan: string | null; signedIn: boolean; chosen: boolean }[];
  cloud?: CloudCopy | null;
  cloudPermission?: string | null;
  cloudCodexMode?: string | null;
  paused?: boolean;
  productOrder?: string[];
  publicLinks?: PublicLinkCopy[];
}
export interface PhoneProjectCopy { slug: string; name: string; onPhone: boolean; autonomous: boolean; permission: PermissionMode | 'workspace'; codexMode: CodexModeId | 'workspace'; account: string; running: number }
/** The whole copy, with the repeating tasks and teammates main/phone-inbox.mts adds beside it. */
export interface PhoneSettingsCopy {
  v: number;
  version: string;
  workspace: PhoneWorkspaceCopy;
  projects: PhoneProjectCopy[];
  repeats?: RepeatRule[];
  teammates?: { list: Partial<Teammate>[]; chat: TeamChatLine[]; runs: TeamRunLine[]; trouble?: string };
}
export interface SettingsRow { device: string; name: string; updated_at: string; settings: PhoneSettingsCopy }
export interface Reading { value: unknown; waiting: boolean; refused: string | null }
export type Changes = Map<string, Reading>;

const REFUSAL_SHOWN_MS = 10 * 60_000;
const TAKEN_BACK = 'refused: taken back on the phone';

export const changeKey = (c: Change) => `${c.scope}:${c.scope === 'project' ? c.product ?? '' : ''}:${c.key}`;

/** The computer heard from last; the page is about that one. */
export const computerOf = (rows: SettingsRow[]): SettingsRow | null =>
  [...rows].sort((a, b) => (Date.parse(b.updated_at) || 0) - (Date.parse(a.updated_at) || 0))[0] ?? null;

export function changesOn(computer: SettingsRow | null, commands: PhoneRows['commands'], now = Date.now()): Changes {
  const out: Changes = new Map();
  if (!computer) return out;
  const copyAt = Date.parse(computer.updated_at) || 0;
  const mine = commands
    .filter((c) => c.kind === 'setting' && c.device === computer.device && c.outcome !== TAKEN_BACK && c.payload?.key)
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  for (const c of mine) {
    const key = changeKey(c.payload as Change);
    const takenAt = c.taken_at ? Date.parse(c.taken_at) || 0 : null;
    if (takenAt === null) out.set(key, { value: c.payload.value, waiting: true, refused: null });
    else if (c.outcome?.startsWith('refused')) {
      if (now - takenAt < REFUSAL_SHOWN_MS) out.set(key, { value: undefined, waiting: false, refused: c.outcome.replace(/^refused:\s*/, '') });
      else out.delete(key);
    } else if (takenAt > copyAt) out.set(key, { value: c.payload.value, waiting: false, refused: null });
    else out.delete(key);
  }
  return out;
}

/** A row's value: the change left for the computer when there is one, else the computer's copy. */
export function readingOf(changes: Changes, scope: Change['scope'], key: string, copy: unknown, product?: string): Reading {
  const hit = changes.get(changeKey({ scope, key, product }));
  if (!hit) return { value: copy, waiting: false, refused: null };
  return hit.refused ? { value: copy, waiting: false, refused: hit.refused } : hit;
}
