// BACK FROM A THREAD OPENED ON THE TEAM PAGE GOES TO THE TEAM PAGE.
//
// What broke: on the Team page's Standup, a teammate's "Test day in the cloud"
// link opened the thread, and Back from there went to the Inbox. The trail
// never recorded the Team page (App.tsx gave it no stop), so Back skipped it
// for the last place it knew. Measured by reading the trail: walking
// Inbox, Standup, thread and stepping back landed on the Inbox.

import { describe, it, expect } from 'vitest';
import { arrive, stepBack, stepForward, sameStop, stopOnScreen, EMPTY_TRAIL, type Stop, type Trail } from '../renderer/src/back-and-forward';

const inbox: Stop = { at: 'list', view: 'inbox' };
const standup: Stop = { at: 'team', place: 'team' };
const mate = (id: string): Stop => ({ at: 'team', place: `mate:${id}` });
const thread = (id: string): Stop => ({ at: 'thread', product: 'p', id });
const walk = (...stops: Stop[]) => stops.reduce((t: Trail, s) => arrive(t, s), EMPTY_TRAIL);

const screen = (over: Partial<Parameters<typeof stopOnScreen>[0]> = {}) => stopOnScreen({
  settings: null, thread: null, card: null, home: false, files: null, connections: false,
  group: null, teammate: null, teamPlace: null, unrecorded: false, view: 'inbox', ...over,
});

describe('the Team page is a place on the trail', () => {
  it('the Standup on screen is recorded as the Standup', () => {
    expect(screen({ teamPlace: 'team' })).toEqual(standup);
  });

  it("a teammate's page and a person's page are each their own place", () => {
    expect(screen({ teamPlace: 'mate:q' })).toEqual(mate('q'));
    expect(screen({ teamPlace: 'person:m' })).toEqual({ at: 'team', place: 'person:m' });
  });

  it('back from a thread opened on the Standup goes to the Standup, and forward to the thread', () => {
    const t = walk(inbox, standup, thread('a'));
    const back = stepBack(t)!;
    expect(back.stop).toEqual(standup);
    expect(stepForward(back.trail)!.stop).toEqual(thread('a'));
    expect(stepBack(back.trail)!.stop).toEqual(inbox);
  });

  it('tells the Standup and two teammates apart, and not the same page twice', () => {
    expect(sameStop(standup, mate('q'))).toBe(false);
    expect(sameStop(mate('q'), mate('r'))).toBe(false);
    expect(sameStop(mate('q'), mate('q'))).toBe(true);
    expect(walk(standup, mate('q'), mate('q')).stops).toEqual([standup, mate('q')]);
  });

  it("a group, a teammate's page and a teammate's thread are places too", () => {
    expect(screen({ group: 'g1' })).toEqual({ at: 'group', id: 'g1' });
    expect(screen({ teammate: 't1' })).toEqual({ at: 'teammate', id: 't1' });
    expect(screen({ card: { person: 'm', thread: 'x' } })).toEqual({ at: 'card', person: 'm', thread: 'x' });
    expect(sameStop({ at: 'group', id: 'g1' }, { at: 'group', id: 'g2' })).toBe(false);
    expect(sameStop({ at: 'card', person: 'm', thread: 'x' }, { at: 'card', person: 'm', thread: 'y' })).toBe(false);
    const t = walk(standup, { at: 'card', person: 'm', thread: 'x' }, thread('a'));
    expect(stepBack(t)!.stop).toEqual({ at: 'card', person: 'm', thread: 'x' });
  });

  it('a thread open over the Team page is the thread, not the page', () => {
    expect(screen({ teamPlace: null, thread: { product: 'p', id: 'a' } })).toEqual(thread('a'));
  });

  it('with no Team page on screen it is the list as before, and unknown pages are still not recorded', () => {
    expect(screen()).toEqual(inbox);
    expect(screen({ view: 'done' })).toEqual({ at: 'list', view: 'done' });
    expect(screen({ unrecorded: true })).toBeNull();
  });

  it('the pages it already knew keep their order', () => {
    expect(screen({ settings: { pane: 'claude' }, thread: { product: 'p', id: 'a' } })).toEqual({ at: 'settings', pane: 'claude' });
    expect(screen({ home: true })).toEqual({ at: 'home' });
    expect(screen({ files: { project: 'x' } })).toEqual({ at: 'files', project: 'x' });
    expect(screen({ connections: true })).toEqual({ at: 'connections' });
  });
});
