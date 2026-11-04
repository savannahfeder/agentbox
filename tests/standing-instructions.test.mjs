// Her standing instructions reach EVERY session, or they are not standing.
//
// The rules she writes once are useless if they reach fresh sessions but not
// the reply she types into a thread three days later. spawnPlan is the one
// place a session's arguments
// are built, which is what makes "every session" a fact rather than a hope;
// this pins that it stays that way.
//
// SINCE 2026-11-04 THE SAME FLAG ALSO CARRIES ONE FACT OF THE APP'S OWN: which
// model and effort level the run is really on, so that a rule naming either can
// be checked by the run it binds (tests/a-run-can-read-which-model-and-effort-
// it-is-on). So the flag is no longer absent when she has written nothing, and
// the cases below ask what they always meant to ask: that her words are in
// there, and that a block she left empty puts nothing of hers in it.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mts';

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
    expect(injected(args)).toContain('Never guess at a number.');
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
    expect(injected(args)).toContain('Never guess at a number.');
    expect(args).toContain('--resume');
  });
});

describe('when there is nothing to say', () => {
  // AND NEVER AN EMPTY BLOCK, which is the rule this pair has always been
  // about: a blank instruction block briefs every session with nothing and
  // invites the model to wonder what is missing. What the run is on is a
  // sentence, so what she has not written adds no second one.
  const runsOn = 'This run is on Claude Code, Opus 5.5.';

  it('carries nothing of hers when the file does not exist', () => {
    const { args } = supervisor().spawnPlan(item(), product, {});
    expect(injected(args).startsWith(runsOn)).toBe(true);
    expect(injected(args).trim()).toBe(injected(args));
  });

  it('carries nothing of hers when she has emptied the box', () => {
    write('   \n\n  ');
    const { args } = supervisor().spawnPlan(item(), product, {});
    expect(injected(args).startsWith(runsOn)).toBe(true);
    expect(injected(args).trim()).toBe(injected(args));
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
    expect(injected(s.spawnPlan(item(), product, {}).args)).toContain('first rule');
    s.writeStanding('second rule');
    const after = injected(s.spawnPlan(item(), product, {}).args);
    expect(after).toContain('second rule');
    expect(after).not.toContain('first rule');
  });

  it('never leaves a half-written file for a spawn to read', () => {
    const s = supervisor();
    s.writeStanding('a rule');
    expect(fs.readdirSync(path.join(appDir, 'briefs')).filter((f) => f.includes('.tmp-'))).toEqual([]);
  });
});
