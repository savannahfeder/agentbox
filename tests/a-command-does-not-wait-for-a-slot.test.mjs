// A COMMAND SHE TYPED IS NOT AN AGENT, SO THE CAP DOES NOT COUNT IT.
//
// Before this, a `/usage` sent into a full fleet did what every other answer
// does: it sat in the queue until a worker finished. The three runs measured on
// this row took 2.8, 4.0 and 4.8 seconds, and the sessions it would have been
// queued behind ran a median of 21 minutes (the numbers in _preemptFor). So the
// wait was hundreds of times longer than the thing being waited for.
//
// Two halves, and both are here. A command starts even with every slot full,
// and a command that is running is not occupying a slot anybody else needs.
//
// THE DOOR IS EXACTLY EIGHT WORDS WIDE. `commandPrompt` is what decides, and it
// returns null for everything that is not one of Claude Code's own commands, so
// an ordinary reply still queues exactly as it did. The last test here is that
// guard, and it is the one that matters if this file ever has to be believed.

import { describe, it, expect, beforeEach } from 'vitest';
import { Supervisor } from '../main/supervisor.mjs';

// A MAC WITH ONE CLAUDE LOGIN ON IT. Since 2026-08-31 the fleet's account list
// is what is signed in on the disk and not only what the config names
// (main/account-discovery.mjs), so a Supervisor built with no `home` reads
// whoever is signed in on the machine running the suite — and a developer with
// a second subscription would silently get twice the capacity these tests are
// about. A home with nothing in it is the machine every one of them means.
const ONE_ACCOUNT_HOME = '/nonexistent-home-with-no-second-account';


const NOW = 1_788_134_429_008; // a fixed clock for every row in this file

const store = (items) => ({
  listItems: () => items,
  listProducts: () => [],
  isDue: () => true,
  settleAnswer() {},
});

// A card she has answered. The answer is the continuation's whole reason to run.
const answered = (id, answer, extra = {}) => ({
  id, product: 'agentbox', status: 'open', kind: 'question', labels: ['founder'],
  priority: 5, answer, createdAt: NOW - 60_000, updatedAt: NOW - 60_000,
  claim: null, claimExpired: false,
  wrote: { answer: { ts: NOW - 60_000, source: 'founder' } },
  ...extra,
});

// Her own fresh task: the 'founder' label is what compose stamps.
const hers = (id, extra = {}) => ({
  id, product: 'agentbox', status: 'open', kind: 'directive', labels: ['founder'],
  priority: 5, answer: undefined, createdAt: NOW, updatedAt: NOW,
  claim: null, claimExpired: false, ...extra,
});

let sup; let spawned;
const build = (items, slots = 1) => {
  sup = new Supervisor(
    { home: ONE_ACCOUNT_HOME, storeRoot: '/nonexistent-zero-root', maxConcurrentSessions: slots, authProfiles: ['default'] },
    store(items),
    '/nonexistent-app',
  );
  spawned = [];
  sup.spawnWorker = (item) => { spawned.push(item.id); sup.sessions.set(item.id, { itemId: item.id }); };
  return sup;
};

// A worker already up on some other row, filling the fleet. `command` absent is
// what an ordinary session looks like.
const fill = (n) => {
  for (let i = 0; i < n; i += 1) {
    sup.sessions.set(`w-busy-${i}`, { itemId: `w-busy-${i}`, product: 'agentbox' });
  }
};

beforeEach(() => { build([]); });

describe('a command sent into a full fleet', () => {
  // Her case, at her numbers: four running, max four, /usage typed on a fifth
  // row. Before this it spawned nothing and she waited on a worker.
  it('runs even when every slot is taken', async () => {
    build([answered('w-5d1ad29efa', '/usage')], 4);
    fill(4);
    await sup.tick();
    expect(spawned).toEqual(['w-5d1ad29efa']);
  });

  // The same fleet, an ordinary reply. This is the half that must NOT change:
  // a real continuation is a worker and workers are what the cap is for.
  it('still makes an ordinary reply wait its turn', async () => {
    build([answered('w-ordinary', 'yes, merge it')], 4);
    fill(4);
    await sup.tick();
    expect(spawned).toEqual([]);
  });

  // The cap does not skip a row it cannot fit, it BREAKS out of the queue. So a
  // command sitting behind other answered rows is only reached because the
  // command is asked about above the cap rather than counted out below it.
  it('is not buried behind the answers in front of it', async () => {
    build([
      answered('w-a', 'go ahead'),
      answered('w-b', 'go ahead'),
      answered('w-usage', '/usage'),
    ], 2);
    fill(2);
    await sup.tick();
    expect(spawned).toEqual(['w-usage']);
  });

  // Every spelling on the menu, and its aliases: /cost and /stats are Claude
  // Code's own words for /usage, and the menu offers /context and /mcp beside
  // it. One of the eight is one of the eight however she typed it.
  it('lets any of the eight through, aliases included', async () => {
    for (const word of ['/usage', '/cost', '/context', '/mcp', '/compact']) {
      build([answered(`w-${word.slice(1)}`, word)], 1);
      fill(1);
      await sup.tick();
      expect(spawned, word).toEqual([`w-${word.slice(1)}`]);
    }
  });

  // A slash mid-sentence is a path or a date, and a word that is not one of the
  // eight is not a command at all. Both are ordinary replies and both queue.
  it('does not open the door to anything that merely starts with a slash', async () => {
    for (const reply of ['/deploy the branch', 'ship it, see main/supervisor.mjs', '/review']) {
      build([answered('w-not-a-command', reply)], 1);
      fill(1);
      await sup.tick();
      expect(spawned, reply).toEqual([]);
    }
  });
});

describe('a command that is running', () => {
  // The second half of her sentence. A four-second session must not hold a slot
  // a worker is waiting for.
  it('does not take a slot off the work behind it', async () => {
    build([hers('w-real-work')], 1);
    sup.sessions.set('w-usage', { itemId: 'w-usage', product: 'agentbox', command: true });
    await sup.tick();
    expect(spawned).toEqual(['w-real-work']);
  });

  // And an ordinary session still does, which is the same guard as above read
  // from the other end.
  it('unlike a worker, which still does', async () => {
    build([hers('w-real-work')], 1);
    sup.sessions.set('w-other', { itemId: 'w-other', product: 'agentbox' });
    await sup.tick();
    expect(spawned).toEqual([]);
  });

  it('is not in the number the cap is measured against', () => {
    build([], 4);
    fill(3);
    sup.sessions.set('w-usage', { itemId: 'w-usage', product: 'agentbox', command: true });
    expect(sup.sessions.size).toBe(4);
    expect(sup._load()).toBe(3);
  });
});
