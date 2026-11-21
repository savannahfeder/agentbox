// `npm run accounts`: every login on this computer as Claude Code and Codex
// themselves see it, beside what Agentbox holds against it. It reads no screen
// and needs no running app, so it still works when the app's own reading is
// wrong. `--reset` asks the app to forget what it holds; `--json` prints the
// engines' own words for a person or an agent to read when a format changes.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { askEngine } from './ask-the-engine.mts';
import type { EngineAnswer } from './ask-the-engine.mts';
import { effectiveProfiles, troubleForProfile } from './account-discovery.mts';
import { refineCause } from '../shared/spawn-trouble.mts';
import { defaultClaudeHome, accountIdentity } from './account-tooling.mts';
import { readPlan } from './claude-plan.mts';
import { codexAccount } from './codex-account.mts';
import { codexHome } from './codex-models.mts';
import { accountRecheckFile, askForAccountRecheck } from './account-recheck.mts';
import { Name } from '../shared/product-name.mjs';

export interface AccountsConfig {
  storeRoot: string;
  claudeBin?: string | null;
  codexBin?: string | null;
  authProfiles?: string[] | null;
  codexProfiles?: string[] | null;
  codexHome?: string | null;
}

export interface Held { cause: string; since: number | null; resetsAt: number | null; restingUntil: number | null }

export interface LoginRow {
  engine: 'claude' | 'codex';
  folder: string;
  /** The key the app files trouble under; null for a folder the app does not list. */
  key: string | null;
  /** For a folder the app does not list: the listed folder holding the same account. */
  sameAs?: string | null;
  email: string | null;
  plan: string | null;
  ended?: boolean;
  engineSays: EngineAnswer | null;
  appHolds: Held | null;
}

type Ask = (engine: string, options: { bin: string; folder?: string | null }) => Promise<EngineAnswer>;

function savedState(storeRoot: string): { profileTrouble?: Record<string, { cause?: string; since?: number; at?: number; resetsAt?: number }>; profileCooldown?: Record<string, number> } {
  try { return JSON.parse(fs.readFileSync(path.join(storeRoot, '.zero-supervisor.json'), 'utf8')) ?? {}; } catch { return {}; }
}

function dotFolders(home: string, prefix: string): string[] {
  try {
    return fs.readdirSync(home, { withFileTypes: true })
      .filter((e) => (e.name === prefix || e.name.startsWith(`${prefix}-`)) && e.isDirectory())
      .map((e) => path.join(home, e.name))
      .sort();
  } catch { return []; }
}

export async function readLogins(config: AccountsConfig, { home = os.homedir(), ask = askEngine as Ask, now = Date.now() }: { home?: string; ask?: Ask; now?: number } = {}): Promise<LoginRow[]> {
  const state = savedState(config.storeRoot);
  // Read as the Accounts page reads it (main/settings.mts), so the two say the same.
  const held = (key: string | null, plan: { ended?: boolean } | null = null): Held | null => {
    if (!key) return null;
    const t = key.startsWith('codex:') ? state.profileTrouble?.[key] : troubleForProfile(state.profileTrouble, key, { home });
    const until = state.profileCooldown?.[key] ?? 0;
    if (!t && until <= now) return null;
    const cause = t?.cause ? refineCause(t.cause, plan) : 'resting';
    return { cause, since: t?.since ?? t?.at ?? null, resetsAt: t?.resetsAt ?? null, restingUntil: until > now ? until : null };
  };

  const dflt = defaultClaudeHome(home);
  const listed = effectiveProfiles(config.authProfiles, { home });
  const claude = new Map<string, string | null>();
  for (const p of listed) claude.set(p === 'default' ? dflt : p, p);
  for (const dir of dotFolders(home, '.claude')) {
    if (!claude.has(dir) && dir !== dflt && fs.existsSync(path.join(dir, '.claude.json'))) claude.set(dir, null);
  }
  if (!claude.has(dflt)) claude.set(dflt, null);

  const codexDefault = codexHome({ configured: config.codexHome ?? null, home });
  const codex = new Map<string, string | null>();
  for (const p of (config.codexProfiles?.length ? config.codexProfiles : ['default'])) {
    const word = p || 'default';
    codex.set(word === 'default' ? codexDefault : word, `codex:${word}`);
  }
  for (const dir of dotFolders(home, '.codex')) {
    if (!codex.has(dir) && fs.existsSync(path.join(dir, 'auth.json'))) codex.set(dir, null);
  }

  const uuidOf = (folder: string) => accountIdentity(folder === dflt ? null : folder, { home })?.accountUuid ?? null;
  const listedBy = new Map<string, string>();
  for (const [folder, key] of claude) {
    const uuid = key ? uuidOf(folder) : null;
    if (uuid && !listedBy.has(uuid)) listedBy.set(uuid, folder);
  }

  const rows: Promise<LoginRow>[] = [];
  for (const [folder, key] of claude) {
    const own = folder === dflt ? null : folder;
    const plan = readPlan(own ?? 'default', { home });
    const uuid = key ? null : uuidOf(folder);
    rows.push((config.claudeBin ? ask('claude', { bin: config.claudeBin, folder: own }) : Promise.resolve(null)).then((says) => ({
      engine: 'claude' as const, folder, key,
      sameAs: uuid ? listedBy.get(uuid) ?? null : null,
      email: says?.email ?? accountIdentity(own, { home })?.email ?? null,
      plan: plan.known ? plan.label : says?.plan ?? null,
      ended: plan.ended === true,
      engineSays: says, appHolds: held(key, plan),
    })));
  }
  for (const [folder, key] of codex) {
    rows.push((config.codexBin ? ask('codex', { bin: config.codexBin, folder }) : Promise.resolve(null)).then((says) => {
      const acct = codexAccount(folder);
      const plan = acct?.plan ? (acct.planNamed ? acct.plan : `plan “${acct.plan}”`) : null;
      return { engine: 'codex' as const, folder, key, email: acct?.email ?? null, plan, engineSays: says, appHolds: held(key) };
    }));
  }
  return Promise.all(rows);
}

const WORDS: Record<string, string> = {
  'signed-out': 'signed out', 'at-limit': 'at its usage limit', 'subscription-ended': 'subscription ended',
  'org-blocked': 'switched off by an admin', resting: 'resting after failed runs', unknown: 'failing for a reason it could not name',
};

/** Whether the app holds this login as signed out while its own engine says it is signed in. */
export function disagrees(row: LoginRow): boolean {
  return !!row.appHolds && row.appHolds.cause === 'signed-out' && row.engineSays?.signedIn === true;
}

export function describeLogins(rows: LoginRow[], { home = os.homedir() }: { home?: string } = {}): string {
  const short = (p: string) => (p.startsWith(home + path.sep) ? `~/${path.relative(home, p)}` : p);
  const out: string[] = [];
  for (const engine of ['claude', 'codex'] as const) {
    const mine = rows.filter((r) => r.engine === engine);
    if (!mine.length) continue;
    out.push(engine === 'claude' ? 'Claude Code' : 'Codex');
    for (const r of mine) {
      const says = r.engineSays?.signedIn === true ? `signed in${r.email ? ` as ${r.email}` : ''}`
        : r.engineSays?.signedIn === false ? 'signed out'
        : `no answer${r.engineSays?.said ? ` (${r.engineSays.said.split('\n')[0].slice(0, 80)})` : ''}`;
      // Claude Code names the plan (Ultra) and keeps an older tier code (max_20x) beside it.
      const tier = r.engineSays?.plan && r.engineSays.plan !== r.plan && !r.ended ? ` (tier ${r.engineSays.plan})` : '';
      const plan = r.plan && r.engineSays?.signedIn !== false ? `, ${r.plan}${tier}` : '';
      const app = r.sameAs ? `${Name} lists this account once, as ${short(r.sameAs)}`
        : !r.key ? `${Name} does not list it`
        : r.appHolds ? `${Name} thinks: ${WORDS[r.appHolds.cause] ?? r.appHolds.cause}`
        : `${Name} thinks: fine`;
      out.push(`  ${short(r.folder)}`);
      out.push(`    ${engine === 'claude' ? 'Claude Code' : 'Codex'} says: ${says}${plan}`);
      out.push(`    ${app}${disagrees(r) ? '   <- they disagree' : ''}`);
    }
    out.push('');
  }
  const stale = rows.filter((r) => r.appHolds);
  if (stale.length) out.push(`To make ${Name} forget what it thinks about every login: npm run accounts -- --reset`);
  return out.join('\n').trimEnd();
}

/** Leaves the request, then waits a little for a running app to take it. */
export async function resetAccounts(storeRoot: string, { waitMs = 30_000, poll = 500 }: { waitMs?: number; poll?: number } = {}): Promise<'taken' | 'waiting'> {
  askForAccountRecheck(storeRoot);
  const file = accountRecheckFile(storeRoot);
  const until = Date.now() + waitMs;
  while (Date.now() < until) {
    if (!fs.existsSync(file)) return 'taken';
    await new Promise((r) => setTimeout(r, poll));
  }
  return fs.existsSync(file) ? 'waiting' : 'taken';
}
