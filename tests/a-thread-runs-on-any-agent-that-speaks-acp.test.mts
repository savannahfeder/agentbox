// Every harness after Claude Code and Codex was going to be its own
// hand-written connection, and the first one rotted in six weeks: the OpenCode
// connection built on its HTTP server (1.18.35, 2026-10-07) answered 405 on its
// first call to OpenCode 2.3.2 with its 37 tests green. The same 2.3.2 driven
// over ACP answered, asked before a command, held a refusal, stopped and
// carried a conversation on after it was killed (measured 2026-11-22).
//
// So one worker runs a thread on any agent that speaks ACP. The stand-in here
// (tests/fixtures/fake-acp-agent.mjs) sends the shapes read off that OpenCode.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createAcpWorker, approvalOf, endAgentsWithTheApp } from '../main/acp-worker.mts';
import type { AcpApproval } from '../main/acp-worker.mts';
import { captureAcpEvent, acpStreamingText, summarizeAcpEvent, traceAcpEvent, acpTookTheWords, ACP_SESSION, ACP_MESSAGE, ACP_TOOL, ACP_TURN } from '../main/acp-readers.mts';
import type { AcpSession } from '../main/acp-readers.mts';
import { acpActivity } from '../main/agent-activity.mts';

const FAKE = path.join(import.meta.dirname, 'fixtures', 'fake-acp-agent.mjs');

let dir = '';
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acp-worker-')); });
// The stand-in agent writes its log here until it has gone, which can be a moment after the worker's exit.
afterEach(() => { endAgentsWithTheApp(); fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }); });

interface Opts { env?: Record<string, string>; resume?: string | null; model?: string | null; ask?: ((approval: AcpApproval) => Promise<boolean>) | null }

/** One turn on the stand-in, read the way the supervisor reads it. */
function turn(prompt: string, { env = {}, resume = null, model = null, ask = null }: Opts = {}) {
  const events: [string, Record<string, unknown>][] = [];
  const stderr: string[] = [];
  const session: AcpSession = {};
  let spawnedBefore: number | null = null;
  let agent: ReturnType<typeof spawn> | null = null;
  const worker = createAcpWorker({
    start: () => (agent = spawn(process.execPath, [FAKE], { env: { ...process.env, FAKE_ACP_LOG: path.join(dir, 'log.jsonl'), FAKE_ACP_STATE: path.join(dir, 'state.json'), ...env }, stdio: ['pipe', 'pipe', 'pipe'] })),
    label: 'Fake', cwd: dir, prompt, resumeSessionId: resume, model, ask,
    mcpServers: [{ name: 'store', command: '/bin/store', args: ['--stdio'], env: [{ name: 'ZERO_ITEM', value: 'w-1' }] }],
    recordFile: (id) => path.join(dir, 'conversations', `${id}.jsonl`),
    signIn: 'fake auth login',
  });
  worker.once('spawn', () => { spawnedBefore = events.length; });
  worker.on('event', (method: string, params: Record<string, unknown>) => { events.push([method, params]); captureAcpEvent(session, method, params); });
  worker.stderr.on('data', (line: unknown) => stderr.push(String(line)));
  const exit = new Promise<{ code: number | null; signal: string | null }>((resolve) => worker.once('exit', (code, signal) => resolve({ code, signal })));
  const ours = (method: string) => events.filter(([m]) => m === method).map(([, p]) => p);
  return { worker, events, stderr, session, exit, ours, spawned: () => spawnedBefore, child: () => agent };
}
const logged = () => fs.readFileSync(path.join(dir, 'log.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const until = async (ok: () => boolean) => { for (let i = 0; i < 400 && !ok(); i += 1) await new Promise((r) => setTimeout(r, 10)); expect(ok()).toBe(true); };

describe('a turn that answers', () => {
  it('ends 0 with the answer, the conversation id, and one event for the finished message', async () => {
    const run = turn('FAKE:SAY apple');
    expect(await run.exit).toEqual({ code: 0, signal: null });
    expect(run.session).toMatchObject({ sessionId: 'ses_fake_1', result: 'apple', resultIsError: false });
    expect(run.ours(ACP_MESSAGE)).toEqual([{ text: 'apple' }]);
    expect(run.ours(ACP_TURN)).toEqual([{ stopReason: 'end_turn', refused: null }]);
    expect(run.stderr).toEqual([]);
  });

  it('says it has started only once the conversation exists, and before any of its events', async () => {
    const run = turn('FAKE:SAY apple');
    await run.exit;
    expect(run.spawned()).toBe(0);
    expect(run.events[0]).toEqual([ACP_SESSION, { sessionId: 'ses_fake_1' }]);
  });

  it('hands the agent the folder and the tool servers it was given', async () => {
    await turn('FAKE:SAY apple').exit;
    const opened = logged().find((l) => l.method === 'session/new');
    expect(opened.params).toEqual({ cwd: dir, mcpServers: [{ name: 'store', command: '/bin/store', args: ['--stdio'], env: [{ name: 'ZERO_ITEM', value: 'w-1' }] }] });
  });

  it('keeps a record of the conversation, which is what lets the app carry it on', async () => {
    await turn('FAKE:SAY apple').exit;
    const lines = fs.readFileSync(path.join(dir, 'conversations', 'ses_fake_1.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    expect(lines.map((l) => l.event)).toEqual(['prompt', ACP_MESSAGE, ACP_TURN]);
    expect(lines[0].text).toBe('FAKE:SAY apple');
  });
});

describe('a command that needs a yes', () => {
  it('asks with the command and where it would run, and runs once allowed', async () => {
    const file = path.join(dir, 'made.txt');
    const asked: AcpApproval[] = [];
    const run = turn(`FAKE:RUN echo ok > ${file}`, { ask: async (approval) => { asked.push(approval); expect(fs.existsSync(file)).toBe(false); return true; } });
    expect(await run.exit).toEqual({ code: 0, signal: null });
    expect(asked).toEqual([{ kind: 'command', command: `echo ok > ${file}`, cwd: dir }]);
    expect(fs.existsSync(file)).toBe(true);
    expect(run.session.result).toBe('done');
  });

  it('answers with the agent\'s own "allow once", never its "always"', async () => {
    await turn(`FAKE:RUN echo ok > ${path.join(dir, 'made.txt')}`, { ask: async () => true }).exit;
    expect(logged().find((l) => l.answered)?.answered).toEqual({ outcome: 'selected', optionId: 'once' });
  });

  it('does not run when refused, and the thread says what was refused', async () => {
    const file = path.join(dir, 'made.txt');
    const run = turn(`FAKE:RUN echo ok > ${file}`, { ask: async () => false });
    expect(await run.exit).toEqual({ code: 0, signal: null });
    expect(fs.existsSync(file)).toBe(false);
    expect(logged().find((l) => l.answered)?.answered).toEqual({ outcome: 'selected', optionId: 'reject' });
    expect(run.session).toMatchObject({ result: `It stopped when you refused: echo ok > ${file}`, resultIsError: false });
  });

  it('refuses everything asked when nobody can be asked', async () => {
    const file = path.join(dir, 'made.txt');
    await turn(`FAKE:RUN echo ok > ${file}`).exit;
    expect(fs.existsSync(file)).toBe(false);
  });

  it('refuses when the asker throws', async () => {
    const file = path.join(dir, 'made.txt');
    await turn(`FAKE:RUN echo ok > ${file}`, { ask: async () => { throw Error('the card could not be drawn'); } }).exit;
    expect(fs.existsSync(file)).toBe(false);
  });

  it('joins a tool call\'s pieces into one started and one finished event', async () => {
    const file = path.join(dir, 'made.txt');
    const run = turn(`FAKE:RUN echo ok > ${file}`, { ask: async () => true });
    await run.exit;
    expect(run.ours(ACP_TOOL).map((t) => [t.kind, t.status, t.detail])).toEqual([
      ['execute', 'started', `echo ok > ${file}`],
      ['execute', 'completed', `echo ok > ${file}`],
    ]);
  });
});

describe('a file change that needs a yes', () => {
  it('asks with the change itself, and names the file it changed afterwards', async () => {
    const asked: AcpApproval[] = [];
    const run = turn('FAKE:EDIT /repo/a.txt', { ask: async (approval) => { asked.push(approval); return true; } });
    await run.exit;
    expect(asked).toEqual([{ kind: 'edit', changes: [{ path: '/repo/a.txt', oldText: 'one\ntwo\nthree\n', newText: 'one\n2\nthree\n' }] }]);
    expect(run.session.acpChange).toEqual(['/repo/a.txt']);
  });

  it('asks about a new file with its content, which arrives with no diff', async () => {
    const asked: AcpApproval[] = [];
    await turn('FAKE:WRITE /elsewhere/new.txt', { ask: async (approval) => { asked.push(approval); return false; } }).exit;
    expect(asked).toEqual([{ kind: 'edit', changes: [{ path: '/elsewhere/new.txt', oldText: null, newText: 'new file\n' }] }]);
  });

  it('reads a request with nothing to show as a tool by its title', () => {
    expect(approvalOf({ kind: 'fetch', title: 'fetch https://example.com' }, '/repo')).toEqual({ kind: 'tool', title: 'fetch https://example.com' });
  });
});

describe('a reply on the same conversation', () => {
  it('loads the conversation in a new process and does not pass its history off as this turn', async () => {
    await turn('FAKE:SAY apple').exit;
    const run = turn('FAKE:RECALL', { resume: 'ses_fake_1' });
    expect(await run.exit).toEqual({ code: 0, signal: null });
    expect(logged().some((l) => l.method === 'session/load' && l.params.sessionId === 'ses_fake_1')).toBe(true);
    expect(run.ours(ACP_MESSAGE)).toEqual([{ text: 'apple' }]);
    expect(run.session).toMatchObject({ sessionId: 'ses_fake_1', result: 'apple' });
  });

  it('says so and starts nothing when the agent cannot carry a conversation on', async () => {
    await turn('FAKE:SAY apple').exit;
    const run = turn('FAKE:RECALL', { resume: 'ses_fake_1', env: { FAKE_ACP_NO_LOAD: '1' } });
    expect(await run.exit).toEqual({ code: 1, signal: null });
    expect(run.stderr.join('\n')).toMatch(/Fake cannot carry on an earlier conversation/);
    expect(run.spawned()).toBeNull();
    expect(run.session.result).toBeUndefined();
  });
});

describe('a start that cannot happen says why, and leaves no result', () => {
  it('names the sign-in command when the agent is signed out', async () => {
    const run = turn('FAKE:SAY apple', { env: { FAKE_ACP_SIGNED_OUT: '1' } });
    expect(await run.exit).toEqual({ code: 1, signal: null });
    expect(run.stderr[0]).toBe('Fake is not signed in on this computer. Sign in by running: fake auth login');
    expect(run.session.result).toBeUndefined();
    expect(run.spawned()).toBeNull();
  });

  it('refuses an agent that answers with another version of the protocol', async () => {
    const run = turn('FAKE:SAY apple', { env: { FAKE_ACP_VERSION: '2' } });
    expect(await run.exit).toEqual({ code: 1, signal: null });
    expect(run.stderr[0]).toMatch(/version 2 of the agent protocol, and this app speaks version 1/);
  });

  it('refuses a model the agent does not offer, and sets one it does', async () => {
    const wrong = turn('FAKE:SAY apple', { model: 'fake/huge' });
    expect(await wrong.exit).toEqual({ code: 1, signal: null });
    expect(wrong.stderr[0]).toMatch(/Fake does not offer the model fake\/huge/);
    fs.rmSync(path.join(dir, 'log.jsonl'));
    expect(await turn('FAKE:SAY apple', { model: 'fake/large' }).exit).toEqual({ code: 0, signal: null });
    expect(logged().find((l) => l.method === 'session/set_config_option')?.params).toMatchObject({ configId: 'model', value: 'fake/large' });
  });
});

describe('a tool call the agent describes off the spec', () => {
  it('is read for what it does say, and the turn still ends with its answer', async () => {
    const run = turn('FAKE:ODD');
    expect(await run.exit).toEqual({ code: 0, signal: null });
    expect(run.session).toMatchObject({ result: 'done', resultIsError: false });
    expect(run.ours(ACP_TOOL).at(-1)).toMatchObject({ kind: 'edit', status: 'completed', paths: [] });
  });
});

describe('a turn that does not end on its own', () => {
  it('is cancelled and ends as a stopped process when the worker is killed', async () => {
    const run = turn('FAKE:HANG');
    await until(() => run.ours(ACP_TOOL).length > 0);
    expect(run.worker.kill()).toBe(true);
    expect(await run.exit).toEqual({ code: 143, signal: 'SIGTERM' });
    expect(logged().some((l) => l.method === 'session/cancel')).toBe(true);
    expect(run.worker.kill()).toBe(false);
  });

  // Found by a second read of the code on 2026-11-22: a stopped turn gets two
  // seconds to say it stopped before its agent is signalled, and the app
  // stops every worker and exits in one go when it quits. An agent in those
  // two seconds was never signalled, so it and its command lived on.
  it('ends an agent still inside its stop when the app itself is going', async () => {
    const run = turn('FAKE:HANG', { env: { FAKE_ACP_DEAF: '1' } });
    await until(() => run.ours(ACP_TOOL).length > 0);
    run.worker.kill();
    const signalled = () => run.child()?.killed === true;
    expect(signalled()).toBe(false);
    endAgentsWithTheApp();
    expect(signalled()).toBe(true);
    expect(await run.exit).toEqual({ code: 143, signal: 'SIGTERM' });
  });

  it('leaves a finished run\'s agent off the list of ones to end with the app', async () => {
    const run = turn('FAKE:SAY apple');
    await run.exit;
    const before = run.child()?.killed;
    endAgentsWithTheApp();
    expect(run.child()?.killed).toBe(before);
  });

  it('withdraws a question nobody answered when the worker is killed', async () => {
    let asked = false;
    const run = turn(`FAKE:RUN echo ok > ${path.join(dir, 'made.txt')}`, { ask: () => { asked = true; return new Promise(() => {}); } });
    await until(() => asked);
    run.worker.kill();
    expect(await run.exit).toEqual({ code: 143, signal: 'SIGTERM' });
    expect(logged().find((l) => l.answered)?.answered).toEqual({ outcome: 'cancelled' });
    expect(fs.existsSync(path.join(dir, 'made.txt'))).toBe(false);
  });

  it('fails with the reason when the agent dies in the middle', async () => {
    const run = turn('FAKE:DIE');
    expect(await run.exit).toEqual({ code: 1, signal: null });
    expect(run.stderr[0]).toMatch(/^Fake stopped: /);
  });

  it('keeps nothing as an answer when the model ran out of room, and says to reply', async () => {
    const run = turn('FAKE:TOKENS');
    await run.exit;
    expect(run.session.resultIsError).toBe(true);
    expect(run.session.result).toMatch(/stopped part way.*Reply to carry on/);
  });
});

describe('the readers, on the events a run sends', () => {
  const chunk = (text: string, messageId = 'm1') => ['session/update', { update: { sessionUpdate: 'agent_message_chunk', messageId, content: { type: 'text', text } } }] as const;

  it('takes the last message as the answer, not the one before a tool call', () => {
    const session: AcpSession = {};
    captureAcpEvent(session, ...chunk('I will run it', 'm1'));
    captureAcpEvent(session, ...chunk('do', 'm2'));
    captureAcpEvent(session, ...chunk('ne', 'm2'));
    expect(session.result).toBe('done');
  });

  it('never takes the model thinking for an answer or for words on the row', () => {
    const session: AcpSession = {};
    const thought = ['session/update', { update: { sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'hmm' } } }] as const;
    captureAcpEvent(session, ...thought);
    expect(acpStreamingText(session, ...thought)).toBe(false);
    expect(session.result).toBeUndefined();
    expect(session.saying).toBeUndefined();
  });

  it('streams prose as it is typed, and a tool starting clears it', () => {
    const session: AcpSession = {};
    expect(acpStreamingText(session, ...chunk('Hel'))).toBe(true);
    expect(acpStreamingText(session, ...chunk('lo'))).toBe(true);
    expect(session.saying).toBe('Hello');
    expect(acpStreamingText(session, 'session/update', { update: { sessionUpdate: 'tool_call' } })).toBe(true);
    expect(session.saying).toBe('');
  });

  it('counts the agent as having taken the words once it thinks, speaks or calls a tool', () => {
    for (const kind of ['agent_thought_chunk', 'agent_message_chunk', 'tool_call']) expect(acpTookTheWords('session/update', { update: { sessionUpdate: kind } }), kind).toBe(true);
    for (const kind of ['available_commands_update', 'usage_update']) expect(acpTookTheWords('session/update', { update: { sessionUpdate: kind } }), kind).toBe(false);
    expect(acpTookTheWords(ACP_SESSION, { sessionId: 's' })).toBe(false);
  });

  it('keeps the context used and the cost, which is all the usage ACP carries', () => {
    const session: AcpSession = {};
    captureAcpEvent(session, 'session/update', { update: { sessionUpdate: 'usage_update', used: 4937, size: 200000, cost: { amount: 0, currency: 'USD' } } });
    expect(session.acpUsage).toEqual({ used: 4937, size: 200000, cost: 0, currency: 'USD' });
  });

  it('writes one line for a finished message and one for a finished tool call', () => {
    expect(summarizeAcpEvent(ACP_MESSAGE, { text: 'All done.' })).toBe('All done.');
    expect(summarizeAcpEvent(ACP_TOOL, { id: 't', kind: 'execute', detail: 'npm test', status: 'completed', paths: [] })).toBe('tool: Bash');
    expect(summarizeAcpEvent(...chunk('All'))).toBeNull();
    expect(traceAcpEvent(ACP_TOOL, { id: 't', kind: 'execute', detail: 'npm test', status: 'completed', paths: [] })).toMatch(/ {2}\[Bash\] npm test$/);
    expect(traceAcpEvent(ACP_TOOL, { id: 't', kind: 'edit', detail: '/repo/a.txt', status: 'failed', paths: [] })).toMatch(/\[Edit\] \(refused or failed\) \/repo\/a\.txt$/);
    expect(traceAcpEvent(ACP_TOOL, { id: 't', kind: 'execute', detail: 'npm test', status: 'started', paths: [] })).toBeNull();
  });

  it('shows what a run is doing while a tool call is open, and nothing once the turn ends', () => {
    const session = {};
    expect(acpActivity(session, ACP_TOOL, { id: 't1', kind: 'execute', detail: 'npm test', status: 'started' })).toBe(true);
    expect(acpActivity(session, ACP_TOOL, { id: 't2', kind: 'edit', detail: '/repo/a.txt', status: 'started' })).toBe(true);
    expect([...(session as { activeTools: Map<string, { label: string }> }).activeTools.values()].map((t) => t.label)).toEqual([expect.stringMatching(/test/i), expect.stringMatching(/^Editing /)]);
    expect(acpActivity(session, ACP_TOOL, { id: 't1', kind: 'execute', detail: 'npm test', status: 'completed' })).toBe(true);
    expect(acpActivity(session, ACP_TURN, {})).toBe(true);
    expect((session as { activeTools: Map<string, unknown> }).activeTools.size).toBe(0);
  });
});
