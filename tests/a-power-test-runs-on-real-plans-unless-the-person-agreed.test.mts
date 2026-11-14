// A POWER TEST RUNS ON REAL PLANS UNLESS THE PERSON AGREED OTHERWISE.
//
// What broke (2026-11-10): 48 of the last 50 power tests ran their copies'
// threads on stand-in agents (counted off the reports in
// /tmp/agentbox-verify/runs), because stand-ins were the default and `--real`
// had to be asked for. Nobody told the person. A Codex thread then started 64
// times on the wrong agent in their real app, which no stand-in could ever
// show. Their words: "the testers are meant to use real plans, with the
// product like it actually works. that's 98% of the point. It should NEVER
// EVER have run without letting me know that and getting my explicit
// awareness."
//
// So real Claude Code and real Codex are the default, and a stand-in run must
// carry the person's own words agreeing to it (`--stand-ins "<their words>"`),
// which the run prints at its start and puts at the top of its report.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { agentMode, testerPrompt } = await import('../.claude/skills/power-test/scripts/plan.mjs');
const { writeReport } = await import('../.claude/skills/power-test/scripts/report.mjs');
const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const POWER = read('.claude/skills/power-test/scripts/power-test.mjs');

const AGREED = 'fine, use stand-ins for this one, I am out of Claude usage';

describe('which agents a power test runs on', () => {
  it('is the real Claude Code and Codex when nothing is said', () => {
    expect(agentMode({})).toEqual({ real: true, codexReal: false, standIns: null });
  });

  it('is stand-ins only with the person\'s words, and Codex stays real', () => {
    expect(agentMode({ standIns: AGREED })).toEqual({ real: false, codexReal: true, standIns: AGREED });
  });

  it('refuses stand-ins with no words, or with a flag where the words should be', () => {
    for (const standIns of ['', '   ', '--who', true]) expect(() => agentMode({ standIns })).toThrow(/their own words/);
  });

  it('refuses the stand-in cloud without agreement, and keeps Codex a stand-in there', () => {
    expect(() => agentMode({ standInCloud: true })).toThrow(/--stand-ins/);
    expect(agentMode({ standIns: AGREED, standInCloud: true })).toMatchObject({ real: false, codexReal: false });
  });

  it('refuses stand-ins on the real cloud, which has no stand-ins', () => {
    expect(() => agentMode({ standIns: AGREED, cloud: true })).toThrow(/cloud/);
    expect(agentMode({ cloud: true })).toMatchObject({ real: true });
  });

  it('is the one rule the script reads', () => {
    expect(POWER).toMatch(/agentMode\(\{ standIns: args\.includes\('--stand-ins'\) \? \(opt\('stand-ins'\) \?\? ''\) : null, standInCloud, cloud \}\)/);
    expect(POWER).not.toMatch(/const real = flag\('real'\)/);
  });
});

describe('a stand-in run says so', () => {
  const person = { slug: 'p', name: 'Priya', role: 'engineer', dir: '/nonexistent', rounds: 1, stopped: null, coverage: null };
  const report = (extra) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'power-report-'));
    const { file } = writeReport({ root, startedAt: 0, endedAt: 60_000, people: [person], ...extra });
    const text = fs.readFileSync(file, 'utf8');
    fs.rmSync(root, { recursive: true, force: true });
    return text;
  };

  it('at the top of its report, with the words that allowed it', () => {
    const text = report({ real: false, codexReal: true, standIns: AGREED });
    const top = text.split('\n').slice(0, 4).join('\n');
    expect(top).toMatch(/NOT real plans/);
    expect(top).toContain(AGREED);
  });

  it('must NOT say so on a real run', () => {
    expect(report({ real: true })).not.toMatch(/NOT real plans/);
  });

  it('and out loud when it starts', () => {
    expect(POWER).toMatch(/STAND-INS, NOT REAL PLANS/);
  });
});

describe('what a tester on real plans is told', () => {
  const p = { name: 'Priya', role: 'engineer', text: 'You build.', atOnce: 4, day: ['Morning'], codex: true, knowsKeys: true, projects: ['api'] };
  const prompt = (person, extra) => testerPrompt({ person, browse: 'app', diary: 'diary', shots: '/tmp/s', round: 1, totalMinutes: 60, minutesLeft: 60, roundMinutes: 20, fraction: 0, diaryTail: [], issues: [], notYet: [], real: true, ...extra });

  it('is told the agents are real and to send most of the work to Codex', () => {
    expect(prompt(p)).toMatch(/real Claude Code and Codex/);
    expect(prompt(p)).toMatch(/four threads in five to Codex/);
  });

  it('must NOT be sent to Codex when they do not use it', () => {
    expect(prompt({ ...p, codex: false })).not.toMatch(/Codex agents|four threads in five to Codex/);
  });
});
