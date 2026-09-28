// A CODEX RUN'S CARD CARRIES THE CODE IT CHANGED, BOTH HALVES OF IT.
//
// `writeChangeForRun` builds that artifact out of TWO readings of one run: the
// conversation, which knows what the agent typed through its editing tools and
// the sentence it said while doing it, and the checkout, photographed at the
// spawn and read back at the exit, which knows what actually moved on the disk.
// `mergeChange` puts them together and the disk wins where they disagree.
//
// A CODEX RUN HAD ONLY THE DISK HALF. `changeFromTranscript` speaks Claude
// Code's JSONL transcript and nothing else, and a Codex rollout fed to it
// yields zero files, so the conversation half of a Codex card was always empty.
// `changeFromCodexTurn` (main/codex.mjs) has existed since the reader slice and
// nothing called it, because calling it needs a change writer that takes a
// change somebody else prepared. That is what this adds, and these are the
// three things it has to be true of:
//
//   THE PREPARED CHANGE REPLACES THE TRANSCRIPT READ, rather than being merged
//   with it. A Codex run has a Claude-shaped transcript path only by accident
//   of the same function taking both, and reading a rollout as JSONL is where
//   an empty half came from in the first place.
//
//   THE CLAUDE PATH IS UNTOUCHED. Every row on this machine is still a Claude
//   Code row, so a caller that passes no prepared change must get exactly the
//   artifact it got before, including the case that writes nothing at all.
//
//   AND THE TWO HALVES STILL MERGE. The disk half is what covers a run that
//   changed a file with `sed`, which for Codex is not the corner case but the
//   ordinary one -- it reads and edits by running shell commands.
//
// The last block is about one number rather than the artifact. `SAYING_CAP`
// was written twice on purpose (main/codex.mjs:111 said so) while the reader
// slice was not allowed to edit the supervisor. CLAUDE.md is right that two
// copies of a rule become two different rules within a week, and the visible
// cost of these two drifting apart is a live sentence that one engine drops at
// 20,000 characters and the other keeps, sitting under its own traced copy on
// her screen forever. There is now one.

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const spawns = vi.hoisted(() => []);
const appServers = vi.hoisted(() => []);
vi.mock('node:child_process', async (importActual) => {
  const actual = await importActual();
  const { EventEmitter: Emitter } = await import('node:events');

  const scriptedAppServer = () => {
    const child = new Emitter();
    child.stdout = new Emitter();
    child.stderr = new Emitter();
    const sent = [];
    const stdin = new Emitter();
    const say = (msg) => child.stdout.emit('data', Buffer.from(`${JSON.stringify(msg)}\n`));
    const server = {
      child,
      sent,
      say,
      mcpServers: {},
      threadId: 'T-CODEX',
      turnId: 'TURN-CODEX',
      paramsOf: (method) => sent.find((m) => m.method === method)?.params,
    };
    stdin.write = (chunk, cb) => {
      for (const line of String(chunk).split('\n')) {
        if (!line.trim()) continue;
        const msg = JSON.parse(line);
        sent.push(msg);
        if (msg.method === 'initialize') say({ jsonrpc: '2.0', id: msg.id, result: { userAgent: 'agentbox/test' } });
        if (msg.method === 'config/read') say({ jsonrpc: '2.0', id: msg.id, result: { config: { mcp_servers: server.mcpServers } } });
        if (msg.method === 'thread/start') {
          say({ jsonrpc: '2.0', id: msg.id, result: { thread: { id: server.threadId } } });
          say({ jsonrpc: '2.0', method: 'thread/started', params: { thread: { id: server.threadId } } });
        }
        if (msg.method === 'turn/start') say({ jsonrpc: '2.0', id: msg.id, result: { turn: { id: server.turnId, status: 'inProgress' } } });
        if (msg.method === 'turn/interrupt') say({ jsonrpc: '2.0', id: msg.id, result: {} });
      }
      cb?.(null);
      return true;
    };
    stdin.end = () => {};
    child.stdin = stdin;
    child.kill = () => true;
    return server;
  };

  return {
    ...actual,
    spawn: (bin, args, options) => {
      spawns.push({ bin, args, options });
      if (Array.isArray(args) && args[0] === 'app-server') {
        const server = scriptedAppServer();
        appServers.push(server);
        return server.child;
      }
      return { stdout: { on() {} }, stderr: { on() {} }, on() {}, once() {} };
    },
  };
});

import { Supervisor, readersFor } from '../main/supervisor.mjs';
import { writeChangeForRun, readChange, changePath } from '../main/code-change.mjs';
import { changeFromCodexTurn, SAYING_CAP } from '../main/codex.mjs';
import { machineryPath } from '../main/store/home.mjs';
import { foldWorkItems } from '../shared/work-items.mjs';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dirs = [];
const tempDir = (prefix) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  dirs.push(dir);
  return dir;
};
const settle = async () => {
  for (let i = 0; i < 8; i += 1) await new Promise((resolve) => { setImmediate(resolve); });
};

beforeEach(() => { spawns.length = 0; appServers.length = 0; });
afterAll(() => {
  for (const dir of dirs) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

/* ==================== the writer takes a prepared change ================== */

describe('the change writer, handed a change somebody else read', () => {
  // One real Claude transcript line, so the test proves the prepared change was
  // USED rather than that there was nothing else to read.
  const claudeTranscript = (dir) => {
    const file = path.join(dir, 'claude.jsonl');
    fs.writeFileSync(file, `${JSON.stringify({
      type: 'assistant',
      timestamp: new Date().toISOString(),
      message: { content: [{ type: 'tool_use', name: 'Write', input: { file_path: path.join(dir, 'from-the-transcript.txt'), content: 'x\n' } }] },
    })}\n`);
    return file;
  };

  it('writes that change instead of reading the transcript', () => {
    const docs = tempDir('codex-change-docs-');
    const work = tempDir('codex-change-work-');
    const prepared = changeFromCodexTurn([
      {
        method: 'item/completed',
        params: {
          completedAtMs: 1_700_000_000_000,
          item: {
            type: 'fileChange',
            changes: [{ path: path.join(work, 'math.js'), kind: { type: 'update' }, diff: '@@ -1 +1 @@\n-a + b\n+a - b\n' }],
          },
        },
      },
    ], { roots: [work] });

    const out = writeChangeForRun({
      transcript: claudeTranscript(work),
      docsDir: docs,
      itemId: 'w-1',
      roots: [work],
      change: prepared,
    });

    const change = readChange(out);
    expect(change.files.map((f) => f.path)).toEqual(['math.js']);
    expect(change.plus).toBe(1);
    expect(change.minus).toBe(1);
  });

  // THE CASE THAT MUST NOT MATCH: no prepared change, and the transcript is
  // read exactly as it always was. Every row on this machine is still this one.
  it('reads the transcript exactly as before when no change is handed to it', () => {
    const docs = tempDir('claude-change-docs-');
    const work = tempDir('claude-change-work-');
    const out = writeChangeForRun({
      transcript: claudeTranscript(work),
      docsDir: docs,
      itemId: 'w-1',
      roots: [work],
    });

    expect(readChange(out).files.map((f) => f.path)).toEqual(['from-the-transcript.txt']);
  });

  // A run that answered a question or drew a page has no code to show, and an
  // empty artifact on her card is worse than none.
  it('writes nothing at all when the prepared change is empty', () => {
    const docs = tempDir('codex-empty-docs-');
    expect(writeChangeForRun({
      transcript: '/nonexistent/rollout.jsonl',
      docsDir: docs,
      itemId: 'w-1',
      roots: [],
      change: changeFromCodexTurn([], { roots: [] }),
    })).toBeNull();
  });
});

/* ===================== both halves, through a real run =================== */

describe('what a finished codex run leaves on her card', () => {
  const codexRow = () => {
    const item = foldWorkItems([
      JSON.parse(JSON.stringify({
        id: 'w-250cd74811',
        ts: 1,
        source: 'founder',
        patch: { title: 'change the code', status: 'open', engine: 'codex' },
      })),
    ]).get('w-250cd74811');
    return { ...item, product: 'agentbox' };
  };

  const build = ({ repoPath = null } = {}) => {
    const dir = tempDir('codex-artifact-');
    const product = { slug: 'agentbox', dir, repoPath };
    const sup = new Supervisor(
      {
        home: '/nonexistent-home-with-no-second-account',
        storeRoot: dir,
        claudeBin: '/nonexistent/claude',
        codexBin: '/nonexistent/codex',
        // THE MOMENT SHE OPENED THE GATE. The `_engineFor` override below says
        // which engine a row runs on; this says the second engine may be run at
        // all, which is the fact `_capacityFor` asks (via `engineChoices`) before
        // it gives Codex a single slot. Opening one and not the other describes a
        // Mac that cannot exist: in the app both come off this same value.
        engineChoice: '2026-09-04T00:00:00Z',
        maxConcurrentSessions: 4,
        authProfiles: ['default'],
      },
      {
        listItems: () => [],
        listProducts: () => [product],
        isDue: () => true,
        settleAnswer() {},
        recordSessionResult() {},
      },
      '/nonexistent-app',
    );
    sup._engineFor = () => 'codex';
    sup.dir = dir;
    return sup;
  };

  const wrote = (sup, id = 'w-250cd74811') => machineryPath(sup.dir, changePath(id));

  it('carries the files the turn changed, read off the turn and not off a rollout', async () => {
    const sup = build();
    sup.spawnWorker(codexRow());
    await settle();
    const server = appServers[0];

    server.say({
      jsonrpc: '2.0',
      method: 'item/completed',
      params: {
        threadId: 'T-CODEX',
        completedAtMs: Date.now(),
        item: { type: 'agentMessage', id: 'm1', text: 'Patching math.js to subtract.', phase: 'commentary' },
      },
    });
    server.say({
      jsonrpc: '2.0',
      method: 'item/completed',
      params: {
        threadId: 'T-CODEX',
        completedAtMs: Date.now(),
        item: {
          type: 'fileChange',
          id: 'f1',
          changes: [
            { path: path.join(sup.dir, 'math.js'), kind: { type: 'update' }, diff: '@@ -1 +1 @@\n-a + b\n+a - b\n' },
            { path: path.join(sup.dir, 'notes.txt'), kind: { type: 'add' }, diff: 'hello\n' },
          ],
        },
      },
    });
    server.say({
      jsonrpc: '2.0',
      method: 'turn/completed',
      params: { threadId: 'T-CODEX', turn: { id: 'TURN-CODEX', status: 'completed', durationMs: 1000, items: [] } },
    });
    await settle();

    const change = readChange(wrote(sup));
    expect(change.files.map((f) => f.path).sort()).toEqual(['math.js', 'notes.txt']);
    // The agent's own sentence beside the hunk, which is the half the disk
    // reading can never have.
    expect(change.files.find((f) => f.path === 'math.js').hunks[0].said).toBe('Patching math.js to subtract.');
  });

  // The disk half is what covers a run that changed a file with `sed`, and
  // Codex reads and edits by running shell commands, so this is not the corner
  // case here. It has always worked for Codex; what must not happen is the
  // prepared half pushing it off the card.
  it('still carries what moved on the disk, beside what the turn reported', async () => {
    // A REAL CHECKOUT, photographed by the real `snapshotRepo` at the spawn and
    // read back by the real `changeFromRepo` at the exit. The disk half is what
    // covers a run that edited with `sed`, and a fixture standing in for git
    // would prove nothing about whether the prepared half displaced it.
    const repo = tempDir('codex-repo-');
    fs.writeFileSync(path.join(repo, 'touched-by-sed.txt'), 'before\n');
    execFileSync('git', ['init', '-q'], { cwd: repo });
    execFileSync('git', ['add', '.'], { cwd: repo });
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'first'], { cwd: repo });

    const sup = build({ repoPath: repo });
    sup.spawnWorker(codexRow());
    // The row's folder is made off the main thread first, so the session
    // starts once it exists rather than inside this call.
    for (let i = 0; i < 500 && !sup.sessions.has(codexRow().id); i += 1) {
      await new Promise((resolve) => { setTimeout(resolve, 20); });
    }
    await settle();
    // IN THE FOLDER THE RUN IS ACTUALLY STANDING IN, which since is the row's
    // own rather than the product's checkout. Writing into the shared
    // checkout here would be another agent's edit, and the whole point of the
    // folders is that those no longer land on her card.
    const ran = sup.sessions.get(codexRow().id).cwd;
    fs.writeFileSync(path.join(ran, 'touched-by-sed.txt'), 'after\n');

    appServers[0].say({
      jsonrpc: '2.0',
      method: 'item/completed',
      params: {
        threadId: 'T-CODEX',
        completedAtMs: Date.now(),
        item: {
          type: 'fileChange',
          id: 'f1',
          changes: [{ path: path.join(ran, 'math.js'), kind: { type: 'update' }, diff: '@@ -1 +1 @@\n-a + b\n+a - b\n' }],
        },
      },
    });
    appServers[0].say({
      jsonrpc: '2.0',
      method: 'turn/completed',
      params: { threadId: 'T-CODEX', turn: { id: 'TURN-CODEX', status: 'completed', durationMs: 1000, items: [] } },
    });
    await settle();

    const change = readChange(wrote(sup));
    expect(change.files.map((f) => f.path).sort()).toEqual(['math.js', 'touched-by-sed.txt']);
  });

  it('leaves no artifact at all for a run that changed nothing', async () => {
    const sup = build();
    sup.spawnWorker(codexRow());
    await settle();
    appServers[0].say({
      jsonrpc: '2.0',
      method: 'turn/completed',
      params: { threadId: 'T-CODEX', turn: { id: 'TURN-CODEX', status: 'completed', durationMs: 1000, items: [] } },
    });
    await settle();

    expect(fs.existsSync(wrote(sup))).toBe(false);
  });
});

/* ========================= one cap, not two ============================== */

describe('the cap on the sentence an agent is typing', () => {
  const claude = readersFor('claude').stream;
  const codex = readersFor('codex').stream;
  const delta = (text) => ({ threadId: 'T', delta: text });
  const partial = (text) => JSON.stringify({
    type: 'stream_event',
    event: { type: 'content_block_delta', delta: { type: 'text_delta', text } },
  });

  // The boundary either side of it, on both engines, off the ONE constant. If
  // the supervisor keeps a second copy and somebody edits one of them, one of
  // these four goes red naming the file it has to move with.
  it('drops the block at the same length on both engines', () => {
    const a = {};
    codex(a, 'item/agentMessage/delta', delta('x'.repeat(SAYING_CAP)));
    expect(a.saying).toHaveLength(SAYING_CAP);
    codex(a, 'item/agentMessage/delta', delta('x'));
    expect(a.saying).toBe('');

    const b = {};
    claude(b, partial('x'.repeat(SAYING_CAP)));
    expect(b.saying).toHaveLength(SAYING_CAP);
    claude(b, partial('x'));
    expect(b.saying).toBe('');
  });

  // The test above agrees with itself while the two copies happen to hold the
  // same number, which is exactly how a duplicated constant survives. This is
  // the one that goes red the moment a second one is declared.
  it('is declared in one file and read from there by the other', () => {
    const supervisor = fs.readFileSync(path.join(repoRoot, 'main', 'supervisor.mjs'), 'utf8');
    expect(supervisor).not.toMatch(/(const|let|var)\s+SAYING_CAP\s*=/);
    expect(supervisor).toMatch(/SAYING_CAP/);
    expect(fs.readFileSync(path.join(repoRoot, 'main', 'codex.mjs'), 'utf8')).toMatch(/export const SAYING_CAP\s*=/);
  });
});
