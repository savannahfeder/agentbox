// On 2026-11-08 a ship stopped before doing anything: `spawnSync git EAGAIN`
// on its third git call, because the Mac was briefly at its process limit.
// The branch was fine and a second later git would have started. Measured by
// feeding the retry a runner that answers EAGAIN, then a real git exit.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { startedWhenBusy } from '../scripts/lib/ship-rules.mjs';

const busy = () => ({ error: Object.assign(new Error('spawnSync git EAGAIN'), { code: 'EAGAIN' }), status: null });
const ran = (status = 0) => ({ status, stdout: 'ok', stderr: '' });

describe('a ship waits out a moment when the Mac cannot start git', () => {
  it('starts git again when the first starts were refused as busy', () => {
    const answers = [busy(), busy(), ran()];
    const waits = [];
    const result = startedWhenBusy(() => answers.shift(), { sleep: (ms) => waits.push(ms) });
    expect(result.status).toBe(0);
    expect(waits.length).toBe(2);
  });

  it('does not run git again when git ran and failed', () => {
    let calls = 0;
    const result = startedWhenBusy(() => { calls += 1; return ran(1); }, { sleep: () => {} });
    expect(result.status).toBe(1);
    expect(calls).toBe(1);
  });

  it('does not retry an error other than busy', () => {
    let calls = 0;
    const missing = { error: Object.assign(new Error('ENOENT'), { code: 'ENOENT' }), status: null };
    const result = startedWhenBusy(() => { calls += 1; return missing; }, { sleep: () => {} });
    expect(result.error.code).toBe('ENOENT');
    expect(calls).toBe(1);
  });

  it('gives up and hands back the busy error after its tries, waiting under a minute in all', () => {
    let calls = 0;
    const waits = [];
    const result = startedWhenBusy(() => { calls += 1; return busy(); }, { sleep: (ms) => waits.push(ms) });
    expect(result.error.code).toBe('EAGAIN');
    expect(calls).toBeGreaterThan(2);
    expect(calls).toBeLessThan(10);
    expect(waits.reduce((a, b) => a + b, 0)).toBeLessThan(60_000);
  });

  it('every git the ship script starts goes through it', () => {
    const src = readFileSync(new URL('../scripts/ship.mjs', import.meta.url), 'utf8');
    const body = src.replace(/^\s*\/\/.*$/gm, '');
    expect(body).toMatch(/startedWhenBusy/);
    expect(body.match(/spawnSync\('git'/g) ?? []).toHaveLength(1);
    expect(body).not.toMatch(/execFileSync\('git'/);
  });
});
