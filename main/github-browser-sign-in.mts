// SIGNING THIS COMPUTER'S GIT IN TO GITHUB THE WAY A PERSON DOES IN TERMINAL:
// `gh auth login --web` prints a one-time code and a link, waits while they
// approve it in their browser, and `gh auth setup-git` then lets git push with
// it. Its OAuth is GitHub's own, which this app has no registration for.
import { spawn as nodeSpawn } from 'node:child_process';

const LOGIN_MS = 15 * 60_000;
const SETUP_MS = 30_000;
const CODE = /one-time code:\s*([A-Z0-9]{4}-[A-Z0-9]{4})/;
const LINK = /(https:\/\/github\.com\/login\/device\S*)/;

type Spawn = typeof nodeSpawn;
export interface GhLogin { code: string; url: string; done: Promise<boolean>; cancel(): void }

export const NO_GH = 'GitHub\'s own tool, gh, is not on this computer, so paste a token instead.';

/** Starts the sign-in; answers with its code and link once gh prints them. */
export function startGhLogin({ gh = 'gh', spawn = nodeSpawn as Spawn, env = process.env }: { gh?: string; spawn?: Spawn; env?: NodeJS.ProcessEnv } = {}): Promise<GhLogin> {
  return new Promise((resolve, reject) => {
    let said = '';
    let child;
    try {
      child = spawn(gh, ['auth', 'login', '--web', '--hostname', 'github.com', '--git-protocol', 'https'], { env: { ...env, GH_PROMPT_DISABLED: '1' }, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch { reject(new Error(NO_GH)); return; }
    const timer = setTimeout(() => child.kill(), LOGIN_MS);
    let settled = false;
    const done = new Promise<boolean>((end) => {
      child.on('error', (e: NodeJS.ErrnoException) => { clearTimeout(timer); end(false); if (!settled) { settled = true; reject(new Error(e.code === 'ENOENT' ? NO_GH : e.message)); } });
      child.on('close', (code: number | null) => { clearTimeout(timer); end(code === 0); if (!settled) { settled = true; reject(new Error(said.trim().split('\n').pop() || 'GitHub\'s sign-in stopped before it began.')); } });
    });
    const hear = (b: Buffer) => {
      said += b;
      const code = CODE.exec(said)?.[1];
      const url = LINK.exec(said)?.[1];
      if (code && url && !settled) { settled = true; resolve({ code, url, done, cancel: () => child.kill() }); }
    };
    child.stdout.on('data', hear);
    child.stderr.on('data', hear);
    // Older gh asks for Enter before it opens a browser; nothing here has one to open.
    child.stdin.end('\n');
  });
}

/** Lets git on this computer push with gh's sign-in. */
export function setUpGit({ gh = 'gh', spawn = nodeSpawn as Spawn, env = process.env }: { gh?: string; spawn?: Spawn; env?: NodeJS.ProcessEnv } = {}): Promise<boolean> {
  return new Promise((resolve) => {
    let child;
    try { child = spawn(gh, ['auth', 'setup-git', '--hostname', 'github.com'], { env, stdio: 'ignore' }); } catch { resolve(false); return; }
    const timer = setTimeout(() => child.kill(), SETUP_MS);
    child.on('error', () => { clearTimeout(timer); resolve(false); });
    child.on('close', (code: number | null) => { clearTimeout(timer); resolve(code === 0); });
  });
}
