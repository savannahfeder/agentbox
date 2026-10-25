// A LOGIN RUNS OUT MID-TEST WITHOUT THE TASK SAYING SO.
//
// What was missing (w-811757c0b5, 2026-10-20): the stand-in agents only
// misbehaved when the task's own words told them to ([[stub:limit]],
// [[stub:hang]]). A power tester types what a person types, so on a long
// session nothing ever ran out, hung or died, which are the cases the person
// running these tests finds bugs in. Measured: a stand-in thread with no
// directive answered in under a second, every time, on every login.
//
// Now both stand-ins also read <instance>/world.json on every start, which the
// power test rewrites as its clock moves: which logins are out, how long an
// answer takes, what share of tasks hang or die, what share offer options.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { worldTurn, worldAnswer, readWorld } from '../scripts/lib/stand-in-world.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STUB = path.join(root, 'scripts', 'lib', 'stub-claude-worker.mjs');

function world(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'world-'));
  const file = path.join(dir, 'world.json');
  if (content !== undefined) fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content));
  const plan = path.join(dir, 'plan.json');
  fs.writeFileSync(plan, JSON.stringify({ say: 'answered', world: file }));
  return { dir, file, plan };
}

function run(plan, { login = null, prompt = 'Work item id: w-1\nTitle: Fix the flaky login test', ms = 8000, argv = null } = {}) {
  const env = { ...process.env, STUB_CLAUDE_PLAN: plan };
  delete env.CLAUDE_CONFIG_DIR;
  if (login) env.CLAUDE_CONFIG_DIR = path.join(os.tmpdir(), login);
  const child = spawn(process.execPath, [STUB, ...(argv ?? ['-p', prompt])], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  const started = Date.now();
  return new Promise((resolve) => {
    const timer = setTimeout(() => { child.kill('SIGTERM'); }, ms);
    child.on('exit', (code) => {
      clearTimeout(timer);
      const frames = out.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      resolve({ code, result: frames.find((f) => f.type === 'result') ?? null, ms: Date.now() - started });
    });
  });
}

describe('the world a power test sets, as each stand-in reads it', () => {
  it('runs out on the login the world names, and only that one', () => {
    const w = { out: ['.claude-second'] };
    expect(worldTurn(w, '.claude-second').limit).toBe(true);
    expect(worldTurn(w, 'default').limit).toBe(false);
    expect(worldTurn(w, 'codex').limit).toBe(false);
    expect(worldTurn({ out: ['codex'] }, 'codex').limit).toBe(true);
  });

  it('rolls hang, die and options against their shares, and never when the share is 0 or missing', () => {
    const w = { hang: 0.2, die: 0.2, options: 0.2 };
    expect(worldTurn(w, 'default', () => 0.1)).toMatchObject({ hang: true, die: true, options: true });
    expect(worldTurn(w, 'default', () => 0.2)).toMatchObject({ hang: false, die: false, options: false });
    expect(worldTurn({ hang: 0 }, 'default', () => 0)).toMatchObject({ hang: false, die: false, options: false });
  });

  it('takes as long as the pace says, between its two ends', () => {
    expect(worldTurn({ pace: { minMs: 1000, maxMs: 3000 } }, 'default', () => 0).delayMs).toBe(1000);
    expect(worldTurn({ pace: { minMs: 1000, maxMs: 3000 } }, 'default', () => 0.5).delayMs).toBe(2000);
    expect(worldTurn({ pace: { minMs: 500 } }, 'default', () => 0.9).delayMs).toBe(500);
    expect(worldTurn({}, 'default').delayMs).toBe(0);
  });

  it('reads a missing or broken world as no world at all', () => {
    expect(readWorld(null)).toEqual({});
    expect(readWorld(path.join(os.tmpdir(), 'no-such-world.json'))).toEqual({});
    expect(readWorld(world('{not json').file)).toEqual({});
  });

  it('names the task it worked on, and offers options the app can parse', () => {
    const said = worldAnswer('answered', { options: true }, 'Fix the flaky login test');
    expect(said).toContain('Fix the flaky login test');
    const options = said.split('## Options\n')[1]?.split('\n').filter((l) => /^\d+\. /.test(l)) ?? [];
    expect(options.length).toBeGreaterThanOrEqual(2);
    expect(options.filter((l) => /\(recommended\)/.test(l))).toHaveLength(1);
    expect(worldAnswer('answered', { options: false }, null)).not.toContain('## Options');
  });

  // Found by the first power test: two testers picked "Ship it", the stand-in
  // answered in the same words as before, and both logged that no answer came.
  it('never answers one thread twice in the same words', () => {
    expect(worldAnswer('answered', { options: false }, 'Fix it', 1)).not.toBe(worldAnswer('answered', { options: false }, 'Fix it', 2));
    expect(worldAnswer('answered', { options: false }, 'Fix it', 2)).toContain('answer 2');
  });
});

describe('the Claude stand-in, started the way the app starts it', () => {
  it('says the login is out when the world says so, in the words Claude Code uses', async () => {
    const { plan } = world({ out: ['.claude-second'] });
    const out = await run(plan, { login: '.claude-second' });
    expect(out.code).toBe(1);
    expect(out.result?.result).toMatch(/hit your session limit/);
  });

  it('answers on another login while one is out', async () => {
    const { plan } = world({ out: ['.claude-second'] });
    const out = await run(plan, { login: null });
    expect(out.code).toBe(0);
    expect(out.result?.is_error).toBe(false);
    expect(out.result?.result).toContain('Fix the flaky login test');
  });

  it('answers as before when there is no world file', async () => {
    const { plan } = world(undefined);
    const out = await run(plan);
    expect(out.code).toBe(0);
    expect(out.result?.result).toBe('answered');
  });

  it('takes the world\'s pace before it answers', async () => {
    const { plan } = world({ pace: { minMs: 700, maxMs: 700 } });
    const out = await run(plan);
    expect(out.code).toBe(0);
    expect(out.ms).toBeGreaterThanOrEqual(650);
  });

  // Found by the first power test's startup-engineer tester: with the world's
  // pace on every start, the app's sign-in check timed out at 15 s and the
  // inbox said agents could not start while one was running.
  it('answers the app\'s sign-in check at once, whatever the world says', async () => {
    const { plan } = world({ pace: { minMs: 20_000, maxMs: 20_000 }, out: ['default'], hang: 1 });
    const out = await run(plan, { argv: ['auth', 'status', '--json'], ms: 5000 });
    expect(out.code).toBe(0);
    expect(out.ms).toBeLessThan(4000);
  });

  it('dies without an answer when the world says this one dies', async () => {
    const { plan } = world({ die: 1 });
    const out = await run(plan);
    expect(out.code).toBe(1);
    expect(out.result).toBeNull();
  });

  it('never answers when the world says this one hangs, until it is stopped', async () => {
    const { plan } = world({ hang: 1 });
    const out = await run(plan, { ms: 1500 });
    expect(out.code).toBe(143);
    expect(out.result).toBeNull();
  });
});

describe('the Codex stand-in model', () => {
  it('refuses as a ChatGPT plan out of usage does when the world puts Codex out, and answers when it does not', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-world-'));
    const server = spawn(process.execPath, [path.join(root, '.claude/skills/verify-agentbox/scripts/stub-codex-server.mjs'), dir], { stdio: 'ignore' });
    try {
      const file = path.join(dir, 'codex-model.json');
      const deadline = Date.now() + 10_000;
      while (!fs.existsSync(file) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
      const { url } = JSON.parse(fs.readFileSync(file, 'utf8'));
      const ask = () => fetch(`${url}/responses`, {
        method: 'POST', signal: AbortSignal.timeout(5000),
        body: JSON.stringify({ input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Title: Add a json flag' }] }] }),
      });
      fs.writeFileSync(path.join(dir, 'world.json'), JSON.stringify({ out: ['codex'] }));
      expect((await ask()).status).toBe(429);
      fs.writeFileSync(path.join(dir, 'world.json'), JSON.stringify({ out: ['.claude-second'] }));
      const ok = await ask();
      expect(ok.status).toBe(200);
      expect(await ok.text()).toContain('Add a json flag');
    } finally {
      server.kill('SIGTERM');
    }
  });
});
