// THE CLOUD BUTTON ON A THREAD SAYS WHERE IT RUNS AND WHAT IT NEEDS (w-f43613624f).
//
// Where a thread ran was a row in its ⋯ menu ("Keep on this Mac", "Run on the
// cloud") and, for a run on this Mac, a boxed "Move to cloud" button after the
// working line that was turned down as looking very bad. A thread the cloud
// had handed back said nothing about why it stayed here. Measured on the
// founder's Mac on 2026-10-28: 163 of about 360 runs that stayed local since
// 2026-10-25 were threads kept here after two hand-backs, each for a key or
// sign-in only the Mac has, and nothing on screen named it.
//
// The approved design (designs/w-f43613624f/r6-*): a labeled button beside
// Done, "Cloud" or "This Mac", opening a panel on click that says where it
// runs, lets you pick the other, and names what it needs when the cloud
// handed it back. Only for someone on the cloud plan, and the ⋯ menu row goes.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Supervisor } from '../main/supervisor.mjs';
import { threadPlace } from '../renderer/src/cloud-menu.ts';
import { threadMenuRows, ThreadMenu } from '../renderer/src/threads/ThreadMenu.tsx';
import { placeView, PlaceButton } from '../renderer/src/threads/PlaceButton.tsx';
import { Live } from '../renderer/src/components/Live';

globalThis.React = React;
const dirs = [];
afterEach(() => { while (dirs.length) fs.rmSync(dirs.pop(), { recursive: true, force: true }); });
const store = { listItems: () => [], listProducts: () => [{ slug: 'p', repoPath: '/r' }], isDue: () => true };
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'place-button-')); dirs.push(d); return d; };
const NEED = 'AGENTBOX-NEEDS-THE-COMPUTER: your Stripe key';

describe('what a handed-back thread needed', () => {
  it('is kept across a restart and carried on the thread (the reported case)', () => {
    const root = tmp();
    const sup = new Supervisor({ storeRoot: root, maxConcurrentSessions: 3 }, store, root);
    expect(sup._noteCloudHandBack({ id: 'w-a', product: 'p' }, { cloud: true, result: NEED })).toBe(true);
    expect(sup.withPlaces([{ id: 'w-a' }])).toEqual([{ id: 'w-a', needsMac: 'your Stripe key' }]);
    sup._noteCloudHandBack({ id: 'w-a', product: 'p' }, { cloud: true, result: NEED });
    const again = new Supervisor({ storeRoot: root, maxConcurrentSessions: 3 }, store, root);
    // A second hand-back no longer keeps it here (no-mark-the-app-sets-...).
    expect(again.withPlaces([{ id: 'w-a' }])).toEqual([{ id: 'w-a', needsMac: 'your Stripe key' }]);
  });

  it('is forgotten once the person picks where it runs', () => {
    const root = tmp();
    const sup = new Supervisor({ storeRoot: root, maxConcurrentSessions: 3 }, store, root);
    sup._noteCloudHandBack({ id: 'w-a', product: 'p' }, { cloud: true, result: NEED });
    sup.setThreadOnMac({ 'w-a': null });
    expect(sup.withPlaces([{ id: 'w-a' }])).toEqual([{ id: 'w-a' }]);
  });

  it('is said of nothing the cloud did not hand back', () => {
    const root = tmp();
    const sup = new Supervisor({ storeRoot: root, maxConcurrentSessions: 3 }, store, root);
    sup.setThreadOnMac({ 'w-b': true });
    expect(sup.withPlaces([{ id: 'w-b' }, { id: 'w-c' }])).toEqual([{ id: 'w-b', onMac: true }, { id: 'w-c' }]);
  });
});

describe('where the button shows', () => {
  const cloud = { setUp: true, mode: 'all', projects: ['p'], movable: [] };
  it('only for someone on the cloud plan', () => {
    expect(threadPlace({ id: 'w-a', product: 'p' }, null, cloud)).toBe('here');
    expect(threadPlace({ id: 'w-a', product: 'p' }, null, null)).toBeNull();
    expect(threadPlace({ id: 'w-a', product: 'p' }, null, { ...cloud, setUp: false })).toBeNull();
    expect(threadPlace({ id: 'w-a', product: 'p' }, null, { ...cloud, managed: true, plan: 'none' })).toBeNull();
    expect(threadPlace({ id: 'w-a', product: 'p' }, null, { ...cloud, managed: true, plan: 'pro' })).toBe('here');
  });

  it('says a handed-back thread needs this Mac, ahead of kept', () => {
    expect(threadPlace({ id: 'w-a', product: 'p', onMac: true, needsMac: 'your Stripe key' }, null, cloud)).toBe('needs');
    expect(threadPlace({ id: 'w-a', product: 'p', onMac: true }, null, cloud)).toBe('kept');
  });

  it('is no longer a row in the ⋯ menu', () => {
    expect(threadMenuRows({ change: false, terminal: 'closed', finish: true }).map((r) => r.id)).toEqual(['terminal', 'done']);
    const html = renderToStaticMarkup(React.createElement(ThreadMenu, { onFinish: () => {}, terminal: 'closed', place: 'kept', onPlace: () => {} }));
    expect(html).toContain('ts-place');
    expect(html).not.toContain('Keep on this Mac');
    expect(renderToStaticMarkup(React.createElement(ThreadMenu, { onFinish: () => {}, terminal: 'closed', place: null, onPlace: () => {} }))).not.toContain('ts-place');
  });

  it('and the working line has no button of its own', () => {
    const session = { startedAt: Date.now(), tail: [], activity: [] };
    expect(renderToStaticMarkup(React.createElement(Live, { item: { id: 'w-a', status: 'claimed' }, facts: { session } }))).not.toContain('Move to cloud');
  });
});

describe('the button and its panel', () => {
  it('names where it runs, and what picking the other does', () => {
    expect(placeView({ place: 'here' })).toMatchObject({ word: 'Cloud', on: 'cloud', dot: false, pickCloud: null, pickMac: true });
    expect(placeView({ place: 'here' }).note).toMatch(/next reply starts in the cloud/);
    expect(placeView({ place: 'cloud' })).toMatchObject({ word: 'Cloud', on: 'cloud', pickMac: true });
    expect(placeView({ place: 'kept' })).toMatchObject({ word: 'This Mac', on: 'mac', pickCloud: false, pickMac: null });
    expect(placeView({ place: 'move' })).toMatchObject({ word: 'This Mac', on: 'mac', pickCloud: 'move' });
    expect(placeView({ place: 'move', moving: true }).note).toMatch(/as soon as the cloud has room/);
  });

  it('marks a thread that needs this Mac with a dot and names what it needs', () => {
    const v = placeView({ place: 'needs', needs: 'your Stripe key' });
    expect(v).toMatchObject({ word: 'This Mac', on: 'mac', dot: true, needs: 'Your Stripe key', pickCloud: false });
  });

  it('a run here the cloud cannot take says why, and offers no Cloud', () => {
    const v = placeView({ place: 'here', running: true, why: 'It works in a folder that stays on this computer.' });
    expect(v).toMatchObject({ word: 'This Mac', on: 'mac', pickCloud: null, note: 'It works in a folder that stays on this computer.' });
  });

  it('draws closed as one labeled button, and the panel only when opened', () => {
    const html = renderToStaticMarkup(React.createElement(PlaceButton, { place: 'needs', needs: 'your Stripe key', onPlace: () => {} }));
    expect(html).toContain('This Mac');
    expect(html).toContain('ts-place-dot');
    expect(html).not.toContain('th-pop');
    const open = renderToStaticMarkup(React.createElement(PlaceButton, { place: 'needs', needs: 'your Stripe key', onPlace: () => {}, startOpen: true }));
    expect(open).toContain('Runs on');
    expect(open).toContain('Your Stripe key');
  });
});
