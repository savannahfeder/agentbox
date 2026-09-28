// A CODEX MODE SHE PICKS HAS TO REACH `thread/start`, OR IT IS THE OLD BUG BACK.
//
// The reason this file exists rather than a line in an existing one: the
// control was taken off the Codex row in the first place because a mode set
// there was accepted by the box and then silently dropped by the run
// (tests/a-permission-mode-cannot-be-set-on-a-codex-row.test.mjs records that).
// Putting a picker back is only safe if the value is followed all the way down,
// so these assert the two ends and the order in between.
import { describe, expect, it } from 'vitest';
import {
  CODEX_DEFAULT_MODE,
  CODEX_MODES,
  CODEX_MODE_ORDER,
  codexPosture,
  isCodexMode,
} from '../shared/codex-modes.mjs';
import { workerThreadParams, WORKER_APPROVAL_POLICY, WORKER_SANDBOX } from '../main/codex-session.mjs';

describe('the three modes are Codex\'s own settings', () => {
  // Read off `codex app-server generate-json-schema` on codex-cli 0.153.4,
  // 2026-09-23. A value not in these lists is one `thread/start` refuses.
  const SANDBOXES = ['read-only', 'workspace-write', 'danger-full-access'];
  const POLICIES = ['untrusted', 'on-request', 'never'];

  it('offers exactly three, in order of what they allow', () => {
    expect(CODEX_MODE_ORDER).toEqual(['read-only', 'auto', 'full-access']);
    expect(Object.keys(CODEX_MODES).sort()).toEqual([...CODEX_MODE_ORDER].sort());
  });

  it('never names a sandbox or a policy Codex does not take', () => {
    for (const id of CODEX_MODE_ORDER) {
      expect(SANDBOXES, id).toContain(CODEX_MODES[id].sandbox);
      expect(POLICIES, id).toContain(CODEX_MODES[id].approvalPolicy);
    }
  });

  // `untrusted` is the one that made Codex unusable. Offering it again would be
  // offering the bug as a choice.
  it('does not offer untrusted', () => {
    for (const id of CODEX_MODE_ORDER) expect(CODEX_MODES[id].approvalPolicy).not.toBe('untrusted');
  });

  it('defaults to the posture the constants already ship', () => {
    expect(CODEX_DEFAULT_MODE).toBe('auto');
    expect(codexPosture(CODEX_DEFAULT_MODE))
      .toMatchObject({ approvalPolicy: WORKER_APPROVAL_POLICY, sandbox: WORKER_SANDBOX });
  });

  // `ApprovalsReviewer` off the same schema: user | auto_review | guardian_subagent.
  const REVIEWERS = ['user', 'auto_review', 'guardian_subagent'];

  it('never names a reviewer Codex does not take', () => {
    for (const id of CODEX_MODE_ORDER) {
      const reviewer = CODEX_MODES[id].approvalsReviewer;
      if (reviewer !== undefined) expect(REVIEWERS, id).toContain(reviewer);
    }
  });

  it('falls back rather than throwing on a word from an old config', () => {
    expect(codexPosture('nonsense')).toEqual(codexPosture(CODEX_DEFAULT_MODE));
    expect(isCodexMode('nonsense')).toBe(false);
    expect(isCodexMode('auto')).toBe(true);
  });
});

describe('the mode reaches the thread', () => {
  const params = (mode) => workerThreadParams({ cwd: '/repo', mode });

  it('sets BOTH the sandbox and the policy, per mode', () => {
    expect(params('read-only')).toMatchObject({ sandbox: 'read-only', approvalPolicy: 'on-request' });
    expect(params('auto')).toMatchObject({ sandbox: 'workspace-write', approvalPolicy: 'on-request' });
    expect(params('full-access')).toMatchObject({ sandbox: 'danger-full-access', approvalPolicy: 'never' });
  });

  // 2026-09-24, w-ca48e69535: auto on her second Codex login carded her for
  // almost every step, because the reviewer lived only in the first login's
  // config.toml. The thread has to carry it, so any account behaves the same.
  it('auto hands its asks to Codex\'s own reviewer, on any account', () => {
    expect(params('auto')).toMatchObject({ approvalsReviewer: 'auto_review' });
    expect(params('read-only')).not.toHaveProperty('approvalsReviewer');
    expect(params('full-access')).not.toHaveProperty('approvalsReviewer');
  });

  // The whole point of the picker: two different modes must not produce the
  // same thread params. That equality is exactly what the old Codex row had.
  it('makes a real difference to the params', () => {
    expect(params('read-only')).not.toEqual(params('full-access'));
    expect(params('read-only')).not.toEqual(params('auto'));
  });

  it('passing no mode leaves the shipped default untouched', () => {
    expect(workerThreadParams({ cwd: '/repo' }))
      .toMatchObject({ approvalPolicy: WORKER_APPROVAL_POLICY, sandbox: WORKER_SANDBOX });
  });
});
