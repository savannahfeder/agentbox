// POWER TESTERS SEND WORK TO THE REAL CODEX.
//
// What broke (2026-11-10): a thread set to a Codex model was started on Claude
// Code 64 times and never ran, and the person only found it on a thread they
// cared about, because they do not use Codex themselves. No power test could
// have caught it: 48 of the last 50 ran on stand-ins (measured off the reports
// in /tmp/agentbox-verify/runs), and a stand-in copy's Codex is the codex
// binary on a scripted model with an empty login. No real login, no plan, no
// list of the models a login has. `--real` was the only way to meet the real
// Codex, and it spends the person's Claude plan too, so it was rarely asked for.
//
// Now a copy for someone who uses Codex gets the real Codex on the testers' own
// Codex login (the plan kept for testing), while Claude Code stays a stand-in
// and costs nothing. Testers are told the Codex agents are real and to send at
// least half their work there.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const { copyConfig } = await import('../.claude/skills/verify-agentbox/scripts/live.mjs');
const { chaosPlan, testerPrompt } = await import('../.claude/skills/power-test/scripts/plan.mjs');
const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const POWER = read('.claude/skills/power-test/scripts/power-test.mjs');
const LIVE = read('.claude/skills/verify-agentbox/scripts/live.mjs');

const person = { name: 'Priya', role: 'founding engineer', text: 'You build things.', atOnce: 4, day: ['Morning'], codex: true, knowsKeys: true, projects: ['api'] };
const prompt = (extra) => testerPrompt({ person, browse: 'app', diary: 'diary', shots: '/tmp/s', round: 1, totalMinutes: 60, minutesLeft: 60, roundMinutes: 20, fraction: 0, diaryTail: [], issues: [], notYet: [], ...extra });

describe('a copy with the real Codex', () => {
  it('points the app at the real Codex login, not a scripted one', () => {
    const cfg = copyConfig({ storeRoot: '/s', claudeBin: '/i/bin/claude', codexBin: '/usr/local/bin/codex', codexHome: '/Users/x/.codex-2', codexReal: true });
    expect(cfg).toMatchObject({ claudeBin: '/i/bin/claude', codexBin: '/usr/local/bin/codex', codexHome: '/Users/x/.codex-2' });
  });

  it('starts no scripted Codex model over it', () => {
    expect(LIVE).toMatch(/if \(state\.codexHome && !state\.codexReal\)/);
    expect(LIVE).toMatch(/const realCodexHome = value\('real-codex'\)/);
  });

  // Since 2026-11-11 a power test is on real plans throughout unless the person
  // agreed to stand-ins (tests/a-power-test-runs-on-real-plans-unless-the-person-agreed);
  // on such a run Codex stays real on the testers' login.
  it('is what a stand-in power test asks for, for people who use Codex, on the testers\' login', () => {
    expect(POWER).toMatch(/person\.codex && codexReal \? \['--real-codex', login\.home\] : \[\]/);
  });
});

describe('what goes wrong around the real Codex', () => {
  it('does not pretend to run it out of usage, as only the scripted one can be', () => {
    const scripted = chaosPlan('normal', 60 * 60_000, { codex: true });
    expect(scripted.some((e) => e.kind === 'codex-out')).toBe(true);
    const realCodex = chaosPlan('normal', 60 * 60_000, { codex: true, codexReal: true });
    expect(realCodex.some((e) => e.kind === 'codex-out')).toBe(false);
    // The Claude stand-in's troubles stay.
    expect(realCodex.some((e) => e.kind !== 'codex-out' && e.out?.length)).toBe(true);
  });
});

describe('what the tester is told', () => {
  it('says the Codex agents are real and asks for half the work there', () => {
    const said = prompt({ codexReal: true });
    expect(said).toMatch(/Codex agents are real/);
    expect(said).toMatch(/at least half/);
    expect(said).toMatch(/Claude Code agents are stand-ins/);
  });

  it('must NOT say so on a copy with no real Codex', () => {
    expect(prompt({})).not.toMatch(/Codex agents are real|at least half/);
  });
});
