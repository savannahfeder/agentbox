// YOUR PAGE HAS A BIO YOU CAN WRITE (w-88e1e23325, 2026-10-21).
//
// "I also don't see a description, like a bio, or a way to add my bio." Room
// profiles have carried a bio (160 characters) since round 23, and the hover
// card shows one, but nothing in the app could write it, and a person's page
// ran it into the headline as one line. Measured on the built app: your own
// page had no bio and no way to add one.
//
// Now your page says "Add a bio" under your name, and saving it reaches your
// own card at once rather than at the next read of the cloud.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProfilePage } from '../renderer/src/team/rooms/RoomPerson.tsx';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mjs';
import { createRooms, roomPrefsFile } from '../main/team/rooms.mjs';
globalThis.React = React;

const card = (o = {}) => ({ id: 'sam', me: false, name: 'Sam R.', avatarUrl: null, headline: null, bio: null, agents: 0, level: 3, hoursTotal: 1, hoursWeek: 1, hoursToday: 0, streak: 1, byMonth: [], teammate: false, showActivity: true, status: null, workingOn: null, workingPrivate: false, ...o });
const page = (c, more = {}) => {
  const room = { id: 'r1', name: 'Northwind', wall: [c] };
  return renderToStaticMarkup(React.createElement(ProfilePage, { card: c, room, rooms: [room], cards: [], rank: 3, onRanks: () => {}, ...more }));
};
const save = async () => null;

describe('on a person’s page', () => {
  it('my page with no bio offers to add one', () => {
    expect(page(card({ me: true }), { onSaveBio: save })).toContain('Add a bio');
  });
  it('my bio shows, with a way to change it', () => {
    const html = page(card({ me: true, bio: 'Building Lantern.' }), { onSaveBio: save });
    expect(html).toContain('Building Lantern.');
    expect(html).toContain('rm-bio-edit');
    expect(html).not.toContain('Add a bio');
  });
  it('someone else’s bio shows on its own line, and cannot be changed', () => {
    const html = page(card({ bio: 'Ask me about Postgres.', headline: 'Founder' }), { onSaveBio: save });
    expect(html).toMatch(/class="rm-bio">Ask me about Postgres\.</);
    expect(html).not.toContain('Founder. Ask me');
    expect(html).not.toContain('rm-bio-edit');
  });
  it('someone else with no bio shows nothing in its place', () => {
    const html = page(card(), { onSaveBio: save });
    expect(html).not.toContain('Add a bio');
    expect(html).not.toContain('rm-bio');
  });
});

describe('saved', () => {
  it('reaches my own card at once, and goes again when cleared', async () => {
    const cloud = createMemoryCloud();
    const id = signUpMemory(cloud, { email: 'sam@northwind.test', name: 'Sam Rivera' });
    const timers = { setTimeout: (fn) => { const h = { off: false }; queueMicrotask(() => { if (!h.off) fn(); }); return h; }, clearTimeout: (h) => { if (h) h.off = true; } };
    const backend = memoryBackend(cloud, id);
    const rooms = createRooms({
      backend: () => backend,
      me: () => ({ id, name: 'Sam Rivera', avatarUrl: null, status: null }),
      team: () => ({ team: null, people: [], cards: [] }),
      enabled: () => true,
      device: () => 'aaaaaaaaaaaa',
      presenceFacts: () => ({ running: [], items: [], products: [], summary: { total: 0, week: 0, weekStart: '2026-10-19', today: 0, day: '2026-10-21', streak: 0, activeDays: [], byMonth: [] } }),
      prefsFile: roomPrefsFile(fs.mkdtempSync(path.join(os.tmpdir(), 'rooms-bio-'))),
      onChange: () => {},
      timers,
    });
    await rooms.tick();
    await rooms.refresh?.();
    const mine = () => rooms.state().rooms.flatMap((r) => r.wall).find((c) => c.me);
    expect(mine()).toBeTruthy();
    expect(mine().bio).toBe(null);
    await rooms.saveProfile({ bio: 'Building Lantern.' });
    expect(rooms.state().me.bio).toBe('Building Lantern.');
    expect(mine().bio).toBe('Building Lantern.');
    await rooms.saveProfile({ bio: null });
    expect(mine().bio).toBe(null);
  });
});
