// The overnight Cloud test of 2026-11-15 spent a Codex login nobody gave it.
// The testers ran on the testing login named with --codex-home, but the app
// copies they drove started their own Codex agents on this Mac's default
// login (~/.codex), because live.mjs lends a copy another login only when
// VERIFY_CODEX_HOME is set, and three of five rounds were started without it.
// Measured on ~/.codex: 237 sessions in 15 hours, every one from a test copy,
// taking that login from 83% of its week to its limit until Wednesday.
// The power test now lends its copies the testers' login itself.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const script = fs.readFileSync(new URL('../.claude/skills/power-test/scripts/power-test.mjs', import.meta.url), 'utf8');
const live = fs.readFileSync(new URL('../.claude/skills/verify-agentbox/scripts/live.mjs', import.meta.url), 'utf8');

describe("a power test's copies run Codex on the testers' login", () => {
  it('passes the testers\' login to every copy it starts, restarts or stops', () => {
    const helper = script.slice(script.indexOf('const live = (name'), script.indexOf('};', script.indexOf('const live = (name')));
    expect(helper).toMatch(/VERIFY_CODEX_HOME: login\.home/);
  });

  it('decides the login before the first copy starts', () => {
    expect(script.indexOf('const login = testerLogin(')).toBeGreaterThan(-1);
    expect(script.indexOf('const login = testerLogin(')).toBeLessThan(script.indexOf("live(name, 'up'"));
  });

  it('is the setting a real copy takes its Codex login from', () => {
    expect(live).toMatch(/real && process\.env\.VERIFY_CODEX_HOME[\s\S]{0,200}codexHome = process\.env\.VERIFY_CODEX_HOME/);
  });
});
