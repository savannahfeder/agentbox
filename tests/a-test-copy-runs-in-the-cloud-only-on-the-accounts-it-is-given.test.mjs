// A TEST COPY RUNS IN THE CLOUD ONLY ON THE ACCOUNTS IT IS GIVEN (w-4465054f04, 2026-10-22).
//
// A power test on the cloud was asked to spend one fresh Claude plan and a
// little of a $20 Codex plan. The cloud had three accounts signed in: two
// Claude, one Codex. A copy of the app on real tools shares this Mac's list of
// cloud accounts, and a cloud run takes whichever account of its engine was
// used least recently, so half its Claude runs would have spent the other
// Claude account, which nobody offered. Narrowing the list for the copy alone
// is the only way: changing the shared list would change the person's own app.
//
// AGENTBOX_CLOUD_ACCOUNTS (emails, comma-separated) narrows the pick for a
// run that carries it; without it the pick is what it always was. Since
// w-dac993a554 that is the first account of the engine signed in, so the
// narrowing is still what lets a copy run on any other.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { recordCloudLogin, pickCloudLogin, cloudAccountsFrom } from '../main/cloud/logins.mjs';
import { cloudAccountKeys } from '../.claude/skills/verify-agentbox/scripts/live.mjs';
import { loginForCloudRun } from '../main/cloud/run-cli.mjs';

let home;
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-only-'));
  // a was signed in first, so a pick with no narrowing takes it every time.
  recordCloudLogin('claude', 'acct-a', { id: 'A', email: 'fresh@example.com' }, { home });
  recordCloudLogin('claude', 'acct-b', { id: 'B', email: 'work@example.com' }, { home });
  recordCloudLogin('codex', 'acct-c', { id: 'C', email: 'fresh@example.com' }, { home });
  pickCloudLogin('claude', { home, now: 1000 });
  pickCloudLogin('claude', { home, now: 2000 });
});
afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

describe('narrowing the cloud accounts a run may use', () => {
  it('takes only a named account, even when another was signed in first', () => {
    for (const now of [3000, 4000, 5000]) {
      expect(pickCloudLogin('claude', { home, now, only: ['work@example.com'] }).email).toBe('work@example.com');
    }
  });

  it('matches the email whatever its case, and with spaces around it', () => {
    expect(pickCloudLogin('claude', { home, now: 3000, only: cloudAccountsFrom({ AGENTBOX_CLOUD_ACCOUNTS: ' Fresh@Example.com , other@example.com' }) }).email).toBe('fresh@example.com');
  });

  it('finds nothing when no account of that engine is named, rather than falling back to one that is not', () => {
    expect(pickCloudLogin('claude', { home, now: 3000, only: ['nobody@example.com'] })).toBe(null);
  });

  it('narrows each engine on its own: the same email names a Codex account too', () => {
    expect(pickCloudLogin('codex', { home, now: 3000, only: ['fresh@example.com'] }).email).toBe('fresh@example.com');
  });

  // A Claude login in the cloud says its organization and not its email, so
  // on the first real run neither Claude account matched by email and the
  // thread stopped with "no Claude account is signed in for the cloud yet".
  it('takes an account named by its key, for a login whose record carries no email', () => {
    recordCloudLogin('claude', 'acct-d', { id: 'D', org: 'org-1' }, { home });
    expect(pickCloudLogin('claude', { home, now: 3000, only: ['acct-d'] }).key).toBe('acct-d');
  });

  it('without a list, takes the first account signed in, as every cloud run does', () => {
    for (const now of [3000, 4000]) expect(pickCloudLogin('claude', { home, now }).email).toBe('fresh@example.com');
  });
});

describe('the list a run carries', () => {
  it('is absent when the variable is unset or blank', () => {
    expect(cloudAccountsFrom({})).toBe(null);
    expect(cloudAccountsFrom({ AGENTBOX_CLOUD_ACCOUNTS: '  ' })).toBe(null);
  });

  it('is the emails, lower-cased, empty entries dropped', () => {
    expect(cloudAccountsFrom({ AGENTBOX_CLOUD_ACCOUNTS: 'A@x.com,,b@y.com ' })).toEqual(['a@x.com', 'b@y.com']);
  });

  it('is the keys of the accounts the emails name, a Claude one found through its organization as the menu finds it', () => {
    const login = (dir, email, org) => {
      fs.mkdirSync(path.join(home, dir), { recursive: true });
      fs.writeFileSync(path.join(home, dir, '.claude.json'), JSON.stringify({ oauthAccount: { emailAddress: email, accountUuid: `u-${dir}`, organizationUuid: org } }));
    };
    login('.claude', 'fresh@example.com', 'org-fresh');
    login('.claude-2', 'work@example.com', 'org-work');
    recordCloudLogin('claude', 'acct-f', { id: 'F', org: 'org-fresh' }, { home });
    recordCloudLogin('claude', 'acct-w', { id: 'W', org: 'org-work' }, { home });
    const { keys, missing } = cloudAccountKeys(['Fresh@example.com', 'nobody@example.com'], { home });
    // acct-a and acct-c carry the email itself; acct-f is the same person by organization.
    expect(keys.sort()).toEqual(['acct-a', 'acct-c', 'acct-f']);
    expect(missing).toEqual(['nobody@example.com']);
  });

  it('is read by the cloud run from the run\'s own environment', () => {
    expect(loginForCloudRun('claude', { AGENTBOX_CLOUD_ACCOUNTS: 'work@example.com' }, { home, now: 3000 }).rec.email).toBe('work@example.com');
    const cli = fs.readFileSync(path.join(import.meta.dirname, '..', 'main', 'cloud', 'run-cli.mjs'), 'utf8');
    expect(cli).toMatch(/loginForCloudRun\(engine, env\)/);
  });
});
