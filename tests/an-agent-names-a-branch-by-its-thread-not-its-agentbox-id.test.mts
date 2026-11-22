// Agents wrote "committed as f635059 on agentbox/w-…" in answers and options, because
// nothing in the coding brief told them not to; teammates read the raw ids. Checked on the brief both engines get.
import { it, expect } from 'vitest';
import { workerGitBrief } from '../main/worker-git.mts';

it('tells a coding agent to name a branch by its thread and to give commit hashes only when asked', () => {
  for (const engine of ['claude', 'codex']) {
    const brief = workerGitBrief('/a/repository', engine);
    expect(brief).toMatch(/name a branch by its thread's title, never by its agentbox\/w-… name/i);
    expect(brief).toMatch(/commit hash(es)? only (if|when) (they|someone) ask/i);
  }
});

it('says nothing of branches to a task without a repository', () => {
  expect(workerGitBrief(null)).toBe('');
});
