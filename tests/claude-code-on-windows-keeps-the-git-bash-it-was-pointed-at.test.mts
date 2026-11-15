// CLAUDE CODE ON WINDOWS KEEPS THE GIT BASH IT WAS POINTED AT.
//
// Claude Code on Windows runs its commands through Git Bash, and a person whose
// Git is not in the default place tells it where bash.exe is with
// CLAUDE_CODE_GIT_BASH_PATH. Every scrub here takes out ^CLAUDE_CODE_ so a
// worker does not inherit the session markers or the OAuth token of a Claude
// Code it was started from, and read that way the variable went too. Measured
// by handing each scrub an environment holding it: the worker's environment,
// the task terminal's and the one `claude agents --json` runs with all came
// back without it, so Claude Code there could not find a shell.
//
// That one name is kept on every system. It is a path to a shell, not a login
// or a marker, and Claude Code reads it only on Windows. Every other
// CLAUDE_CODE_ name still goes, including longer names that start with it.

import { describe, it, expect } from 'vitest';
import { claudeHarness } from '../main/harnesses/claude.mts';
import { codexHarness } from '../main/harnesses/codex.mts';
import { openCodeHarness } from '../main/harnesses/opencode.mts';
import { terminalEnv } from '../main/task-terminals.mts';
import { __scrubbed } from '../main/agents.mts';

const BASH = 'D:\\Tools\\Git\\bin\\bash.exe';
const inherited = {
  PATH: 'C:\\Windows\\system32',
  CLAUDE_CODE_GIT_BASH_PATH: BASH,
  CLAUDE_CODE_OAUTH_TOKEN: 'invented',
  CLAUDE_CODE_ENTRYPOINT: 'cli',
  CLAUDE_CODE_GIT_BASH_PATH_OLD: 'C:\\old\\bash.exe',
  CLAUDE_CODE_GIT_BASH: 'C:\\other\\bash.exe',
};
const GONE = ['CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_CODE_GIT_BASH_PATH_OLD', 'CLAUDE_CODE_GIT_BASH'];

const scrubs = {
  'a Claude Code worker': (env) => claudeHarness.workerEnv(env),
  'a Codex worker': (env) => codexHarness.workerEnv(env),
  'an OpenCode worker': (env) => openCodeHarness.workerEnv(env),
  'a task terminal': (env) => terminalEnv(env),
  'the agents list': (env) => __scrubbed(env),
};

describe.each(Object.entries(scrubs))('%s', (_name, scrub) => {
  it('keeps the Git Bash path', () => {
    expect(scrub({ ...inherited }).CLAUDE_CODE_GIT_BASH_PATH).toBe(BASH);
  });

  it('still takes out every other CLAUDE_CODE_ name', () => {
    const env = scrub({ ...inherited });
    for (const key of GONE) expect(env).not.toHaveProperty(key);
    expect(env.PATH).toBe(inherited.PATH);
  });
});
