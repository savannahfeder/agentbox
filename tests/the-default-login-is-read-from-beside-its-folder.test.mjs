// THE DEFAULT LOGIN NAMES ITS ACCOUNT, EVEN THOUGH ITS FILE SITS BESIDE THE
// FOLDER RATHER THAN INSIDE IT.
//
// WHAT WAS WRONG, reported on PR 13: the Accounts page drew the default row with
// no email, while every row for a second login had one. The page cannot tell a
// person which subscription their primary login actually is, which is the whole
// reason it reads the file at all.
//
// HOW IT WAS MEASURED: Claude Code keeps the default login's `.claude.json` in
// the HOME folder, next to `~/.claude`, and keeps it INSIDE the folder only when
// that folder came from a `CLAUDE_CONFIG_DIR`. `accountIdentity` looked inside
// `~/.claude` in both cases, so on the ordinary Mac it found nothing.
//
// WHAT CAN SILENTLY BREAK: the fallback is applied to a NAMED folder too, and
// then a second login with no file of its own reports the default account's
// email -- one subscription shown as two, which is the exact confusion
// `duplicateAccountNote` exists to catch. The third expectation below is that.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { accountIdentity } from '../main/account-tooling.mjs';

describe('whose login the default account is', () => {
  it('reads the file beside the folder when the folder holds none', () => {
    const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-default-login-'));
    try {
      fs.mkdirSync(path.join(bare, '.claude'));
      expect(accountIdentity(null, { home: bare })).toBe(null);
      fs.writeFileSync(path.join(bare, '.claude.json'), JSON.stringify({ oauthAccount: { accountUuid: 'beside', emailAddress: 'beside@example.com' } }));
      expect(accountIdentity(null, { home: bare })).toEqual({ email: 'beside@example.com', accountUuid: 'beside' });
      expect(accountIdentity(path.join(bare, '.claude'), { home: bare })).toBe(null);
    } finally {
      fs.rmSync(bare, { recursive: true, force: true });
    }
  });

  it('prefers the file inside the folder when there is one', () => {
    const full = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-default-login-'));
    try {
      fs.mkdirSync(path.join(full, '.claude'));
      fs.writeFileSync(path.join(full, '.claude', '.claude.json'), JSON.stringify({ oauthAccount: { accountUuid: 'inside', emailAddress: 'inside@example.com' } }));
      fs.writeFileSync(path.join(full, '.claude.json'), JSON.stringify({ oauthAccount: { accountUuid: 'beside', emailAddress: 'beside@example.com' } }));
      expect(accountIdentity(null, { home: full })?.accountUuid).toBe('inside');
    } finally {
      fs.rmSync(full, { recursive: true, force: true });
    }
  });
});
