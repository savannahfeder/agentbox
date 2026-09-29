// THE AUDIT LOG WAS THE SAME PRIMITIVE AS THE ANSWER FILE, AND REPEATABLE
// (2026-09-04).
//
// Both engines end a decision the same way: `fs.appendFileSync(path.join(dir,
// 'log.jsonl'), ...)` -- main/approval-prompt-server.mjs's `finish` for a
// Claude Code worker, main/codex-approvals.mjs's `finish` for a Codex one. The
// name is FIXED, so unlike the answer file it needs no guessing at all, and the
// bytes appended include the worker's own `command` string. Measured on this
// Mac, node v22.19.0:
//
//     fs.appendFileSync(<symlink>, line)                     -> target grew
//     open(<symlink>, O_WRONLY|O_APPEND|O_CREAT|O_NOFOLLOW)  -> ELOOP
//
// So a worker that symlinks `<storeRoot>/.approvals/log.jsonl` at a file of
// hers has a repeatable append of partly-chosen content into it, once per
// decision, forever. Pointed at `briefs/founder.md` that is agent-authored text
// inside the standing instructions every session is briefed with -- which
// CLAUDE.md says is exactly why that file lives in git.
//
// TWO THINGS HAD TO BE TRUE OF THE FIX, not one.
//
// O_NOFOLLOW closes the append. It is preferred over `lstat`-then-append
// because there is no window between the check and the write: the kernel
// refuses on the same call.
//
// But refusing alone hands the attacker the audit trail. The old `finish`
// swallows its own failure (`catch { /* the audit line is not worth the
// decision */ }`), which is right -- a decision must never be held hostage to
// its log line -- and it means a planted link would silently end auditing for
// good. So a spool entry named `log.jsonl` that is NOT a regular file is
// removed (which unlinks the LINK, never the target: `rmSync` on a symlink
// leaves what it points at alone, measured) and a real file is opened in its
// place, loudly. That is the one warning in this area that really does mean a
// worker attacked the spool.

import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createCodexApprovals } from '../main/codex-approvals.mjs';
import { answer, approvalPublicKey, listPending, spoolDir } from '../main/approvals.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ORIGINAL = '# Standing instructions\n\nBe careful with her files.\n';

const dirs = [];
function planted() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-log-link-'));
  dirs.push(root);
  const dir = spoolDir(root);
  fs.mkdirSync(dir, { recursive: true });
  const bystander = path.join(root, 'founder.md');
  fs.writeFileSync(bystander, ORIGINAL);
  return { root, dir, bystander, log: path.join(dir, 'log.jsonl') };
}
afterAll(() => { for (const d of dirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ } } });

const commandAsk = (command) => ['item/commandExecution/requestApproval', { threadId: 'T', turnId: 'U', itemId: 'I', command }];

/* ============================ the Codex half ============================= */

describe('a Codex decision, with log.jsonl symlinked at a file of hers', () => {
  it('does not append the audit line into the file the link names', async () => {
    const { root, bystander, log } = planted();
    fs.symlinkSync(bystander, log); // the attack

    const cards = createCodexApprovals({ storeRoot: root, uuid: () => 'card-1', timeoutMs: 60_000, pollMs: 60_000 });
    const asked = cards.scope({ product: 'agentbox', item: 'w-1' }).handle(...commandAsk('rm -rf ~/Zero'));
    cards.settle('card-1', false, 'no');
    await asked;

    // RED IF THE FIX IS REVERTED: the old appendFileSync writes the whole
    // request, `rm -rf ~/Zero` and all, into her standing instructions.
    expect(fs.readFileSync(bystander, 'utf8')).toBe(ORIGINAL);
  });

  it('destroys the link and keeps auditing, rather than going quiet forever', async () => {
    const { root, bystander, log } = planted();
    fs.symlinkSync(bystander, log);

    const cards = createCodexApprovals({ storeRoot: root, uuid: () => 'card-1', timeoutMs: 60_000, pollMs: 60_000 });
    const asked = cards.scope({ product: 'agentbox', item: 'w-1' }).handle(...commandAsk('rm -rf ~/Zero'));
    cards.settle('card-1', false, 'no');
    await asked;

    expect(fs.lstatSync(log).isSymbolicLink()).toBe(false);
    const lines = fs.readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    expect(lines).toHaveLength(1);
    expect(lines[0].id).toBe('card-1');
    expect(lines[0].answer.allow).toBe(false);
    expect(fs.readFileSync(bystander, 'utf8')).toBe(ORIGINAL);
  });

  it('writes the audit line as it always did when nothing is planted', async () => {
    // The case that must NOT match. A "fix" that simply stopped writing the log
    // would pass both tests above and lose the audit trail, which is the record
    // of every decision she has ever made.
    const { root, log } = planted();

    const cards = createCodexApprovals({ storeRoot: root, uuid: () => 'card-1', now: () => 1234, timeoutMs: 60_000, pollMs: 60_000 });
    const asked = cards.scope({ product: 'agentbox', item: 'w-1' }).handle(...commandAsk('git push'));
    cards.settle('card-1', true, null);
    await asked;

    const line = JSON.parse(fs.readFileSync(log, 'utf8').trim());
    expect(line).toMatchObject({ id: 'card-1', at: 1234, product: 'agentbox', item: 'w-1', tool: 'Bash', decidedAt: 1234 });
    expect(line.input.command).toBe('git push');
    expect(line.answer).toMatchObject({ allow: true, note: null });
  });

  it('appends, so two decisions are two lines', async () => {
    const { root, log } = planted();
    let n = 1;
    const cards = createCodexApprovals({ storeRoot: root, uuid: () => `card-${n}`, timeoutMs: 60_000, pollMs: 60_000 });
    const scope = cards.scope({ product: 'agentbox', item: 'w-1' });
    const first = scope.handle(...commandAsk('git status'));
    cards.settle('card-1', true, null);
    await first;
    n = 2;
    const second = scope.handle(...commandAsk('git push'));
    cards.settle('card-2', false, null);
    await second;

    expect(fs.readFileSync(log, 'utf8').trim().split('\n')).toHaveLength(2);
  });
});

/* ============================ the Claude half ============================ */
//
// Driven as the real thing rather than by importing it: main/approval-prompt-
// server.mjs is a process the CLI spawns and speaks JSON-RPC to over stdio, and
// its `finish` only runs at the end of a real decision.

/** Ask the server for one approval, answer it through the app's own door, and
 *  give back the request id it minted. */
function decideOnce(root, allow) {
  const dir = spoolDir(root);
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(here, '..', 'main', 'approval-prompt-server.mjs')], {
      // The public key rides here exactly as `mcpServers` sends it: without one
      // the server refuses everything rather than believing a file it cannot
      // check (tests/a-worker-cannot-write-its-own-approval), and this test is
      // about the audit line rather than about that gate.
      env: {
        ...process.env,
        ZERO_APPROVALS_DIR: dir,
        ZERO_APPROVALS_PUBKEY: approvalPublicKey(),
        ZERO_PRODUCT: 'agentbox',
        ZERO_ITEM: 'w-1',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const fail = (why) => { try { child.kill('SIGKILL'); } catch { /* gone */ } reject(new Error(why)); };
    const giveUp = setTimeout(() => fail('the approvals server never answered'), 20_000);
    let out = '';
    child.stdout.on('data', (b) => {
      out += b;
      if (!out.includes('\n')) return;
      clearTimeout(giveUp);
      child.kill();
      resolve(JSON.parse(JSON.parse(out.split('\n')[0]).result.content[0].text));
    });
    child.stdin.write(`${JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'approval_prompt', arguments: { tool_name: 'Bash', input: { command: 'rm -rf ~/Zero' } } },
    })}\n`);
    // Her click, once the worker's request is actually in the spool -- drawn
    // first, because her decision is signed against the card that was put in
    // front of her (tests/an-approval-authorises-only-the-action-she-read).
    const watch = setInterval(() => {
      const req = fs.readdirSync(dir).find((f) => f.endsWith('.request.json'));
      if (!req) return;
      clearInterval(watch);
      listPending(root);
      answer(root, req.replace('.request.json', ''), allow, null);
    }, 50);
    child.on('exit', () => { clearInterval(watch); clearTimeout(giveUp); });
  });
}

describe('a Claude Code decision, with log.jsonl symlinked at a file of hers', () => {
  it('does not append the audit line into the file the link names', async () => {
    const { root, bystander, log } = planted();
    fs.symlinkSync(bystander, log);

    await expect(decideOnce(root, true)).resolves.toMatchObject({ behavior: 'allow' });

    expect(fs.readFileSync(bystander, 'utf8')).toBe(ORIGINAL);
    expect(fs.lstatSync(log).isSymbolicLink()).toBe(false);
    expect(JSON.parse(fs.readFileSync(log, 'utf8').trim()).input.command).toBe('rm -rf ~/Zero');
  }, 30_000);

  it('audits the ordinary decision, and reaps the pair', async () => {
    const { root, dir, log } = planted();

    await expect(decideOnce(root, false)).resolves.toMatchObject({ behavior: 'deny' });

    const line = JSON.parse(fs.readFileSync(log, 'utf8').trim());
    expect(line.answer.allow).toBe(false);
    expect(line.tool).toBe('Bash');
    expect(fs.readdirSync(dir)).toEqual(['log.jsonl']);
  }, 30_000);
});
