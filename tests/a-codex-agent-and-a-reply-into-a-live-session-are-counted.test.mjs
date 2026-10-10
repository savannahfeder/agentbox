// A CODEX AGENT, AND A REPLY TYPED STRAIGHT INTO A LIVE SESSION, ARE COUNTED.
//
// Found on 2026-10-08 reading the daily report's own numbers against the code
// (w-1116fbb68a). Three counts were missing or misshapen, and each one bends a
// number somebody reads as "did this install get going":
//
//   · `agent_seen` listed Claude Code PROCESSES and nothing else (main/ipc.mjs,
//     liveAgents; main/agents.mjs has no Codex read in 0.1.11, 0.1.12 or main).
//     About a third of the people on this app are on Codex, so for them
//     "an agent connected" was read off proxies: a run this app started, which
//     only 0.1.12 sends at all, or a reply. A Codex thread has no process to
//     find, so it is read off what Codex leaves on the disk, which the watch
//     already reads once a minute for another reason entirely.
//   · a reply typed into a live session (`zero:agent-reply`) sent NOTHING,
//     while a reply on a task sent `reply_sent`. Activation is read as three
//     real replies to agents in the first day, so everybody who talks to their
//     own sessions instead of through a row was missing from it.
//   · `repo_connected` fired once per folder, and setup's import makes a
//     project per folder in one press: nine folders read as nine connections.
//
// Nothing new may leave: the event names, the property allowlist and the two
// closed word lists are all unchanged, which is why the README's twelve
// sentences do not move either. `engine` and `kind` and `count` were already
// approved properties (shared/analytics-events.mjs), and this is the first
// caller of each on these three events.
//
// The cases, including the ones that must NOT count:
//   · a Codex thread Codex is still in counts, once, as 'codex';
//   · one touched ten minutes ago still counts, and the boundary either side of
//     the hour is pinned;
//   · one last touched three hours ago does NOT count;
//   · the same thread over three ticks of the watch counts once, two threads
//     count twice;
//   · a reply that was not delivered counts nothing;
//   · a bogus `kind` or `engine` is still dropped rather than sent.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { CODEX_SEEN_MS, scanCodex } from '../main/codex-watch.mjs';
import { ALLOWED_PROPS, EVENT_NAMES, sanitize } from '../shared/analytics-events.mjs';

const read = (rel) => fs.readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
const ipc = () => read('main/ipc.mjs');

const NOW = Date.parse('2026-10-08T14:00:00-07:00');

/** A store that answers the watch's two questions and remembers nothing. */
const quietStore = () => ({ refreshCodexMirrors: () => 0, refreshCodexAsks: () => 0 });

/**
 * One Codex conversation in the shape `readCodexThreads` hands over. `ago` is
 *  how long since Codex last wrote to it, which is the whole of what decides
 *  whether it counts.
 */
const thread = (id, ago, over = {}) => ({
  id,
  source: 'codex',
  folder: '/somewhere/orders',
  folderName: 'orders',
  title: `Conversation ${id}`,
  when: NOW - ago,
  lastActive: NOW - ago,
  live: ago < 2 * 60_000,
  turns: 2,
  ...over,
});

/** Runs the watch's scan over `threads` and returns every count it sent. */
function tick(threads, { seen = null, now = NOW } = {}) {
  const sent = [];
  scanCodex({
    store: quietStore(),
    readThreads: () => ({ threads }),
    count: (name, props) => sent.push([name, props]),
    seen,
    now,
  });
  return sent;
}

describe('a Codex conversation is an agent that was seen', () => {
  it('counts one Codex is still in, and says which engine', () => {
    expect(tick([thread('live-one', 10_000)])).toEqual([['agent_seen', { engine: 'codex' }]]);
  });

  it('counts one touched earlier in the same sitting', () => {
    expect(tick([thread('ten-minutes', 10 * 60_000)])).toEqual([['agent_seen', { engine: 'codex' }]]);
  });

  // THE BOUNDARY EITHER SIDE. An hour is a sitting; a thread from this morning
  // is not an agent that is up now, and counting it would say an install had an
  // agent on every day it was opened.
  it('counts one just inside the hour and not one just outside it', () => {
    expect(tick([thread('inside', CODEX_SEEN_MS - 60_000)])).toHaveLength(1);
    expect(tick([thread('outside', CODEX_SEEN_MS + 60_000)])).toEqual([]);
  });

  it('does not count one last touched three hours ago', () => {
    expect(tick([thread('this-morning', 3 * 60 * 60_000)])).toEqual([]);
  });

  it('counts a thread once however many times the watch runs', () => {
    const seen = new Set();
    const t = thread('same', 10_000);
    expect(tick([t], { seen })).toHaveLength(1);
    expect(tick([t], { seen, now: NOW + 60_000 })).toEqual([]);
    expect(tick([t], { seen, now: NOW + 120_000 })).toEqual([]);
  });

  it('counts two conversations as two', () => {
    const seen = new Set();
    expect(tick([thread('a', 10_000), thread('b', 20 * 60_000)], { seen })).toEqual([
      ['agent_seen', { engine: 'codex' }],
      ['agent_seen', { engine: 'codex' }],
    ]);
  });

  it('counts nothing, and throws nothing, when no counter was handed in', () => {
    expect(() => scanCodex({ store: quietStore(), readThreads: () => ({ threads: [thread('x', 10_000)] }), now: NOW })).not.toThrow();
  });

  it('is wired to the switch, with a set that lasts one run of the app', () => {
    expect(read('main/codex-watch.mjs')).toMatch(/const seen = new Set\(\)/);
    expect(read('main/main.mjs')).toMatch(/startCodexWatch\(\{ store, count: \(name, props\) => analytics\.track\(name, props\) \}\)/);
  });
});

describe('the Claude Code side says which engine too', () => {
  it('sends agent_seen as claude, so the two can be told apart', () => {
    const src = ipc();
    const at = src.indexOf('const liveAgents = () => {');
    expect(at).toBeGreaterThan(-1);
    expect(src.slice(at, src.indexOf('return live;', at))).toMatch(
      /analytics\.track\('agent_seen', \{ engine: 'claude' \}\)/,
    );
  });

  it('keeps the engine only when it is one of the two', () => {
    expect(sanitize('agent_seen', { engine: 'codex' })).toEqual({ engine: 'codex' });
    expect(sanitize('agent_seen', { engine: 'claude' })).toEqual({ engine: 'claude' });
    expect(sanitize('agent_seen', { engine: 'gemini' })).toEqual({});
  });
});

describe('a reply typed straight into a live session', () => {
  /** The handler, start to the one after it. */
  const handler = () => {
    const src = ipc();
    const at = src.indexOf("ipcMain.handle('zero:agent-reply'");
    expect(at).toBeGreaterThan(-1);
    const end = src.indexOf("ipcMain.handle('zero:unreply-agent'", at);
    expect(end).toBeGreaterThan(at);
    return src.slice(at, end);
  };

  it('is counted as a reply, and says it was to an agent rather than on a task', () => {
    expect(handler()).toMatch(/analytics\.track\('reply_sent', \{ kind: 'agent' \}\)/);
  });

  // ONLY A DELIVERED MESSAGE. The reader refuses a send to a session frozen on
  // a permission box, and a count for words that never arrived would read as
  // activation nobody had. So the count sits inside the same `out.ok` that the
  // row's own mark waits for, and the handler counts in exactly one place.
  it('counts nothing when the message was not delivered', () => {
    const body = handler();
    const ok = body.indexOf('if (out?.ok) {');
    expect(ok).toBeGreaterThan(-1);
    const guarded = body.slice(ok, body.indexOf('push();', ok));
    expect(guarded).toMatch(/analytics\.track\('reply_sent', \{ kind: 'agent' \}\)/);
    expect(body.match(/analytics\.track\(/g)).toHaveLength(1);
  });

  it('still marks the row, which needs the key and not only the delivery', () => {
    expect(handler()).toMatch(/if \(out\.key\) agentSchedule\.replied\(/);
  });

  it('keeps the kind only when it is one of the approved words', () => {
    expect(sanitize('reply_sent', { kind: 'agent' })).toEqual({ kind: 'agent' });
    expect(sanitize('reply_sent', { kind: 'session' })).toEqual({});
  });
});

describe('a press that connects nine folders', () => {
  it('leaves the single connect counting itself', () => {
    const src = ipc();
    const at = src.indexOf("ipcMain.handle('zero:create-product'");
    expect(at).toBeGreaterThan(-1);
    const body = src.slice(at, src.indexOf('return out;', at));
    expect(body).toMatch(
      /if \(!ofMany && typeof repoPath === 'string' && repoPath\.trim\(\)\) analytics\.track\('repo_connected'\)/,
    );
  });

  it('counts the press once, with how many folders it connected', () => {
    const card = read('renderer/src/components/ImportAgents.tsx');
    expect(card).toMatch(/createProduct\(\{ name: f\.name, repoPath: f\.folder, ofMany: true \}\)/);
    // `newly` is only pushed for a project the store really made, so a folder
    // it refused is not in the number either.
    expect(card).toMatch(/window\.zero\?\.track\?\.\('repo_connected', newly\.length\)/);
    expect(card).toMatch(/if \(newly\.length\)/);
  });

  it('can carry that number through the one door the window has', () => {
    expect(EVENT_NAMES).toContain('repo_connected');
    expect(ALLOWED_PROPS.has('count')).toBe(true);
    expect(sanitize('repo_connected', { count: 9 })).toEqual({ count: 9 });
    expect(sanitize('repo_connected', { folders: '/Users/someone/code' })).toEqual({});
  });
});
