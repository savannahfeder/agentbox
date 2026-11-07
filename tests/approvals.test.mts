// The approvals spool: a worker's gated action becomes a request file, the
// founder's click becomes an answer file, and nothing but her explicit file
// can produce an allow. The protocol is files so a restart on either side
// loses nothing.
//
// THE FIRST CASE HERE USED TO ASSERT THE DEFECT (2026-09-04). It wrote two
// requests with `at: 2` and `at: 1` and expected the second one first, which
// pinned `listPending`'s sort on a number a WORKER writes -- the spool is
// `additionalDirectories` and Bash is allowed broadly, so `at: 0` bought the
// front of the card stack, permanently, in front of every real question on
// either engine. Ordering is Agentbox's own sighting now, and the attack and its
// boundaries are pinned in
// tests/a-card-a-worker-forged-cannot-hold-the-front-of-her-stack.test.mjs.
// What survives here is the half that was never about the worker's number: a
// card with an answer beside it is not pending.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listPending, answer, spoolDir } from '../main/approvals.mjs';

const root = () => fs.mkdtempSync(path.join(os.tmpdir(), 'zero-approvals-'));

describe('the approvals spool', () => {
  it('lists what is waiting, in the order it arrived, and hides decided ones', () => {
    const r = root();
    const dir = spoolDir(r);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'a.request.json'), JSON.stringify({ id: 'a', at: 2, tool: 'Bash', input: {} }));
    expect(listPending(r).map((x) => x.id)).toEqual(['a']);
    fs.writeFileSync(path.join(dir, 'b.request.json'), JSON.stringify({ id: 'b', at: 1, tool: 'Bash', input: {} }));
    expect(listPending(r).map((x) => x.id)).toEqual(['a', 'b']);

    answer(r, 'a', true);
    expect(listPending(r).map((x) => x.id)).toEqual(['b']);
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'a.answer.json'), 'utf8')).allow).toBe(true);
  });

  it('refuses to answer a request that does not exist, and rejects bad ids', () => {
    const r = root();
    fs.mkdirSync(spoolDir(r), { recursive: true });
    expect(answer(r, 'nope', true)).toBe(false);
    expect(answer(r, '../escape', true)).toBe(false);
  });

  it('an empty or missing spool is just an empty list', () => {
    expect(listPending(root())).toEqual([]);
  });
});

// Workers run on Claude Code's own defaults for their mode, with no rules of
// ours on top (w-6ade63e1aa, 2026-09-27). An ask list outranks auto mode, so a
// list here put a card in front of her for every command it named even while
// the chip said Auto: ten `vercel` cards in nine minutes on one row.
describe('the worker permission rules', () => {
  const rules = JSON.parse(fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'worker-permissions.json'), 'utf8'));

  it('carry no allow, ask or deny rules of our own', () => {
    expect(Object.keys(rules.permissions)).toEqual(['additionalDirectories']);
  });

  it('ships no store folder of its own, because the shipped file is nobody\'s home', () => {
    // Workers cwd in their product repo but constantly touch store files;
    // without a grant, those touches were most of the flood (2026-08-06). The
    // grant is still made, just not HERE: this file used to carry one
    // developer's home folder and it went out inside the download, where it
    // named a directory that exists on exactly one Mac.
    expect(rules.permissions.additionalDirectories).toEqual([]);
    expect(JSON.stringify(rules)).not.toMatch(/\/Users\/[a-z]/i);
  });
});
