// A STAND-IN AGENT SHOWS ITS WORK WHILE IT WORKS.
//
// Found in the power test of 2026-11-02: two of three testers wrote that an
// open running thread only ever said "Thinking", so neither could tell whether
// its live log kept moving, which was half of the change they were asked to
// lean on (only the open thread is sent a running agent's log). The stand-in
// waited out the power test's pace (5 to 90 s) and wrote nothing until its
// answer. A real agent writes steps all the way through.
//
// Now, while it waits out a world's pace, it writes a step every few seconds:
// a command, then a sentence. A task's own [[stub:slow]] and a run with no
// pace write nothing new, so the tests built on them read what they always did.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { stepEvery, workStep } from '../scripts/lib/stand-in-world.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STUB = path.join(root, 'scripts', 'lib', 'stub-claude-worker.mjs');

function run(world, prompt = 'Work item id: w-1\nTitle: Fix the flaky login test') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'steps-'));
  const file = path.join(dir, 'world.json');
  fs.writeFileSync(file, JSON.stringify(world));
  const plan = path.join(dir, 'plan.json');
  fs.writeFileSync(plan, JSON.stringify({ say: 'answered', world: file }));
  const env = { ...process.env, STUB_CLAUDE_PLAN: plan };
  delete env.CLAUDE_CONFIG_DIR;
  const child = spawn(process.execPath, [STUB, '-p', prompt], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  return new Promise((resolve) => {
    const timer = setTimeout(() => child.kill('SIGTERM'), 8000);
    child.on('exit', () => {
      clearTimeout(timer);
      const frames = out.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      const resultAt = frames.findIndex((f) => f.type === 'result');
      const steps = frames.slice(0, resultAt < 0 ? frames.length : resultAt).filter((f) => f.type === 'assistant');
      resolve({ steps, result: frames[resultAt] ?? null });
    });
  });
}

describe('a stand-in agent shows its work while it works', () => {
  it('waiting out a power test\'s pace, it writes steps before its answer, a command and then a sentence', async () => {
    const { steps, result } = await run({ pace: { minMs: 900, maxMs: 900, stepMs: 200 } });
    expect(result?.is_error).toBe(false);
    expect(steps.length).toBeGreaterThanOrEqual(3);
    const kinds = steps.map((s) => s.message.content[0].type);
    expect(kinds.slice(0, 2)).toEqual(['tool_use', 'text']);
    expect(steps.find((s) => s.message.content[0].type === 'text').message.content[0].text).toMatch(/Fix the flaky login test/);
  });

  it('a pace shorter than one step writes no step, only its answer', async () => {
    const { steps, result } = await run({ pace: { minMs: 100, maxMs: 100, stepMs: 400 } });
    expect(result?.is_error).toBe(false);
    expect(steps).toEqual([]);
  });

  it('with no pace, or a task\'s own [[stub:slow]], it writes nothing new', async () => {
    expect((await run({})).steps).toEqual([]);
    const slow = await run({ pace: { minMs: 900, maxMs: 900, stepMs: 200 } }, 'Work item id: w-1\nTitle: Slow one\n[[stub:slow:600]]');
    expect(slow.result?.is_error).toBe(false);
    expect(slow.steps).toEqual([]);
  });

  it('steps come every few seconds unless the world says otherwise, and never at 0', () => {
    expect(stepEvery({ pace: { minMs: 5000, maxMs: 90000 } })).toBe(4000);
    expect(stepEvery({ pace: { minMs: 5000, stepMs: 250 } })).toBe(250);
    expect(stepEvery({ pace: { minMs: 5000, stepMs: 0 } })).toBe(0);
    expect(stepEvery({})).toBe(0);
  });

  it('each step names a different file or part, so a log that moves reads as moving', () => {
    expect(workStep(1, 'A').name).toBe('Read');
    expect(workStep(3, 'A').input).not.toEqual(workStep(1, 'A').input);
    expect(workStep(2, 'A').text).not.toBe(workStep(4, 'A').text);
    expect(workStep(2, null).text).toMatch(/the task/);
  });
});
