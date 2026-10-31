// Every mode must name a reviewer instead of inheriting the account's setting.
// Auto reviews extra access automatically; Read only asks the person.
import { describe, expect, it } from 'vitest';
import { CODEX_DEFAULT_MODE, CODEX_MODES, CODEX_MODE_ORDER, codexPosture, CODEX_REVIEWERS, ASKS_THE_PERSON } from '../shared/codex-modes.mjs';
import { workerThreadParams, resumeThreadParams, WORKER_APPROVAL_POLICY, WORKER_SANDBOX } from '../main/codex-session.mjs';
import { APPROVAL_DECISIONS, ELICITATION_ACTIONS } from '../main/codex-app-server.mjs';

describe('who reviews extra access', () => {
  it('uses supported reviewer names', () => {
    expect(CODEX_REVIEWERS).toEqual(['user', 'auto_review', 'guardian_subagent']);
    expect(ASKS_THE_PERSON).toBe('user');
  });

  it('keeps the default sandbox and approval policy', () => {
    expect(WORKER_SANDBOX).toBe('workspace-write');
    expect(WORKER_APPROVAL_POLICY).toBe('on-request');
    expect(workerThreadParams({ cwd: '/repo' })).toMatchObject({
      sandbox: WORKER_SANDBOX, approvalPolicy: WORKER_APPROVAL_POLICY, approvalsReviewer: 'auto_review',
    });
  });

  it.each(CODEX_MODE_ORDER)('names the reviewer for %s on starts and resumes', mode => {
    const reviewer = mode === 'auto' ? 'auto_review' : ASKS_THE_PERSON;
    const params = workerThreadParams({ cwd: '/repo', mode });
    expect(params.approvalsReviewer).toBe(reviewer);
    expect(resumeThreadParams('thread', params).approvalsReviewer).toBe(reviewer);
  });

  it('keeps invalid explicit reviewers with the person', () => {
    for (const reviewer of ['nonsense', '']) {
      expect(workerThreadParams({ cwd: '/repo', reviewer }).approvalsReviewer).toBe(ASKS_THE_PERSON);
    }
  });

  it('defaults to Auto review for missing or stale mode names', () => {
    expect(CODEX_DEFAULT_MODE).toBe('auto');
    expect(codexPosture('nonsense').approvalsReviewer).toBe('auto_review');
    expect(codexPosture(undefined).approvalsReviewer).toBe('auto_review');
  });

  it('describes automatic review without promising every request will be approved', () => {
    expect(CODEX_MODES.auto.what).toMatch(/automatically reviews requests/i);
    expect(CODEX_MODES.auto.what).not.toMatch(/asks you|without asking/i);
    expect(codexPosture('auto').approvalsReviewer).toBe('auto_review');
  });

  it('keeps Full access unrestricted', () => {
    expect(codexPosture('full-access')).toMatchObject({ approvalPolicy: 'never', sandbox: 'danger-full-access' });
    expect(CODEX_MODES['full-access'].what).toMatch(/without asking/i);
  });
});

describe('a card that still reaches the person', () => {
  it('takes only the four command decisions Codex accepts', () => {
    expect(APPROVAL_DECISIONS).toEqual(['accept', 'acceptForSession', 'decline', 'cancel']);
  });

  it('does not offer session approval for an elicitation', () => {
    expect(ELICITATION_ACTIONS).toEqual(['accept', 'decline', 'cancel']);
  });
});
