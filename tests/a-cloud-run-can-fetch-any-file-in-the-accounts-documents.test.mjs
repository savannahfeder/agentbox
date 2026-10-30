// A CLOUD RUN CAN FETCH ANY FILE IN THE ACCOUNT'S DOCUMENTS (w-6771163ced, 2026-10-29).
//
// The launch-video brief pointed at an intro film in another product's
// documents (astral/videos/hyperfocus-brain-…/). The tool took a path relative
// to this task or to this product's documents only, and refused any `..`, so
// `../astral/videos/…/index.html` was refused and the film could never be
// fetched. A run now names any path under the account's documents: relative to
// it, relative to this product's documents with `..`, or written out in full
// (`~/…` or absolute), the way briefs write it. A folder answers with its files.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createResourceRequests } from '../main/cloud/resources.mjs';

let root; let account; let options;
beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-resource-account-')));
  account = path.join(root, 'home/Zero/accounts/acct');
  for (const dir of ['task', 'home/.claude', 'outside', 'home/Zero/accounts/acct/agentbox']) fs.mkdirSync(path.join(root, dir), { recursive: true });
  put('home/Zero/accounts/acct/astral/videos/intro/index.html', '<html>intro</html>');
  put('home/Zero/accounts/acct/astral/videos/intro/assets/music.mp3', 'mp3');
  put('home/Zero/accounts/acct/astral/videos/intro/.env', 'SECRET=1');
  put('home/Zero/accounts/acct/astral/videos/intro/node_modules/x/index.js', 'x');
  put('home/Zero/accounts/acct/astral/.hidden/plan.md', 'hidden');
  put('outside/secret.txt', 'not for the cloud');
  options = { cwd: path.join(root, 'task'), docs: path.join(account, 'agentbox'), account, homeDir: path.join(root, 'home'),
    configDir: path.join(root, 'home/.claude'), engine: 'claude', runId: 'run-account', state: {}, save: () => {},
    upload: vi.fn(async (key) => `https://storage.invalid/${key}`), deliver: vi.fn(async () => true), stopped: () => false, timeoutMs: 1000 };
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
function put(rel, text) { const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); return f; }

const intro = 'astral/videos/intro/index.html';

it('fetches another product\'s file by its path in the account', async () => {
  const answer = await createResourceRequests(options)({ kind: 'file', scope: 'account', path: intro });
  expect(answer).toMatchObject({ status: 'delivered' });
  expect(path.basename(answer.path)).toBe('index.html');
});

it('fetches it from this product\'s documents with ..', async () => {
  expect(await createResourceRequests(options)({ kind: 'file', scope: 'documents', path: `../${intro}` })).toMatchObject({ status: 'delivered' });
});

it('fetches it by the full path a brief writes, with ~ or without', async () => {
  const request = createResourceRequests(options);
  expect(await request({ kind: 'file', path: `~/Zero/accounts/acct/${intro}` })).toMatchObject({ status: 'delivered' });
  expect(await request({ kind: 'file', path: path.join(account, 'astral/videos/intro/assets/music.mp3') })).toMatchObject({ status: 'delivered' });
});

it('answers a folder with the files in it, leaving out hidden, private and installed ones', async () => {
  const answer = await createResourceRequests(options)({ kind: 'file', path: `~/Zero/accounts/acct/astral/videos/intro/` });
  expect(answer.status).toBe('folder');
  expect(answer.files.map((f) => f.path).sort()).toEqual([
    path.join(account, 'astral/videos/intro/assets/music.mp3'),
    path.join(account, 'astral/videos/intro/index.html'),
  ]);
  expect(options.upload).not.toHaveBeenCalled();
});

it('still refuses a file outside the account, a hidden folder in it, and a climb out of it', async () => {
  const request = createResourceRequests(options);
  for (const ask of [
    { kind: 'file', path: path.join(root, 'outside/secret.txt') },
    { kind: 'file', scope: 'account', path: '../../../../outside/secret.txt' },
    { kind: 'file', scope: 'account', path: 'astral/.hidden/plan.md' },
    { kind: 'file', scope: 'account', path: 'astral/videos/intro/.env' },
  ]) expect(await request(ask), JSON.stringify(ask)).toMatchObject({ status: 'denied' });
  expect(options.upload).not.toHaveBeenCalled();
});

it('refuses the account scope when the run does not know the account folder', async () => {
  const request = createResourceRequests({ ...options, account: null });
  expect(await request({ kind: 'file', scope: 'account', path: intro })).toMatchObject({ status: 'denied' });
  expect(await request({ kind: 'file', scope: 'documents', path: `../${intro}` })).toMatchObject({ status: 'denied' });
});

it('says where it looked when a file is not there', async () => {
  const answer = await createResourceRequests(options)({ kind: 'file', scope: 'account', path: 'astral/videos/intro/missing.html' });
  expect(answer.status).toBe('not_found');
  expect(answer.message).toContain(path.join(account, 'astral/videos/intro/missing.html'));
});
