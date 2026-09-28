// RENAMING THIS APP DOES NOT TAKE THE STORE AWAY FROM A WORKER.
//
// The store is an MCP server and its name is this app's name, so a rename
// changes what the store is CALLED in two places that outlive the rename and
// that are not ours to rewrite:
//
//   HER CONFIG. `--allowedTools mcp__<store>` in zero.config.json is how a
//   Claude Code worker is given the store at all. After a rename it names a
//   server that is not started any more. The worker comes up looking
//   configured and holding nothing: it cannot claim a row, checkpoint or
//   finish one, and no error is raised anywhere, because a grant for a tool
//   that does not exist is not a failure of anything.
//
//   AN OLD CODEX THREAD. A thread is resumed for every reply she writes, and
//   the resume is a deep merge over the thread's own config, so a thread that
//   started before the rename still carries the server under the old slug. The
//   model reads its own transcript and calls the tool by the name it used last
//   time. `codex-approvals.mjs` compared that name with one string, so the app
//   failed to recognise its own store and put its own plumbing in front of her
//   as a card, or refused it.
//
// The mechanism is the one this app already keeps for its data folder and its
// env vars: `WAS`, every name it has had. Nothing is hardcoded and nothing
// outside this app is widened: a name it has never answered to is not its own.
//
// The 2026-09-23 row this came from (w-1be7222bc9) was NOT this bug. That one
// was an app process nineteen hours older than the build on disk, and the two
// names in its rollout are what dated it. The founder's answer on reading it:
// "We need to be able to handle this edge-case as users will frequently rename
// their projects."

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { nameSlug, nameSlugs, WAS_SLUGS, isOurSlug } from '../shared/product-name.mjs';
import { storeGrantUnderAnyOfOurNames } from '../main/supervisor.mjs';
import { createCodexApprovals, isStoreElicitation } from '../main/codex-approvals.mjs';
import { listPending } from '../main/approvals.mjs';

const ELICIT = 'mcpServer/elicitation/request';
const WAS_CALLED = WAS_SLUGS[0];

const askToCall = (serverName, tool = 'claim_work_item') => ({
  threadId: 'T-1',
  turnId: 'TURN-1',
  serverName,
  mode: 'form',
  message: `Allow the ${serverName} MCP server to run tool "${tool}"?`,
  requestedSchema: { type: 'object', properties: {} },
  _meta: { codex_approval_kind: 'mcp_tool_call', persist: ['session', 'always'], tool_params: {} },
});

const root = () => fs.mkdtempSync(path.join(os.tmpdir(), 'rename-store-'));

describe('the names this app has answered to', () => {
  it('lists the current one first and keeps the old ones', () => {
    expect(nameSlugs[0]).toBe(nameSlug);
    expect(nameSlugs).toEqual([nameSlug, ...WAS_SLUGS]);
    expect(WAS_SLUGS.length).toBeGreaterThan(0);
  });

  it('claims no name this app has never had', () => {
    expect(isOurSlug(nameSlug)).toBe(true);
    expect(isOurSlug(WAS_CALLED)).toBe(true);
    expect(isOurSlug('playwright')).toBe(false);
    expect(isOurSlug('')).toBe(false);
    expect(isOurSlug(undefined)).toBe(false);
  });
});

describe('a store grant her config still spells the old way', () => {
  it('reaches the worker as a grant for the store server that exists', () => {
    const args = ['--allowedTools', `mcp__${WAS_CALLED}`, '--permission-mode', 'auto'];
    expect(storeGrantUnderAnyOfOurNames(args)).toEqual(
      ['--allowedTools', `mcp__${nameSlug}`, '--permission-mode', 'auto'],
    );
  });

  it('is corrected inside a comma-separated list and at tool level', () => {
    const args = ['--allowedTools', `mcp__${WAS_CALLED}__claim_work_item,mcp__playwright,Bash`];
    expect(storeGrantUnderAnyOfOurNames(args)).toEqual(
      ['--allowedTools', `mcp__${nameSlug}__claim_work_item,mcp__playwright,Bash`],
    );
  });

  // Her own MCP servers ride on a worker too: there is no --strict-mcp-config on
  // the spawn. A grant for one of those is live and must come through untouched.
  it('leaves a server that was never this app alone', () => {
    const args = ['--allowedTools', 'mcp__playwright,mcp__context7', '--permission-mode', 'auto'];
    expect(storeGrantUnderAnyOfOurNames(args)).toEqual(args);
  });

  // Identity, not just equality: an untouched config is the SAME array, which is
  // what the caller reads to decide whether to say anything at all.
  it('gives back the very array it was given when nothing needed correcting', () => {
    const args = ['--allowedTools', `mcp__${nameSlug}`];
    expect(storeGrantUnderAnyOfOurNames(args)).toBe(args);
  });

  it('is not confused by something that is not a grant', () => {
    const args = ['--model', 'opus', 42, null];
    expect(storeGrantUnderAnyOfOurNames(args)).toBe(args);
    expect(storeGrantUnderAnyOfOurNames(null)).toBe(null);
  });
});

describe('a Codex thread that started before the rename', () => {
  it('is recognised as the store when it calls the old name', () => {
    expect(isStoreElicitation(askToCall(WAS_CALLED), nameSlug)).toBe(true);
    expect(isStoreElicitation(askToCall(nameSlug), nameSlug)).toBe(true);
  });

  it('is still not a blank cheque for anything else', () => {
    expect(isStoreElicitation(askToCall('playwright'), nameSlug)).toBe(false);
    expect(isStoreElicitation(askToCall(''), nameSlug)).toBe(false);
    // A run with no store server of its own, which is every personal session.
    expect(isStoreElicitation(askToCall(WAS_CALLED), null)).toBe(false);
  });

  it('claims its row with no card in front of the founder', async () => {
    const storeRoot = root();
    const approvals = createCodexApprovals({ storeRoot });
    const cards = approvals.scope({ product: 'astral', item: 'w-1', storeServer: nameSlug });

    const answered = await cards.handle(ELICIT, askToCall(WAS_CALLED));

    expect(answered).toBe('accept');
    expect(listPending(storeRoot)).toEqual([]);
    fs.rmSync(storeRoot, { recursive: true, force: true });
  });

  it('does not let another server through by calling itself the store', async () => {
    const storeRoot = root();
    const approvals = createCodexApprovals({ storeRoot });
    const cards = approvals.scope({ product: 'astral', item: 'w-1', storeServer: nameSlug });

    cards.handle(ELICIT, askToCall('playwright', 'browser_navigate'));
    await new Promise((resolve) => { setImmediate(resolve); });

    expect(listPending(storeRoot)).toHaveLength(1);
    fs.rmSync(storeRoot, { recursive: true, force: true });
  });
});
