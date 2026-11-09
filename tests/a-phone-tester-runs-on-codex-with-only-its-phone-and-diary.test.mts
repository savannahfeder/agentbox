// A PHONE TESTER RUNS ON CODEX WITH ONLY ITS PHONE AND DIARY (w-e4d49a1539).
//
// The product loop's synthetic users test the phone app through its browser
// preview, on the Codex plan the person wants spent. Three things decide
// whether a day of that is worth anything, and each is pinned here:
// - a Codex tester keeps its session log (no --ephemeral), because that log is
//   where the pacer reads how much of the week is gone, and it may reach the
//   local preview from its sandbox (testers never run on Claude Code:
//   tests/every-synthetic-tester-runs-on-codex);
// - every stretch after the first is told what was already logged, so testers
//   confirm or move on instead of filing one bug six times;
// - the report puts broken before confusing, and the most seen first.

import { describe, expect, it } from 'vitest';
import { phonePrompt, rankIssues, testerArgv } from '../.claude/skills/product-loop/scripts/workday.mjs';

const dir = '/tmp/loop/founder';
const person = { name: 'Ana Ruiz', role: 'technical co-founder', text: 'You check in between calls.' };

describe('how a tester starts', () => {
  it('on Codex, in its own folder, sandboxed, with the local network open and its log kept', () => {
    const argv = testerArgv('codex', { dir, prompt: 'go', last: `${dir}/last.txt` });
    expect(argv.slice(0, 3)).toEqual(['exec', '-C', dir]);
    expect(argv).toContain('workspace-write');
    expect(argv).toContain('sandbox_workspace_write.network_access=true');
    expect(argv).not.toContain('--ephemeral');
    expect(argv).not.toContain('--dangerously-bypass-approvals-and-sandbox');
    expect(argv.at(-1)).toBe('go');
  });

  it('refuses any engine but Codex', () => {
    expect(() => testerArgv('claude', { dir, prompt: 'go' })).toThrow(/synthetic testers run on codex/);
    expect(() => testerArgv('gemini', { dir, prompt: 'go' })).toThrow(/synthetic testers run on codex/);
  });
});

describe('what a tester is told', () => {
  it('who they are, the phone in their hand and its two commands', () => {
    const p = phonePrompt(person, { dir, minutes: 30 });
    expect(p).toMatch(/You are Ana Ruiz/);
    expect(p).toMatch(/on your iPhone/);
    expect(p).toContain(`${dir}/phone`);
    expect(p).toContain(`${dir}/diary`);
    expect(p).not.toMatch(/Already logged/);
  });

  it('what was already logged, after the first stretch', () => {
    const p = phonePrompt(person, { dir, minutes: 30, focus: 'replying to options', logged: [{ n: 1, severity: 'broken', title: 'Allow card covers the options' }] });
    expect(p).toMatch(/Lean on this today: replying to options/);
    expect(p).toMatch(/1\. \[broken\] Allow card covers the options/);
    expect(p).toMatch(/diary again/);
  });
});

describe('the report', () => {
  it('puts broken first, then the most seen', () => {
    const ranked = rankIssues({
      Ana: [{ severity: 'confusing', title: 'a', seen: 5 }, { severity: 'broken', title: 'b', seen: 1 }],
      Sam: [{ severity: 'broken', title: 'c', seen: 3 }],
    });
    expect(ranked.map((i) => i.title)).toEqual(['c', 'b', 'a']);
    expect(ranked[0].who).toBe('Sam');
  });
});
