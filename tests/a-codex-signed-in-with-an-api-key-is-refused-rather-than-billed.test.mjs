// A CODEX SIGNED IN WITH AN API KEY IS REFUSED, RATHER THAN BILLED.
//
// What broke (found 2026-10-15 by the verify skill's `codex-api-key-login`
// setup). Workers run on a person's subscription and never on a key: that is
// the app's rule, and the worker scrub takes OPENAI_* and CODEX_* out of every
// Codex worker's environment for it. But `codex login --with-api-key` keeps
// the key in auth.json (`auth_mode: "apikey"`), which Codex reads for itself,
// past the scrub. Measured with the real codex-cli 0.160.0 on a home laid out
// that way, against a stand-in model on loopback: the browser copy started
// the task, every request the worker sent was signed `Bearer sk-...` (6 of 6,
// the key, metered per call to whoever owns it), and the thread got the answer
// as if nothing were wrong.
//
// What it does now: a Codex login that is an API key is refused before the
// worker starts, with one sentence that says so and names the command that
// signs Codex in with a ChatGPT plan instead. The account leaves the rotation
// until auth.json changes, as a signed-out login does, so it is not retried
// in a loop.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { codexLoginMode, codexKeyRefusal } from '../main/codex-account.mjs';
import { codexHarness } from '../main/harnesses/codex.mjs';
import { troubleCause, deadRunSentence, needsHerHands, engineTroubleNote } from '../shared/spawn-trouble.mjs';

const homes = [];
afterEach(() => { for (const h of homes.splice(0)) fs.rmSync(h, { recursive: true, force: true }); });
const homeWith = (auth) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-key-'));
  homes.push(home);
  if (auth !== undefined) fs.writeFileSync(path.join(home, 'auth.json'), typeof auth === 'string' ? auth : JSON.stringify(auth));
  return home;
};
const chatgpt = { auth_mode: 'chatgpt', OPENAI_API_KEY: null, tokens: { id_token: 'a.b.c', access_token: 'a.b.c', refresh_token: 'r', account_id: 'x' } };

describe('which kind of login a Codex home holds', () => {
  it('an API-key login, the case that was billed', () => {
    expect(codexLoginMode(homeWith({ auth_mode: 'apikey', OPENAI_API_KEY: 'sk-verify-not-a-real-key' }))).toBe('apikey');
  });
  it('an older auth.json with no mode and only a key is a key too, as Codex reads it', () => {
    expect(codexLoginMode(homeWith({ OPENAI_API_KEY: 'sk-verify-not-a-real-key' }))).toBe('apikey');
  });
  it('a ChatGPT login is a plan, even with a key left beside its tokens', () => {
    expect(codexLoginMode(homeWith(chatgpt))).toBe('chatgpt');
    expect(codexLoginMode(homeWith({ ...chatgpt, OPENAI_API_KEY: 'sk-verify-not-a-real-key' }))).toBe('chatgpt');
  });
  it('no file, or one that is not JSON, is not a key', () => {
    expect(codexLoginMode(homeWith())).toBe(null);
    expect(codexLoginMode(homeWith('{not json'))).toBe(null);
    expect(codexKeyRefusal(homeWith())).toBe(null);
  });
});

describe('a worker on an API-key login never starts', () => {
  const sup = (home, spawned) => ({ _codexProfileHome: () => home, _spawnCodexWorker: () => { spawned.push(1); return 'real worker'; } });

  it('the harness hands back a worker that says why and exits, and Codex is never started', async () => {
    const spawned = [];
    const home = homeWith({ auth_mode: 'apikey', OPENAI_API_KEY: 'sk-verify-not-a-real-key' });
    const worker = codexHarness.spawn(sup(home, spawned), {}, { profile: 'default' });
    const said = [];
    worker.stderr.on('data', (d) => said.push(String(d)));
    const [code] = await new Promise((resolve) => worker.once('exit', (...a) => resolve(a)));
    expect(spawned).toEqual([]);
    expect(code).toBe(1);
    expect(said.join(' ')).toMatch(/API key/);
    expect(worker.kill()).toBe(false);
  });

  it('a ChatGPT login starts the real worker, untouched', () => {
    const spawned = [];
    expect(codexHarness.spawn(sup(homeWith(chatgpt), spawned), {}, { profile: 'default' })).toBe('real worker');
    expect(spawned).toEqual([1]);
  });

  it('what she reads names the key and the command, and it is not retried in a loop', () => {
    const line = codexKeyRefusal(homeWith({ auth_mode: 'apikey', OPENAI_API_KEY: 'sk-verify-not-a-real-key' }));
    expect(troubleCause(line)).toBe('api-key');
    expect(needsHerHands('api-key')).toBe(true);
    const sentence = deadRunSentence({ engineWord: 'Codex', cause: 'api-key' });
    expect(sentence).toMatch(/^Codex is signed in with an API key/);
    expect(sentence).toMatch(/codex login/);
    expect(sentence.split('.')[0].length).toBeLessThan(112);
    expect(engineTroubleNote('api-key')).toMatch(/codex login/);
  });

  it('the key itself is never in what she reads', () => {
    const line = codexKeyRefusal(homeWith({ auth_mode: 'apikey', OPENAI_API_KEY: 'sk-verify-not-a-real-key' }));
    expect(line).not.toMatch(/sk-verify/);
  });

  it('a signed-out Codex and a 401 still read as signed out, not as a key', () => {
    expect(troubleCause('unexpected status 401 Unauthorized: Missing bearer or basic authentication in header')).toBe('signed-out');
    expect(troubleCause('Invalid API key')).toBe('signed-out');
  });
});
