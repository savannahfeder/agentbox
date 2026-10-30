// A CLOUD RESOURCE THAT CANNOT BE DELIVERED SAYS WHY (w-6771163ced, 2026-10-29).
//
// The launch-video cloud run asked the Mac for two files and a skill and got
// "The resource could not be delivered while this computer was available"
// three times, and nothing on either side said why. Measured from a cloud run
// on 2026-10-29: a plain skill and a plain task file both came back that way,
// and the image's /opt/agentbox/server.mjs had no 'resources' in its CAPS
// (built 2026-10-25, three days before delivery landed), so the Mac refused
// every request before reading a byte. The answer now carries the reason, the
// Mac's log gets a line for it, and the agent is told to hand back an input
// the request names rather than build around a guess.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createResourceRequests } from '../main/cloud/resources.mjs';
import { HAND_BACK } from '../shared/cloud-hand-back.mjs';

let root; let options; let lines;
beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-resource-why-')));
  for (const dir of ['task', 'docs', 'home']) fs.mkdirSync(path.join(root, dir));
  fs.writeFileSync(path.join(root, 'task/file.txt'), 'bytes');
  lines = [];
  options = { cwd: path.join(root, 'task'), docs: path.join(root, 'docs'), homeDir: path.join(root, 'home'),
    configDir: path.join(root, 'home/.claude'), engine: 'claude', runId: 'run-why', state: {}, save: () => {},
    upload: vi.fn(async (key) => `https://storage.invalid/${key}`), deliver: vi.fn(async () => true),
    stopped: () => false, log: (line) => lines.push(line), timeoutMs: 1000 };
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

const args = { kind: 'file', scope: 'task', path: 'file.txt' };

it('says the cloud image is too old to take deliveries, without uploading anything', async () => {
  const answer = await createResourceRequests({ ...options, capable: () => false })(args);
  expect(answer.status).toBe('unavailable');
  expect(answer.message).toMatch(/image is older than file delivery/);
  expect(options.upload).not.toHaveBeenCalled();
  expect(lines.join('\n')).toMatch(/file\.txt: unavailable \(.*image is older/);
});

it('tells the agent to hand back an input the request names, and to go on without anything else', async () => {
  const answer = await createResourceRequests({ ...options, capable: () => false })(args);
  expect(answer.message).toContain(HAND_BACK);
  expect(answer.message).toMatch(/request names/);
});

it('says the cloud refused the delivery when it did', async () => {
  options.deliver = vi.fn(async () => false);
  const answer = await createResourceRequests(options)(args);
  expect(answer.message).toMatch(/cloud machine did not take the delivery/);
});

it('says an upload failed and with what', async () => {
  options.upload = vi.fn(async () => { throw new Error('network offline'); });
  const answer = await createResourceRequests(options)(args);
  expect(answer.message).toMatch(/upload failed: network offline/);
});

it('says the run has ended', async () => {
  const answer = await createResourceRequests({ ...options, stopped: () => true })(args);
  expect(answer.message).toMatch(/run is ending/);
});

it('logs a refusal too, but not a delivery', async () => {
  const request = createResourceRequests(options);
  expect(await request(args)).toMatchObject({ status: 'delivered' });
  expect(await request({ kind: 'file', scope: 'task', path: 'missing.txt' })).toMatchObject({ status: 'not_found' });
  expect(lines).toHaveLength(1);
  expect(lines[0]).toMatch(/missing\.txt: not_found/);
});

it('still delivers when the image can take it', async () => {
  expect(await createResourceRequests({ ...options, capable: () => true })(args)).toMatchObject({ status: 'delivered' });
});
