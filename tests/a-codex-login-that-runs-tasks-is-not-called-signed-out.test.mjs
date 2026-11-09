// A CODEX LOGIN THAT RUNS TASKS IS NOT CALLED SIGNED OUT (F-194).
//
// What broke: Settings › Codex read "Not signed in · Finish signing in to use
// it" for a ChatGPT login whose `codex login status` said Logged in and which
// went on to finish a task. Refresh did not change it; a relaunch did. The card
// takes `signedIn` from `codexAccount`, which believed a running Codex's
// `account/read` answer of no account over the auth.json beside it, and kept
// that answer in memory until auth.json changed or the app restarted.
//
// How it was measured: QA session 38, screenshots b011-10 to b011-12, main
// 808ee3b3; then here, by remembering a null account against a real auth.json.
import { it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { codexAccount, rememberCodexAccount } from '../main/codex-account.mts';

const homes = [];
afterEach(() => { for (const h of homes.splice(0)) fs.rmSync(h, { recursive: true, force: true }); });

function homeWith(auth) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-signed-in-'));
  homes.push(home);
  if (auth) fs.writeFileSync(path.join(home, 'auth.json'), JSON.stringify(auth));
  return home;
}
const token = (claims) => `h.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.s`;
const SIGNED_IN = { auth_mode: 'chatgpt', tokens: { id_token: token({ email: 'a@example.com', 'https://api.openai.com/auth': { chatgpt_plan_type: 'plus' } }) } };

it('still names the account after Codex answered with none', () => {
  const home = homeWith(SIGNED_IN);
  rememberCodexAccount(home, null);
  expect(codexAccount(home)).toMatchObject({ email: 'a@example.com', plan: 'Plus' });
  rememberCodexAccount(home, undefined);
  expect(codexAccount(home)?.email).toBe('a@example.com');
});

it('still takes the plan Codex reports when it does name an account', () => {
  const home = homeWith(SIGNED_IN);
  rememberCodexAccount(home, { type: 'chatgpt', planType: 'pro', email: 'a@example.com' });
  expect(codexAccount(home)?.plan).toBe('Pro');
});

// The case that must stay signed out: no login in the folder at all.
it('is signed out when there is no auth.json', () => {
  const home = homeWith(null);
  rememberCodexAccount(home, null);
  expect(codexAccount(home)).toBeNull();
});
