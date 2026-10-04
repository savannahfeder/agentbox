// A STATUS RUNS UNTIL ANY TIME YOU CHOOSE, SAID AS ONE SENTENCE (w-a09476712f).
//
// The box you set a status in was a field, a row of four uppercase holds and a
// Save button. Shown it on 2026-10-04: it "looks a little unattractive, does
// not match our UI patterns, and is a little hard to understand". Of three
// redesigns the one sentence was approved, "I'm in meetings until the end of
// today.", with one change: "they should be able to choose their own
// timelines (Eod tomorrow night and Eow are only a small portion of what you
// might need)".
//
// Until now a status could only end at one of four moments, because the app
// sent a hold's name and the Mac worked out the time. So these pin:
//   - the Mac takes a moment you chose, if it is still ahead, and falls back
//     to the named hold for one that is not (now, the past, or not a number);
//   - a typed time ("friday 5pm", "in 3 days") becomes that moment, and words
//     that are not a time, or a time already gone, become nothing;
//   - the sentence says when it ends in words: the four presets, or the
//     moment you typed, read back the way the rest of the app reads it;
//   - the box is the sentence, with no uppercase hold buttons and no Save.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mjs';
import { createTeamService } from '../main/team/index.mjs';
import { memorySession } from '../main/team/session.mjs';
import { holdEnds, statusEnds } from '../shared/team-status.mjs';
import { UNTIL_PRESETS, endOf, readUntil, untilWords } from '../renderer/src/team/status-until';
import { StatusComposer } from '../renderer/src/team/status';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
// A Wednesday at 10am, local time, so weekday words are stable.
const wednesday = new Date(2026, 9, 7, 10, 0, 0).getTime();

describe('the Mac takes a moment you chose', () => {
  it('uses a moment that is still ahead', () => {
    const at = wednesday + 3 * DAY + 5 * HOUR;
    expect(statusEnds({ hold: 'today', until: at }, wednesday)).toBe(at);
  });

  it('uses a moment one millisecond ahead', () => {
    expect(statusEnds({ hold: 'open', until: wednesday + 1 }, wednesday)).toBe(wednesday + 1);
  });

  it('falls back to the hold for a moment that is now, or gone', () => {
    expect(statusEnds({ hold: 'today', until: wednesday }, wednesday)).toBe(holdEnds('today', wednesday));
    expect(statusEnds({ hold: 'today', until: wednesday - HOUR }, wednesday)).toBe(holdEnds('today', wednesday));
  });

  it('falls back to the hold for something that is not a moment', () => {
    for (const until of ['tomorrow', NaN, Infinity, null, undefined]) {
      expect(statusEnds({ hold: 'week', until }, wednesday)).toBe(holdEnds('week', wednesday));
    }
  });

  it('holds until you clear it when given neither', () => {
    expect(statusEnds({}, wednesday)).toBeNull();
  });
});

describe('the team service writes the moment through', () => {
  const service = async (now) => {
    const cloud = createMemoryCloud();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'status-until-'));
    const id = signUpMemory(cloud, { email: 'sam@northwind.test', name: 'Sam Rivera' });
    const svc = createTeamService({
      session: memorySession(() => memoryBackend(cloud, id)),
      store: { listProducts: () => [] },
      disk: { setLineAuthor: () => {}, readWorkItems: () => [] },
      accountRoot: dir, stateFile: path.join(dir, '.team-sync.json'), intervalMs: 1_000_000, now,
    });
    await svc.signIn();
    await svc.createTeam('Northwind');
    return svc;
  };

  it('stores the time you chose', async () => {
    const svc = await service(() => wednesday);
    const at = wednesday + 9 * DAY;
    await svc.setStatus({ text: 'On holiday', hold: 'open', until: at });
    expect(svc.state().me.status).toEqual({ text: 'On holiday', until: at });
    svc.stop();
  });

  it('still takes a named hold on its own', async () => {
    const svc = await service(() => wednesday);
    await svc.setStatus({ text: 'In meetings', hold: 'tomorrow' });
    expect(svc.state().me.status.until).toBe(holdEnds('tomorrow', wednesday));
    svc.stop();
  });
});

describe('a time you type', () => {
  it('reads a weekday and an hour', () => {
    const r = readUntil('friday 5pm', wednesday);
    expect(new Date(r.until).getDay()).toBe(5);
    expect(new Date(r.until).getHours()).toBe(17);
  });

  // The composer's reader puts a day-sized span on that day's morning, so the
  // day is what is pinned, not the hour.
  it('reads a span from now', () => {
    const r = readUntil('in 3 days', wednesday);
    expect(new Date(r.until).getDate()).toBe(new Date(wednesday + 3 * DAY).getDate());
    expect(r.until).toBeGreaterThan(wednesday + 2 * DAY);
  });

  it('is nothing when the words are not a time', () => {
    expect(readUntil('banana', wednesday)).toBeNull();
    expect(readUntil('', wednesday)).toBeNull();
  });

  // Typed a minute after nine, "9am" can only mean tomorrow's, or nothing.
  it('never lands on a time already gone', () => {
    const nine = new Date(2026, 9, 7, 9, 0, 0).getTime();
    const r = readUntil('9am', nine + 60_000);
    if (r) expect(r.until).toBeGreaterThan(nine + 60_000);
  });
});

describe('the sentence says when it ends', () => {
  it('offers the four presets in plain words', () => {
    expect(UNTIL_PRESETS.map((p) => p.words)).toEqual(['the end of today', 'tomorrow night', 'the end of the week', 'I clear it']);
  });

  it('says a preset in its own words', () => {
    expect(untilWords({ hold: 'today' }, wednesday)).toBe('the end of today');
    expect(untilWords({ hold: 'open' }, wednesday)).toBe('I clear it');
  });

  it('says a moment you chose the way the app reads times back', () => {
    expect(untilWords({ until: wednesday + 2 * DAY }, wednesday)).toBe('Friday');
    expect(untilWords({ until: wednesday + 20 * DAY }, wednesday)).toMatch(/Oct 27/);
  });

  it('reopens on the end you picked', () => {
    expect(endOf({ text: 'x', until: holdEnds('week', wednesday) }, wednesday)).toEqual({ hold: 'week' });
    expect(endOf({ text: 'x', until: null }, wednesday)).toEqual({ hold: 'open' });
    expect(endOf({ text: 'x', until: wednesday + 9 * DAY }, wednesday)).toEqual({ until: wednesday + 9 * DAY });
    expect(endOf(null, wednesday)).toEqual({ hold: 'today' });
  });
});

describe('the box is one sentence', () => {
  const me = { id: 'u-1', email: 'ada@example.test', name: 'Ada Lovelace', avatarUrl: null };
  const html = renderToStaticMarkup(createElement(StatusComposer, { person: me, now: wednesday, onDone: () => {} }));

  it('reads "I\'m ... until the end of today."', () => {
    const words = html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');
    expect(words).toMatch(/I'm .*until .*the end of today/);
  });

  it('has no uppercase hold buttons and no Save button', () => {
    expect(html).not.toContain('tm-seg');
    expect(html).not.toMatch(/>Save</);
  });

  it('says how to save and how to leave', () => {
    expect(html).toMatch(/save/);
    expect(html).toMatch(/cancel/);
  });
});
