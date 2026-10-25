// A teammate run sent to the cloud could not post to the team chat. Measured in
// the first real power test of teammates (2026-10-24): with two agents already
// running, Ada's next run overflowed to the cloud, her team_post failed there
// ("I couldn't post this to the team chat, so Felix hasn't been told"), and
// she reported to the inbox instead. The team chat and the teammates are files
// on this computer, which a cloud run cannot reach. So a teammate run never
// goes to the cloud, the thread says why, and its menu does not offer to move it.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';
import { whyWords } from '../renderer/src/where-why.ts';
import { threadPlace } from '../renderer/src/cloud-menu.ts';

const product = { slug: 'p', repoPath: '/r' };
const store = { listItems: () => [], listProducts: () => [product], isDue: () => true };
const make = () => new Supervisor({ storeRoot: fs.mkdtempSync(path.join(os.tmpdir(), 'zero-tm-local-')), maxConcurrentSessions: 2 }, store, '/tmp');
const RUN = { id: 'w-t1', product: 'p', labels: ['founder', 'teammate:t-abcdef1234', 'hop:0'] };
const PLAIN = { id: 'w-p1', product: 'p', labels: ['founder'] };
// A thread that only mentions teammates is not one.
const LOOKALIKE = { id: 'w-l1', product: 'p', labels: ['founder', 'teammates'] };

describe('a teammate run and the cloud', () => {
  it('is never one the cloud may take, while a plain thread and a lookalike still are', () => {
    const sup = make();
    expect(sup._cloudEligible(RUN)).toBe(false);
    expect(sup._cloudEligible(PLAIN)).toBe(true);
    expect(sup._cloudEligible(LOOKALIKE)).toBe(true);
    expect(sup._mayRunInCloud(RUN, product, '/r/.claude/worktrees/w-t1')).toBe(false);
    expect(sup._mayRunInCloud(PLAIN, product, '/r/.claude/worktrees/w-p1')).toBe(true);
  });

  it('says why it runs here, in words', () => {
    const sup = make();
    sup._cloudSetUp = () => true;
    sup._cloudFirst = () => true;
    expect(sup._whyLocal({ item: RUN, product })).toEqual({ why: 'teammate' });
    expect(sup._whyLocal({ item: PLAIN, product })).not.toEqual({ why: 'teammate' });
    expect(whyWords({ at: 'mac', why: 'teammate' }).body).toMatch(/team chat/);
  });

  it('is not offered a move to the cloud from its menu', () => {
    const cloud = { setUp: true, mode: 'all', projects: ['p'] };
    expect(threadPlace(RUN, null, cloud)).toBeNull();
    expect(threadPlace(PLAIN, null, cloud)).not.toBeNull();
  });
});
