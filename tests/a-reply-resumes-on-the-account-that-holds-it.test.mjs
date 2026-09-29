// SHE HOLDS TWO CLAUDE LOGINS, AND A SESSION LIVES ON EXACTLY ONE OF THEM.
//
// The cause was one missing half of a session id: a map recorded the id and
// not the account, spawnWorker round-robined the account, and a reply that
// landed on the other login handed `--resume` an id that home had never heard
// of. Claude Code printed "No conversation found with session ID" and exited in
// under a second with `result: ''`, and the writeback, which tested only for
// null, wrote a placeholder over the answer she was reading.
//
// Measured on her own store the morning she filed it: all 21 of her own threads
// had their transcript in exactly one home and none in both, 15 under the
// default login and 6 under the second. 37 of the 124 results ever written on
// those rows were that placeholder, and all 33 traces behind them printed the
// same "No conversation found" line.
//
// THIS FILE USED TO SAY "PERSONAL" EVERYWHERE and it was rewritten when personal
// projects were deleted (w-d19d6d387c, 2026-09-22). The rule it pins outlived
// them, because the wake sweep resumes an id nobody recorded an account for: a
// resume goes to the account that holds the transcript, found on disk when it
// was never written down, and asks for no account when no home holds it.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';

let tmp, second, home;

// A transcript where the CLI keeps one: <home>/projects/<cwd with every
// character that is not a letter or a digit turned into a dash>/<id>.jsonl.
function putTranscript(profileHome, cwd, sessionId) {
  const dir = path.join(profileHome, 'projects', String(cwd).replace(/[^a-zA-Z0-9]/g, '-'));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${sessionId}.jsonl`), '{}\n');
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-two-accounts-'));
  // The default profile is the CLI's own home, which the supervisor reads off
  // os.homedir; the test drives it there so nothing has to be stubbed.
  home = path.join(os.homedir(), '.claude');
  second = path.join(tmp, 'claude-second');
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

const productDir = () => path.join(tmp, 'acme');
const product = () => ({ slug: 'acme', name: 'Acme', dir: productDir() });

function makeSupervisor() {
  const store = { listItems: () => [], listProducts: () => [product()], isDue: () => true };
  const sup = new Supervisor({ storeRoot: tmp, authProfiles: ['default', second] }, store, tmp);
  sup._saveState = () => {};
  return sup;
}

const row = (extra = {}) => ({ id: 'w-1', product: 'acme', title: 'Reply Alisha Jain for tax stuff', ...extra });

describe('which account a resumed reply goes back to', () => {
  it('picks the account whose home actually holds the transcript', () => {
    const sup = makeSupervisor();
    putTranscript(second, productDir(), 'sess-on-the-second');
    const plan = sup.spawnPlan(row({ answer: 'continue' }), product(), {
      continuation: true, resumeSessionId: 'sess-on-the-second',
    });
    expect(plan.args[plan.args.indexOf('--resume') + 1]).toBe('sess-on-the-second');
    // The whole bug in one assertion: before this, the account was whatever the
    // round robin happened to be on.
    expect(plan.resumeProfile).toBe(second);
  });

  it('believes the row chat itself before it goes looking', () => {
    const sup = makeSupervisor();
    sup.rowSessionFor = (item) => (item.id === 'w-1' ? { sessionId: 'sess-abc', profile: second, engine: 'claude' } : null);
    const plan = sup.spawnPlan(row({ answer: 'continue' }), product(), { continuation: true });
    expect(plan.args[plan.args.indexOf('--resume') + 1]).toBe('sess-abc');
    expect(plan.resumeProfile).toBe(second);
  });

  it('a session no home holds asks for no account, which is the old behaviour', () => {
    const sup = makeSupervisor();
    const plan = sup.spawnPlan(row({ answer: 'continue' }), product(), {
      continuation: true, resumeSessionId: 'sess-vanished',
    });
    expect(plan.resumeProfile).toBe(null);
  });

  it('a fresh session asks for no account either: there is nothing to resume', () => {
    const sup = makeSupervisor();
    const plan = sup.spawnPlan(row(), product(), { continuation: false });
    expect(plan.args).not.toContain('--resume');
    expect(plan.resumeProfile).toBe(null);
  });

  it('finds the default login too, and names it the way spawnWorker does', () => {
    const sup = makeSupervisor();
    const id = `sess-default-${process.pid}`;
    putTranscript(home, productDir(), id);
    try {
      const plan = sup.spawnPlan(row({ answer: 'continue' }), product(), {
        continuation: true, resumeSessionId: id,
      });
      expect(plan.resumeProfile).toBe('default');
    } finally {
      fs.rmSync(path.join(home, 'projects', productDir().replace(/[^a-zA-Z0-9]/g, '-')), { recursive: true, force: true });
    }
  });
});

describe('what a run is allowed to write on her row', () => {
  it('a clean run writes, a dead one does not', () => {
    const sup = makeSupervisor();
    expect(sup.speaksForTheSession({ result: 'Here are the four documents.', resultIsError: false })).toBe(true);
    // The exact shape of a resume that missed: exit 1, no words, is_error.
    expect(sup.speaksForTheSession({ result: '', resultIsError: true })).toBe(false);
    expect(sup.speaksForTheSession({ result: 'API Error: 500', resultIsError: true })).toBe(false);
    // A session killed mid-flight still writes nothing, as it always has.
    expect(sup.speaksForTheSession({ result: null })).toBe(false);
  });

  it('a run that finished with nothing to say is still allowed the placeholder', () => {
    const sup = makeSupervisor();
    expect(sup.speaksForTheSession({ result: '', resultIsError: false })).toBe(true);
  });

  it('a dead run is left to the delivery retry, which is what says why', () => {
    const sup = makeSupervisor();
    const item = { id: 'w-1', product: 'acme', answer: 'continue', updatedAt: 1 };
    const dead = { result: '', resultIsError: true };
    // Not delivered, so her answer is carried to a fresh run rather than
    // buried under a placeholder that ends the thread.
    expect(sup.settleDelivery(item, 'continue', dead, null)).toBe('retrying');
  });
});
