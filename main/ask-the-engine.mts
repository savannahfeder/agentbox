// Whether one login is signed in, in the engine's own words: its status
// command (`claude auth status --json`, `codex login status`), run the way a
// worker on that login would be started. The app's other checks read the
// engines' files, whose layout is theirs to change; this asks.

import { execFile } from 'node:child_process';
import { harnessFor } from './harnesses.mts';
import { claudeLaunchEnv } from './claude-launch-env.mts';
import { codexLaunchEnv } from './codex-launch-env.mts';

export interface EngineAnswer {
  /** Null when there was no yes or no: not installed, no answer in time, a crash. */
  signedIn: boolean | null;
  email: string | null;
  plan: string | null;
  /** Changes when the login does: a new sign-in, another account, a renewed token. */
  print: string | null;
  said: string;
}

export type RunStatus = (
  file: string,
  args: string[],
  options: { env: NodeJS.ProcessEnv; timeout: number; windowsHide: boolean },
  done: (error: (Error & { code?: unknown }) | null, stdout: string, stderr: string) => void,
) => unknown;

const ASK_TIMEOUT_MS = 20_000;

/** The environment a worker on this login gets, so the app's own shell never decides who answers. */
export function loginEnv(engine: string, folder: string | null | undefined, bin: string, base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env = harnessFor(engine).workerEnv(base);
  if (engine === 'codex') return { ...codexLaunchEnv(bin, env), ...(folder ? { CODEX_HOME: folder } : {}) };
  return { ...claudeLaunchEnv(bin, env), ...(folder ? { CLAUDE_CONFIG_DIR: folder } : {}) };
}

/** Exit 0 is signed in and 1 is not, on both engines (main/engine-setup.mts). */
export function readAnswer(engine: string, exit: number | null, stdout: string, stderr: string): EngineAnswer {
  const signedIn = exit === 0 ? true : exit === 1 ? false : null;
  const said = `${stdout}\n${stderr}`.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').trim().slice(0, 2000);
  if (engine !== 'codex') {
    let json: Record<string, unknown> | null = null;
    try {
      const parsed: unknown = JSON.parse(stdout);
      if (parsed && typeof parsed === 'object') json = parsed as Record<string, unknown>;
    } catch { /* a format this does not know: the exit code still answers */ }
    if (json) {
      const text = (k: string) => (typeof json[k] === 'string' && json[k] ? json[k] as string : null);
      const fields = ['authMethod', 'email', 'orgId', 'subscriptionType', 'loginExpiresAt'].map((k) => json[k] ?? null);
      return {
        signedIn: typeof json.loggedIn === 'boolean' && signedIn !== null ? json.loggedIn : signedIn,
        email: text('email'),
        plan: text('planTier') ?? text('subscriptionType'),
        print: signedIn === null ? null : JSON.stringify([signedIn, ...fields]),
        said,
      };
    }
  }
  return { signedIn, email: null, plan: null, print: signedIn === null ? null : JSON.stringify([signedIn, said]), said };
}

/** Never rejects; a check that could not run answers `signedIn: null`. */
export function askEngine(
  engine: string,
  { bin, folder = null, base = process.env, run = execFile as unknown as RunStatus, timeoutMs = ASK_TIMEOUT_MS }:
  { bin: string; folder?: string | null; base?: NodeJS.ProcessEnv; run?: RunStatus; timeoutMs?: number },
): Promise<EngineAnswer> {
  const { file, args } = harnessFor(engine).signInStatus(bin);
  return new Promise((resolve) => {
    try {
      run(file, args, { env: loginEnv(engine, folder, bin, base), timeout: timeoutMs, windowsHide: true }, (error, stdout, stderr) => {
        const code = error ? (typeof error.code === 'number' ? error.code : null) : 0;
        const answer = readAnswer(engine, code, String(stdout ?? ''), String(stderr ?? ''));
        resolve(code === null && !answer.said ? { ...answer, said: error?.message ?? 'no answer' } : answer);
      });
    } catch (error) {
      resolve({ signedIn: null, email: null, plan: null, print: null, said: (error as Error).message });
    }
  });
}
