// WHICH CODEX ACCOUNT THIS MAC IS SIGNED INTO.
//
// THE CARD HAD A REASON FOR THE SILENCE AND THE REASON HAD EXPIRED. Both the
// component and its test said, in as many words, that `~/.codex/auth.json`
// carries a mode and an opaque account id and no email, so the question had no
// honest answer. Measured against codex-cli 0.153.4 on her Mac that day, the
// `id_token` in that same file carries `email`, `name`, and a ChatGPT plan.
// `codex login status` answers "Logged in using ChatGPT" and names nobody, so
// the file is the only source there is.
//
// AND NOTHING SECRET COMES OUT OF IT. That file also holds an access token, a
// refresh token and an API key. The reader returns five named fields and none of
// them is any of those, which is what the last test here is for.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { codexAccount, codexAuthFile } from '../main/codex-account.mjs';

/** A JWT's middle is plain base64url JSON, and that is all this builds. */
const jwt = (claims) => ['x', Buffer.from(JSON.stringify(claims)).toString('base64url'), 'y'].join('.');

const AUTH_CLAIM = 'https://api.openai.com/auth';

/**
 * Her file's shape, with her values replaced. The claim names are the ones
 *  really present on her Mac, read on 2026-09-18 without printing a value. */
function authFile(overrides = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-auth-'));
  const auth = {
    OPENAI_API_KEY: 'sk-secret-never-drawn',
    auth_mode: 'chatgpt',
    last_refresh: '2026-09-18T21:25:00Z',
    tokens: {
      access_token: 'access-secret-never-drawn',
      refresh_token: 'refresh-secret-never-drawn',
      account_id: '11111111-2222-3333-4444-555555555555',
      id_token: jwt({
        email: 'her@example.com',
        name: 'Her Name',
        [AUTH_CLAIM]: { chatgpt_plan_type: 'pro', chatgpt_account_id: 'acc-1' },
      }),
    },
    ...overrides,
  };
  fs.writeFileSync(path.join(home, 'auth.json'), JSON.stringify(auth));
  return home;
}

describe('reading who Codex is signed in as', () => {
  it('answers her question: the email, and the plan beside it', () => {
    const account = codexAccount(authFile());
    expect(account.email).toBe('her@example.com');
    expect(account.name).toBe('Her Name');
    expect(account.plan).toBe('Pro');
    expect(account.mode).toBe('chatgpt');
  });

  // A PLAN ID WE DO NOT KNOW IS PRINTED AS THE ID. Her own token reads "prolite",
  // which title-cases into "Prolite", a product name nobody at OpenAI has ever
  // used. Inventing a label is how a screen tells a confident lie about what
  // somebody is paying for.
  it('never invents a name for a plan it does not know', () => {
    const home = authFile({
      tokens: {
        account_id: 'a',
        id_token: jwt({ email: 'her@example.com', [AUTH_CLAIM]: { chatgpt_plan_type: 'prolite' } }),
      },
    });
    expect(codexAccount(home).plan).toBe('prolite');
    // AND IT IS MARKED AS CODEX'S WORD RATHER THAN OURS, so the screen can say
    // "Codex reports the plan as prolite" instead of "On the prolite plan",
    // which reads like our typo.
    expect(codexAccount(home).planNamed).toBe(false);
    expect(codexAccount(authFile()).planNamed).toBe(true);
  });

  // An API-key login has no email and no plan, and the reader says so rather
  // than drawing an empty row.
  it('answers what it can on a login with no id token', () => {
    const home = authFile({ auth_mode: 'apikey', tokens: { account_id: 'abc-123' } });
    const account = codexAccount(home);
    expect(account.email).toBe(null);
    expect(account.plan).toBe(null);
    expect(account.mode).toBe('apikey');
    expect(account.accountId).toBe('abc-123');
  });

  // Nobody signed in is an ordinary answer, and the card then reads exactly as
  // it did before any of this existed.
  it('answers null where nobody is signed in', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-none-'));
    expect(codexAccount(home)).toBe(null);
  });

  it('survives a file that is not json', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-junk-'));
    fs.writeFileSync(path.join(home, 'auth.json'), 'not json at all');
    expect(codexAccount(home)).toBe(null);
  });

  it('survives an id token that is not a jwt', () => {
    const home = authFile({ tokens: { account_id: 'a', id_token: 'nonsense' } });
    expect(codexAccount(home).accountId).toBe('a');
    expect(codexAccount(home).email).toBe(null);
  });

  // THE ONE THAT MATTERS. Three secrets go into that file and none of them may
  // come back out of this function, whatever else it learns to say.
  it('returns no token, no key and nothing else it was not asked for', () => {
    const account = codexAccount(authFile());
    expect(Object.keys(account).sort()).toEqual(['accountId', 'email', 'mode', 'name', 'plan', 'planNamed']);
    const printed = JSON.stringify(account);
    expect(printed).not.toMatch(/secret|sk-|access_token|refresh_token|OPENAI_API_KEY/i);
  });

  it('looks in the home it is given, and in ~/.codex when it is given none', () => {
    expect(codexAuthFile('/somewhere')).toBe(path.join('/somewhere', 'auth.json'));
    expect(codexAuthFile(null)).toBe(path.join(os.homedir(), '.codex', 'auth.json'));
  });
});
