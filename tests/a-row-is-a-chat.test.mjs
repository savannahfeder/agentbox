// A ROW IS A CHAT: HER REPLY GOES BACK TO THE SESSION THAT WROTE TO HER.
//
// What it replaces: a reply on a product row threw the finished session away
// and briefed a stranger with a transcript of the whole thread to catch up on.
// Measured on her machine across 2,789 runs: 2,321 were replies like that, and
// in the median one 65% of the first twenty files it opened had already been
// opened by the run before it on the same row, which then read for 206 seconds
// before it wrote anything.
//
// Nothing is kept running between her replies. What is kept is one line per row
// in the supervisor's state file, which is the whole of what she asked about.
//
// PROVEN AGAINST THE REAL BINARY (2.1.251) BEFORE THIS WAS WIRED UP: a session
// resumed with `--resume` keeps the SAME session id, and answers from memory.
// A probe read a fact out of a file, the file was deleted, and the resumed run
// gave the fact back in one turn with no tool calls.
//
// Every guard below fails safe: the worst case of each one is a fresh brief,
// which is exactly the behaviour every row had before this existed.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';
import { Name } from '../shared/product-name.mjs';

let tmp, second, home;

// A transcript where the CLI keeps one: <home>/projects/<cwd with every
// character that is not a letter or a digit turned into a dash>/<id>.jsonl.
function putTranscript(profileHome, cwd, sessionId) {
  const dir = path.join(profileHome, 'projects', String(cwd).replace(/[^a-zA-Z0-9]/g, '-'));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${sessionId}.jsonl`), '{}\n');
}

const appFolder = () => path.join(tmp, 'agentbox');
const appProduct = () => ({ slug: 'agentbox', name: Name, dir: appFolder() });
const personalDir = () => path.join(tmp, 'personal');
const personalProduct = () => ({ slug: 'personal', name: 'Personal', dir: personalDir() });

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-row-chat-'));
  // Desktop-launch verification exposed writes into the real CLI home
  // on 2026-10-07. This account belongs to the fixture, like the second one.
  vi.spyOn(os, 'homedir').mockReturnValue(tmp);
  home = path.join(os.homedir(), '.claude');
  second = path.join(tmp, 'claude-second');
  fs.mkdirSync(appFolder(), { recursive: true });
  fs.mkdirSync(personalDir(), { recursive: true });
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(tmp, { recursive: true, force: true });
});

function makeSupervisor() {
  const store = {
    listItems: () => [],
    listProducts: () => [appProduct(), personalProduct()],
    isDue: () => true,
  };
  const sup = new Supervisor({
    storeRoot: tmp,
    authProfiles: ['default', second],
  }, store, tmp);
  sup._saveState = () => {};
  return sup;
}

// A row she has replied on, which is the only case this feature is about.
const answered = (over = {}) => ({
  id: 'w-1', product: 'agentbox', title: 'Keeping the session alive between your replies',
  answer: 'go ahead and make this change', ...over,
});

const resumeArg = (plan) => (plan.args.includes('--resume')
  ? plan.args[plan.args.indexOf('--resume') + 1]
  : null);
const promptOf = (plan) => plan.args[plan.args.indexOf('-p') + 1];

describe('a row remembers the session that worked it', () => {
  it('records a product row after a clean finish, with the account it ran on', () => {
    const sup = makeSupervisor();
    sup.rememberRowSession(answered(), {
      sessionId: 'sess-1', cwd: appFolder(), profile: second, startedAt: 1000,
    });
    expect(sup._rowSessions['w-1']).toMatchObject({
      sessionId: 'sess-1', product: 'agentbox', cwd: appFolder(), profile: second,
    });
  });

  // A personal row was skipped here, because it had a session map of its own
  // and two maps resuming one thread would be two sessions on it. Personal
  // projects are deleted (w-d19d6d387c, 2026-09-22) and every row is written
  // into this one map.

  it('writes nothing when there is no id to write', () => {
    const sup = makeSupervisor();
    sup.rememberRowSession(answered(), { sessionId: null, cwd: appFolder(), profile: 'default' });
    expect(sup._rowSessions['w-1']).toBeUndefined();
  });

  it('survives a restart, which is the point of it being on disk at all', () => {
    const sup = makeSupervisor();
    sup._saveState = Supervisor.prototype._saveState.bind(sup);
    sup.rememberRowSession(answered(), {
      sessionId: 'sess-1', cwd: appFolder(), profile: 'default', startedAt: 1000,
    });
    sup._saveState();
    const again = makeSupervisor();
    expect(again._rowSessions['w-1']?.sessionId).toBe('sess-1');
  });
});

describe('her reply goes back to that session', () => {
  it('resumes the row chat and says so in the words for a chat, not for a crash', () => {
    const sup = makeSupervisor();
    putTranscript(second, appFolder(), 'sess-1');
    sup._rowSessions['w-1'] = {
      sessionId: 'sess-1', product: 'agentbox', cwd: appFolder(), profile: second, lastUsedAt: 1,
    };

    const plan = sup.spawnPlan(answered(), appProduct(), { continuation: true });

    expect(resumeArg(plan)).toBe('sess-1');
    // The account is half of a session id. A round-robin pick here hands
    // `--resume` an id the other home has never heard of.
    expect(plan.resumeProfile).toBe(second);
    const prompt = promptOf(plan);
    expect(prompt).toContain('The founder has replied on the work item');
    expect(prompt).toContain('go ahead and make this change');
    // It must not tell a session that finished cleanly that it was interrupted:
    // that sends it looking for a half-done step it never left.
    expect(prompt).not.toContain('was interrupted');
    // And it must not re-brief. A second copy of the brief, arriving after
    // everything the session already read, reads as an instruction to start
    // over, which is the restart this whole change exists to avoid.
    expect(prompt).not.toContain('# How to work');
  });

  it('carries what she attached to the reply, the one thing the session cannot have', () => {
    const sup = makeSupervisor();
    putTranscript(home, appFolder(), 'sess-att');
    sup._rowSessions['w-1'] = {
      sessionId: 'sess-att', product: 'agentbox', cwd: appFolder(), profile: 'default', lastUsedAt: 1,
    };
    fs.mkdirSync(path.join(appFolder(), 'attachments'), { recursive: true });
    fs.writeFileSync(path.join(appFolder(), 'attachments', 'shot.png'), 'x');

    const plan = sup.spawnPlan(
      answered({ answer: 'see this ![shot](attachments/shot.png)' }),
      appProduct(),
      { continuation: true }
    );
    expect(promptOf(plan)).toContain('attachments/shot.png');
  });
});

describe('what it refuses to resume, each one falling back to a fresh brief', () => {
  const refuses = (name, setup, item = answered()) => it(name, () => {
    const sup = makeSupervisor();
    setup(sup);
    const plan = sup.spawnPlan(item, appProduct(), { continuation: true });
    expect(resumeArg(plan)).toBe(null);
  });

  const good = (sup, over = {}) => {
    putTranscript(home, appFolder(), 'sess-1');
    sup._rowSessions['w-1'] = {
      sessionId: 'sess-1', product: 'agentbox', cwd: appFolder(), profile: 'default', lastUsedAt: 1, ...over,
    };
  };

  refuses('a row it has never seen', () => {});

  // Claude Code deletes its own transcripts after a month, so this is a case
  // that WILL arrive on any row she comes back to later. `--resume` on a
  // vanished id exits in about a second, and this file reads a spawn that dies
  // in seconds as a fast exit: three of those arm a fleet-wide spawn cooldown.
  refuses('a session whose transcript has been cleaned up', (sup) => {
    sup._rowSessions['w-1'] = {
      sessionId: 'sess-gone', product: 'agentbox', cwd: appFolder(), profile: 'default', lastUsedAt: 1,
    };
  });

  // The map is keyed on the row id alone, and ids are unique per product.
  refuses('a chat belonging to a different product', (sup) => good(sup, { product: 'other' }));

  // The transcript lives under a name made from the old path, so resuming would
  // run the session in one place with a memory of another.
  refuses('a chat whose folder has moved under it', (sup) => good(sup, { cwd: '/somewhere/else' }));

  // A cancel is not a reply.
  refuses('a withdrawn reply', (sup) => good(sup), answered({ answer: '(withdrawn)' }));

  refuses('a row with no answer on it at all', (sup) => good(sup), answered({ answer: '' }));

  it('fresh work, which is a row nobody has replied on, is briefed as it always was', () => {
    const sup = makeSupervisor();
    putTranscript(home, appFolder(), 'sess-1');
    sup._rowSessions['w-1'] = {
      sessionId: 'sess-1', product: 'agentbox', cwd: appFolder(), profile: 'default', lastUsedAt: 1,
    };
    const plan = sup.spawnPlan(answered({ answer: '' }), appProduct(), { continuation: false });
    expect(resumeArg(plan)).toBe(null);
    expect(promptOf(plan)).toContain('w-1');
  });

  it('the wake sweep still wins outright, and still gets the interrupted wording', () => {
    const sup = makeSupervisor();
    putTranscript(home, appFolder(), 'sess-1');
    putTranscript(home, appFolder(), 'sess-interrupted');
    sup._rowSessions['w-1'] = {
      sessionId: 'sess-1', product: 'agentbox', cwd: appFolder(), profile: 'default', lastUsedAt: 1,
    };
    // That path knows which session it interrupted: a run that never finished,
    // not one that finished and is being written back to.
    const plan = sup.spawnPlan(answered(), appProduct(), {
      continuation: true, resumeSessionId: 'sess-interrupted',
    });
    expect(resumeArg(plan)).toBe('sess-interrupted');
    expect(promptOf(plan)).toContain('was interrupted');
  });
});

describe('what it costs her computer, which is what she asked', () => {
  it('forgets the oldest chats past the cap and keeps the newest', () => {
    const sup = makeSupervisor();
    const cap = Supervisor.ROW_SESSION_CAP;
    // All within the age window, so this test measures the count backstop only.
    for (let i = 0; i < cap + 25; i += 1) {
      sup._rowSessions[`w-${i}`] = {
        sessionId: `s-${i}`, product: 'agentbox', cwd: appFolder(), profile: 'default',
        lastUsedAt: Date.now() - (cap + 25 - i) * 1000,
      };
    }
    sup.pruneRowSessions();
    const left = Object.keys(sup._rowSessions);
    expect(left).toHaveLength(cap);
    expect(sup._rowSessions['w-0']).toBeUndefined();
    expect(sup._rowSessions['w-24']).toBeUndefined();
    expect(sup._rowSessions['w-25']).toBeDefined();
    expect(sup._rowSessions[`w-${cap + 24}`]).toBeDefined();
  });

  // Her question, 2026-08-30: is a count the right thing to forget on at all?
  // It is not. Claude Code deletes its own transcripts at thirty days, so past
  // that the entry is a pointer at nothing and keeping it only grows the file.
  it('forgets a chat older than the transcript it points at, whatever the count', () => {
    const sup = makeSupervisor();
    const day = 24 * 60 * 60 * 1000;
    sup._rowSessions['w-fresh'] = {
      sessionId: 's-fresh', product: 'agentbox', cwd: appFolder(), profile: 'default',
      lastUsedAt: Date.now() - 29 * day,
    };
    sup._rowSessions['w-aged'] = {
      sessionId: 's-aged', product: 'agentbox', cwd: appFolder(), profile: 'default',
      lastUsedAt: Date.now() - 31 * day,
    };
    // Written before this map recorded a last-used time: treated as old.
    sup._rowSessions['w-unknown'] = {
      sessionId: 's-unknown', product: 'agentbox', cwd: appFolder(), profile: 'default',
    };
    sup.pruneRowSessions();
    expect(sup._rowSessions['w-fresh']).toBeDefined();
    expect(sup._rowSessions['w-aged']).toBeUndefined();
    expect(sup._rowSessions['w-unknown']).toBeUndefined();
  });

  // The cap has to sit far above how deep in the list she actually replies.
  // MEASURED across her 1,603 real replies, 2026-08-30: the worst one sat 228
  // rows down, and 30 days of her rows at 29.8 a day is about 890.
  it('keeps a chat for more rows than thirty days of her work produces', () => {
    expect(Supervisor.ROW_SESSION_CAP).toBeGreaterThan(890);
  });

  // Caught by the suite the first time this was wired up: a supervisor built
  // without the constructor has no map at all, and a THROW here does not fall
  // back to a fresh brief, it takes the whole spawn down with it. Every other
  // guard in this feature returns null; this one has to as well.
  it('a supervisor with no map at all still plans a spawn, it does not throw', () => {
    const sup = makeSupervisor();
    delete sup._rowSessions;
    expect(() => sup.rowSessionFor(answered(), appProduct())).not.toThrow();
    expect(sup.rowSessionFor(answered(), appProduct())).toBe(null);
    expect(() => sup.pruneRowSessions()).not.toThrow();
    sup.rememberRowSession(answered(), {
      sessionId: 'sess-1', cwd: appFolder(), profile: 'default', startedAt: 1,
    });
    expect(sup._rowSessions['w-1']?.sessionId).toBe('sess-1');
  });

  it('holds nothing open: a remembered chat is a line of JSON and no process', () => {
    const sup = makeSupervisor();
    sup.rememberRowSession(answered(), {
      sessionId: '11111111-2222-3333-4444-555555555555',
      cwd: appFolder(), profile: 'default', startedAt: Date.now(),
    });
    // Nothing is running for it. `sessions` is the map of live child processes.
    expect(sup.sessions.size).toBe(0);
    // And this is the number on her card, measured rather than claimed: one
    // row's entry, serialised the way the state file serialises it.
    const bytes = Buffer.byteLength(JSON.stringify({ 'w-595f3ccad4': sup._rowSessions['w-1'] }));
    expect(bytes).toBeLessThan(400);
  });
});
