// AN AGENT IS TOLD THE KEYS THE APP HAS TODAY.
//
// What broke (w-7ec8553e23, 2026-10-04): asked for a reminder, an agent
// answered "When should this come back to you? Press S on this task and type
// a time." S had stopped scheduling on 2026-10-01; it shows the summary now,
// and L is later. Nothing the app hands a session said what its keys are, so
// the agent went by a memory one of its own sessions saved on 2026-09-10
// ("tell her to press S on the row"), three weeks before the key moved. Read
// off that session's transcript: the memory file was the only place in the
// run that said S.
//
// So every run is now handed the app's keys, read off the same list the
// Settings page draws (shared/shortcuts.mjs), with a line saying a remembered
// key that disagrees is out of date. One list, so the next key that moves
// reaches the agents the moment it reaches the page.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';
import { SHORTCUTS, keysForAgents } from '../shared/shortcuts.mjs';

let appDir;
let dataDir;

const supervisor = () => {
  const s = Object.create(Supervisor.prototype);
  s.appDir = appDir;
  s.dataDir = dataDir;
  s.userDir = dataDir;
  s.config = { sessionArgs: ['--allowedTools', 'mcp__agentbox'] };
  s.buildBrief = () => 'THE BRIEF';
  return s;
};

const item = (over = {}) => ({ id: 'w-1', product: 'acme', title: 'remind me', ...over });
const product = { slug: 'acme', name: 'Acme', dir: '/tmp/acme-nowhere', repoPath: null };

const injected = (args) => {
  const at = args.indexOf('--append-system-prompt');
  return at === -1 ? undefined : args[at + 1];
};

const shipDefault = (text) => {
  fs.mkdirSync(path.join(appDir, 'briefs'), { recursive: true });
  fs.writeFileSync(path.join(appDir, 'briefs', 'message-rules.md'), text, 'utf8');
};

beforeEach(() => {
  appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'keys-app-'));
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'keys-data-'));
});
afterEach(() => {
  fs.rmSync(appDir, { recursive: true, force: true });
  fs.rmSync(dataDir, { recursive: true, force: true });
});

/** The line a block gives one key, so a test can ask what a letter does. */
const lineFor = (text, cap) => text.split('\n').find((l) => l.startsWith(`- ${cap}:`) || l.startsWith(`- ${cap} `));

describe('the keys block', () => {
  it('says L puts a task off until later', () => {
    expect(lineFor(keysForAgents(), 'L')).toMatch(/Put the task off until a time you pick/);
  });

  it('says S is the summary, and nothing about S schedules', () => {
    const s = lineFor(keysForAgents(), 'S');
    expect(s).toMatch(/summary/i);
    expect(s).not.toMatch(/snooze|later|schedul|put .* off/i);
  });

  it('says a key remembered from before is out of date', () => {
    expect(keysForAgents()).toMatch(/out of date/);
  });

  // Exhaustive by construction: every row the Settings page draws is in what
  // the agent is told, so a key moved on the page cannot stay behind here.
  it('carries every row of the shortcuts page', () => {
    const text = keysForAgents();
    for (const g of SHORTCUTS) for (const k of g.keys) expect(text).toContain(k.what);
  });
});

describe('who is told', () => {
  it('a new run', () => {
    shipDefault('Line one is the ask, in bold.');
    const sys = injected(supervisor().spawnPlan(item(), product, {}).args);
    expect(lineFor(sys, 'L')).toMatch(/off until/);
  });

  it('a resumed thread carrying a reply', () => {
    shipDefault('Line one is the ask, in bold.');
    const { args } = supervisor().spawnPlan(item({ answer: 'yes' }), product, {
      continuation: true, resumeSessionId: 'session-abc',
    });
    expect(lineFor(injected(args), 'L')).toMatch(/off until/);
  });

  // The keys ride with the app's own rules and never on their own, so the
  // standing rule that an empty instruction adds no flag at all still holds.
  it('nobody, when the app ships no rules at all', () => {
    expect(supervisor().spawnPlan(item(), product, {}).args).not.toContain('--append-system-prompt');
  });
});
