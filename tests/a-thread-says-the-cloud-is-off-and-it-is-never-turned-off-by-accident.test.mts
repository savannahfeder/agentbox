// A THREAD SAYS THE CLOUD IS OFF, AND THE CLOUD IS NEVER TURNED OFF BY ACCIDENT
// (w-dd3b8c10c7, 2026-11-11).
//
// What broke: the whole app's cloud went off between 6:38 and 6:40pm ET on
// 2026-11-10 (`cloudRuns: false`; the cloud account's last use was 6:39pm),
// and every one of about 45 runs started over the next three hours ran on the
// Mac. A Blender thread set to render in the cloud started three replies on
// the Mac and said "looks like the same app bug". Nobody meant it: "i did not
// do that intentionally (must have accidentally hti in cmd + k) plus i was
// never aware of it."
//
// Measured in the built window: typing "off" in ⌘K put "Turn the cloud off"
// first, so one Enter turned it off, and ⌘C with nothing selected turns it off
// with no question. And a thread's "Runs on" button beside Done hid itself
// whenever the cloud was off (`threadPlace` returned null), so the thread page
// said nothing at all.
//
// The approved design (designs/w-dd3b8c10c7, 2-runs-on-button-stays-v7 and
// 3-asks-before-turning-off-v3): the button stays, as a faded cloud, and its
// panel offers Cloud to turn it back on; turning the cloud off by ⌘C or ⌘K
// asks first, in a box where ⌘K opens.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { threadPlace, cloudCommands, cloudOffAsks, CLOUD_OFF_ASK, type CloudStatus } from '../renderer/src/cloud-menu.ts';
import { placeView, afterPick, PlaceButton } from '../renderer/src/threads/PlaceButton.tsx';
import { threadCommands } from '../renderer/src/thread-commands.ts';
import { matchesQuery } from '../renderer/src/palette-rows.ts';
import { CloudOffAsk } from '../renderer/src/components/CloudOffAsk.tsx';

globalThis.React = React;
const read = (p: string) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const off = { setUp: true, mode: 'mac', whenOn: 'all', running: 0, month: { runs: 0, agentHours: 0 }, projects: ['p'], noCloudSignIn: [] } as unknown as CloudStatus;
const on = { ...off, mode: 'all' } as CloudStatus;
const item = { id: 'w-a', product: 'p' };

describe('a thread on a project the cloud runs, with the cloud off', () => {
  it('keeps its Runs on button and says the cloud is off (the reported case)', () => {
    expect(threadPlace(item, null, off)).toBe('off');
    expect(threadPlace(item, { where: 'mac' }, off)).toBe('off');
  });

  it('is the same thread as with the cloud on, where it says it may go there', () => {
    expect(threadPlace(item, null, on)).toBe('here');
  });

  it('still says kept, handed back or in the cloud before it says off', () => {
    expect(threadPlace({ ...item, onMac: true }, null, off)).toBe('kept');
    expect(threadPlace({ ...item, needsMac: 'your Stripe key' }, null, off)).toBe('needs');
    expect(threadPlace(item, { where: 'cloud' }, off)).toBe('cloud');
  });

  it('draws nothing where the cloud could never run it', () => {
    expect(threadPlace({ ...item, product: 'other' }, null, off)).toBe(null);
    expect(threadPlace(item, null, { ...off, noCloudSignIn: ['codex'] } as CloudStatus, 'codex')).toBe(null);
    expect(threadPlace(item, null, { ...off, setUp: false } as CloudStatus)).toBe(null);
    expect(threadPlace(item, null, null)).toBe(null);
  });
});

describe('its button', () => {
  it('is a faded cloud, This Mac picked, and Cloud turns the cloud back on', () => {
    const v = placeView({ place: 'off' });
    expect(v).toMatchObject({ on: 'mac', off: true, pickCloud: 'cloud-on', pickMac: null, dot: false });
    expect(v.note).toBe('The cloud is off. Pick Cloud to turn it on.');
  });

  it('shows Cloud picked the moment Cloud is pressed', () => {
    expect(placeView(afterPick({ place: 'off' }, 'cloud-on'))).toMatchObject({ on: 'cloud', off: false });
  });

  it('draws the faded cloud closed, and the panel with Cloud pressable', () => {
    const closed = renderToStaticMarkup(React.createElement(PlaceButton, { place: 'off' }));
    expect(closed).toMatch(/class="ts-done ts-place ts-place-off"/);
    expect(closed).not.toMatch(/ts-place-dot/);
    const open = renderToStaticMarkup(React.createElement(PlaceButton, { place: 'off', startOpen: true }));
    expect(open).toMatch(/The cloud is off\. Pick Cloud to turn it on\./);
    const cloudChoice = open.match(/<button type="button"[^>]*>(?:(?!<\/button>).)*?Cloud<\/button>/)?.[0] ?? '';
    expect(cloudChoice).toMatch(/aria-pressed="false"/);
    expect(cloudChoice).not.toMatch(/disabled/);
    expect(open).toMatch(/class="on picked" aria-pressed="true">(?:(?!<\/button>).)*This Mac<\/button>/);
  });

  it('a thread with the cloud on draws no faded cloud', () => {
    expect(renderToStaticMarkup(React.createElement(PlaceButton, { place: 'here' }))).not.toMatch(/ts-place-off/);
  });

  it('adds no second ⌘K row: the app-wide Turn the cloud on row is the one', () => {
    const rows = threadCommands({ place: 'off' } as Parameters<typeof threadCommands>[0]);
    expect(rows.some((r) => r.id === 'place')).toBe(false);
    expect(threadCommands({ place: 'here' } as Parameters<typeof threadCommands>[0]).some((r) => r.id === 'place')).toBe(true);
  });

  it('pressing Cloud in the panel turns the cloud on as it was meant to be on', () => {
    const app = read('../renderer/src/App.tsx');
    expect(app).toMatch(/if \(keep === 'cloud-on'\) \{[^}]*cloudToggleTarget\(snap\.cloud\)/);
  });
});

describe('turning the cloud off', () => {
  it('asks first, and turning it on never asks', () => {
    expect(cloudOffAsks('mac')).toBe(true);
    expect(cloudOffAsks('full')).toBe(false);
    expect(cloudOffAsks('all')).toBe(false);
  });

  it('asks from ⌘C and from ⌘K, and only the question turns it off', () => {
    const app = read('../renderer/src/App.tsx');
    const chord = app.slice(app.indexOf('toggleCloudRef.current = () => {'), app.indexOf('toggleCloudRef.current = () => {') + 500);
    expect(chord).toMatch(/if \(cloudOffAsks\(mode\)\) \{ setModal\('cloud-off'\); return; \}/);
    expect(app).toMatch(/onCloudMode=\{\(mode\) => \{ if \(cloudOffAsks\(mode\)\) \{ setModal\('cloud-off'\); return; \}/);
    expect(app).toMatch(/modal === 'cloud-off' && <CloudOffAsk/);
  });

  it('is a box where ⌘K opens, with Keep it on on esc and Turn off on return', () => {
    const html = renderToStaticMarkup(React.createElement(CloudOffAsk, { onOff: () => {}, onKeep: () => {} }));
    expect(html).toMatch(/class="modal-backdrop palette-backdrop"/);
    expect(html).toMatch(/class="modal palette cloud-off-ask"/);
    expect(html).toContain(CLOUD_OFF_ASK.head);
    expect(html).toContain(CLOUD_OFF_ASK.line);
    expect(html).toMatch(/Keep it on<kbd>esc<\/kbd>/);
    expect(html).toMatch(/Turn off<kbd>↵<\/kbd>/);
    expect(CLOUD_OFF_ASK).toMatchObject({ head: 'Turn the cloud off?', line: 'New threads and replies will run on this Mac.' });
  });
});

describe('⌘K', () => {
  const offRow = cloudCommands(on)[0];
  it('does not offer Turn the cloud off for "off" alone (the reported case)', () => {
    expect(offRow.label).toBe('Turn the cloud off');
    expect(matchesQuery('off', offRow)).toBe(false);
    expect(matchesQuery('turn off', offRow)).toBe(false);
    expect(matchesQuery('on', offRow)).toBe(false);
  });

  it('offers it once the cloud is named, from its first two letters', () => {
    expect(matchesQuery('cloud', offRow)).toBe(true);
    expect(matchesQuery('cloud off', offRow)).toBe(true);
    expect(matchesQuery('cl', offRow)).toBe(true);
    expect(matchesQuery('off cloud', offRow)).toBe(true);
  });

  it('leaves Turn the cloud on, and every other row, as they were', () => {
    const onRow = cloudCommands(off)[0];
    expect(onRow.label).toBe('Turn the cloud on');
    expect(matchesQuery('on', { label: onRow.label })).toBe(true);
    expect(matchesQuery('off', { label: 'Turn off keyboard shortcut hints' })).toBe(true);
  });

  it('carries the rule through to the palette', () => {
    expect(read('../renderer/src/components/Palette.tsx')).toMatch(/onlyWith: r\.onlyWith/);
  });
});
