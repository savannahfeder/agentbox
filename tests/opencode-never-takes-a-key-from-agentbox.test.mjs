// WHAT THIS GUARDS. CLAUDE.md: "Workers run on the user's own Claude or Codex
// subscription. Never pass an API key into a worker's environment."
//
// OpenCode is the first harness where that rule could actually be broken by
// accident, because it is bring-your-own-model and will read a provider key
// straight out of its environment if it finds one. Measured on a real OpenCode
// 1.18.35 on 2026-10-07: with ZERO credentials in its own
// ~/.local/share/opencode/auth.json it still listed ten models and finished a
// run reporting `"cost":0` -- the OpenCode Zen free tier. So there is never a
// reason for Agentbox to hand it a key, and these tests make sure it cannot.
//
// The one secret that IS passed is OPENCODE_SERVER_PASSWORD, which is the
// server's own basic-auth secret for its loopback port. Measured: without it
// GET /session answered 401 and with it 200. It is not a provider credential
// and it buys nobody any model time.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { harnessFor } from '../main/harnesses.mjs';
import { harnessDefinition } from '../shared/harness-definitions.mjs';
import { openCodePermissionConfig } from '../main/opencode.mjs';
import { writePermissionConfig } from '../main/harnesses/opencode.mjs';
import { splitModel } from '../main/opencode-server.mjs';

const harness = () => harnessFor('opencode');

describe('OpenCode never takes a key from Agentbox', () => {
  it('strips every provider credential out of the worker environment', () => {
    const input = {
      PATH: '/bin', HOME: '/home',
      ANTHROPIC_API_KEY: 'fixture', OPENAI_API_KEY: 'fixture', OPENROUTER_API_KEY: 'fixture',
      GEMINI_API_KEY: 'fixture', GROQ_API_KEY: 'fixture', MISTRAL_API_KEY: 'fixture',
      DEEPSEEK_API_KEY: 'fixture', XAI_API_KEY: 'fixture', CEREBRAS_API_KEY: 'fixture',
      TOGETHER_API_KEY: 'fixture', FIREWORKS_API_KEY: 'fixture', DEEPINFRA_API_KEY: 'fixture',
      BASETEN_API_KEY: 'fixture', NVIDIA_API_KEY: 'fixture', GITLAB_TOKEN: 'fixture',
      AWS_ACCESS_KEY_ID: 'fixture', AWS_SECRET_ACCESS_KEY: 'fixture', AZURE_RESOURCE_NAME: 'fixture',
      GOOGLE_APPLICATION_CREDENTIALS: '/fixture', SOME_OTHER_API_KEY: 'fixture',
      HUGGINGFACE_ACCESS_TOKEN: 'fixture',
      OPENCODE_SERVER_PASSWORD: 'fixture', OPENCODE_CONFIG: '/wrong',
      CLAUDE_CONFIG_DIR: '/wrong', CODEX_HOME: '/wrong',
    };
    expect(harness().workerEnv(input)).toEqual({ PATH: '/bin', HOME: '/home' });
    // The caller's own environment is never mutated on the way through.
    expect(input.ANTHROPIC_API_KEY).toBe('fixture');
  });

  it('leaves the other two harnesses able to see their own subscriptions', () => {
    // The wide scrub belongs to OpenCode alone. Widening it for everybody
    // would take CODEX_HOME off a Claude worker and break the second login.
    const input = { PATH: '/bin', OPENAI_API_KEY: 'fixture', CODEX_HOME: '/second' };
    expect(harnessFor('claude').workerEnv(input)).toEqual({ PATH: '/bin', OPENAI_API_KEY: 'fixture', CODEX_HOME: '/second' });
  });

  it('points at OpenCode’s own credential store and reads nothing from it', () => {
    expect(harness().signInFiles({ home: '/home' })).toEqual(['/home/.local/share/opencode/auth.json']);
    expect(harness().signIn('/tool').args).toEqual(['auth', 'login']);
    expect(harness().signInStatus('/tool').args).toEqual(['auth', 'list']);
  });

  it('needs no sign-in to run, because the free tier really runs', () => {
    // Measured, not assumed: zero credentials, ten models, a finished run at
    // cost 0. A harness that demanded a login here would refuse to start on a
    // machine where OpenCode works fine.
    expect(harness().signedIn()).toBe(true);
    expect(harness().profiles()).toEqual(['default']);
    expect(harness().accountKey()).toBe('opencode:default');
  });

  it('writes a permission policy that asks, and no credentials', () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-policy-'));
    try {
      const file = writePermissionConfig(folder);
      expect(file).toBe(path.join(folder, '.agentbox-opencode.json'));
      const written = JSON.parse(fs.readFileSync(file, 'utf8'));
      expect(written.permission.bash).toBe('ask');
      expect(written.permission.edit).toBe('ask');
      expect(written.permission.webfetch).toBe('ask');
      // Reading inside the task's own folder is what the folder is for.
      expect(written.permission.read).toBeUndefined();
      // Nothing that looks like a credential is ever in this file.
      expect(JSON.stringify(written)).not.toMatch(/key|token|secret|password/i);
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });

  it('keeps the policy out of the user’s own OpenCode config', () => {
    // OPENCODE_CONFIG is a path to a file Agentbox wrote for this folder, not
    // a change to anything the user owns.
    expect(harnessDefinition('opencode').homeEnv).toBe('OPENCODE_CONFIG');
    expect(openCodePermissionConfig().$schema).toBe('https://opencode.ai/config.json');
    expect(harness().profileEnv({ PATH: '/bin' }, 'default')).toEqual({ PATH: '/bin' });
    expect(harness().profileEnv({ PATH: '/bin' }, '/folder/.agentbox-opencode.json'))
      .toEqual({ PATH: '/bin', OPENCODE_CONFIG: '/folder/.agentbox-opencode.json' });
  });

  it('splits a provider-qualified model and refuses to invent a provider', () => {
    expect(splitModel('opencode/big-pickle')).toEqual({ providerID: 'opencode', modelID: 'big-pickle' });
    expect(splitModel('anthropic/claude-sonnet-4-5')).toEqual({ providerID: 'anthropic', modelID: 'claude-sonnet-4-5' });
    // A bare name is left for the server's own default rather than guessed at.
    for (const bad of ['opus', '', null, undefined, '/model', 'provider/', 42]) {
      expect(splitModel(bad)).toEqual({});
    }
  });
});
