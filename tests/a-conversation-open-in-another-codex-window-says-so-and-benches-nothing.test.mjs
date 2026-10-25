// A CONVERSATION OPEN IN ANOTHER CODEX WINDOW SAYS SO, AND BENCHES NOTHING.
//
// What broke (reported in PR #31, from use). Codex lets one process write to a
// conversation at a time. While the Codex app or a terminal has it open, our
// resume is refused, the run dies in milliseconds, and the cause was
// 'unknown'. So a reply spent its three tries at once and the row said "Codex
// stopped before it did anything ... Check that your ChatGPT plan is active",
// which sends her to the wrong place. Every one of those deaths was also a
// strike on the Codex login, and the third benched every Codex task on it for
// thirty minutes over one open window.
//
// Measured 2026-10-20 with two real `codex app-server` 0.163.0 processes on
// one CODEX_HOME: the first resumed a thread, and the second's resume was
// refused with code -32600, "thread <id> already has an active writer". The
// lock lives in $CODEX_HOME/thread-writer-locks/<id>.lock.
import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { createCodexAppServer } from '../main/codex-app-server.mjs';
import { createCodexWorker } from '../main/codex-session.mjs';
import { Supervisor } from '../main/supervisor.mjs';
import {
  troubleCause, deadRunSentence, deadRunCause, runStoppedLine, needsHerHands, causeBreakdown,
} from '../shared/spawn-trouble.mjs';

const THREAD = '01a15af8-44ed-7571-854c-318a72162204';
const REFUSAL = { code: -32600, message: `thread ${THREAD} already has an active writer` };
const SAID = `codex app-server refused thread/resume: thread ${THREAD} already has an active writer`;

function fakeCodex() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  const sent = [];
  const stdin = new EventEmitter();
  stdin.write = (chunk, cb) => {
    for (const line of String(chunk).split('\n')) if (line.trim()) sent.push(JSON.parse(line));
    cb?.(null);
    return true;
  };
  stdin.end = vi.fn();
  child.stdin = stdin;
  child.kill = vi.fn(() => true);
  return { child, sent, say: (msg) => child.stdout.emit('data', Buffer.from(`${JSON.stringify(msg)}\n`)) };
}

const settle = async () => { for (let i = 0; i < 6; i += 1) await new Promise((r) => { setImmediate(r); }); };

function bare() {
  const s = Object.create(Supervisor.prototype);
  s.config = { authProfiles: ['default'], codexHome: '/nowhere/.codex', maxConcurrentSessions: 3 };
  s._profileCooldown = {};
  s._profileStrikes = {};
  s._profileTrouble = {};
  s._saveState = () => {};
  return s;
}

const deadOnTheLock = () => ({
  engine: 'codex', profile: 'default', startedAt: Date.now() - 40, result: null, resultIsError: false,
  tail: [`stderr: ${SAID}`, 'session exited (1)'],
});

describe('a codex conversation another window is writing to', () => {
  it('is what the worker says when its resume is refused for it', async () => {
    const codex = fakeCodex();
    const server = createCodexAppServer({ spawn: () => codex.child });
    const ready = server.initialize();
    await settle();
    codex.say({ id: codex.sent.find((m) => m.method === 'initialize').id, result: {} });
    const worker = createCodexWorker({ server, ready, resumeThreadId: THREAD });
    const said = [];
    worker.stderr.on('data', (line) => said.push(String(line)));
    const exited = new Promise((resolve) => worker.once('exit', resolve));
    await settle();
    codex.say({ id: codex.sent.find((m) => m.method === 'thread/resume').id, error: REFUSAL });
    expect(await exited).toBe(1);
    expect(troubleCause(said.join('\n'))).toBe('open-elsewhere');
  });

  it('says where the conversation is and what to do, on the row', () => {
    const s = deadRunSentence({ engineWord: 'Codex', cause: 'open-elsewhere' });
    expect(s).toMatch(/^Codex has this conversation open in another window/);
    expect(s).toMatch(/close it there/i);
    expect(s).not.toMatch(/ChatGPT plan/);
    expect(deadRunSentence({ engineWord: 'Claude Code', cause: 'open-elsewhere' }).split('.')[0].length).toBeLessThan(112);
    expect(deadRunCause(s)).toBe('open-elsewhere');
  });

  it('asks her to close it before replying, once the app stops trying', () => {
    const s = deadRunSentence({ engineWord: 'Codex', cause: 'open-elsewhere', runs: 3, gaveUp: true });
    expect(s).toMatch(/Close it there\. Then reply here to start it again\.$/);
  });

  it('names it where a run stopped mid-thread and above the list', () => {
    expect(runStoppedLine(SAID)).toMatch(/open in another Codex window/);
    const [line] = causeBreakdown([{ cause: 'open-elsewhere' }, { cause: 'open-elsewhere' }]);
    expect(line.what).toMatch(/^2 open in another Codex window/);
    expect(line.hers).toBe(true);
  });

  it('is not the login, so three of them file no trouble and bench nothing', () => {
    const s = bare();
    for (let i = 0; i < 3; i += 1) s.noteExitForBackoff(deadOnTheLock());
    expect(s._profileTrouble).toEqual({});
    expect(Object.values(s._profileCooldown).every((until) => !(until > Date.now()))).toBe(true);
    expect(needsHerHands('open-elsewhere')).toBe(false);
  });

  it('leaves every other cause its own name', () => {
    expect(troubleCause(`codex app-server refused thread/resume: no rollout found for thread id ${THREAD}`)).toBe('unknown');
    expect(troubleCause('unexpected status 401 Unauthorized: Missing bearer or basic authentication in header')).toBe('signed-out');
    expect(troubleCause('the connection to codex app-server is corrupt, a frame of 17000000 characters passed the 16777216 this connection allows')).toBe('unknown');
  });

  it('still benches a login whose runs die for a reason we cannot name', () => {
    const s = bare();
    const dead = () => ({ ...deadOnTheLock(), tail: ['stderr: codex app-server exited (code 1, signal null)'] });
    for (let i = 0; i < 3; i += 1) s.noteExitForBackoff(dead());
    expect(s._profileTrouble['codex:default']?.cause).toBe('unknown');
    expect(s._profileCooldown['codex:default']).toBeGreaterThan(Date.now());
  });
});
