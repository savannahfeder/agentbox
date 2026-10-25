// The usage reader changed on 2026-10-17 from parsing text to two control
// requests. A real stand-in process proves no user prompt is sent and a failed,
// unsupported, or timed-out CLI cannot linger or return an invented reading.
import { expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { runClaudeUsage } from '../main/claude-usage-process.mjs';

const fixture = fileURLToPath(new URL('./fixtures/usage-control-cli.mjs', import.meta.url));
function read(mode = '') {
  let child;
  const result = new Promise(resolve => {
    child = runClaudeUsage(process.execPath, [fixture], {
      cwd: process.cwd(), env: { ...process.env, USAGE_PROBE_MODE: mode },
      maxBuffer: 64 * 1024, timeout: mode === 'timeout' ? 100 : 5000,
    }, (error, output) => resolve({ error, output }));
  });
  const exited = new Promise(resolve => child.once('exit', resolve));
  return { result, exited };
}

it('only initializes and requests provider usage without the local transcript scan', async () => {
  const run = read();
  const { error, output } = await run.result;
  expect(error).toBeNull();
  const data = JSON.parse(output);
  expect(data.requests.map(r => r.type)).toEqual(['control_request', 'control_request']);
  expect(data.requests.map(r => r.request)).toEqual([{ subtype: 'initialize' }, { subtype: 'get_usage', skip_behaviors: true }]);
  expect(data.rate_limits.five_hour.utilization).toBe(12);
  await run.exited;
});

for (const mode of ['unsupported', 'timeout', 'exit']) {
  it(`${mode} reports a failure and stops the child`, async () => {
    const run = read(mode);
    expect((await run.result).error).toBeInstanceOf(Error);
    await run.exited;
  });
}
