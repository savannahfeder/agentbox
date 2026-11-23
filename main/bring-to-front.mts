// Takes her to the window a session she started is running in: its app, and on
// a Mac the very tab (Terminal, iTerm) or tmux pane, found by the terminal
// device the session's process holds.

import { execFile } from 'node:child_process';
import path from 'node:path';

export interface ProcRow { pid: number; ppid: number; tty: string; command: string }

/** `ps -Aww -o pid=,ppid=,tty=,command=` as a table by pid. */
export function parsePs(out: string): Map<number, ProcRow> {
  const table = new Map<number, ProcRow>();
  for (const line of out.split('\n')) {
    const m = line.match(/^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/);
    if (m) table.set(Number(m[1]), { pid: Number(m[1]), ppid: Number(m[2]), tty: m[3], command: m[4].trimEnd() });
  }
  return table;
}

const ancestors = function* (table: Map<number, ProcRow>, pid: number) {
  let cur = table.get(pid);
  for (let hops = 0; cur && hops < 16; hops += 1) { yield cur; cur = table.get(cur.ppid); }
};

/** The macOS app a process runs inside, from the first `.app` up its parents. */
export function appOf(table: Map<number, ProcRow>, pid: number): { path: string; name: string } | null {
  for (const row of ancestors(table, pid)) {
    const m = row.command.match(/^(\/(?:Applications|System\/Applications)\/(?:[^/]+\/)*?[^/]*?\.app)\//);
    if (m) return { path: m[1], name: path.basename(m[1], '.app') };
  }
  return null;
}

/** Whether the process is inside tmux: a tmux server is one of its parents. */
export const inTmux = (table: Map<number, ProcRow>, pid: number) => [...ancestors(table, pid)].slice(1).some((r) => /(^|\/)tmux(\s|:|$)/.test(r.command));

/** The device path ps writes as `ttys004` (Mac) or `pts/3` (Linux); null for none. */
export const ttyPath = (tty: string) => (!tty || tty === '?' || tty === '??' ? null : tty.startsWith('/dev/') ? tty : `/dev/${tty}`);

/**
 * The Codex process a session she started in a terminal or editor runs in.
 * Codex itself names no process for a thread, so it is the Codex command line
 * naming the session, else the Codex started in the session's folder most
 * recently. Its own background service, `codex exec` and MCP runs are not it.
 */
export function codexProcessFor(table: Map<number, ProcRow>, cwds: Map<number, string>, { sessionId, cwd }: { sessionId: string; cwd: string }): number | null {
  const tui = [...table.values()].filter((r) => /(^|\/)codex(\s|$)/.test(r.command) && !/\s(app-server|exec|mcp|mcp-server|login|proto)(\s|$)/.test(r.command));
  // A node launcher and the binary it starts are one Codex: the innermost holds the terminal.
  const inner = tui.filter((r) => !tui.some((c) => c.ppid === r.pid));
  const named = inner.find((r) => r.command.includes(sessionId));
  if (named) return named.pid;
  const here = inner.filter((r) => cwds.get(r.pid) === cwd || [...ancestors(table, r.pid)].some((a) => cwds.get(a.pid) === cwd));
  return here.length ? Math.max(...here.map((r) => r.pid)) : null;
}

const quote = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/** The AppleScript that selects the tab holding that terminal device, for Terminal and iTerm. */
export function tabScript(app: 'Terminal' | 'iTerm', tty: string): string {
  if (app === 'Terminal') {
    return [
      'tell application "Terminal"',
      '  repeat with w in windows',
      '    repeat with t in tabs of w',
      `      if tty of t is ${quote(tty)} then`,
      '        set selected tab of w to t',
      '        set index of w to 1',
      '        activate',
      '        return "ok"',
      '      end if',
      '    end repeat',
      '  end repeat',
      'end tell',
      'return "none"',
    ].join('\n');
  }
  return [
    'tell application "iTerm"',
    '  repeat with w in windows',
    '    repeat with t in tabs of w',
    '      repeat with s in sessions of t',
    `        if tty of s is ${quote(tty)} then`,
    '          select w',
    '          tell t to select',
    '          tell s to select',
    '          activate',
    '          return "ok"',
    '        end if',
    '      end repeat',
    '    end repeat',
    '  end repeat',
    'end tell',
    'return "none"',
  ].join('\n');
}

export const terminalKind = (appName: string): 'Terminal' | 'iTerm' | null => (appName === 'Terminal' ? 'Terminal' : /^iTerm/.test(appName) ? 'iTerm' : null);

type Run = (file: string, args: string[]) => Promise<string>;
const run: Run = (file, args) => new Promise((resolve, reject) => {
  execFile(file, args, { timeout: 5_000, maxBuffer: 16 << 20, encoding: 'utf8', windowsHide: true }, (err, out) => (err ? reject(err) : resolve(String(out))));
});

export type BringResult = { ok: true; name: string } | { ok: false; reason: string };

/**
 * Brings the session's window to the front: the tab, where the app can be told
 * which, else the app. Inside tmux the pane is selected first and the tab of
 * the terminal showing that tmux session is the one brought up.
 */
export async function bringToFront(pid: number, { exec = run, platform = process.platform }: { exec?: Run; platform?: NodeJS.Platform } = {}): Promise<BringResult> {
  let table: Map<number, ProcRow>;
  try { table = parsePs(await exec('/bin/ps', ['-Aww', '-o', 'pid=,ppid=,tty=,command='])); } catch { return { ok: false, reason: 'It cannot tell which window it is running in.' }; }
  if (!table.has(pid)) return { ok: false, reason: 'It cannot tell which window it is running in.' };
  let tty = ttyPath(table.get(pid)!.tty);
  let holder = pid;
  if (tty && inTmux(table, pid)) {
    try {
      const panes = (await exec('tmux', ['list-panes', '-a', '-F', '#{pane_tty} #{session_name}:#{window_index}.#{pane_index}'])).split('\n');
      const pane = panes.map((l) => l.split(' ')).find(([t]) => t === tty)?.[1];
      if (pane) {
        await exec('tmux', ['select-window', '-t', pane.replace(/\.\d+$/, '')]);
        await exec('tmux', ['select-pane', '-t', pane]);
        const client = (await exec('tmux', ['list-clients', '-t', pane.split(':')[0], '-F', '#{client_pid} #{client_tty}'])).split('\n')[0]?.split(' ');
        if (client?.[0]) { holder = Number(client[0]); tty = client[1] || null; }
      }
    } catch { /* tmux would not say; the app still comes up */ }
  }
  const app = appOf(table, holder);
  if (!app) return { ok: false, reason: 'It cannot tell which window it is running in.' };
  if (platform !== 'darwin') return { ok: false, reason: `Switch to ${app.name} to answer it.` };
  const kind = terminalKind(app.name);
  if (kind && tty) {
    try { if ((await exec('/usr/bin/osascript', ['-e', tabScript(kind, tty)])).trim() === 'ok') return { ok: true, name: app.name }; } catch { /* not allowed to; the app still comes up */ }
  }
  try { await exec('/usr/bin/open', ['-a', app.path]); return { ok: true, name: app.name }; } catch { return { ok: false, reason: `${app.name} would not come to the front.` }; }
}
