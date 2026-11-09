// A DAY THE APP FROZE IS A THREAD THAT FIXES IT.
//
// main/freeze-recorder.mts writes each hold of the main thread to the log on
// this computer. This reads yesterday's once a day and, when the longest hold
// reached FILE_AT_MS, files one thread in the project whose repository the app
// runs from, with the holds grouped by the function that held them and the
// stack of each group's longest. It is filed to start on its own; its fix waits
// for review like any other.
//
// Only that computer files anything: a person who just uses Agentbox has no
// project on its repository and nothing to fix it with. One open thread at a
// time: while it is open, another bad day is a note on it.
import fs from 'node:fs';
import path from 'node:path';
import { dayOf, type FreezeLine } from './freeze-recorder.mts';
import type { FiledItem, Store, StoreProduct } from './store.mts';
import { SWAP_CRITICAL_MBPS } from './memory-gate.mts';

export const FILE_AT_MS = 1000;
export const FREEZE_LABEL = 'app-froze';
const STATE = 'freeze-watch.json';
const GROUPS = 5;
const FRAMES = 12;

interface HoldGroup { where: string; times: number; totalMs: number; longest: FreezeLine }

export type FreezeRow = Required<Pick<FiledItem, 'title' | 'problem' | 'body'>>;

/** What `freeze-watch.json` keeps: the last day looked at, and the thread it filed. */
interface FreezeWatchState { checked?: string; open?: { product: string; id: string } }

type FreezeStore = Pick<Store, 'listProducts' | 'listItems' | 'readItem' | 'noteItem' | 'fileOnItsOwn'>;

export interface FreezeWatchOptions {
  store: FreezeStore;
  userDir: string;
  appDir: string;
  logDir?: string;
  now?: () => number;
  log?: Pick<Console, 'warn' | 'info'>;
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

/** Every freeze line of one day's log, oldest first. */
export function freezesOn(logDir: string, day: string): FreezeLine[] {
  let text = '';
  try { text = fs.readFileSync(path.join(logDir, `freeze-${day}.jsonl`), 'utf8'); } catch { return []; }
  const out: FreezeLine[] = [];
  for (const raw of text.split('\n')) {
    if (!raw.trim()) continue;
    try {
      const line = JSON.parse(raw);
      if (Number.isFinite(line?.ms)) out.push(line);
    } catch { /* a line cut short by a quit */ }
  }
  return out;
}

/** The day's holds grouped by what held them, most time first. Pure. */
function groupsOf(lines: FreezeLine[]): HoldGroup[] {
  const by = new Map<string, HoldGroup>();
  for (const l of lines) {
    const where = String(l.where ?? '(unknown)');
    const g = by.get(where) ?? { where, times: 0, totalMs: 0, longest: l };
    g.times += 1;
    g.totalMs += l.ms;
    if (l.ms > g.longest.ms) g.longest = l;
    by.set(where, g);
  }
  return [...by.values()].sort((a, b) => b.totalMs - a.totalMs);
}

function listOf(lines: FreezeLine[]): string[] {
  return groupsOf(lines).slice(0, GROUPS).flatMap((g, i) => {
    const stack = g.longest.stacks?.[0];
    return [
      `${i + 1}. ${g.times} ${g.times === 1 ? 'time' : 'times'}, ${seconds(g.totalMs)} in all, longest ${seconds(g.longest.ms)}: ${g.where}`,
      ...(stack?.frames?.length ? [
        `   The longest one's stack (${Math.round((stack.share ?? 0) * 100)}% of its busy samples):`,
        ...stack.frames.slice(0, FRAMES).map((f) => `     ${f}`),
      ] : []),
    ];
  });
}

/** A minute line of the memory log (main/memory-log.mts), as read back here. */
export interface MemoryMinute {
  at: string | number;
  pressure?: string | null;
  swapInMbps?: number | null;
  swapMb?: number | null;
  app?: { mb?: number };
  tasks?: MemoryHolder[];
  others?: MemoryHolder[];
}
interface MemoryHolder { item?: string; name?: string; mb?: number }

/** The minute lines of one day's memory log (main/memory-log.mts), oldest first. */
export function memoryOn(logDir: string, day: string): MemoryMinute[] {
  let text = '';
  try { text = fs.readFileSync(path.join(logDir, `memory-${day}.jsonl`), 'utf8'); } catch { return []; }
  const out: MemoryMinute[] = [];
  for (const raw of text.split('\n')) {
    if (!raw.trim()) continue;
    try {
      const line = JSON.parse(raw);
      // The recorder's heap lines share the file and carry no pressure.
      if (line && 'pressure' in line) out.push(line);
    } catch { /* a line cut short by a quit */ }
  }
  return out;
}

const clock = (at: string | number) => { const d = new Date(at); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const held = (list: MemoryHolder[] | undefined, name: 'item' | 'name') => (list ?? []).slice().sort((a, b) => (b.mb ?? 0) - (a.mb ?? 0)).slice(0, 3).map((p) => `${p[name] ?? '?'} ${Math.round(p.mb ?? 0)} MB`);

/**
 * How short of memory the Mac was over the day, from its minute log. A main
 * thread held while the Mac swaps hard is mostly the Mac paging the app back
 * in, wherever the hold landed, so the thread says when that was so. Pure.
 */
export function memoryWords(lines: MemoryMinute[] | null | undefined): string[] {
  if (!lines?.length) return [];
  const count = (word: string) => lines.filter((l) => l.pressure === word).length;
  const out = [`Pressure: critical ${count('critical')}, tight ${count('tight')} of ${lines.length} minutes logged.`];
  const rated = lines.filter((l): l is MemoryMinute & { swapInMbps: number } => Number.isFinite(l.swapInMbps));
  if (!rated.length) return out;
  const worst = rated.reduce((a, b) => (b.swapInMbps > a.swapInMbps ? b : a));
  const heavy = rated.filter((l) => l.swapInMbps >= SWAP_CRITICAL_MBPS).length;
  const peakMb = Math.max(0, ...lines.map((l) => (Number.isFinite(l.swapMb) ? l.swapMb as number : 0)));
  out.unshift(`Swapping: up to ${worst.swapInMbps} MB/s read back off the disk (a minute's average), ${heavy} ${heavy === 1 ? 'minute' : 'minutes'} at ${SWAP_CRITICAL_MBPS} MB/s or more, the rate at which the app holds new agents.${peakMb ? ` Swap peaked at ${(peakMb / 1024).toFixed(1)} GB.` : ''}`);
  out.push(`It swapped hardest at ${clock(worst.at)}. Memory then: the app ${Math.round(worst.app?.mb ?? 0)} MB; tasks ${held(worst.tasks, 'item').join(', ') || 'none'}; outside the app ${held(worst.others, 'name').join(', ') || 'nothing logged'}.`);
  if (heavy) out.push('The Mac was swapping hard, so the holds above are as likely the Mac paging the app back in as the code they name: start with what held memory.');
  return out;
}

/** The thread for a day's freezes, or null when none reached FILE_AT_MS. Pure. */
export function freezeRow(lines: FreezeLine[], { day, memory = [] }: { day: string; memory?: MemoryMinute[] }): FreezeRow | null {
  if (!lines.some((l) => l.ms >= FILE_AT_MS)) return null;
  const longest = Math.max(...lines.map((l) => l.ms));
  const total = lines.reduce((sum, l) => sum + l.ms, 0);
  const n = lines.length;
  const top = groupsOf(lines)[0];
  return {
    title: `The app froze ${n} ${n === 1 ? 'time' : 'times'} on ${day}, longest ${seconds(longest)}`,
    problem: `On ${day} the app's main thread was held ${n} ${n === 1 ? 'time' : 'times'}, ${seconds(total)} in all, most in ${top.where}. This thread finds what held it, fixes the worst, and measures before and after.`,
    body: [
      `The freeze recorder caught the app's main thread held for over half a second ${n} ${n === 1 ? 'time' : 'times'} on ${day}, ${seconds(total)} in all. Each hold is a click or a key that got no answer; the long ones are the spinning wheel.`,
      '',
      'Where the time went, most first:',
      '',
      ...listOf(lines),
      '',
      ...(memoryWords(memory).length ? ['How short of memory the Mac was that day:', '', ...memoryWords(memory), ''] : []),
      'Find what held the thread in the first of these, fix it, and measure it before and after. `node scripts/measure-speed.mjs` runs a copy of the app on a large made-up inbox, presses keys the way a person does, and prints each request\'s time and every freeze with its stack. The whole log is `memory-log/freeze-' + day + '.jsonl` in the app\'s data folder on the computer that froze, kept a week.',
    ].join('\n'),
  };
}

/** What the open thread hears about another bad day. Pure. */
export function freezeNote(lines: FreezeLine[], { day, memory = [] }: { day: string; memory?: MemoryMinute[] }): string | null {
  const row = freezeRow(lines, { day });
  if (!row) return null;
  const words = memoryWords(memory);
  return [`Again on ${day}: ${row.title.replace(/^The app froze /, '').replace(/ on \S+,/, ',')}.`, '', ...listOf(lines), ...(words.length ? ['', ...words] : [])].join('\n');
}

export class FreezeWatch {
  declare store: FreezeStore;
  declare userDir: string;
  declare appDir: string;
  declare logDir: string;
  declare now: () => number;
  declare log: Pick<Console, 'warn' | 'info'>;

  constructor({ store, userDir, appDir, logDir = path.join(userDir, 'memory-log'), now = Date.now, log = console }: FreezeWatchOptions) {
    Object.assign(this, { store, userDir, appDir, logDir, now, log });
  }

  read(): FreezeWatchState {
    try { return JSON.parse(fs.readFileSync(path.join(this.userDir, STATE), 'utf8')) ?? {}; } catch { return {}; }
  }

  write(state: FreezeWatchState): void {
    try {
      fs.mkdirSync(this.userDir, { recursive: true });
      fs.writeFileSync(path.join(this.userDir, STATE), `${JSON.stringify(state)}\n`);
    } catch (err) { this.log.warn?.(`freeze-watch: could not keep what it checked: ${(err as Error).message}`); }
  }

  /** The project on the repository the app runs from, the one with the most threads if several are. */
  project(): StoreProduct | null {
    const real = (p: string) => { try { return fs.realpathSync(p); } catch { return null; } };
    const app = real(this.appDir);
    if (!app) return null;
    const mine = this.store.listProducts().filter((p) => p.repoPath && real(p.repoPath) === app);
    if (mine.length <= 1) return mine[0] ?? null;
    const count = (slug: string) => this.store.listItems().filter((i) => i.product === slug).length;
    return mine.sort((a, b) => count(b.slug) - count(a.slug))[0];
  }

  /** Yesterday, once: files or notes when it froze. Returns what it wrote, or null. */
  check() {
    const now = new Date(this.now());
    const day = dayOf(new Date(now).setDate(now.getDate() - 1));
    const state = this.read();
    if (state.checked && state.checked >= day) return null;
    const lines = freezesOn(this.logDir, day);
    const product = freezeRow(lines, { day }) ? this.project() : null;
    if (!product) { this.write({ ...state, checked: day }); return null; }
    const open = state.open ? this.store.readItem(state.open.product, state.open.id) : null;
    const memory = memoryOn(this.logDir, day);
    let wrote = null;
    // `product` is only set when freezeRow found a day worth filing, so neither of these is null.
    if (open && open.status !== 'done') {
      wrote = this.store.noteItem(open.product, open.id, freezeNote(lines, { day, memory })!);
    } else {
      const row = freezeRow(lines, { day, memory })!;
      wrote = this.store.fileOnItsOwn(product.slug, { ...row, kind: 'task', labels: [FREEZE_LABEL] });
      state.open = { product: product.slug, id: wrote.id };
      this.log.info?.(`freeze-watch: the app froze on ${day}; filed ${wrote.id}.`);
    }
    this.write({ ...state, checked: day });
    return wrote;
  }
}
