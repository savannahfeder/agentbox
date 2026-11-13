// A POWER TESTER ON REAL PLANS SENDS MOST OF ITS WORK TO CODEX.
//
// What was wrong (2026-11-13): on real plans the tester was told to send "at
// least half" of its work to Codex, so up to half of every run spent the
// person's Claude plan, the one they keep for real work. Their words: the
// testers use "Claude Code, but mostly Codex, because that's just gotten more
// usage per subscription". Measured by reading testerPrompt's text for a
// Codex user on real plans.
//
// A stand-in run keeps "at least half": its Claude Code costs nothing.
import { describe, it, expect } from 'vitest';

const { testerPrompt } = await import('../.claude/skills/power-test/scripts/plan.mjs');

const person = { name: 'Priya', role: 'engineer', text: 'You build.', atOnce: 4, day: ['Morning'], codex: true, knowsKeys: true, projects: ['api'] };
const prompt = (extra) => testerPrompt({ person, browse: 'app', diary: 'diary', shots: '/tmp/s', round: 1, totalMinutes: 60, minutesLeft: 60, roundMinutes: 20, fraction: 0, diaryTail: [], issues: [], notYet: [], ...extra });

describe('a tester on real plans who uses Codex', () => {
  it('sends most of its work to Codex and Claude Code now and then', () => {
    const said = prompt({ real: true });
    expect(said).toMatch(/about four threads in five to Codex/);
    expect(said).toMatch(/Claude Code now and then/);
  });

  it('is no longer told only "at least half"', () => {
    expect(prompt({ real: true })).not.toMatch(/at least half/);
  });
});

describe('where it must NOT change', () => {
  it('a stand-in run, whose Claude Code is free, still asks for at least half', () => {
    expect(prompt({ codexReal: true })).toMatch(/at least half/);
  });

  it('a person without Codex is sent nowhere', () => {
    expect(prompt({ real: true, person: { ...person, codex: false } })).not.toMatch(/four threads in five|at least half/);
  });
});
