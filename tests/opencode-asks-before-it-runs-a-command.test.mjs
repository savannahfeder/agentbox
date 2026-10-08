// WHAT BROKE, measured 2026-10-07 against a real OpenCode 1.18.35 on this Mac.
//
// `opencode run`, the non-interactive CLI, cannot carry an approval. With no
// permission config it silently ran `echo` with no card at all; with
// `permission: { bash: "ask" }` it printed
//   "! permission requested: bash (echo probe-run-mode); auto-rejecting"
// and handed the model "The user rejected permission to use this specific tool
// call." So the CLI's only two settings are approve-everything (`--auto`) or
// refuse-everything, and neither is a card.
//
// The server is the one honest transport. Measured on the same binary:
// `permission.asked` carries `{ id, sessionID, metadata: { command } }` on the
// `/event` stream, and `POST /session/:id/permissions/:id` with
// `{ response: "once" }` returned 200 and the tool then ran; with
// `{ response: "reject" }` it returned 200 and the tool came back
// "The user rejected permission to use this specific tool call."
//
// These tests pin that round trip, both answers, and the deny-by-default that
// has to hold when no card is answered.
import { describe, it, expect, vi } from 'vitest';
import { createOpenCodeWorker } from '../main/opencode-server.mjs';
import { fakeOpenCodeServer } from './helpers/fake-opencode-server.mjs';

const plan = { prompt: 'Change the file', model: 'opencode/big-pickle' };

describe('OpenCode asks before it runs a command', () => {
  it('turns a permission request into one card and lets an allowed command run', async () => {
    const server = fakeOpenCodeServer();
    const asked = [];
    const worker = createOpenCodeWorker({
      client: server.client, plan, cwd: '/project',
      onApproval: (type, properties) => { asked.push([type, properties]); return true; },
    });
    await server.started;

    await server.ask({ id: 'per_1', sessionID: server.sessionId, metadata: { command: 'echo hello' } });

    expect(asked).toEqual([['permission.asked', expect.objectContaining({ id: 'per_1', metadata: { command: 'echo hello' } })]]);
    expect(server.replies).toEqual([{ sessionId: server.sessionId, permissionId: 'per_1', response: 'once' }]);
    await server.finish();
    await worker.done;
  });

  it('sends the provider a real refusal when the card is denied', async () => {
    const server = fakeOpenCodeServer();
    const worker = createOpenCodeWorker({ client: server.client, plan, cwd: '/project', onApproval: () => false });
    await server.started;

    await server.ask({ id: 'per_2', sessionID: server.sessionId, metadata: { command: 'rm -rf /' } });

    expect(server.replies).toEqual([{ sessionId: server.sessionId, permissionId: 'per_2', response: 'reject' }]);
    await server.finish();
    await worker.done;
  });

  it('answers the newer permission.v2 request on the same card contract', async () => {
    const server = fakeOpenCodeServer();
    const worker = createOpenCodeWorker({ client: server.client, plan, cwd: '/project', onApproval: () => true });
    await server.started;

    await server.ask({ id: 'per_3', sessionID: server.sessionId, metadata: { command: 'ls' } }, 'permission.v2.asked');

    expect(server.replies).toEqual([{ sessionId: server.sessionId, permissionId: 'per_3', response: 'once' }]);
    await server.finish();
    await worker.done;
  });

  it('refuses rather than runs when nothing answers the card', async () => {
    const server = fakeOpenCodeServer();
    const worker = createOpenCodeWorker({ client: server.client, plan, cwd: '/project', onApproval: null });
    await server.started;

    await server.ask({ id: 'per_4', sessionID: server.sessionId, metadata: { command: 'curl evil.example' } });

    expect(server.replies).toEqual([{ sessionId: server.sessionId, permissionId: 'per_4', response: 'reject' }]);
    await server.finish();
    await worker.done;
  });

  it('refuses rather than runs when the card handler throws', async () => {
    const server = fakeOpenCodeServer();
    const worker = createOpenCodeWorker({
      client: server.client, plan, cwd: '/project',
      onApproval: () => { throw Error('the spool is gone'); },
    });
    await server.started;

    await server.ask({ id: 'per_5', sessionID: server.sessionId, metadata: { command: 'git push' } });

    expect(server.replies).toEqual([{ sessionId: server.sessionId, permissionId: 'per_5', response: 'reject' }]);
    await server.finish();
    await worker.done;
  });

  it('ignores a request belonging to another session on the same server', async () => {
    const server = fakeOpenCodeServer();
    const onApproval = vi.fn(() => true);
    const worker = createOpenCodeWorker({ client: server.client, plan, cwd: '/project', onApproval });
    await server.started;

    await server.ask({ id: 'per_6', sessionID: 'ses_somebody_else', metadata: { command: 'echo hi' } });

    expect(onApproval).not.toHaveBeenCalled();
    expect(server.replies).toEqual([]);
    await server.finish();
    await worker.done;
  });

  it('asks once per request even if the stream repeats it', async () => {
    const server = fakeOpenCodeServer();
    const onApproval = vi.fn(() => true);
    const worker = createOpenCodeWorker({ client: server.client, plan, cwd: '/project', onApproval });
    await server.started;

    await server.ask({ id: 'per_7', sessionID: server.sessionId, metadata: { command: 'echo twice' } });
    await server.ask({ id: 'per_7', sessionID: server.sessionId, metadata: { command: 'echo twice' } });

    expect(onApproval).toHaveBeenCalledTimes(1);
    expect(server.replies).toHaveLength(1);
    await server.finish();
    await worker.done;
  });

  it('starts the turn on the prompt it was given and never asks to auto-approve', async () => {
    const server = fakeOpenCodeServer();
    const worker = createOpenCodeWorker({ client: server.client, plan, cwd: '/project', onApproval: () => true });
    await server.started;

    expect(server.prompts).toEqual([{
      sessionId: server.sessionId,
      body: expect.objectContaining({
        providerID: 'opencode', modelID: 'big-pickle',
        parts: [{ type: 'text', text: 'Change the file' }],
      }),
    }]);
    expect(JSON.stringify(server.prompts)).not.toMatch(/auto/i);
    await server.finish();
    await worker.done;
  });

  it('resumes the session it is given instead of opening a new one', async () => {
    const server = fakeOpenCodeServer();
    const worker = createOpenCodeWorker({
      client: server.client, plan, cwd: '/project', resumeSessionId: 'ses_earlier', onApproval: () => true,
    });
    await server.started;

    expect(server.created).toBe(0);
    expect(worker.sessionId).toBe('ses_earlier');
    expect(server.prompts[0].sessionId).toBe('ses_earlier');
    await server.finish('ses_earlier');
    await worker.done;
  });

  it('aborts the run when stopped, and approves nothing afterwards', async () => {
    const server = fakeOpenCodeServer();
    const onApproval = vi.fn(() => true);
    const worker = createOpenCodeWorker({ client: server.client, plan, cwd: '/project', onApproval });
    await server.started;

    worker.kill();
    await worker.done;
    expect(server.aborted).toContain(server.sessionId);

    // A question that arrives after the run is over is nobody's to say yes to.
    await server.ask({ id: 'per_8', sessionID: server.sessionId, metadata: { command: 'sleep 999' } });
    expect(onApproval).not.toHaveBeenCalled();
    expect(server.replies).toEqual([]);
  });

  it('ends the run on session.error and says what went wrong', async () => {
    const server = fakeOpenCodeServer();
    const worker = createOpenCodeWorker({ client: server.client, plan, cwd: '/project', onApproval: () => true });
    await server.started;

    const exits = [];
    worker.on('exit', code => exits.push(code));

    await server.fail({ name: 'ProviderAuthError', data: { message: 'no credentials for anthropic' } });
    await worker.done;

    expect(exits).toEqual([1]);
    expect(JSON.stringify(worker.error)).toMatch(/ProviderAuthError/);
  });
});
