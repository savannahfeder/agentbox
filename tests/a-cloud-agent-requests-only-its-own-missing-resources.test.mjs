// Missing files used to move an entire thread to the Mac. The resolver must
// deliver into immutable scratch paths, acknowledge receipt, and bound retries.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createResourceRequests, resourceContextFor } from '../main/cloud/resources.mjs';

let root; let options; let sent; let state;
beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-resource-')));
  for (const dir of ['task', 'docs', 'home']) fs.mkdirSync(path.join(root, dir));
  sent = []; state = {};
  options = { cwd: path.join(root, 'task'), docs: path.join(root, 'docs'), homeDir: path.join(root, 'home'),
    configDir: path.join(root, 'home/.claude'), codexHome: path.join(root, 'home/.codex-2'), engine: 'codex', runId: 'run-one',
    state, save: vi.fn(), upload: vi.fn(async (key, body) => { sent.push({ key, body }); return `https://storage.invalid/${key}`; }),
    deliver: vi.fn(async () => true), stopped: () => false, timeoutMs: 1000 };
});
afterEach(() => { vi.useRealTimers(); fs.rmSync(root, { recursive: true, force: true }); });
function put(rel, text) { const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); return f; }

it('returns a path only after delivery is acknowledged, outside both the checkout and documents', async () => {
  const original = put('docs/references/plan.md', 'plan'); let ack;
  options.deliver = vi.fn(() => new Promise((r) => { ack = r; }));
  const request = createResourceRequests(options);
  let finished = false; const result = request({ kind: 'file', scope: 'documents', path: 'references/plan.md' }).then((r) => { finished = true; return r; });
  await vi.waitFor(() => expect(ack).toBeTypeOf('function'));
  expect(finished).toBe(false); ack(true);
  expect(await result).toMatchObject({ status: 'delivered' });
  const answer = await result; expect(answer.path.startsWith('/tmp/agentbox-resources/')).toBe(true);
  expect(answer.path).not.toBe(original); expect(fs.readFileSync(original, 'utf8')).toBe('plan');
  expect(options.deliver.mock.calls[0][0][0].path).toBe(answer.path);
  expect(options.save).toHaveBeenCalled();
});

it('deduplicates concurrent calls and preserves delivered results when the relay restarts', async () => {
  put('task/file.txt', 'bytes'); const request = createResourceRequests(options); const args = { kind: 'file', scope: 'task', path: 'file.txt' };
  const [a, b] = await Promise.all([request(args), request(args)]);
  expect(a).toEqual(b); expect(options.deliver).toHaveBeenCalledTimes(1); expect(options.upload).toHaveBeenCalledTimes(1);
  const again = createResourceRequests(options); expect(await again(args)).toEqual(a); expect(options.deliver).toHaveBeenCalledTimes(1);
});

it('does not merge different resource identities just because they contain identical bytes', async () => {
  put('task/file.txt', 'same'); put('docs/file.txt', 'same'); const request = createResourceRequests(options);
  const a = await request({ kind: 'file', scope: 'task', path: 'file.txt' });
  const b = await request({ kind: 'file', scope: 'documents', path: 'file.txt' });
  expect(a.path).not.toBe(b.path); expect(sent[0].key).toBe(sent[1].key);
});

it('refuses other projects, hidden credentials, inner symlink escapes, and tokens', async () => {
  const other = put('other/file.txt', 'private'); fs.symlinkSync(other, path.join(root, 'task/alias.txt'));
  put('task/.env', 'private'); put('task/auth.json', '{}'); put('task/key.txt', 'ghp_' + 'a'.repeat(40));
  const request = createResourceRequests(options);
  for (const rel of [other, '../other/file.txt', 'alias.txt', '.env', 'auth.json', 'key.txt']) {
    expect(await request({ kind: 'file', scope: 'task', path: rel })).toMatchObject({ status: 'denied' });
  }
  expect(options.upload).not.toHaveBeenCalled();
});

it('ships a named skill with its references to a separate immutable skill directory', async () => {
  put('home/.agents/skills/taste/SKILL.md', '# Taste'); put('home/.agents/skills/taste/references/a.md', 'reference');
  const answer = await createResourceRequests(options)({ kind: 'skill', path: 'taste' });
  expect(answer.status).toBe('delivered'); expect(answer.path).toMatch(/\/skills\/taste\/SKILL.md$/);
  const delivery = options.deliver.mock.calls[0][0][0]; expect(delivery.untar).toBe(path.dirname(path.dirname(answer.path)));
  expect(path.basename(delivery.path)).toMatch(/^\.skills-[a-f0-9]{64}\.tgz$/);
});

it('distinguishes missing and oversized files and reserves its count before concurrent requests', async () => {
  const request = createResourceRequests({ ...options, limits: { file: 3, total: 10, requests: 5 } });
  expect(await request({ kind: 'file', scope: 'task', path: 'missing' })).toMatchObject({ status: 'not_found' });
  put('task/big', '1234'); expect(await request({ kind: 'file', scope: 'task', path: 'big' })).toMatchObject({ status: 'too_large' });
  for (let i = 0; i < 5; i++) put(`task/${i}`, 'ok');
  const results = await Promise.all(Array.from({ length: 5 }, (_, i) => request({ kind: 'file', scope: 'task', path: String(i) })));
  expect(results.filter((r) => r.status === 'delivered')).toHaveLength(3);
  expect(results.filter((r) => r.status === 'denied')).toHaveLength(2);
});

it('times out honestly and allows a retry after unavailability without a late delivery', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  put('task/file', 'data'); let upload;
  options.upload = vi.fn(() => new Promise((r) => { upload = r; }));
  const request = createResourceRequests({ ...options, timeoutMs: 60_000 }); const args = { kind: 'file', scope: 'task', path: 'file' };
  const first = request(args); await vi.waitFor(() => expect(upload).toBeTypeOf('function'));
  await vi.advanceTimersByTimeAsync(60_001); expect(await first).toMatchObject({ status: 'unavailable' });
  upload('https://storage.invalid/late'); await Promise.resolve(); await Promise.resolve();
  expect(options.deliver).not.toHaveBeenCalled();
  options.upload.mockResolvedValue('https://storage.invalid/retry'); expect(await request(args)).toMatchObject({ status: 'delivered' });
});

it('refuses work after the cloud run has stopped', async () => {
  put('task/file', 'data'); const request = createResourceRequests({ ...options, stopped: () => true });
  expect(await request({ kind: 'file', scope: 'task', path: 'file' })).toMatchObject({ status: 'unavailable' });
  expect(options.upload).not.toHaveBeenCalled();
});

it('allows retry after a transient upload failure', async () => {
  put('task/file', 'data'); options.upload.mockRejectedValueOnce(new Error('network offline'));
  const request = createResourceRequests(options); const args = { kind: 'file', scope: 'task', path: 'file' };
  expect(await request(args)).toMatchObject({ status: 'unavailable' });
  expect(await request(args)).toMatchObject({ status: 'delivered' });
});

it('bounds cancelled uploads that have not settled while allowing later retries', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  put('task/file', 'data'); options.upload.mockImplementation(() => new Promise(() => {}));
  const request = createResourceRequests({ ...options, timeoutMs: 60_000 }); const args = { kind: 'file', scope: 'task', path: 'file' };
  for (let i = 0; i < 5; i++) {
    const result = request(args); await vi.waitFor(() => expect(options.upload).toHaveBeenCalledTimes(i + 1));
    await vi.advanceTimersByTimeAsync(60_001); expect(await result).toMatchObject({ status: 'unavailable' });
  }
  expect(await request(args)).toMatchObject({ status: 'unavailable' });
  expect(options.upload).toHaveBeenCalledTimes(5);
});

it('ends an outstanding request promptly when its relay closes', async () => {
  put('task/file', 'data'); options.upload.mockImplementation(() => new Promise(() => {}));
  const request = createResourceRequests(options); const answer = request({ kind: 'file', scope: 'task', path: 'file' });
  await vi.waitFor(() => expect(options.upload).toHaveBeenCalled());
  request.close(); expect(await answer).toMatchObject({ status: 'unavailable' });
  expect(await request({ kind: 'file', scope: 'task', path: 'file' })).toMatchObject({ status: 'unavailable' });
});

it('restores the original Codex account when a Claude import-only process rejoins it', () => {
  const original = { engine: 'codex', homeDir: '/person', configDir: '/person/.claude', codexHome: '/person/.codex-2' };
  const importer = { engine: 'claude', homeDir: '/person', configDir: '/person/.claude-3', codexHome: '/person/.codex' };
  expect(resourceContextFor({ resourceContext: original }, importer)).toMatchObject(original);
  expect(resourceContextFor({ engine: 'codex', configDir: original.configDir, bringDirs: [{ name: 'sessions.tgz', dir: '/person/.codex-2/sessions' }] }, importer)).toMatchObject({ engine: 'codex', codexHome: original.codexHome });
  expect(resourceContextFor({ engine: 'codex' }, importer).skillsAvailable).toBe(false);
});

it('does not permanently deny a transient source read error', async () => {
  const request = createResourceRequests(options); const args = { kind: 'file', scope: 'task', path: 'file' };
  const read = vi.spyOn(fs.promises, 'realpath').mockRejectedValueOnce(Object.assign(new Error('temporarily busy'), { code: 'EBUSY' }));
  try { expect(await request(args)).toMatchObject({ status: 'unavailable' }); } finally { read.mockRestore(); }
  put('task/file', 'data'); expect(await request(args)).toMatchObject({ status: 'delivered' });
});

it('distinguishes a rejected skill from a temporary failure to read its installation', async () => {
  put('home/.agents/skills/taste/SKILL.md', '# Taste');
  const request = createResourceRequests(options); const args = { kind: 'skill', path: 'taste' };
  const read = vi.spyOn(fs.promises, 'realpath').mockRejectedValueOnce(Object.assign(new Error('temporarily busy'), { code: 'EBUSY' }));
  try { expect(await request(args)).toMatchObject({ status: 'unavailable' }); } finally { read.mockRestore(); }
  expect(await request(args)).toMatchObject({ status: 'delivered' });
  put('home/.agents/skills/bad/SKILL.md', '# Bad'); const outside = put('outside/private', 'private');
  fs.symlinkSync(outside, path.join(root, 'home/.agents/skills/bad/alias'));
  expect(await request({ kind: 'skill', path: 'bad' })).toMatchObject({ status: 'denied' });
});

it('does not bypass disabled skills when account configuration is temporarily unreadable', async () => {
  const file = put('home/.agents/skills/taste/SKILL.md', '# Taste');
  const config = put('home/.codex-2/config.toml', `[[skills.config]]\npath = ${JSON.stringify(file)}\nenabled = false\n`);
  const original = fs.readFileSync;
  const read = vi.spyOn(fs, 'readFileSync').mockImplementation((p, ...args) => {
    if (p === config) throw Object.assign(new Error('temporary config read failure'), { code: 'EIO' });
    return original(p, ...args);
  });
  const request = createResourceRequests(options);
  try { expect(await request({ kind: 'skill', path: 'taste' })).toMatchObject({ status: 'unavailable' }); }
  finally { read.mockRestore(); }
  expect(await request({ kind: 'skill', path: 'taste' })).toMatchObject({ status: 'not_found' });
  expect(options.upload).not.toHaveBeenCalled();
});

it('retries skill discovery after a transient root-stat failure', async () => {
  put('home/.codex-2/skills/taste/SKILL.md', '# Taste');
  const original = fs.statSync; const dir = path.join(root, 'home/.codex-2/skills');
  const stat = vi.spyOn(fs, 'statSync').mockImplementation((p, ...args) => {
    if (p === dir) throw Object.assign(new Error('temporary skill-root stat failure'), { code: 'EIO' });
    return original(p, ...args);
  });
  const request = createResourceRequests(options);
  try { expect(await request({ kind: 'skill', path: 'taste' })).toMatchObject({ status: 'unavailable' }); }
  finally { stat.mockRestore(); }
  expect(await request({ kind: 'skill', path: 'taste' })).toMatchObject({ status: 'delivered' });
});
