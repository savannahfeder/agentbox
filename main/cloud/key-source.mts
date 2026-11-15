// READING A KEY FROM THIS COMPUTER, from one of the places
// shared/cloud-key-sources.mjs names. Called only after the person has said
// yes (./key-asks.mts, or their own press on a thread's card); `keyIsThere`
// is the one look before that, and it never reads a value it can avoid.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { KEY_VALUE_MAX } from '../../shared/cloud-keys.mts';
import { keySourceWords, sourceHoldsSignIns } from '../../shared/cloud-key-sources.mts';
import { pathHoldsSignIns, SIGN_IN_REFUSED } from '../../shared/sign-in-places.mts';
import { shellProbes, shellRunnerLater } from '../engine-bin.mts';

export interface KeySource { place: 'keychain' | 'file' | 'shell'; from: string; entry?: string }
export type KeyRead = { value: string } | { error: string; missing: boolean };
export type Runner = (cmd: string, args: string[], opts: { timeoutMs: number }) => Promise<string>;
type ShellRunner = (shell: string, probe: [string, string], timeoutMs?: number) => Promise<string>;

export interface ReadOptions {
  home?: string;
  platform?: NodeJS.Platform;
  run?: Runner;
  shell?: ShellRunner;
  env?: NodeJS.ProcessEnv;
}

const FILE_MAX = 64 * 1024;
// Long enough for the Keychain's own password prompt to be answered.
const KEYCHAIN_MS = 2 * 60_000;
// `security` exits 44 when there is no such item.
const NO_ITEM = 44;

const defaultRun: Runner = (cmd, args, { timeoutMs }) => new Promise((resolve, reject) => {
  const child = execFile(cmd, args, { encoding: 'utf8', timeout: timeoutMs, killSignal: 'SIGKILL', maxBuffer: 1024 * 1024 }, (err, stdout) => {
    if (err) reject(err); else resolve(stdout);
  });
  child.stdin?.end();
});

const missing = (src: KeySource): KeyRead => ({ error: `There is nothing at ${keySourceWords(src)} on this computer.`, missing: true });
const failed = (error: string): KeyRead => ({ error, missing: false });

function checked(src: KeySource, raw: string): KeyRead {
  const value = raw.trim();
  if (!value) return missing(src);
  if (value.length > KEY_VALUE_MAX) return failed(`What is at ${keySourceWords(src)} is too big to be a key.`);
  return { value };
}

function homeFile(src: KeySource, home: string): { file: string } | KeyRead {
  const asked = src.from.startsWith('~/') ? path.join(home, src.from.slice(2)) : path.resolve(src.from);
  let real: string; let realHome: string;
  try { realHome = fs.realpathSync(home); } catch { return failed('This computer has no home folder to read from.'); }
  try { real = fs.realpathSync(asked); } catch { return missing(src); }
  if (!real.startsWith(realHome + path.sep)) return failed(`${src.from} is not in the home folder, and a key is only read from there.`);
  if (pathHoldsSignIns(path.relative(realHome, real))) return failed(SIGN_IN_REFUSED);
  const st = fs.statSync(real);
  if (!st.isFile()) return missing(src);
  if (st.size > FILE_MAX) return failed(`${src.from} is too big to be a key file.`);
  return { file: real };
}

// One line of an .env file: `NAME=value`, `export NAME="value"`, a comment after an unquoted value.
function envLine(text: string, name: string): string | null {
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m || m[1] !== name) continue;
    const v = m[2].trim();
    const quoted = /^(["'])(.*?)\1/.exec(v);
    return quoted ? quoted[2] : v.replace(/\s+#.*$/, '');
  }
  return null;
}

async function fromShell(src: KeySource, { shell, env }: { shell: ShellRunner; env: NodeJS.ProcessEnv }): Promise<KeyRead> {
  let said = false;
  for (const [sh, flags, timeout] of shellProbes(env) as [string, string, number][]) {
    try { return checked(src, await shell(sh, [flags, `printenv ${src.from}`], timeout)); } catch (err) {
      if (typeof (err as { status?: unknown }).status === 'number') said = true;
    }
  }
  return said ? missing(src) : failed('Your shell did not answer.');
}

/** The key's value, or why there is none. */
export async function readKeyFrom(src: KeySource, { home = os.homedir(), platform = process.platform, run = defaultRun, shell, env = process.env }: ReadOptions = {}): Promise<KeyRead> {
  if (sourceHoldsSignIns(src)) return failed(SIGN_IN_REFUSED);
  if (src.place === 'keychain') {
    if (platform !== 'darwin') return failed('There is no Keychain on this computer.');
    try { return checked(src, await run('security', ['find-generic-password', '-s', src.from, '-w'], { timeoutMs: KEYCHAIN_MS })); } catch (err) {
      return (err as { code?: unknown }).code === NO_ITEM ? missing(src) : failed(`The Keychain did not give ${src.from}: ${(err as Error).message.split('\n')[0]}`);
    }
  }
  if (src.place === 'shell') return fromShell(src, { shell: shell ?? shellRunnerLater(env), env });
  const found = homeFile(src, home);
  if (!('file' in found)) return found;
  const text = fs.readFileSync(found.file, 'utf8');
  if (!src.entry) return checked(src, text);
  const v = envLine(text, src.entry);
  return v == null ? missing(src) : checked(src, v);
}

/** Whether the key is there to read. A Keychain item is looked up without its value, so macOS asks nothing. */
export async function keyIsThere(src: KeySource, opts: ReadOptions = {}): Promise<{ ok: true } | { ok: false; error: string; missing: boolean }> {
  if (sourceHoldsSignIns(src)) return { ok: false, error: SIGN_IN_REFUSED, missing: false };
  if (src.place === 'keychain' && (opts.platform ?? process.platform) === 'darwin') {
    try { await (opts.run ?? defaultRun)('security', ['find-generic-password', '-s', src.from], { timeoutMs: 15_000 }); return { ok: true }; } catch (err) {
      const r = (err as { code?: unknown }).code === NO_ITEM ? missing(src) : failed(`The Keychain could not be asked: ${(err as Error).message.split('\n')[0]}`);
      return { ok: false, ...(r as { error: string; missing: boolean }) };
    }
  }
  const r = await readKeyFrom(src, opts);
  return 'value' in r ? { ok: true } : { ok: false, ...r };
}
