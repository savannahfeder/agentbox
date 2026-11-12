// A POWER TEST STOPS ONCE WHEN ITS CODEX IS REFUSED (w-d0357badd1).
//
// What broke (2026-11-11): on a cloud machine the testers' Codex login said
// "Logged in using ChatGPT" to `codex login status`, the only check power-test
// made, while OpenAI refused every request with it (401, token_expired). Both
// testers were started anyway and each stopped in its first stretch as signed
// out. Measured from that run's report; `codex login status` never sends a
// request ("Authentication is checked when you send a request", in Codex's own
// strings), so it cannot tell a refused sign-in from a good one.
//
// Now the script makes one tiny real request first and stops with one sentence
// that says why, before any tester starts.
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CODEX_CHECK_ARGV, codexCheckFailed } from '../.claude/skills/power-test/scripts/codex-tester.mjs';

const script = fs.readFileSync(new URL('../.claude/skills/power-test/scripts/power-test.mjs', import.meta.url), 'utf8');

describe('the check before any tester starts', () => {
  it('is a real request, not `codex login status`', () => {
    expect(CODEX_CHECK_ARGV[0]).toBe('exec');
    expect(CODEX_CHECK_ARGV).toContain('--ephemeral');
    expect(script).toMatch(/run\('codex', CODEX_CHECK_ARGV/);
    expect(script).not.toMatch(/run\('codex', \['login', 'status'\]/);
  });

  it('passes a login that answers', () => {
    expect(codexCheckFailed({ code: 0, out: 'ok' }, { home: '/h/.codex' })).toBeNull();
  });

  it('a refused sign-in says so, and that login status is no proof', () => {
    const said = codexCheckFailed({ code: 1, out: 'ERROR: unexpected status 401 Unauthorized: token_expired' }, { home: '/h/.codex' });
    expect(said).toMatch(/OpenAI refuses the testers' Codex sign-in at \/h\/\.codex/);
    expect(said).toMatch(/even though `codex login status` says signed in/);
    expect(said).toMatch(/CODEX_HOME=\/h\/\.codex codex login/);
  });

  it('on a cloud machine, points at the cloud menu and the computer instead of a sign-in here', () => {
    const said = codexCheckFailed({ code: 1, out: 'workspace routing discovery unauthorized (401)' }, { home: '/opt/agent/.codex', onCloud: true });
    expect(said).toMatch(/Sign in again in the cloud menu/);
    expect(said).toMatch(/run the testers on the computer/);
    expect(said).not.toMatch(/CODEX_HOME=\S+ codex login/);
  });

  it('any other failure stops too, quoting what Codex said', () => {
    const said = codexCheckFailed({ code: 1, out: 'You have hit your usage limit.' }, { home: '/h/.codex' });
    expect(said).toMatch(/Codex at \/h\/\.codex could not answer one request: ".*usage limit/);
  });
});
