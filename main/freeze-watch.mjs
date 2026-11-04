// A DAY THE APP FROZE IS A THREAD THAT FIXES IT.
//
// main/freeze-recorder.mjs writes each hold of the main thread to the log on
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
import { dayOf } from './freeze-recorder.mjs';

export const FILE_AT_MS = 1000;
export const FREEZE_LABEL = 'app-froze';
const STATE = 'freeze-watch.json';
const GROUPS = 5;
const FRAMES = 12;

const seconds = (ms) => `${(ms / 1000).toFixed(1)} s`;

/** Every freeze line of one day's log, oldest first. */
export function freezesOn(logDir, day) {
  let text = '';
  try { text = fs.readFileSync(path.join(logDir, `freeze-${day}.jsonl`), 'utf8'); } catch { return []; }
  const out = [];
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
function groupsOf(lines) {
  const by = new Map();
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

function listOf(lines) {
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

/** The thread for a day's freezes, or null when none reached FILE_AT_MS. Pure. */
export function freezeRow(lines, { day }) {
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
      'Find what held the thread in the first of these, fix it, and measure it before and after. `node scripts/measure-speed.mjs` runs a copy of the app on a large made-up inbox, presses keys the way a person does, and prints each request\'s time and every freeze with its stack. The whole log is `memory-log/freeze-' + day + '.jsonl` in the app\'s data folder on the computer that froze, kept a week.',
    ].join('\n'),
  };
}

/** What the open thread hears about another bad day. Pure. */
export function freezeNote(lines, { day }) {
  const row = freezeRow(lines, { day });
  if (!row) return null;
  return [`Again on ${day}: ${row.title.replace(/^The app froze /, '').replace(/ on \S+,/, ',')}.`, '', ...listOf(lines)].join('\n');
}

export class FreezeWatch {
  constructor({ store, userDir, appDir, logDir = path.join(userDir, 'memory-log'), now = Date.now, log = console }) {
    Object.assign(this, { store, userDir, appDir, logDir, now, log });
  }

  read() {
    try { return JSON.parse(fs.readFileSync(path.join(this.userDir, STATE), 'utf8')) ?? {}; } catch { return {}; }
  }

  write(state) {
    try {
      fs.mkdirSync(this.userDir, { recursive: true });
      fs.writeFileSync(path.join(this.userDir, STATE), `${JSON.stringify(state)}\n`);
    } catch (err) { this.log.warn?.(`freeze-watch: could not keep what it checked: ${err.message}`); }
  }

  /** The project on the repository the app runs from, the one with the most threads if several are. */
  project() {
    const real = (p) => { try { return fs.realpathSync(p); } catch { return null; } };
    const app = real(this.appDir);
    if (!app) return null;
    const mine = this.store.listProducts().filter((p) => p.repoPath && real(p.repoPath) === app);
    if (mine.length <= 1) return mine[0] ?? null;
    const count = (slug) => this.store.listItems().filter((i) => i.product === slug).length;
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
    let wrote = null;
    if (open && open.status !== 'done') {
      wrote = this.store.noteItem(open.product, open.id, freezeNote(lines, { day }));
    } else {
      const row = freezeRow(lines, { day });
      wrote = this.store.fileOnItsOwn(product.slug, { ...row, kind: 'task', labels: [FREEZE_LABEL] });
      state.open = { product: product.slug, id: wrote.id };
      this.log.info?.(`freeze-watch: the app froze on ${day}; filed ${wrote.id}.`);
    }
    this.write({ ...state, checked: day });
    return wrote;
  }
}
