// ⌘R STAYS ON THE PAGE YOU WERE ON, NOT HOME.
//
// What broke: "when i hit cmd + r it should stay on the same page, not go
// straight to home page." The note a reload leaves itself
// (renderer/src/where-she-was.ts) knew the inbox tab, an open thread and
// Settings, and nothing else. Home is where the app opens, and `homeOpen`
// starts true, so a reload from Needs you wrote `{ view: 'inbox' }`, which
// `placeIsSomewhere` called nowhere, and the page came back on Home. A reload
// from Files, Connections, the Team page, a chat, a group, Today or Tasks
// lost the page the same way. Measured by writing the note each of those pages
// leaves and reading it back as a reload does: none of them were in it.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { placeIsSomewhere, readPlace, writePlace } from '../renderer/src/where-she-was';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = fs.readFileSync(path.join(here, '..', 'renderer', 'src', 'App.tsx'), 'utf8');

const store = (seed?: string | null) => {
  let held = seed ?? null;
  return { getItem: () => held, setItem: (_k: string, v: string) => { held = v; }, read: () => held };
};
const acrossAReload = (place: Parameters<typeof writePlace>[1]) => {
  const s = store();
  writePlace(s, place);
  return readPlace(store(s.read()));
};
const raw = (o: unknown) => readPlace(store(JSON.stringify(o)));

describe('Needs you is not Home', () => {
  it('keeps Home shut after a reload from the inbox', () => {
    const back = acrossAReload({ view: 'inbox', home: false });
    expect(back).toEqual({ view: 'inbox', home: false });
    expect(placeIsSomewhere(back)).toBe(true);
  });

  it('still opens on Home when Home was what was up', () => {
    const back = acrossAReload({ view: 'inbox', home: true });
    expect(back?.home).toBe(true);
    expect(placeIsSomewhere(back)).toBe(false);
  });

  it('reads a note from before Home was kept as saying nothing about it', () => {
    const back = raw({ view: 'done' });
    expect(back?.home).toBeUndefined();
    expect(placeIsSomewhere(back)).toBe(true);
  });

  it('ignores a Home that is not true or false', () => {
    for (const bad of ['false', 0, null, {}]) expect(raw({ view: 'inbox', home: bad })?.home).toBeUndefined();
  });
});

describe('every page comes back', () => {
  it('Files, on every file and on one project', () => {
    expect(acrossAReload({ view: 'inbox', files: { project: null } })?.files).toEqual({ project: null });
    expect(acrossAReload({ view: 'inbox', files: { project: 'kestrel' } })?.files).toEqual({ project: 'kestrel' });
    expect(placeIsSomewhere(raw({ view: 'inbox', files: { project: null } }))).toBe(true);
  });

  it('Connections, Team, Today and Tasks', () => {
    for (const key of ['connections', 'team', 'today', 'tasks'] as const) {
      const back = acrossAReload({ view: 'inbox', [key]: true });
      expect(back?.[key]).toBe(true);
      expect(placeIsSomewhere(back)).toBe(true);
    }
  });

  it('a chat, a group and an AI teammate, by id', () => {
    const back = acrossAReload({ view: 'inbox', chats: 'mate:m1', room: 'r-1', teammate: 'm2' });
    expect(back).toMatchObject({ chats: 'mate:m1', room: 'r-1', teammate: 'm2' });
    for (const key of ['chats', 'room', 'teammate']) expect(placeIsSomewhere(raw({ view: 'inbox', [key]: 'x' }))).toBe(true);
  });

  it('drops a page that is not the right shape, and keeps the rest', () => {
    const back = raw({
      view: 'done', files: { project: 4 }, connections: 'yes', team: 1, today: 'true', tasks: null,
      chats: '', room: 7, teammate: {},
    });
    expect(back).toEqual({ view: 'done' });
    expect(placeIsSomewhere(raw({ view: 'inbox', files: 'all', team: false, room: '' }))).toBe(false);
  });
});

describe('the app is wired to it', () => {
  const write = app.slice(app.indexOf('const place: Place = { view };'), app.indexOf('writePlace(window.localStorage, place);'));
  const read = app.slice(app.indexOf('const place = wasAt.current;'), app.indexOf('wantRow.current = place.row ?? null;'));

  it('writes Home and every page into the note', () => {
    expect(write).toContain('if (homeOn) place.home = homeOpen;');
    for (const bit of ['place.files', 'place.connections', 'place.team', 'place.chats', 'place.room', 'place.teammate', 'place.today', 'place.tasks']) {
      expect(write).toContain(bit);
    }
  });

  it('rewrites the note when any of those pages changes', () => {
    const deps = app.slice(app.indexOf('writePlace(window.localStorage, place);'), app.indexOf('// READING IT BACK'));
    for (const dep of ['homeOpen', 'filesPage?.project', 'connectionsPage', 'teamOpen', 'chatsPlace', 'roomsUi.openId', 'teammatesUi.open', 'todayOn', 'tasksOn']) {
      expect(deps).toContain(dep);
    }
  });

  it('puts each page back on the reload', () => {
    expect(read).toMatch(/setHomeOpen\(place\.home \?\? place\.view === 'inbox'\)/);
    for (const call of ['setFilesPage(', 'setConnectionsPage(', 'setTeamOpen(true)', 'setChatsPlace(', 'roomsUi.open(', 'teammatesUi.go(', 'setTodayOn(true)', 'setTasksOn(true)']) {
      expect(read).toContain(call);
    }
  });
});
