// A repository can keep part of itself in a private one checked out inside
// it, named in `.agentbox/private.json` as `{ path, url }`. agentbox keeps its
// skills, their tests and its plans that way at `.claude/skills`. A task folder
// is a fresh worktree, so this gives each new one a copy of the app folder's
// checkout, cloning or updating that first. It never stops a folder being made.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { copyTree } from './worktree-include.mts';

export interface PrivateFolder {
  path: string;
  url: string;
}

export interface Brought {
  ok: boolean;
  did?: 'cloned' | 'pulled' | 'recent';
  why?: string;
}

interface Timing {
  /** How long a look at the remote stays good, in ms. */
  every?: number;
  now?: number;
}

const CONFIG = '.agentbox/private.json';
const CLONE_MS = 2 * 60_000;
const PULL_MS = 60_000;
const LOCAL_MS = 20_000;
const EVERY = 10 * 60_000;
const NO_PROMPT = { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' };

const lastLook = new Map<string, number>();
const lastFailure = new Map<string, string>();

function git(cwd: string, args: string[], timeout = LOCAL_MS): { ok: boolean; out: string } {
  try {
    const out = execFileSync('git', args, { cwd, encoding: 'utf8', timeout, killSignal: 'SIGKILL', env: NO_PROMPT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    return { ok: true, out: out.trim() };
  } catch (error) {
    const e = error as { stderr?: unknown; message?: string };
    return { ok: false, out: String(e.stderr ?? e.message ?? '').trim().split('\n').pop() ?? '' };
  }
}

export function privateFolderOf(root: string): PrivateFolder | null {
  let named: unknown;
  try { named = JSON.parse(fs.readFileSync(path.join(root, CONFIG), 'utf8')); } catch { return null; }
  const { path: rel, url } = (named ?? {}) as Record<string, unknown>;
  if (typeof rel !== 'string' || typeof url !== 'string' || !rel || !url) return null;
  const inside = path.relative(root, path.resolve(root, rel));
  if (!inside || inside.startsWith('..') || path.isAbsolute(inside)) return null;
  return { path: rel, url };
}

const tracks = (cwd: string, rel: string) => git(cwd, ['ls-files', '--error-unmatch', '--', rel]).ok;
const ignores = (cwd: string, rel: string) => git(cwd, ['check-ignore', '-q', '--', path.join(rel, 'x')]).ok;

/** Clone the private folder into the app folder, or bring it up to date. */
export function bringPrivateFolder(root: string, { every = EVERY, now = Date.now() }: Timing = {}): Brought {
  const named = privateFolderOf(root);
  if (!named) return { ok: false, why: 'the repository names no private folder' };
  const at = path.join(root, named.path);
  if (tracks(root, named.path) || !ignores(root, named.path)) {
    return { ok: false, why: `${named.path} is still part of the public checkout here` };
  }
  const cloned = fs.existsSync(path.join(at, '.git'));
  const looked = lastLook.get(root);
  if (looked !== undefined && now - looked < every) {
    return cloned ? { ok: true, did: 'recent' } : { ok: false, why: lastFailure.get(root) ?? 'tried a moment ago' };
  }
  lastLook.set(root, now);
  if (cloned) {
    const pulled = git(at, ['pull', '--ff-only', '--quiet'], PULL_MS);
    return pulled.ok ? { ok: true, did: 'pulled' } : { ok: true, did: 'recent', why: `could not bring ${named.path} up to date: ${pulled.out}` };
  }
  const temp = `${at}.cloning-${process.pid}`;
  fs.rmSync(temp, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(at), { recursive: true });
  const got = git(path.dirname(at), ['clone', '--quiet', named.url, temp], CLONE_MS);
  if (!got.ok) {
    fs.rmSync(temp, { recursive: true, force: true });
    const why = `could not clone ${named.url}: ${got.out}`;
    lastFailure.set(root, why);
    return { ok: false, why };
  }
  if (!fs.existsSync(at)) {
    fs.renameSync(temp, at);
    return { ok: true, did: 'cloned' };
  }
  // What the public copy left behind stays, and an edit made there shows as a change.
  fs.renameSync(path.join(temp, '.git'), path.join(at, '.git'));
  fs.rmSync(temp, { recursive: true, force: true });
  git(at, ['reset', '--quiet']);
  const gone = git(at, ['ls-files', '--deleted']);
  for (const file of gone.ok && gone.out ? gone.out.split('\n') : []) git(at, ['checkout', '--', file]);
  return { ok: true, did: 'cloned' };
}

/** Copy the app folder's private checkout into a task folder that has just been made. */
export function givePrivateFolder(root: string, folder: string, timing: Timing = {}): { given: boolean; why?: string } {
  const named = privateFolderOf(root);
  if (!named) return { given: false };
  const to = path.join(folder, named.path);
  if (fs.existsSync(to)) return { given: false, why: `${named.path} is already there` };
  if (tracks(folder, named.path) || !ignores(folder, named.path)) {
    return { given: false, why: `this branch still carries ${named.path} itself` };
  }
  const brought = bringPrivateFolder(root, timing);
  const from = path.join(root, named.path);
  if (!fs.existsSync(path.join(from, '.git'))) return { given: false, why: brought.why ?? `${named.path} could not be had` };
  try {
    fs.mkdirSync(path.dirname(to), { recursive: true });
    copyTree(from, to);
  } catch (error) {
    return { given: false, why: `could not copy ${named.path}: ${(error as Error).message}` };
  }
  return { given: true, ...(brought.why ? { why: brought.why } : {}) };
}
