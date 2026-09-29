// TWO SPAWNS IN ONE TICK MUST NOT READ EACH OTHER'S FILES.
//
// FOUND 2026-09-07 while writing the harness,
// which drives a real Supervisor over a throwaway store on a Mac that is also
// running Agentbox. The proof's spawns rewrote the running app's worker files,
// because both instances write to ONE fixed name in the shared temp directory:
//
//   `writeMcpConfig`      -> <tmp>/zero-mcp.json
//   `writeWorkerSettings` -> <tmp>/agentbox-worker-settings.json
//
// THAT COLLISION IS NOT ONLY BETWEEN TWO ASTRALS. It is inside one, and that is
// the half that costs her something today. `writeWorkerSettings(product)`
// builds PER-PRODUCT content -- `additionalDirectories` is the store root plus
// THIS product's folder -- and `tick` spawns straight down its queue in one
// synchronous `for` loop, several workers, several products, no await between
// them. Each spawn writes that one file and hands its path to a child that
// opens it later, on the child's own schedule. So:
//
//   spawnWorker(P1)  writes the file naming P1's folder
//   spawnWorker(P2)  overwrites it, naming P2's folder
//   the P1 worker    finally starts, reads the file, and is granted P2's folder
//                    and NOT its own
//
// Both halves of that are bugs. A worker denied its own product's folder turns
// every Read and Edit of a store doc into an approval card, which CLAUDE.md
// records as most of the 2026-08-06 card flood -- "she was approving blind at
// one per second, which is no gate at all". And a worker handed a folder that
// belongs to a DIFFERENT product has been granted something nobody decided to
// grant it.
//
// THE FIX IS THAT THE NAME FOLLOWS THE RUN, AND THE FILES GO WHEN IT DOES. This
// branch first fixed it by naming each file after a digest of its own bytes,
// and main fixed the same race in the same week by naming both files after the
// spawn's `runId` and removing them when the process ends or never starts. Only
// one of the two can be true at a time, and the merge kept hers: a
// content-addressed name is SHARED by two spawns that want the same rules, so
// the first of them to die would delete a path the second had already been
// handed -- which is this bug again, from the other end. The per-run lifecycle
// is pinned in tests/a-worker-gets-its-connector-rules-per-spawn.test.mjs; what
// stays here is the pair of collisions that were measured on 2026-09-07,
// because those are facts about her Mac and not about either mechanism.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Supervisor } from '../main/supervisor.mjs';
import { NAME } from '../shared/product-name.mjs';

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

let root;
let appDir;

const makeSupervisor = (config = {}) => {
  const store = { listItems: () => [], listProducts: () => [], isDue: () => true };
  return new Supervisor({ storeRoot: root, accountId: 'acct', maxConcurrentSessions: 3, ...config }, store, appDir);
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-two-spawns-'));
  appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-two-spawns-app-'));
  fs.copyFileSync(path.join(REPO, 'worker-permissions.json'), path.join(appDir, 'worker-permissions.json'));
  fs.mkdirSync(path.join(appDir, 'scripts'), { recursive: true });
  fs.copyFileSync(path.join(REPO, 'scripts', 'approval-server.sh'), path.join(appDir, 'scripts', 'approval-server.sh'));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(appDir, { recursive: true, force: true });
});

describe('the permission rules one worker was handed', () => {
  // THE CASE SHE WOULD HIT: two products spawning in the same tick.
  it('still name that worker\'s own product after another product spawns', () => {
    const sup = makeSupervisor();
    const one = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-product-one-'));
    const two = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-product-two-'));

    const forOne = sup.writeWorkerSettings({ dir: one });
    // The second spawn of the same tick, before the first child has opened its
    // file. This is the line the whole bug is: today it lands on the same path.
    const forTwo = sup.writeWorkerSettings({ dir: two });

    const readByWorkerOne = JSON.parse(fs.readFileSync(forOne, 'utf8'));
    expect(readByWorkerOne.permissions.additionalDirectories).toEqual([root, one]);
    const readByWorkerTwo = JSON.parse(fs.readFileSync(forTwo, 'utf8'));
    expect(readByWorkerTwo.permissions.additionalDirectories).toEqual([root, two]);

    fs.rmSync(one, { recursive: true, force: true });
    fs.rmSync(two, { recursive: true, force: true });
  });

  // THE BOUNDARY EITHER SIDE. Two spawns that want the SAME rules still get a
  // file each, because the name is the run and not the bytes. The directory
  // that would otherwise grow for as long as the app runs is answered by
  // `removeSpawnFiles` instead of by sharing, and it has to be: a shared path is
  // one the first run to die takes away from the second, which is this same bug
  // read from the other end.
  it('is a file each even when two spawns really do want the same rules', () => {
    const sup = makeSupervisor();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-product-same-'));
    expect(sup.writeWorkerSettings({ dir })).not.toBe(sup.writeWorkerSettings({ dir }));
    expect(sup.writeWorkerSettings(null)).not.toBe(sup.writeWorkerSettings(null));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  // THE CASE THAT MUST NOT MATCH: rules that differ must not share a name, or
  // the fix has done nothing.
  it('is a different file when the rules differ', () => {
    const sup = makeSupervisor();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-product-diff-'));
    expect(sup.writeWorkerSettings({ dir })).not.toBe(sup.writeWorkerSettings(null));
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('the mcp config one worker was handed', () => {
  // TWO ASTRALS ON ONE MAC, which is the ordinary state of this repo: her app
  // runs from ~/Astral while a harness, a test or a proof script runs from a
  // worktree. The approvals directory named inside this file is where a
  // worker's card goes, so reading another instance's copy means raising cards
  // into a spool nobody is watching -- a worker parked for fifteen minutes and
  // then denied, with nothing on her screen.
  it(`still names its own store after a second ${NAME} writes one`, () => {
    const mine = makeSupervisor();
    const otherRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-other-store-'));
    const theirs = makeSupervisor({ storeRoot: otherRoot });

    const forMine = mine.writeMcpConfig();
    const forTheirs = theirs.writeMcpConfig();

    const readByMyWorker = JSON.parse(fs.readFileSync(forMine, 'utf8'));
    expect(readByMyWorker.mcpServers['zero-approvals'].env.ZERO_APPROVALS_DIR)
      .toBe(path.join(root, '.approvals'));
    const readByTheirWorker = JSON.parse(fs.readFileSync(forTheirs, 'utf8'));
    expect(readByTheirWorker.mcpServers['zero-approvals'].env.ZERO_APPROVALS_DIR)
      .toBe(path.join(otherRoot, '.approvals'));

    fs.rmSync(otherRoot, { recursive: true, force: true });
  });

  it(`is a file each when two spawns of one ${NAME} want the same config`, () => {
    const sup = makeSupervisor();
    expect(sup.writeMcpConfig()).not.toBe(sup.writeMcpConfig());
  });
});
