// THE SEARCH READS FURTHER BACK THAN THE CARD DOES, AND SAYS WHERE IT STOPPED.
//
// The card's own list is the last ten days (`readImportableThreads`). Typing a
// name has to reach past that or the field is decoration, so searching uses a
// second, deeper read (w-6418318cd5, from GitHub #31).
//
// IT CANNOT PROMISE EVERYTHING AND MUST NOT PRETEND TO. A chat's name is only
// known once its transcript has been opened, and the Mac this was written on
// has 29,703 of them; the existing read already stops at a time budget for
// exactly that reason (READ_BUDGET_MS, main/agent-sessions.mjs). So the deep
// read goes newest first until its own budget is spent and hands back the
// moment it got to. "No chat with that name" over a read that gave up in
// August is the lie this number exists to prevent.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readImportableThreads, readSearchableThreads, SEARCH_DAYS } from '../main/importable-threads.mjs';

const NOW = Date.UTC(2026, 9, 15, 12, 0, 0);
const DAY = 86400000;
let home;

beforeEach(() => { home = fs.mkdtempSync(path.join(os.tmpdir(), 'search-home-')); });
afterEach(() => { fs.rmSync(home, { recursive: true, force: true }); });

function claudeSession({ id, when, said = `job ${id}` }) {
  const cwd = `${home}/code/shop`;
  const dir = path.join(home, '.claude', 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'));
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${id}.jsonl`);
  fs.writeFileSync(file, `${JSON.stringify({ type: 'user', sessionId: id, entrypoint: 'cli', cwd, message: { role: 'user', content: said } })}\n`);
  fs.utimesSync(file, new Date(when), new Date(when));
}

const deep = (opts = {}) => readSearchableThreads({ config: {}, supervisor: null, env: {}, shellEnv: {}, home, now: NOW, ...opts });
const shallow = () => readImportableThreads({ config: {}, supervisor: null, env: {}, shellEnv: {}, home, now: NOW });

describe('how far back it reaches', () => {
  beforeEach(() => {
    claudeSession({ id: 'today', when: NOW - 1 * DAY, said: 'Make the hero image load faster' });
    claudeSession({ id: 'summer', when: NOW - 100 * DAY, said: 'Reopen the Powerup application' });
  });

  it('finds a chat from a hundred days ago that the ten-day list does not offer', async () => {
    expect((await shallow()).map((t) => t.id)).toEqual(['today']);
    expect((await deep()).threads.map((t) => t.id).sort()).toEqual(['summer', 'today']);
  });

  it('keeps the newest first, so the list reads the same way the card does', async () => {
    expect((await deep()).threads.map((t) => t.id)).toEqual(['today', 'summer']);
  });

  it('leaves out what is older than its window', async () => {
    claudeSession({ id: 'ancient', when: NOW - (SEARCH_DAYS + 30) * DAY, said: 'The very first thing' });
    expect((await deep()).threads.map((t) => t.id)).not.toContain('ancient');
  });

  it('reaches a year back, because "older" means months and not a fortnight', async () => {
    expect(SEARCH_DAYS).toBeGreaterThanOrEqual(365);
  });
});

describe('what it says when there were too many to open', () => {
  it('reports nothing when it read the whole window', async () => {
    claudeSession({ id: 'one', when: NOW - 5 * DAY });
    expect((await deep()).reached).toBe(0);
  });

  it('stops at the cap and hands back the moment it stopped at', async () => {
    for (let i = 0; i < 6; i += 1) claudeSession({ id: `s${i}`, when: NOW - (i + 1) * DAY });
    const got = await deep({ max: 3 });
    expect(got.threads).toHaveLength(3);
    // Newest first, so the three it kept are the three newest and the moment
    // it stopped at is the oldest of those.
    expect(got.threads.map((t) => t.id)).toEqual(['s0', 's1', 's2']);
    expect(got.reached).toBe(NOW - 3 * DAY);
  });

  it('a search of the cut-short read can still find what it did open', async () => {
    claudeSession({ id: 'near', when: NOW - 1 * DAY, said: 'Reopen the Powerup application' });
    for (let i = 0; i < 5; i += 1) claudeSession({ id: `pad${i}`, when: NOW - (i + 2) * DAY });
    const got = await deep({ max: 2 });
    expect(got.threads.map((t) => t.id)).toContain('near');
    expect(got.reached).toBeGreaterThan(0);
  });
});
