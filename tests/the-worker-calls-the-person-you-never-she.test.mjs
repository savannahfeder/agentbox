// THE WORKER CALLS THE PERSON "YOU", NEVER "SHE" OR "HE".
//
// Measured 2026-10-01 on the team build: a tester, a man, read his own worker
// write "Re-claiming the row, and checking git for the original test she
// mentions." The briefs were written for one founder. In the team version
// anyone on a team is the person a worker works for, so the brief says so
// near the top, in one plain rule, and says it whether or not the install
// gives the worker store tools (the two halves of the brief are fenced, and a
// rule inside one fence would reach only half the workers).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Supervisor } from '../main/supervisor.mjs';

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const RULE = /anyone on a team[\s\S]{0,200}"you"[\s\S]{0,120}"they"[\s\S]{0,60}never "she" or "he"/;

let root;
let appDir;

const makeSupervisor = (config = {}) => {
  appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-you-app-'));
  fs.mkdirSync(path.join(appDir, 'briefs'), { recursive: true });
  for (const f of fs.readdirSync(path.join(REPO, 'briefs'))) {
    fs.copyFileSync(path.join(REPO, 'briefs', f), path.join(appDir, 'briefs', f));
  }
  const store = { listItems: () => [], listProducts: () => [], isDue: () => true };
  return new Supervisor({ storeRoot: root, maxConcurrentSessions: 3, ...config }, store, appDir);
};
const item = () => ({ id: 'w-1', product: 'p', title: 'do the thing', labels: [] });
const product = () => ({ slug: 'p', name: 'P', dir: fs.mkdtempSync(path.join(root, 'prod-')), repoPath: null });

beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-you-')); });
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  if (appDir) fs.rmSync(appDir, { recursive: true, force: true });
});

describe('the worker brief', () => {
  const template = () => fs.readFileSync(path.join(REPO, 'briefs', 'worker.md'), 'utf8');

  it('carries the rule near the top, before the first section', () => {
    const text = template();
    const at = text.search(RULE);
    expect(at, 'the rule is not in briefs/worker.md').toBeGreaterThan(-1);
    expect(at).toBeLessThan(text.indexOf('## The store'));
  });

  it('reaches a worker that has store tools', () => {
    const s = makeSupervisor({ storeMcpCommand: path.join(REPO, 'mcp', 'agentbox-mcp.sh') });
    expect(s.storeMcpCommand()).toBeTruthy();
    expect(s.buildBrief(item(), product(), { continuation: false })).toMatch(RULE);
  });

  it('reaches a worker that has none', () => {
    const s = makeSupervisor();
    expect(s.storeMcpCommand()).toBe(null);
    expect(s.buildBrief(item(), product(), { continuation: false })).toMatch(RULE);
  });

  it('is said once, not repeated in each half', () => {
    expect(template().match(new RegExp(RULE.source, 'g'))).toHaveLength(1);
  });
});
