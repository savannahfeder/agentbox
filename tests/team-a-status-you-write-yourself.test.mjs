// A STATUS LINE YOU WRITE YOURSELF, END TO END.
//
// The founder, 2026-10-01: "If I'm going to spend a day or a few days in
// meetings, I don't want the board to make it seem like I'm not doing any
// work." Four of six people interviewed asked for the same thing. So a person
// carries one short line they wrote, their teammates see it on the Team page,
// and it stops being there when the time they chose has passed.
//
// What this covers, and why each case is here:
//   - a teammate reads it, a stranger never does (the whole point of putting
//     it in the cloud rather than on one Mac);
//   - it is gone the moment it expires, from the READER's clock, with the
//     second either side of that moment checked, because an expiry that only
//     works when the writer's Mac is awake is the bug this design avoids;
//   - the owner's Mac clears a lapsed one on its next sync, so old text does
//     not sit in the database for good;
//   - you cannot write somebody else's;
//   - the words it is drawn with, which are the only thing a person reads.
import { it, expect, describe, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mjs';
import { createTeamService } from '../main/team/index.mjs';
import { memorySession } from '../main/team/session.mjs';
import { cleanStatus, holdEnds, holdsUntil, hasLapsed, liveStatus, STATUS_MAX } from '../shared/team-status.mjs';

const DAY = 86_400_000;

describe('a line you wrote, in the cloud', () => {
  let cloud; let maya; let theo; let jun; let team;

  beforeEach(async () => {
    cloud = createMemoryCloud();
    maya = memoryBackend(cloud, signUpMemory(cloud, { email: 'maya@northwind.test', name: 'Maya Chen' }));
    theo = memoryBackend(cloud, signUpMemory(cloud, { email: 'theo@northwind.test', name: 'Theo Park' }));
    jun = memoryBackend(cloud, signUpMemory(cloud, { email: 'jun@elsewhere.test', name: 'Jun Ito' }));
    team = await maya.createTeam('Northwind');
    await maya.invite(team.id, 'theo@northwind.test');
    await theo.acceptInvite(team.id);
  });

  const statusOf = (people, who) => people.find((p) => p.id === who.personId)?.status ?? null;

  it('reaches a teammate, with the time it holds until', async () => {
    const until = Date.now() + 2 * DAY;
    await maya.setStatus({ text: 'At the Acme onsite, back Monday', until });
    expect(statusOf(await theo.teamPeople(team.id), maya)).toEqual({ text: 'At the Acme onsite, back Monday', until });
  });

  it('is on your own record too, so your own row can draw it', async () => {
    await maya.setStatus({ text: 'Fundraising meetings all week', until: null });
    expect((await maya.me()).status).toEqual({ text: 'Fundraising meetings all week', until: null });
  });

  it('never reaches somebody who is not on the team', async () => {
    await maya.setStatus({ text: 'At the Acme onsite', until: null });
    expect(await jun.teamPeople(team.id)).toEqual([]);
  });

  it('is cleared by saying nothing', async () => {
    await maya.setStatus({ text: 'At the Acme onsite', until: null });
    await maya.setStatus({ text: '   ', until: null });
    expect(statusOf(await theo.teamPeople(team.id), maya)).toBeNull();
    expect((await maya.me()).status).toBeNull();
  });

  it('is cut to one line of eighty characters', async () => {
    await maya.setStatus({ text: `${'x'.repeat(200)}\nand more`, until: null });
    expect(statusOf(await theo.teamPeople(team.id), maya).text).toHaveLength(STATUS_MAX);
  });

  it('cannot be written for somebody else', async () => {
    await expect(theo.setStatus({ text: 'ha', until: null, personId: maya.personId })).rejects.toThrow();
    expect(statusOf(await theo.teamPeople(team.id), maya)).toBeNull();
  });
});

describe('when it runs out', () => {
  const at = 1_790_000_000_000;
  const said = (until) => ({ text: 'In meetings', until });

  it('reads as nothing a second after, and still reads a second before', () => {
    expect(liveStatus(said(at + 1000), at)).toEqual({ text: 'In meetings', until: at + 1000 });
    expect(liveStatus(said(at - 1000), at)).toBeNull();
  });

  it('is gone exactly on the moment, not a tick later', () => {
    expect(liveStatus(said(at), at)).toBeNull();
    expect(liveStatus(said(at + 1), at)).not.toBeNull();
  });

  it('holds for good when no time was chosen', () => {
    expect(liveStatus(said(null), at + 100 * DAY)).toEqual({ text: 'In meetings', until: null });
  });

  it('is nothing when nothing was said, whatever the time says', () => {
    expect(liveStatus({ text: '  ', until: at + DAY }, at)).toBeNull();
    expect(liveStatus(null, at)).toBeNull();
  });

  it('counts as lapsed only once there is text and the time has passed', () => {
    expect(hasLapsed(said(at - 1), at)).toBe(true);
    expect(hasLapsed(said(at + 1), at)).toBe(false);
    expect(hasLapsed(said(null), at)).toBe(false);
    expect(hasLapsed({ text: '', until: at - 1 }, at)).toBe(false);
  });
});

describe('the words it is drawn with', () => {
  // A Wednesday at 9am, so "today", a weekday and a date are all reachable.
  const wed9 = new Date('2026-10-07T09:00:00').getTime();

  it('says the hour when it runs out today', () => {
    expect(holdsUntil(new Date('2026-10-07T18:00:00').getTime(), wed9)).toBe('until 6pm today');
    expect(holdsUntil(new Date('2026-10-07T09:30:00').getTime(), wed9)).toBe('until 9:30am today');
  });

  it('names the weekday inside a week', () => {
    expect(holdsUntil(new Date('2026-10-12T18:00:00').getTime(), wed9)).toBe('until Monday');
  });

  it('gives a date once a weekday would mean the wrong one', () => {
    // Eight days out: "until Thursday" would read as tomorrow week.
    expect(holdsUntil(new Date('2026-10-15T18:00:00').getTime(), wed9)).toMatch(/^until \w+ 15$/);
  });

  it('says nothing when it holds until you clear it, or has already passed', () => {
    expect(holdsUntil(null, wed9)).toBe('');
    expect(holdsUntil(wed9 - 1, wed9)).toBe('');
  });

  // The day is the one on the clock in front of them, so these compare local
  // dates; an ISO slice is UTC and is a day out west of Greenwich.
  const localDay = (ms) => new Date(ms).toLocaleDateString('en-CA');

  it('ends today and tomorrow at the end of the day, not in an hour', () => {
    expect(localDay(holdEnds('today', wed9))).toBe('2026-10-07');
    expect(new Date(holdEnds('today', wed9)).getHours()).toBe(23);
    expect(localDay(holdEnds('tomorrow', wed9))).toBe('2026-10-08');
    expect(holdEnds('open', wed9)).toBeNull();
  });

  it('ends this week on the coming Sunday, never today', () => {
    const end = new Date(holdEnds('week', wed9));
    expect(end.getDay()).toBe(0);
    expect(end.getTime()).toBeGreaterThan(wed9);
    // Set ON a Sunday it means the Sunday after, not the minute to midnight.
    const sun = new Date('2026-10-11T09:00:00').getTime();
    expect(localDay(holdEnds('week', sun))).toBe('2026-10-18');
  });

  it('keeps a line to one line', () => {
    expect(cleanStatus('  In   meetings\nuntil Thursday ')).toBe('In meetings until Thursday');
    expect(cleanStatus('   ')).toBeNull();
  });
});

describe('the Mac that wrote it', () => {
  let dir;
  const cloud = createMemoryCloud();

  const service = async ({ now }) => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'status-'));
    const id = signUpMemory(cloud, { email: `me-${Math.random()}@northwind.test`, name: 'Sam Rivera' });
    const svc = createTeamService({
      session: memorySession(() => memoryBackend(cloud, id)),
      store: { listProducts: () => [] },
      disk: { setLineAuthor: () => {}, readWorkItems: () => [] },
      accountRoot: dir,
      stateFile: path.join(dir, '.team-sync.json'),
      intervalMs: 1_000_000,
      now,
    });
    await svc.signIn();
    await svc.createTeam('Northwind');
    return svc;
  };

  it('writes what you typed and reads it straight back', async () => {
    let clock = 1_790_000_000_000;
    const svc = await service({ now: () => clock });
    await svc.setStatus({ text: 'Hiring loops all day', hold: 'today' });
    expect(svc.state().me.status.text).toBe('Hiring loops all day');
    expect(svc.state().me.status.until).toBe(holdEnds('today', clock));
    svc.stop();
  });

  // WITHIN ONE SYNC, NOT INSTANTLY, AND THAT IS THE CONTRACT. Syncs coalesce
  // on purpose: asking for one while another is running joins the running
  // one. So this waits for the pass the write set off before moving the
  // clock, and then checks the first pass that STARTS after the line lapsed.
  // Nobody sees the stale text in the meantime: every reader goes through
  // liveStatus, which is covered above.
  it('clears a lapsed line on the first sync that starts after it runs out', async () => {
    let clock = 1_790_000_000_000;
    const svc = await service({ now: () => clock });
    await svc.setStatus({ text: 'In meetings', hold: 'today' });
    await svc.syncNow();
    clock += 3 * DAY;
    await svc.syncNow();
    expect(svc.state().me.status).toBeNull();
    svc.stop();
  });

  it('leaves a line that has not lapsed alone', async () => {
    let clock = 1_790_000_000_000;
    const svc = await service({ now: () => clock });
    await svc.setStatus({ text: 'In meetings', hold: 'week' });
    clock += 2 * 3600_000;
    await svc.syncNow();
    expect(svc.state().me.status.text).toBe('In meetings');
    svc.stop();
  });
});
