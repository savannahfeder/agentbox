// Every local Codex thread runs under one shared `codex app-server` that the
// app starts with no ZERO_ITEM, so the commands a Codex thread ran (an ffmpeg
// render at 586 MB, a headless Chrome at about 2 GB) were counted as "the app's
// own" by the memory log, and neither the leftovers sweep nor the caps could
// tie them to a thread. Measured on 2026-11-15: the memory log read "app 6-7 GB"
// while Agentbox itself held about 3 GB.
//
// Codex 0.165 passes `config["shell_environment_policy.set.<NAME>"]` given at
// thread/start and thread/resume to the thread's commands and their children,
// two threads on one app-server each keeping their own, and a model-issued
// command too (checked against a real app-server). So the thread's tag goes in
// there, on start and on resume.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resumeThreadParams, workerThreadParams } from '../main/codex-session.mts';
import { Supervisor } from '../main/supervisor.mts';

const SET = 'shell_environment_policy.set';

describe('the supervisor names the thread when it starts a Codex worker', () => {
  const fakeSupervisor = () => Object.assign(Object.create(Supervisor.prototype), {
    config: { storeRoot: '/tmp/store', accountId: 'a' },
    _codexModelWord: () => null, codexModelRefusal: () => null, codexEffortRefusal: () => null, effectiveCodexMode: () => null,
  });

  it('passes the row it was given to the thread params', () => {
    const params = fakeSupervisor().codexThreadParamsFor({}, '/w', [], null, '/h', { item: { id: 'w-feed01', product: 'acme' } });
    expect(params.config[`${SET}.ZERO_ITEM`]).toBe('w-feed01');
    expect(params.config[`${SET}.ZERO_PRODUCT`]).toBe('acme');
  });

  it('gives the worker it starts its row', () => {
    const src = fs.readFileSync(path.resolve(import.meta.dirname, '../main/supervisor.mts'), 'utf8');
    const start = src.slice(src.indexOf('  _spawnCodexWorker('), src.indexOf('  codexThreadParamsFor('));
    expect(start).toMatch(/threadParams: \(mcpServers: unknown\) => this\.codexThreadParamsFor\([^)]*\{[^}]*\bitem\b[^}]*\}\)/);
  });
});

describe("a Codex thread's commands carry the thread they belong to", () => {
  it('puts the thread and its project in the environment its commands get', () => {
    const p = workerThreadParams({ cwd: '/tmp/x', thread: { item: 'w-abc123', product: 'acme' } });
    expect(p.config[`${SET}.ZERO_ITEM`]).toBe('w-abc123');
    expect(p.config[`${SET}.ZERO_PRODUCT`]).toBe('acme');
  });

  it('carries the same tag when the thread is resumed', () => {
    const start = workerThreadParams({ cwd: '/tmp/x', thread: { item: 'w-abc123', product: 'acme' } });
    const resumed = resumeThreadParams('t-1', start) as { config: Record<string, unknown> };
    expect(resumed.config[`${SET}.ZERO_ITEM`]).toBe('w-abc123');
    expect(resumed.config[`${SET}.ZERO_PRODUCT`]).toBe('acme');
  });

  it('uses dotted keys, so a policy of the person\'s own is added to rather than replaced', () => {
    const p = workerThreadParams({ cwd: '/tmp/x', thread: { item: 'w-abc123', product: 'acme' } });
    expect(p.config).not.toHaveProperty('shell_environment_policy');
  });

  it('leaves the project out when the thread has none, and sets nothing with no thread', () => {
    const noProduct = workerThreadParams({ cwd: '/tmp/x', thread: { item: 'w-abc123', product: null } });
    expect(noProduct.config[`${SET}.ZERO_ITEM`]).toBe('w-abc123');
    expect(Object.keys(noProduct.config)).not.toContain(`${SET}.ZERO_PRODUCT`);
    const none = workerThreadParams({ cwd: '/tmp/x' });
    expect(Object.keys(none.config).filter((k) => k.startsWith(SET))).toEqual([]);
  });

  it('refuses a value that is not a thread id rather than passing it on', () => {
    const p = workerThreadParams({ cwd: '/tmp/x', thread: { item: 'w-abc; rm -rf ~', product: 'acme' } });
    expect(Object.keys(p.config).filter((k) => k.startsWith(SET))).toEqual([]);
  });
});
