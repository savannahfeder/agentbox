// WHAT BROKE. With no permission config OpenCode runs a shell command and
// writes a file without a word (measured on 1.18.35, 2026-10-07, and again on
// 2.3.2 over ACP, 2026-11-22: the command the check refused ran, because
// nothing was ever asked). And the connection that carried its approvals was
// built on OpenCode's HTTP server and was never joined to the inbox's cards:
// every request was refused with no card, and then the server's addresses
// moved in 2.x and nothing ran at all.
//
// Over ACP the request arrives in this process and is put to the person as one
// of the app's own cards. These tests run the OpenCode harness against the
// stand-in agent (tests/fixtures/fake-acp-agent.mjs) and pin that round trip.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { harnessFor } from '../main/harnesses.mts';
import { oneHunk } from '../main/harnesses/acp.mts';
import { captureAcpEvent } from '../main/acp-readers.mts';
import type { AcpSession } from '../main/acp-readers.mts';
import type { AcpWorker } from '../main/acp-worker.mts';

const FAKE = path.join(import.meta.dirname, 'fixtures', 'fake-acp-agent.mjs');

let dir = '';
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-cards-'));
  for (const sub of ['repo', 'user', 'store']) fs.mkdirSync(path.join(dir, sub));
  // The harness starts whatever its binary is; this one is the stand-in.
  fs.writeFileSync(path.join(dir, 'opencode'), `#!/bin/sh\nexec "${process.execPath}" "${FAKE}" "$@"\n`, { mode: 0o755 });
});
// The stand-in agent writes its log here until it has gone, which can be a moment after the worker's exit.
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }); });

/** One turn of a thread on OpenCode, with a supervisor that records the cards it is asked to raise. */
function turn(prompt: string, { allow = true, resumeId = null as string | null, system = 'Keep answers short.', answerMode = null as string | null } = {}) {
  const asked: unknown[] = [];
  let opened = 0;
  let closed = 0;
  const sup = {
    config: { storeRoot: path.join(dir, 'store'), opencodeBin: path.join(dir, 'opencode') },
    userDir: path.join(dir, 'user'),
    _codexStoreServer: () => ({ name: 'agentbox', command: '/bin/store', args: ['--stdio'], env: { ZERO_ITEM: 'w-1', STORE_ACCOUNT_ID: 'me', GONE: null } }),
    approvalCardsFor: () => {
      opened += 1;
      return {
        command: async (command: string, cwd: string | null) => { asked.push({ command, cwd }); return allow; },
        edit: async (files: unknown) => { asked.push({ files }); return allow; },
        close: () => { closed += 1; },
      };
    },
  };
  const session: AcpSession = {};
  const worker = harnessFor('opencode').spawn(sup as never, { args: ['--mcp-config', '/ignored'], prompt, system, resumeId, answerMode, model: null }, {
    cwd: path.join(dir, 'repo'), item: { id: 'w-1', product: 'sandbox' }, profile: 'default',
    env: { PATH: process.env.PATH, HOME: dir, FAKE_ACP_LOG: path.join(dir, 'log.jsonl'), FAKE_ACP_STATE: path.join(dir, 'state.json') },
  }) as AcpWorker;
  worker.on('event', (method: string, params: unknown) => captureAcpEvent(session, method, params as never));
  const exit = new Promise<number | null>((resolve) => worker.once('exit', (code) => resolve(code)));
  return { sup, session, exit, asked, cards: () => ({ opened, closed }) };
}
const logged = () => fs.readFileSync(path.join(dir, 'log.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));

describe('OpenCode asks before it runs a command', () => {
  it('puts the command to the person as one card, and runs it once allowed', async () => {
    const file = path.join(dir, 'repo', 'made.txt');
    const run = turn(`FAKE:RUN echo ok > ${file}`);
    expect(await run.exit).toBe(0);
    expect(run.asked).toEqual([{ command: `echo ok > ${file}`, cwd: path.join(dir, 'repo') }]);
    expect(fs.existsSync(file)).toBe(true);
    expect(run.session.result).toBe('done');
  });

  it('does not run a refused command', async () => {
    const file = path.join(dir, 'repo', 'made.txt');
    const run = turn(`FAKE:RUN echo ok > ${file}`, { allow: false });
    await run.exit;
    expect(run.asked).toHaveLength(1);
    expect(fs.existsSync(file)).toBe(false);
    expect(run.session.result).toMatch(/^It stopped when you refused: echo ok > /);
  });

  it('puts a change to a file as the lines that differ', async () => {
    const run = turn('FAKE:EDIT /repo/a.txt');
    await run.exit;
    expect(run.asked).toEqual([{ files: [{ path: '/repo/a.txt', kind: 'update', diff: '@@ -1,3 +1,3 @@\n one\n-two\n+2\n three' }] }]);
  });

  it('puts a new file as the file itself', async () => {
    const run = turn('FAKE:WRITE /elsewhere/new.txt', { allow: false });
    await run.exit;
    expect(run.asked).toEqual([{ files: [{ path: '/elsewhere/new.txt', kind: 'add', diff: 'new file\n' }] }]);
  });

  it('closes its cards when the run ends, and opens none when nothing was asked', async () => {
    const asking = turn(`FAKE:RUN echo ok > ${path.join(dir, 'repo', 'made.txt')}`);
    await asking.exit;
    expect(asking.cards()).toEqual({ opened: 1, closed: 1 });
    const quiet = turn('FAKE:SAY apple');
    await quiet.exit;
    expect(quiet.cards()).toEqual({ opened: 0, closed: 0 });
  });
});

describe('what a thread on OpenCode is started with', () => {
  const startedWith = () => logged().find((l) => l.started).started;
  const configOf = (started: { env: Record<string, string> }) => JSON.parse(started.env.OPENCODE_CONFIG_CONTENT);

  it('is `opencode acp`, its config in the environment, the thread it is on, and no key', async () => {
    await turn('FAKE:SAY apple').exit;
    const started = startedWith();
    expect(started.args).toEqual(['acp']);
    expect(Object.keys(started.env).sort()).toEqual(['OPENCODE_CONFIG_CONTENT', 'OPENCODE_CONFIG_PROJECT_DISABLE', 'OPENCODE_DISABLE_PROJECT_CONFIG', 'ZERO_ITEM', 'ZERO_PRODUCT']);
    expect(started.env).toMatchObject({ ZERO_ITEM: 'w-1', ZERO_PRODUCT: 'sandbox' });
    // Nothing is written into the project's own folder.
    expect(fs.readdirSync(path.join(dir, 'repo'))).toEqual([]);
  });

  it('sends the task as the prompt and the standing instructions as a file, not in the prompt', async () => {
    await turn('FAKE:SAY apple', { system: 'Standing rule: be brief.' }).exit;
    const sent = logged().find((l) => l.method === 'session/prompt');
    expect(sent.params.prompt).toEqual([{ type: 'text', text: 'FAKE:SAY apple' }]);
    const thread = path.join(dir, 'user', 'harnesses', 'opencode', 'threads', 'w-1');
    expect(fs.readFileSync(path.join(thread, 'instructions.md'), 'utf8')).toBe('Standing rule: be brief.\n');
    expect(configOf(startedWith()).instructions).toEqual([path.join(thread, 'instructions.md')]);
  });

  // 2026-11-22, on OpenCode 2.3.2, each case measured with a command the check
  // would refuse. Agentbox's policy went in as a file `OPENCODE_CONFIG` named,
  // and a project's own `opencode.json` saying `bash: allow` is loaded after
  // that file: the command ran and nothing was asked. Passed inline instead,
  // the top-level policy held against that file but not against a rule set for
  // one agent (`agent.build.permission`), in the project or in the person's
  // global config. What held in every case: the project's config switched
  // off, and the policy inline at the top level and for both built-in agents.
  it('is told not to read the project\'s own config, which could switch the asking off', async () => {
    await turn('FAKE:SAY apple').exit;
    expect(startedWith().env).toMatchObject({ OPENCODE_DISABLE_PROJECT_CONFIG: '1', OPENCODE_CONFIG_PROJECT_DISABLE: '1' });
    expect(startedWith().env.OPENCODE_CONFIG).toBeUndefined();
  });

  it('carries the policy inline, at the top level and for each built-in agent, so no rule for one agent outranks it', async () => {
    await turn('FAKE:SAY apple', { answerMode: 'default' }).exit;
    const config = configOf(startedWith());
    expect(config.permission).toMatchObject({ bash: 'ask', edit: 'ask', external_directory: 'ask' });
    expect(config.agent.build.permission).toEqual(config.permission);
    expect(config.agent.plan.permission).toEqual(config.permission);
  });

  it('carries the same policy at every level in a mode that asks for nothing', async () => {
    await turn('FAKE:SAY apple', { answerMode: 'bypassPermissions' }).exit;
    const config = configOf(startedWith());
    expect(config.permission).toMatchObject({ bash: 'allow', edit: 'allow' });
    expect(config.agent.build.permission).toEqual(config.permission);
    expect(startedWith().env.OPENCODE_DISABLE_PROJECT_CONFIG).toBe('1');
  });

  it('hands it the store\'s tools, without the variables that have no value', async () => {
    await turn('FAKE:SAY apple').exit;
    expect(logged().find((l) => l.method === 'session/new').params.mcpServers).toEqual([
      { name: 'agentbox', command: '/bin/store', args: ['--stdio'], env: [{ name: 'ZERO_ITEM', value: 'w-1' }, { name: 'STORE_ACCOUNT_ID', value: 'me' }] },
    ]);
  });

  it('carries the policy for the mode this run was given, and writes no config file', async () => {
    await turn('FAKE:SAY apple', { answerMode: 'default' }).exit;
    expect(configOf(startedWith()).permission).toMatchObject({ bash: 'ask', edit: 'ask' });
    expect(fs.readdirSync(path.join(dir, 'user', 'harnesses', 'opencode', 'threads', 'w-1'))).toEqual(['instructions.md']);
  });
});

describe('a conversation the app can carry on', () => {
  it('has a record on disk once it has run, which is what a reply looks for', async () => {
    const first = turn('FAKE:SAY apple');
    await first.exit;
    const harness = harnessFor('opencode');
    const record = harness.transcript(first.sup as never, { sessionId: first.session.sessionId });
    expect(record).toBe(path.join(dir, 'user', 'harnesses', 'opencode', 'conversations', 'ses_fake_1.jsonl'));
    expect(harness.transcript(first.sup as never, { sessionId: 'ses_never_ran' })).toBeNull();
    expect(harness.transcript(first.sup as never, null)).toBeNull();
  });

  it('carries on in a new process when the reply names it', async () => {
    const first = turn('FAKE:SAY apple');
    await first.exit;
    const reply = turn('FAKE:RECALL', { resumeId: first.session.sessionId! });
    expect(await reply.exit).toBe(0);
    expect(reply.session.result).toBe('apple');
  });
});

describe('the one hunk a file-change card draws', () => {
  it('is the lines that differ with three either side', () => {
    const before = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'].join('\n');
    const after = ['a', 'b', 'c', 'd', 'E', 'f', 'g', 'h', 'i'].join('\n');
    expect(oneHunk(before, after)).toBe(['@@ -2,7 +2,7 @@', ' b', ' c', ' d', '-e', '+E', ' f', ' g', ' h'].join('\n'));
  });

  it('counts added and removed lines in its header', () => {
    expect(oneHunk('a\nb\n', 'a\nx\ny\nb\n')).toBe(['@@ -1,2 +1,4 @@', ' a', '+x', '+y', ' b'].join('\n'));
    expect(oneHunk('a\nx\ny\nb\n', 'a\nb\n')).toBe(['@@ -1,4 +1,2 @@', ' a', '-x', '-y', ' b'].join('\n'));
  });

  it('does not treat a trailing newline as a line', () => {
    expect(oneHunk('a\n', 'b\n')).toBe(['@@ -1,1 +1,1 @@', '-a', '+b'].join('\n'));
  });
});
