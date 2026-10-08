// 2026-10-07: the engine proposal counted 96 vendor branches across 12 files.
// Prove the adapter seam with a third, offline harness, and preserve the two
// real transports, login isolation, old records, and unsupported operations.
import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { createHarnessRegistry, harnessFor, HARNESS_OPERATIONS } from '../main/harnesses.mjs';
import { harnessDefinition } from '../shared/harness-definitions.mjs';
import { installCommand, signInCommand, statusCommand } from '../main/engine-setup.mjs';
import { signInFiles } from '../main/sign-in-files.mjs';
import { Supervisor } from '../main/supervisor.mjs';

describe('one adapter boundary for every harness', () => {
  it('keeps missing engines on Claude but refuses an unknown explicit engine', () => {
    expect(harnessFor().id).toBe('claude');
    for (const id of ['hermes', 'typo', '__proto__', 'constructor']) {
      expect(() => harnessFor(id)).toThrow(/Unknown coding agent/);
    }
  });
  it('registers a third harness without changing consumers or enabling it globally', () => {
    const spawn = vi.fn(() => 'offline worker');
    const registry = createHarnessRegistry([{ id: 'offline', label: 'Offline', spawn }]);
    expect(registry.get('offline').spawn()).toBe('offline worker');
    expect(spawn).toHaveBeenCalledOnce();
    expect(registry.supports('offline', 'spawn')).toBe(true);
    expect(registry.supports('offline', 'usage')).toBe(false);
    expect(registry.get('offline').usage()).toEqual({ supported: false, engine: 'offline', capability: 'usage' });
    expect(() => registry.get('offline').compact()).toThrow(/Offline.*compact/);
    expect(() => harnessFor('offline')).toThrow(/Unknown coding agent/);
    expect(harnessDefinition('offline')).toBeNull();
  });
  it('rejects duplicate registrations and malformed capability declarations', () => {
    expect(() => createHarnessRegistry([{ id: 'x', label: 'X' }, { id: 'x', label: 'X' }])).toThrow(/Duplicate/);
    expect(() => createHarnessRegistry([{ id: 'x', label: 'X', spawn: true }])).toThrow(/spawn/);
    expect(() => createHarnessRegistry([{ id: '', label: 'X' }])).toThrow(/id/);
    expect(() => createHarnessRegistry([{ id: 'x', label: 'X', capabilities: { remoteControl: true } }])).toThrow(/attachInput/);
    expect(() => createHarnessRegistry([{ id: 'x', label: 'X', capabilities: { fork: 'yes' } }])).toThrow(/boolean/);
  });
  it.each(['claude', 'codex'])('exposes all named operations on %s', id => {
    for (const name of HARNESS_OPERATIONS) expect(typeof harnessFor(id)[name]).toBe('function');
    expect(Object.isFrozen(harnessFor(id))).toBe(true);
  });
  it('keeps subscription credentials isolated without touching its input', () => {
    const input = { PATH: '/bin', ANTHROPIC_API_KEY: 'fixture', CLAUDE_CONFIG_DIR: '/wrong', OPENAI_API_KEY: 'fixture', CODEX_HOME: '/wrong' };
    expect(harnessFor('claude').workerEnv(input)).toEqual({ PATH: '/bin', OPENAI_API_KEY: 'fixture', CODEX_HOME: '/wrong' });
    expect(harnessFor('codex').workerEnv(input)).toEqual({ PATH: '/bin' });
    expect(input.CLAUDE_CONFIG_DIR).toBe('/wrong');
    const sup = { _codexProfileHome: profile => profile.trim() };
    expect(harnessFor('codex').profileEnv({}, ' /second ', sup)).toEqual({ CODEX_HOME: '/second' });
    expect(harnessFor('claude').profileEnv({}, 'default', {})).toEqual({});
    expect(harnessFor('claude').profileEnv({}, '/second', {})).toEqual({ CLAUDE_CONFIG_DIR: '/second' });
  });
  it('keeps legacy Claude account keys and namespaces Codex accounts', () => {
    expect(harnessFor('claude').accountKey('default')).toBe('default');
    expect(harnessFor('codex').accountKey('default')).toBe('codex:default');
    const sup = { _profiles: () => ['/claude'], _codexProfiles: () => ['/codex'] };
    expect(harnessFor('claude').profiles(sup)).toEqual(['/claude']);
    expect(harnessFor('codex').profiles(sup)).toEqual(['/codex']);
  });
  it('preserves legacy transcript engine normalization during recovery', () => {
    for (const engine of [undefined, '', 'obsolete']) {
      expect(Supervisor.prototype.transcriptFile.call({}, { engine, sessionId: 'missing-fixture', profile: '/missing-fixture', cwd: '/project' })).toBeNull();
    }
  });
  it('uses each tool’s own login commands and rejects unknown tools', () => {
    expect(signInCommand('claude', '/tool').args).toEqual(['auth', 'login', '--claudeai']);
    expect(signInCommand('codex', '/tool').args).toEqual(['login']);
    expect(statusCommand('claude', '/tool').args).toEqual(['auth', 'status', '--json']);
    expect(statusCommand('codex', '/tool').args).toEqual(['login', 'status']);
    expect(installCommand('claude').file).toBe('/bin/bash');
    expect(installCommand('codex').file).toBe('/bin/sh');
    expect(() => signInCommand('unknown', '/tool')).toThrow(/Unknown/);
  });
  it('keeps credential watching on the selected login only', () => {
    expect(signInFiles({ engine: 'claude', folder: '/second', home: '/home' })).toEqual(['/second/.claude.json', '/second/.credentials.json']);
    expect(signInFiles({ engine: 'codex', folder: '/second', home: '/home' })).toEqual(['/second/auth.json']);
    expect(signInFiles({ engine: 'codex', home: '/home' })).toEqual([]);
    expect(() => signInFiles({ engine: 'unknown', home: '/home' })).toThrow(/Unknown/);
  });
  it('reads fragmented Claude lines once, ignoring empty lines', () => {
    const child = { stdout: new EventEmitter() }, session = {}, got = [];
    harnessFor('claude').subscribe(child, session, (...frame) => got.push(frame));
    child.stdout.emit('data', '{"type":"sys');
    child.stdout.emit('data', 'tem"}\n\n{"type":"result"}\n');
    expect(got).toEqual([['{"type":"system"}'], ['{"type":"result"}']]);
  });
  it('passes Codex notifications directly and records only that session’s change', () => {
    const child = new EventEmitter(), session = {}, got = [];
    harnessFor('codex').subscribe(child, session, (...frame) => got.push(frame));
    const params = { item: { id: 'text', type: 'agentMessage', text: 'Ready' } };
    child.emit('event', 'item/completed', params);
    expect(got).toEqual([['item/completed', params]]);
    expect(session.codexChange?.length).toBeGreaterThan(0);
  });
  it('captures results in both native vocabularies', () => {
    const a = {}, b = {};
    harnessFor('claude').readers().capture(a, JSON.stringify({ type: 'result', session_id: 'claude-id', result: 'Ready', is_error: false }));
    harnessFor('codex').readers().capture(b, 'thread/started', { thread: { id: 'codex-id' } });
    harnessFor('codex').readers().capture(b, 'item/completed', { item: { type: 'agentMessage', text: 'Ready' } });
    expect(a.sessionId).toBe('claude-id'); expect(a.result).toBe('Ready');
    expect(b.sessionId).toBe('codex-id'); expect(b.result).toBe('Ready');
  });
});
