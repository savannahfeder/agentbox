// A thread you start by writing to a teammate in its chat (label from-chat) is
// your own ask. Its system prompt said so: "end with your answer as your last
// message and leave it open". The worker brief under it still carried the
// section for a teammate's own runs: "This run is your own work, not something
// the person asked for, so the rules above about leaving their rows open do not
// apply", finishing done and clean. Measured on the Head of Marketing's
// multiplayer-video thread (2026-11-18): its first brief carried both, and that
// thread went on to leave your questions unanswered.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Supervisor } from '../main/supervisor.mts';

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const TEAMMATE_RULES = 'If this item is one run of a teammate';

let root: string;
let appDir: string;

const makeSupervisor = () => {
  appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-chat-brief-app-'));
  fs.mkdirSync(path.join(appDir, 'briefs'), { recursive: true });
  for (const f of fs.readdirSync(path.join(REPO, 'briefs'))) {
    fs.copyFileSync(path.join(REPO, 'briefs', f), path.join(appDir, 'briefs', f));
  }
  const store = { listItems: () => [], listProducts: () => [], isDue: () => true };
  return new Supervisor({ storeRoot: root, maxConcurrentSessions: 3 }, store, appDir);
};

const item = (labels: string[], over = {}) => ({ id: 'w-1', product: 'p', title: 'make the launch video', labels, ...over });
const product = () => ({ slug: 'p', name: 'P', dir: fs.mkdtempSync(path.join(root, 'prod-')), repoPath: null });
const brief = (labels: string[], over = {}) => makeSupervisor().buildBrief(item(labels, over), product(), { continuation: false });

beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-chat-brief-')); });
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  if (appDir) fs.rmSync(appDir, { recursive: true, force: true });
});

describe('a thread you started in a teammate chat is briefed as your ask', () => {
  it('is not told it is the teammate\'s own work, nor to close itself clean', () => {
    const b = brief(['founder', 'teammate:t-27fd9da55b', 'hop:0', 'work:w-1', 'from-chat']);
    expect(b).not.toContain(TEAMMATE_RULES);
    expect(b).not.toContain('This run is your own work');
    expect(b).not.toContain('teammate-rules:start');
  });

  it('a thread Auto sent to a teammate still is not told so either', () => {
    expect(brief(['founder', 'teammate:t-27fd9da55b', 'hop:0'], { routed: { to: 't-27fd9da55b', why: 'x', at: 1, by: 'auto' } })).not.toContain(TEAMMATE_RULES);
  });

  it('a teammate\'s own run, woken by a duty or a hand-off, keeps the section', () => {
    expect(brief(['founder', 'teammate:t-27fd9da55b', 'hop:0'])).toContain(TEAMMATE_RULES);
    expect(brief(['founder', 'teammate:t-27fd9da55b', 'hop:1', 'duty:d1'])).toContain(TEAMMATE_RULES);
  });

  it('a from-chat label with no teammate on it changes nothing', () => {
    expect(brief(['founder', 'from-chat'])).not.toContain(TEAMMATE_RULES);
  });
});
