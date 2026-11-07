// A PLAN READ TWICE IS READ FROM THE FILE ONLY WHEN THE FILE CHANGED.
//
// Why (2026-10-20): cloud tiles now say their plan, read from the folder here
// in the same organization, and the cloud list is built on every snapshot.
// That folder's .claude.json was 157 KB on her Mac. readPlan now keeps its
// answer until the file's mtime moves, the way accountIdentity already does.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readPlan } from '../main/claude-plan.mjs';

let dir;
let file;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-cache-')); file = path.join(dir, '.claude.json'); });
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(dir, { recursive: true, force: true }); });

const write = (tier, at) => {
  fs.writeFileSync(file, JSON.stringify({ oauthAccount: { organizationRateLimitTier: tier, billingType: 'stripe_subscription' } }));
  fs.utimesSync(file, at, at);
};

it('an unchanged file is not parsed again', () => {
  write('default_claude_max_20x', new Date(2026, 9, 20, 12));
  expect(readPlan('x', { file }).label).toBe('Max 20x');
  const parse = vi.spyOn(JSON, 'parse');
  expect(readPlan('x', { file }).label).toBe('Max 20x');
  expect(parse).not.toHaveBeenCalled();
});

it('a new sign-in is seen the moment the file changes', () => {
  write('default_claude_max_20x', new Date(2026, 9, 20, 12));
  expect(readPlan('x', { file }).label).toBe('Max 20x');
  write('default_claude_max_5x', new Date(2026, 9, 20, 12, 1));
  expect(readPlan('x', { file }).label).toBe('Max 5x');
});

it('must NOT keep answering for a file that has gone', () => {
  write('default_claude_max_20x', new Date(2026, 9, 20, 12));
  expect(readPlan('x', { file }).known).toBe(true);
  fs.rmSync(file);
  expect(readPlan('x', { file }).known).toBe(false);
});
