// Auto sent every escalation to the person. Check the reviewer on starts and
// resumes, while keeping Read only and explicit reviewer overrides intact.
import { describe, expect, it } from 'vitest';
import { codexPosture } from '../shared/codex-modes.mjs';
import { workerThreadParams, resumeThreadParams, createCodexWorker } from '../main/codex-session.mjs';

describe('Codex Auto reviews extra access', () => {
  it.each([undefined, null, 'auto', 'old-mode'])('uses automatic review for %s', mode => {
    const params = workerThreadParams({ cwd: '/repo', mode });
    expect(params).toMatchObject({
      sandbox: 'workspace-write', approvalPolicy: 'on-request', approvalsReviewer: 'auto_review',
    });
    expect(resumeThreadParams('existing-thread', params)).toMatchObject({
      threadId: 'existing-thread', approvalsReviewer: 'auto_review',
    });
  });

  it('keeps Read only asking the person and Full access unrestricted', () => {
    expect(codexPosture('read-only')).toEqual({
      sandbox: 'read-only', approvalPolicy: 'on-request', approvalsReviewer: 'user',
    });
    expect(codexPosture('full-access')).toEqual({
      sandbox: 'danger-full-access', approvalPolicy: 'never', approvalsReviewer: 'user',
    });
  });

  it('honours explicit reviewers and rejects unknown reviewer names', () => {
    expect(workerThreadParams({ cwd: '/repo', mode: 'auto', reviewer: 'user' }).approvalsReviewer).toBe('user');
    expect(workerThreadParams({ cwd: '/repo', mode: 'read-only', reviewer: 'auto_review' }).approvalsReviewer).toBe('auto_review');
    expect(workerThreadParams({ cwd: '/repo', mode: 'auto', reviewer: 'unknown' }).approvalsReviewer).toBe('user');
  });

  it.each([null, 'existing-thread'])('delivers Auto review to the server when resuming %s', async resumeThreadId => {
    const received = [];
    const record = async params => {
      received.push(params);
      return { threadId: 'existing-thread' };
    };
    const server = {
      startThread: record,
      resumeThread: record,
      unwatch() {},
      async startTurn() { return { turn: { id: 'turn' } }; },
    };
    const worker = createCodexWorker({
      server, resumeThreadId,
      threadParams: () => workerThreadParams({ cwd: '/repo', mode: 'auto', mcpServers: ['private-server'] }),
    });
    await new Promise(resolve => worker.once('spawn', resolve));
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      approvalsReviewer: 'auto_review', sandbox: 'workspace-write', approvalPolicy: 'on-request',
      config: {
        mcp_servers: { 'private-server': { enabled: false } },
        projects: { '/repo': { trust_level: 'untrusted' } },
        features: { apps: false, plugins: false, remote_plugin: false },
      },
    });
    if (resumeThreadId) {
      expect(received[0].threadId).toBe(resumeThreadId);
      expect(received[0]).not.toHaveProperty('ephemeral');
    }
    worker.kill();
  });
});
