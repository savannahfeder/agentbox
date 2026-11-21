// A KEPT CLOUD KEY CANNOT TAKE A NAME THAT RUNS A COMMAND.
//
// A key a cloud agent keeps with sign_in is handed to every later cloud run of
// every thread as an environment variable. The name check refused a list of
// names, and names that make git, ssh, bash or a language run a command of
// their own got through: GIT_SSH_COMMAND, GIT_EXTERNAL_DIFF, GIT_ASKPASS,
// BASH_ENV, PROMPT_COMMAND, PAGER, PERL5OPT, PYTHONSTARTUP. sign_in's keep
// needs only an ask the agent opened itself, so one agent that read a hostile
// page could plant a command in every run after it (security review
// 2026-11-13: the real keyNameRefused passed all of them, and placeKeys puts
// the value into the agent's environment untouched).
//
// Those names are now the machine's own. A key already saved under one is left
// out of what a run carries, so it neither runs nor stops the runs.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { keyNameRefused } from '../shared/cloud-key-names.mts';
import { keyNameRefused as sandboxRefused } from '../cloud/sandbox/key-names.mjs';
import { cloudKeysPath, keysCarried } from '../main/cloud/keys.mts';

const RUNS_A_COMMAND = [
  'GIT_SSH_COMMAND', 'GIT_SSH', 'GIT_EXTERNAL_DIFF', 'GIT_ASKPASS', 'GIT_PAGER', 'GIT_EDITOR', 'GIT_EXEC_PATH', 'GIT_TEMPLATE_DIR', 'GIT_PROXY_COMMAND',
  'SSH_ASKPASS', 'SUDO_ASKPASS',
  'BASH_ENV', 'ENV', 'PROMPT_COMMAND', 'SHELLOPTS', 'BASHOPTS', 'PS4', 'IFS', 'ZDOTDIR',
  'PAGER', 'MANPAGER', 'VISUAL', 'LESSOPEN', 'LESSCLOSE',
  'PERL5OPT', 'PERL5LIB', 'PERLLIB', 'RUBYOPT', 'RUBYLIB', 'PYTHONSTARTUP', 'PYTHONWARNINGS', 'PYTHONINSPECT',
  'JAVA_TOOL_OPTIONS', '_JAVA_OPTIONS', 'JDK_JAVA_OPTIONS',
  'PIP_INDEX_URL', 'PIP_EXTRA_INDEX_URL', 'UV_INDEX_URL', 'GOFLAGS', 'GOPROXY', 'XDG_CONFIG_HOME', 'CURL_HOME', 'WGETRC',
  // Found by the credential review the same day: tar, make, compilers, rsync and svn run commands named here.
  'TAR_OPTIONS', 'CC', 'CXX', 'CPP', 'LD', 'MAKEFLAGS', 'MAKE', 'MFLAGS', 'RSYNC_RSH', 'SVN_SSH', 'CVS_RSH',
  // And this one switches off the TLS check for Claude Code itself.
  'NODE_TLS_REJECT_UNAUTHORIZED', 'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'REQUESTS_CA_BUNDLE', 'CURL_CA_BUNDLE',
];

const REAL_KEYS = [
  'GITHUB_TOKEN', 'GH_TOKEN', 'GITLAB_TOKEN', 'SSH_PRIVATE_KEY', 'NODE_AUTH_TOKEN', 'NPM_TOKEN',
  'PYTHON_API_KEY', 'LESSON_API_KEY', 'PAGERDUTY_TOKEN', 'ENVIRONMENT', 'SUPABASE_ACCESS_TOKEN', 'TREG_TOKEN',
  'POSTHOG_PERSONAL_KEY', 'ELEVENLABS_API_KEY', 'STRIPE_SECRET_KEY',
];

describe('the name a kept key may have', () => {
  it.each(RUNS_A_COMMAND)('refuses %s, on the Mac and on the cloud machine', (name) => {
    expect(keyNameRefused(name)).toBeTruthy();
    expect(sandboxRefused(name)).toBeTruthy();
  });

  it.each(REAL_KEYS)('still takes %s', (name) => {
    expect(keyNameRefused(name)).toBeNull();
    expect(sandboxRefused(name)).toBeNull();
  });
});

describe('a key kept under such a name before', () => {
  it('is not carried to a run, and the others still are', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'kept-keys-'));
    fs.mkdirSync(path.dirname(cloudKeysPath(home)), { recursive: true });
    fs.writeFileSync(cloudKeysPath(home), JSON.stringify({
      keys: { GIT_SSH_COMMAND: { id: 'a1', savedAt: 1 }, GH_TOKEN: { id: 'b2', savedAt: 2 } },
      retired: [],
    }));
    expect(keysCarried({ home }).map((k) => k.name)).toEqual(['GH_TOKEN']);
    fs.rmSync(home, { recursive: true, force: true });
  });
});
