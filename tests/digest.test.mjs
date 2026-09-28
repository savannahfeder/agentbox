// The digest is an INVARIANT, not a schedule.
//
// Nothing fires on a clock. Every tick asks whether the invariant holds and,
// where it does not, spawns the one session that makes it hold. That is what
// makes downtime free: there is no queue of missed firings to catch up on, only
// a condition that is currently false.
//
// The bug this replaces: five digest rows in her inbox on 2026-08-06, because
// workers appended to one row's `note` until it hit the store's 8,192 character
// ceiling and then honestly opened a new row rather than silently truncate.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const now = () => Date.now();

function makeSupervisor(items, { autonomous = ['p'] } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-digest-'));
  const store = {
    listItems: () => items,
    listProducts: () => [{ slug: 'p', name: 'P', dir: '/tmp/nowhere' }],
    isDue: (i, t = Date.now()) => !i?.runAt || i.runAt <= t,
  };
  const sup = new Supervisor({
    storeRoot: root, maxConcurrentSessions: 3,
    autonomousProducts: autonomous,
  }, store, root);
  sup.spawned = [];
  sup.spawnWorker = (item, opts) => sup.spawned.push({ item, opts });
  return sup;
}

const digests = (sup) => sup.spawned.filter((s) => s.item.kind === 'digest');
const news = (id, at) => ({ id, product: 'p', status: 'done', kind: 'task', createdAt: at, updatedAt: at });
const digestRow = (id, at, status = 'done') => ({
  id, product: 'p', status, kind: 'review', labels: ['digest'],
  title: `Digest ${id}`, createdAt: at, updatedAt: at,
});

describe('when a digest is owed', () => {
  it('writes one when news exists and the gap has passed', async () => {
    const sup = makeSupervisor([digestRow('d-1', now() - 13 * HOUR), news('w-1', now() - HOUR)]);
    await sup.tick();
    expect(digests(sup).length).toBe(1);
  });

  it('stays quiet inside the twelve hour floor, however much happened', async () => {
    const sup = makeSupervisor([
      digestRow('d-1', now() - 2 * HOUR),
      news('w-1', now() - HOUR), news('w-2', now() - HOUR), news('w-3', now() - HOUR),
    ]);
    await sup.tick();
    expect(digests(sup)).toEqual([]);
  });

  // A digest with no news is a row that says nothing, which is the thing she
  // asked us to stop. Silence is the correct output for a quiet stretch.
  it('writes nothing when nothing finished since the last one', async () => {
    const sup = makeSupervisor([
      digestRow('d-1', now() - 13 * HOUR),
      news('w-1', now() - 20 * HOUR), // finished BEFORE the last digest
    ]);
    await sup.tick();
    expect(digests(sup)).toEqual([]);
  });

  it('writes the first one for a product that has never had a digest', async () => {
    const sup = makeSupervisor([news('w-1', now() - HOUR)]);
    await sup.tick();
    expect(digests(sup).length).toBe(1);
  });
});

// The heart of it. Three days away is ONE digest, not six, and not because
// anything collapsed them: six were never representable.
describe('an arbitrary gap produces exactly one digest', () => {
  it('three days of downtime yields one, and then quiet', async () => {
    const items = [
      digestRow('d-1', now() - 3 * DAY),
      news('w-1', now() - 2.5 * DAY), news('w-2', now() - 2 * DAY),
      news('w-3', now() - DAY), news('w-4', now() - 2 * HOUR),
    ];
    const sup = makeSupervisor(items);
    await sup.tick();
    expect(digests(sup).length).toBe(1);

    // The session writes its row; the invariant now holds and stays held.
    items.push(digestRow('d-2', now(), 'open'));
    sup.lastDigestTry = {}; // even with the retry backoff cleared
    await sup.tick();
    expect(digests(sup).length).toBe(1);
  });

  it('does not respawn every tick while one attempt is in flight', async () => {
    const sup = makeSupervisor([digestRow('d-1', now() - 13 * HOUR), news('w-1', now() - HOUR)]);
    await sup.tick();
    await sup.tick();
    await sup.tick();
    expect(digests(sup).length).toBe(1);
  });
});

// Her call, 2026-08-06: "yes rewriting is good". An open digest is rewritten to
// cover the wider window; it is never joined by a second row.
describe('an open digest is rewritten, not joined', () => {
  it('names the open row so the session rewrites it', async () => {
    const sup = makeSupervisor([
      digestRow('d-1', now() - 13 * HOUR, 'open'),
      news('w-1', now() - HOUR),
    ]);
    await sup.tick();
    const brief = digests(sup)[0].item.body;
    expect(brief).toContain('d-1');
    expect(brief).toMatch(/REWRITE ITS BODY/);
    expect(brief).toMatch(/Do not create a second row/);
  });

  it('tells a session with no open row to create one', async () => {
    const sup = makeSupervisor([
      digestRow('d-1', now() - 13 * HOUR, 'done'),
      news('w-1', now() - HOUR),
    ]);
    await sup.tick();
    expect(digests(sup)[0].item.body).toMatch(/No digest row is open, so create one/);
  });

  // The 8,192 character ceiling is what put five rows in her inbox. The body
  // holds four times as much, and overflow is answered by summarising.
  it('sends the news to the body, never the note', async () => {
    const sup = makeSupervisor([digestRow('d-1', now() - 13 * HOUR), news('w-1', now() - HOUR)]);
    await sup.tick();
    const brief = digests(sup)[0].item.body;
    expect(brief).toMatch(/Write the body, never the note/);
    expect(brief).toMatch(/never becomes a second\s+row/);
  });
});

describe('who gets a digest at all', () => {
  // A digest is what a standing grant trades an inbox row for. Without one,
  // finished work still reaches her as a review.
  it('not a product without a standing grant', async () => {
    const sup = makeSupervisor(
      [digestRow('d-1', now() - 13 * HOUR), news('w-1', now() - HOUR)],
      { autonomous: [] },
    );
    await sup.tick();
    expect(digests(sup)).toEqual([]);
  });

  // A personal workspace was excluded here, having no company to report on.
  // Personal projects are deleted (w-d19d6d387c, 2026-09-22).

  it('not while the whole supervisor is paused', async () => {
    const sup = makeSupervisor([digestRow('d-1', now() - 13 * HOUR), news('w-1', now() - HOUR)]);
    sup.paused = true;
    await sup.tick();
    expect(digests(sup)).toEqual([]);
  });
});
