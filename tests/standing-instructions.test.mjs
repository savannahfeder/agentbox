// Her standing instructions reach EVERY session, or they are not standing.
//
// The rules she writes once are useless if they reach fresh sessions but not
// the reply she types into a thread three days later. spawnPlan is the one
// place a session's arguments
// are built, which is what makes "every session" a fact rather than a hope;
// this pins that it stays that way.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';

let appDir;

const supervisor = (over = {}) => {
  const s = Object.create(Supervisor.prototype);
  s.appDir = appDir;
  // Running from source these two are the same folder; they only diverge inside
  // a packaged app, where the bundle is read-only and what she writes cannot be.
  s.dataDir = appDir;
  // HER OWN FOLDER, AND IT IS NEVER THE CHECKOUT (w-3dc46f3a67). The file this
  // whole suite is about used to be read from dataDir, which running from
  // source is the git repository the fleet works in. The cases below write and
  // read through the supervisor's own methods, so pointing this at the same
  // temporary directory keeps them honest about what they exercise.
  s.userDir = appDir;
  s.config = { sessionArgs: ['--allowedTools', 'mcp__agentbox'] };
  s.buildBrief = () => 'THE BRIEF';
  return Object.assign(s, over);
};

const item = (over = {}) => ({ id: 'w-1', product: 'acme', title: 'do the thing', ...over });
const product = { slug: 'acme', name: 'Acme', dir: '/tmp/acme', repoPath: null };

const write = (text) => {
  fs.mkdirSync(path.join(appDir, 'briefs'), { recursive: true });
  fs.writeFileSync(path.join(appDir, 'briefs', 'founder.md'), text, 'utf8');
};

// The flag's value, or undefined if the flag is not there at all.
const injected = (args) => {
  const at = args.indexOf('--append-system-prompt');
  return at === -1 ? undefined : args[at + 1];
};

beforeEach(() => { appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-standing-')); });
afterEach(() => { fs.rmSync(appDir, { recursive: true, force: true }); });

describe('who gets them', () => {
  it('a product worker', () => {
    write('Never guess at a number.');
    const { args } = supervisor().spawnPlan(item(), product, {});
    expect(injected(args)).toBe('Never guess at a number.');
  });

  // A rule she writes today has to apply to the thread she started last week.
  // A personal task was the third case here until personal projects were
  // deleted (w-d19d6d387c, 2026-09-22).
  it('a resumed session carrying her reply', () => {
    write('Never guess at a number.');
    const s = supervisor();
    const { args } = s.spawnPlan(item({ answer: 'yes, do it' }), product, {
      continuation: true, resumeSessionId: 'session-abc',
    });
    expect(injected(args)).toBe('Never guess at a number.');
    expect(args).toContain('--resume');
  });
});

describe('when there is nothing to say', () => {
  it('adds no flag when the file does not exist', () => {
    const { args } = supervisor().spawnPlan(item(), product, {});
    expect(args).not.toContain('--append-system-prompt');
  });

  // An empty flag is not the same as no flag: it briefs every session with a
  // blank instruction block and invites the model to wonder what is missing.
  it('adds no flag when she has emptied the box', () => {
    write('   \n\n  ');
    const { args } = supervisor().spawnPlan(item(), product, {});
    expect(args).not.toContain('--append-system-prompt');
  });
});

describe('reading and writing the file', () => {
  it('round-trips her text exactly, whitespace and all', () => {
    const s = supervisor();
    s.writeStanding('one rule\n\n  and another\n');
    expect(s.readStanding()).toBe('one rule\n\n  and another\n');
  });

  it('reads as empty before she has ever written one', () => {
    expect(supervisor().readStanding()).toBe('');
  });

  // She edits this while the fleet is running. A cached copy is a rule she
  // believes she set, ignored by every session until the app restarts.
  it('picks up an edit with no restart', () => {
    const s = supervisor();
    s.writeStanding('first rule');
    expect(injected(s.spawnPlan(item(), product, {}).args)).toBe('first rule');
    s.writeStanding('second rule');
    expect(injected(s.spawnPlan(item(), product, {}).args)).toBe('second rule');
  });

  it('never leaves a half-written file for a spawn to read', () => {
    const s = supervisor();
    s.writeStanding('a rule');
    expect(fs.readdirSync(path.join(appDir, 'briefs')).filter((f) => f.includes('.tmp-'))).toEqual([]);
  });
});
