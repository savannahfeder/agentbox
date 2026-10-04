// NO CODEX ON THIS MAC STARTS NO CODEX.
//
// 2026-10-04: the first teammate to install the team version saw, before she
// had done anything, an error in the terminal from codex-app-server:
// ERR_INVALID_ARG_TYPE, a missing path to the Codex binary. She does not use
// Codex. The window asks both agents to refresh their model lists when it
// opens (components/AgentUpdates.tsx), and the Codex refresh spawned
// `config.codexBin`, which is null by design when Codex is not installed
// (main/config.mjs), so `spawn(null)` threw. Codex is optional; a Mac without
// it should hear nothing about it.
import { it, expect } from 'vitest';
import os from 'node:os';
import { refreshAgentModels } from '../main/refresh-agent-models.mjs';

it('refreshing Codex on a Mac without Codex is quietly nothing', async () => {
  await expect(refreshAgentModels('codex', { codexBin: null, home: os.tmpdir() }, os.tmpdir())).resolves.toBeUndefined();
});

it('an empty path counts as not installed too', async () => {
  await expect(refreshAgentModels('codex', { codexBin: '', home: os.tmpdir() }, os.tmpdir())).resolves.toBeUndefined();
});

it('Claude still refreshes when Codex is missing', async () => {
  await expect(refreshAgentModels('claude', { claudeBin: null, codexBin: null }, os.tmpdir())).resolves.toBeUndefined();
});

it('a Codex path that is set is still tried, and a broken one still fails out loud', async () => {
  await expect(refreshAgentModels('codex', { codexBin: '/nonexistent/codex', home: os.tmpdir() }, os.tmpdir())).rejects.toThrow();
}, 20000);
