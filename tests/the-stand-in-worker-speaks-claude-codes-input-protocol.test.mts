// THE STAND-IN WORKER SPEAKS THE SAME INPUT PROTOCOL AS CLAUDE CODE.
//
// What broke, found 2026-10-11 by the first live drive of the verify skill
// (.claude/skills/verify-agentbox): a thread run by scripts/lib/stub-claude-worker.mjs
// finished, exited 0 with its answer, and the answer never reached the row.
// Workers are spawned with `--input-format stream-json --replay-user-messages`
// (main/claude-input.mts): the prompt arrives as a `user` line on stdin, and the
// app only counts a result as the end of the run once Claude Code has replayed
// that line by uuid and the app has closed its input. The stand-in predated
// that: it never read stdin, never replayed, and exited at its result. Measured:
// `child.ranToTheEnd()` was false at exit, `closingMessageIsTheAnswer` said no,
// and the ledger held two lines and no result 20 s later. With the fix, the
// answer was on the row within a second.
//
// A stand-in that drifts from the real CLI makes every proof built on it prove
// the wrong thing, which is why its protocol has a test of its own.
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { attachClaudeInput } from '../main/claude-input.mts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STUB = path.join(root, 'scripts', 'lib', 'stub-claude-worker.mjs');
const STREAM = ['-p', '--output-format', 'stream-json', '--input-format', 'stream-json', '--replay-user-messages'];

function start(args) {
  const child = spawn(process.execPath, [STUB, ...args], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, STUB_CLAUDE_PLAN: '' } });
  const frames = [];
  let buffer = '';
  child.stdout.on('data', (d) => {
    buffer += d;
    let at;
    while ((at = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, at); buffer = buffer.slice(at + 1);
      try { frames.push(JSON.parse(line)); } catch { /* not a frame */ }
    }
  });
  const exited = new Promise((resolve) => child.on('exit', (code) => resolve(code)));
  return { child, frames, exited };
}
const until = async (fn, ms = 5000) => {
  const deadline = Date.now() + ms;
  while (!fn()) { if (Date.now() > deadline) return false; await new Promise((r) => setTimeout(r, 20)); }
  return true;
};

describe('the stand-in worker, under the app\'s own input handling', () => {
  it('replays the prompt, answers, and counts as a run that finished', async () => {
    const { child, frames, exited } = start(STREAM);
    attachClaudeInput(child);
    const replayed = child.steer('say hello');
    await expect(replayed).resolves.toEqual({ accepted: true });
    expect(await exited).toBe(0);
    expect(frames.find((f) => f.type === 'result')?.result).toBe('the stub worker ran');
    expect(child.ranToTheEnd()).toBe(true);
  });

  it('replays the user line with the uuid it was sent', async () => {
    const { child, frames, exited } = start(STREAM);
    child.stdin.write(`${JSON.stringify({ type: 'user', uuid: 'u-123', message: { role: 'user', content: 'hi' } })}\n`);
    expect(await until(() => frames.some((f) => f.type === 'result'))).toBe(true);
    const replay = frames.find((f) => f.type === 'user');
    expect(replay?.uuid).toBe('u-123');
    expect(frames.indexOf(replay)).toBeLessThan(frames.findIndex((f) => f.type === 'result'));
    child.stdin.end();
    expect(await exited).toBe(0);
  });

  it('does not exit at its result while its input is still open, as Claude Code does not', async () => {
    const { child, frames, exited } = start(STREAM);
    child.stdin.write(`${JSON.stringify({ type: 'user', uuid: 'u-1', message: { role: 'user', content: 'hi' } })}\n`);
    expect(await until(() => frames.some((f) => f.type === 'result'))).toBe(true);
    await new Promise((r) => setTimeout(r, 300));
    expect(child.exitCode).toBe(null);
    child.stdin.end();
    expect(await exited).toBe(0);
  });

  it('answers with the token the task carries, so a proof can tell whose answer is whose', async () => {
    const { child, frames, exited } = start(STREAM);
    child.stdin.write(`${JSON.stringify({ type: 'user', uuid: 'u-t', message: { role: 'user', content: 'Do it [[tok:abc123]]' } })}\n`);
    expect(await until(() => frames.some((f) => f.type === 'result'))).toBe(true);
    expect(frames.find((f) => f.type === 'result').result).toContain('[abc123]');
    child.stdin.end();
    await exited;
  });

  it('runs out of usage only on the login the task names, in the words Claude Code uses', async () => {
    const run = async (configDir) => {
      const child = spawn(process.execPath, [STUB, ...STREAM], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, STUB_CLAUDE_PLAN: '', ...(configDir ? { CLAUDE_CONFIG_DIR: configDir } : {}) },
      });
      let out = '';
      child.stdout.on('data', (d) => { out += d; });
      child.stdin.write(`${JSON.stringify({ type: 'user', uuid: 'u-l', message: { role: 'user', content: 'x [[stub:limit-on:.claude-second]]' } })}\n`);
      const code = await new Promise((r) => child.on('exit', r));
      return { code, result: out.split('\n').filter(Boolean).map((l) => JSON.parse(l)).find((f) => f.type === 'result') };
    };
    const second = await run('/tmp/somewhere/.claude-second');
    expect(second.code).toBe(1);
    expect(second.result).toMatchObject({ is_error: true });
    expect(second.result.result).toMatch(/hit your session limit/);
    const main = await run(null);
    expect(main.code).toBe(0);
    expect(main.result.is_error).toBe(false);
  });

  it('without streamed input, still answers and exits on its own (the old proofs\' shape)', async () => {
    const { child, frames, exited } = start(['-p', 'say hello', '--output-format', 'stream-json']);
    child.stdin.end();
    expect(await exited).toBe(0);
    expect(frames.some((f) => f.type === 'user')).toBe(false);
    expect(frames.at(-1)).toMatchObject({ type: 'result', is_error: false });
  });
});
