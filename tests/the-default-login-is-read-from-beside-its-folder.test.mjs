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
