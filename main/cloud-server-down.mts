// THE CLOUD SERVER GOING DOWN IS ONE THREAD IN NEEDS YOU, ON THE MAC THAT RUNS IT.
//
// From 2026-11-04 the cloud server answered 502 to every call for more than
// two days. Every Mac saw its cloud runs fail and quietly ran threads here, so
// nobody was told. The Mac that deploys the server (it has the server's AWS
// settings in ~/.agentbox) now files one thread when cloud starts keep dying
// on the server's own error, and notes on that same thread when a cloud run
// starts again. One outage is one thread, across restarts.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const STATE = 'cloud-server-down.json';
// The files that hold the server's AWS settings (scripts/lib/deploy-rules.mjs `serverConfig`).
const SERVER_FILES = ['cloud.json', 'cloud.own-aws.json'];
// What marks the project the server's code lives in.
const SERVER_CODE = path.join('scripts', 'cloud-gateway-setup.mjs');

/** What the cloud server said when it itself errored (a 5xx), from a run's tail, or null. */
export function serverError(tail: unknown[] | null | undefined): string | null {
  for (const line of [...(tail ?? [])].reverse()) {
    if (typeof line !== 'string') continue;
    const m = line.match(/agentbox cloud:\s*(.*the cloud server said 5\d\d\b.*)$/m);
    if (m) return m[1].trim();
  }
  return null;
}

/** Whether this Mac deploys a cloud server: it holds that server's AWS bucket and runtime. */
export function runsACloudServer(home: string = os.homedir()): boolean {
  return SERVER_FILES.some((name) => {
    try {
      const c = JSON.parse(fs.readFileSync(path.join(home, '.agentbox', name), 'utf8'));
      return !!(c?.bucket && c?.runtimeArn);
    } catch { return false; }
  });
}

export function downRow({ said, failed }: { said: string; failed: number }) {
  return {
    title: 'The cloud server is down, and cloud runs are failing',
    problem: 'Cloud runs end before their agent starts because the cloud server itself errors. Threads run on this Mac meanwhile. It needs a fix and a redeploy.',
    body: [
      `The last ${failed} cloud runs in a row ended before their agent started. Each time the cloud server said`,
      '',
      `    ${said}`,
      '',
      'Every cloud run goes through this server, so the cloud is down for everyone, not only this Mac. Threads run on this Mac until it answers again, and this thread gets a note when it does.',
      '',
      'To find the cause, read the server\'s log in AWS CloudWatch, under /aws/lambda/agentbox-gateway. Once the fix is on main, put it live with `npm run deploy`.',
    ].join('\n'),
    kind: 'review',
  };
}

export const UP_AGAIN = 'The cloud server answers again. A cloud run just started its agent.';

interface DownState { product: string; id: string; since: number }

export interface CloudServerWatchOptions {
  store: {
    fileItem(slug: string, row: object): { id: string };
    noteItem?(product: string, id: string, text: string): unknown;
    listProducts?(): { slug: string; repoPath?: string | null }[];
  };
  userDir: string;
  home?: string;
  now?: () => number;
}

export class CloudServerWatch {
  declare opts: Required<Omit<CloudServerWatchOptions, 'home'>> & { home: string };

  constructor({ store, userDir, home = os.homedir(), now = Date.now }: CloudServerWatchOptions) {
    this.opts = { store, userDir, home, now };
  }

  file() { return path.join(this.opts.userDir, STATE); }

  read(): DownState | null {
    try { return JSON.parse(fs.readFileSync(this.file(), 'utf8')) || null; } catch { return null; }
  }

  /** The project the server's code is in, or null. */
  serverProject(): string | null {
    const products = this.opts.store.listProducts?.() ?? [];
    return products.find((p) => p.repoPath && fs.existsSync(path.join(p.repoPath, SERVER_CODE)))?.slug ?? null;
  }

  /** Cloud starts keep dying on the server's own error. Files one thread per outage. */
  down(said: string, failed: number) {
    if (this.read() || !runsACloudServer(this.opts.home)) return null;
    const product = this.serverProject();
    if (!product) return null;
    try {
      const { id } = this.opts.store.fileItem(product, downRow({ said, failed }));
      fs.writeFileSync(this.file(), `${JSON.stringify({ product, id, since: this.opts.now() })}\n`);
      return id;
    } catch (e) {
      console.warn(`cloud-server-down: could not file the thread: ${(e as Error).message}`);
      return null;
    }
  }

  /** A cloud run started its agent: the outage, if one was filed, is over. */
  up() {
    const state = this.read();
    if (!state) return;
    try { this.opts.store.noteItem?.(state.product, state.id, UP_AGAIN); } catch { /* the row may be gone */ }
    try { fs.rmSync(this.file(), { force: true }); } catch { /* filed again next outage at worst */ }
  }
}
