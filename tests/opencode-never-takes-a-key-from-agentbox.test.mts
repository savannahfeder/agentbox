// WHAT THIS GUARDS. CLAUDE.md: "Workers run on the user's own Claude or Codex
// subscription. Never pass an API key into a worker's environment."
//
// OpenCode is the first harness where that rule could be broken by accident,
// because it is bring-your-own-model and reads a provider key straight out of
// its environment if it finds one. Measured on OpenCode 1.18.35 (2026-10-07)
// and again on 2.3.2 (2026-11-22): with no credentials of its own it still
// lists ten models and finishes a run at cost 0, the OpenCode Zen free tier.
// So there is never a reason to hand it a key, and these tests make sure the
// app cannot.
//
// What it IS handed is its config, written into its environment, and one file
// of standing instructions that config names.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { harnessFor } from '../main/harnesses.mts';
import { harnessDefinition } from '../shared/harness-definitions.mts';
import { openCodePermissionConfig, prepareOpenCode } from '../main/harnesses/opencode.mts';

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
    expect(harness().signedIn()).toBe(true);
    expect(harness().profiles()).toEqual(['default']);
    expect(harness().accountKey()).toBe('opencode:default');
    expect(harness().profileEnv({ PATH: '/bin' }, 'default')).toEqual({ PATH: '/bin' });
  });
});

describe('what a thread on OpenCode is handed', () => {
  const laidOut = (mode: string | null = null, instructions = 'Keep answers short.') => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-thread-'));
    const env = prepareOpenCode({ dir, cwd: '/repo', instructions, mode });
    const config = JSON.parse(env.OPENCODE_CONFIG_CONTENT!);
    return { dir, env, config };
  };

  it('is its config in the environment and one file in the folder it was given, nowhere in the project', () => {
    const { dir, env } = laidOut();
    expect(Object.keys(env).sort()).toEqual(['OPENCODE_CONFIG_CONTENT', 'OPENCODE_CONFIG_PROJECT_DISABLE', 'OPENCODE_DISABLE_PROJECT_CONFIG']);
    expect(fs.readdirSync(dir)).toEqual(['instructions.md']);
    // A config path the person's own shell exports is still scrubbed on the way in.
    expect(harnessDefinition('opencode').homeEnv).toBe('OPENCODE_CONFIG');
  });

  it('carries the standing instructions as a file its config names', () => {
    const { dir, config } = laidOut();
    expect(config.instructions).toEqual([path.join(dir, 'instructions.md')]);
    expect(fs.readFileSync(path.join(dir, 'instructions.md'), 'utf8')).toBe('Keep answers short.\n');
    expect(laidOut(null, '').config.instructions).toBeUndefined();
  });

  it('holds nothing that looks like a credential', () => {
    expect(JSON.stringify(laidOut().config)).not.toMatch(/key|token|secret|password/i);
  });

  // OpenCode has no sandbox and no reviewer of its own: a shell command asks
  // unless the person chose a mode that asks for nothing.
  it('asks before a shell command, a page fetch and a file outside the folder, whatever the mode but the free ones', () => {
    for (const mode of [null, 'auto', 'acceptEdits', 'default', 'plan', 'read-only', 'dontAsk']) {
      const { permission } = openCodePermissionConfig(mode);
      expect([permission.bash, permission.webfetch, permission.websearch, permission.external_directory], String(mode)).toEqual(['ask', 'ask', 'ask', 'ask']);
    }
  });

  it('lets edits inside the folder go ahead unless the mode asks first', () => {
    for (const mode of [null, 'auto', 'acceptEdits']) expect(openCodePermissionConfig(mode).permission.edit, String(mode)).toBe('allow');
    for (const mode of ['default', 'plan', 'read-only']) expect(openCodePermissionConfig(mode).permission.edit, mode).toBe('ask');
  });

  it('asks for nothing only in the modes that say so', () => {
    for (const mode of ['bypassPermissions', 'full-access']) {
      const { permission } = openCodePermissionConfig(mode);
      expect([permission.bash, permission.edit, permission.external_directory], mode).toEqual(['allow', 'allow', 'allow']);
    }
  });

  it('never asks about reading, which would be a card per file', () => {
    expect(openCodePermissionConfig().permission).not.toHaveProperty('read');
    expect(openCodePermissionConfig().$schema).toBe('https://opencode.ai/config.json');
  });
});
