// THE THREAD HOLDING THE MOST MEMORY IS ASKED TO GIVE SOME BACK.
//
// The doors keep Agentbox from growing while it is over its allowance
// (main/memory-allowance.mts); they bring nothing back inside, and most
// minutes over are one thread holding more than the agents' whole room. Only
// that thread's agent can stop what it started, so its next command is
// answered with what its commands left running (main/memory-gate-server.mts).
// The measurements are in
// tests/the-thread-holding-the-most-memory-is-asked-to-give-some-back.

import { programName } from './memory-log.mts';

/** A thread is not asked twice inside this, and after it only if it holds more. */
export const ASK_AGAIN_MS = 15 * 60_000;
/** After this an ask counts for nothing: the thread's next run never heard it. */
export const ASK_FORGOTTEN_MS = 2 * 60 * 60_000;
const TREES_NAMED = 6;
const TREE_WORTH_NAMING_MB = 50;

/** One program of a thread's, as a listing has it; `start` is in seconds. */
export interface HeldProgram { pid: number; ppid: number; mb: number; start: number | null; exe: string; cmd: string; keep: boolean }
/** One program a thread's command started, with everything under it. `kept` is the mark that holds off the app's own sweep. */
export interface HeldTree { pid: number; name: string; mb: number; procs: number; startedAt: number | null; kept: boolean }
export interface Holding { item: string; mb: number; programs: HeldProgram[]; at: number }

/** Whether a thread asked `last` time may be asked now. Pure. */
export function mayAskAgain(last: { at: number; mb: number } | undefined, holding: Holding, now: number): boolean {
  if (!last || now - last.at >= ASK_FORGOTTEN_MS) return true;
  return now - last.at >= ASK_AGAIN_MS && holding.mb > last.mb;
}

const base = (file: unknown) => String(file ?? '').split('/').filter(Boolean).pop() ?? '';
// Claude Code as its own installer names it (its version), as npm packs it
// (claude.exe, on every system), and either agent run by node from its package.
const AGENT_FILE = /^(claude|codex)(\.exe)?$|^\d+\.\d+\.\d+$/;
const AGENT_PACKAGE = /(^|\/)(claude-code|codex)\//;
const SHELL = /^(sh|bash|zsh|dash|fish|ksh)$/;

function looksLikeAnAgent(p: HeldProgram): boolean {
  if (AGENT_FILE.test(base(p.exe))) return true;
  const [first = '', second = ''] = String(p.cmd ?? '').trim().split(/\s+/);
  return AGENT_FILE.test(base(first)) || (/^(node|bun)$/.test(base(first)) && AGENT_PACKAGE.test(second));
}

/**
 * Whether the command asking came from an agent one of the thread's commands
 * started (a tester, a `claude -p` it ran) and not from its own worker. Such
 * an agent is one of the things the worker left running, and is not the one
 * to say what the thread still needs. `asker` is the pids above the hook,
 * nearest first; `workers` the pids the app started for the thread. Only a
 * program the listing has, that looks like an agent, counts. Pure.
 */
export function askedByANestedAgent(holding: Holding, asker: readonly number[], workers: readonly number[]): boolean {
  const byPid = new Map(holding.programs.map((p) => [p.pid, p]));
  for (const pid of asker) {
    if (workers.includes(pid)) return false;
    const program = byPid.get(pid);
    if (program && looksLikeAnAgent(program)) return true;
  }
  return false;
}

type Kind = 'own' | 'shell' | 'program';

/**
 * WHAT ONE THREAD'S COMMANDS LEFT RUNNING, biggest first: each program a
 * command started, with everything under it, by the pid that stops the lot.
 *
 * Left out, because stopping them stops the agent: the thread's own agent,
 * whatever it runs under, a tool server it started itself (anything under it
 * that is not a shell), and all under those. The agent is known two ways.
 * `asker` is the pids above the hook that is asking and the worker the app
 * started, which are the agent whatever it is called. With none of those in
 * the listing, it is whatever looks like an agent and runs under no other.
 *
 * Everything else is named, an agent a command started and a program marked
 * to keep included: a test run is started detached, marked to keep, with its
 * testers under it, and it is the heaviest thing a thread holds. A shell with
 * no program of the thread's above it is the command line itself, so what it
 * runs stands for it. Pure.
 */
export function commandTrees(programs: readonly HeldProgram[], asker: Iterable<number> = []): HeldTree[] {
  const byPid = new Map(programs.map((p) => [p.pid, p]));
  // Up from `p` through the thread's own programs, nearest first; a pid met twice ends it.
  const above = (p: HeldProgram): HeldProgram[] => {
    const chain: HeldProgram[] = [];
    const seen = new Set([p.pid]);
    for (let up = byPid.get(p.ppid); up && !seen.has(up.pid); up = byPid.get(up.ppid)) { chain.push(up); seen.add(up.pid); }
    return chain;
  };
  const known = new Set([...asker].filter((pid) => byPid.has(pid)));
  const agents = known.size ? known
    : new Set(programs.filter((p) => looksLikeAnAgent(p) && !above(p).some(looksLikeAnAgent)).map((p) => p.pid));
  const isAgent = (p: HeldProgram) => agents.has(p.pid);
  const hosts = new Set<number>();
  for (const p of programs) if (isAgent(p)) for (const up of above(p)) hosts.add(up.pid);
  const kinds = new Map<number, Kind>();
  // Parents before children, so each kind is read off the one above it.
  const kindOf = (p: HeldProgram): Kind => {
    for (const q of [...above(p).reverse(), p]) {
      if (kinds.has(q.pid)) continue;
      const parent = byPid.get(q.ppid);
      const up = parent ? kinds.get(parent.pid) ?? null : null;
      const shell = SHELL.test(base(q.exe));
      let is: Kind;
      if (isAgent(q) || hosts.has(q.pid)) is = 'own';
      else if (up === 'own') is = shell && isAgent(parent!) ? 'shell' : 'own';
      else is = shell && up !== 'program' ? 'shell' : 'program';
      kinds.set(q.pid, is);
    }
    return kinds.get(p.pid)!;
  };
  const trees = new Map<number, HeldTree>();
  for (const p of programs) {
    if (kindOf(p) !== 'program') continue;
    const root = [p, ...above(p)].filter((_q, i, chain) => chain.slice(0, i + 1).every((x) => kindOf(x) === 'program')).pop()!;
    const tree = trees.get(root.pid) ?? { pid: root.pid, name: programName(root), mb: 0, procs: 0, startedAt: root.start === null ? null : root.start * 1000, kept: !!root.keep };
    tree.mb += Number(p.mb) || 0;
    tree.procs += 1;
    trees.set(root.pid, tree);
  }
  return [...trees.values()].map((t) => ({ ...t, mb: Math.round(t.mb) })).sort((a, b) => b.mb - a.mb);
}

const gb = (mb: number) => `${(mb / 1024).toFixed(1)} GB`;

function ago(startedAt: number, now: number): string {
  if (now - startedAt < 60_000) return 'under a minute ago';
  const minutes = Math.round((now - startedAt) / 60_000);
  if (minutes < 90) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hours ago`;
  return `${Math.round(hours / 24)} days ago`;
}

/**
 * What the agent is told in place of running its command, or null when there
 * is nothing it could stop. It is the only account it gets, so it names each
 * tree by the pid that stops it: a name would also match another thread's
 * browser, or the person's own. `running` drops what has ended since the
 * listing, which can be a minute old.
 */
export function giveBackAsk(holding: Holding, now: number, { asker = [], running = () => true }: { asker?: Iterable<number>; running?: (pid: number) => boolean } = {}): string | null {
  const named = commandTrees(holding.programs, asker).filter((t) => t.mb >= TREE_WORTH_NAMING_MB && running(t.pid)).slice(0, TREES_NAMED).map((t) => {
    const size = t.procs > 1 ? `${gb(t.mb)} in ${t.procs} programs` : gb(t.mb);
    return `pid ${t.pid}: ${t.name}, ${size}${t.startedAt === null ? '' : `, started ${ago(t.startedAt, now)}`}${t.kept ? ', marked to keep' : ''}`;
  });
  if (!named.length) return null;
  return `Not run yet. This computer is running short of memory, and this thread's own programs hold more of it than any other thread's: ${gb(holding.mb)}. `
    + `The biggest things its commands started and left running:\n${named.join('\n')}\n\n`
    + 'Stop the ones you no longer need (test browsers, dev servers and watchers left from earlier steps), then run this command again. '
    + 'Stop them by pid, never by name, and stop nothing that is not listed here: other threads and the person\'s own apps run programs with the same names. '
    + 'If you still need all of them, run this command again as it is.';
}
