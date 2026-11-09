// EVERY TEAMMATE'S COPY OF A FILE OPENS THE SAME LIVE ROOM.
//
// Live editing only works if Maya's copy of a thread's launch plan and Ben's
// copy of it name one room, and a project's private notes name none. Measured
// on 2026-11-08 with two copies of the app on one stand-in team: before the
// teammate's view passed the project's name it found no room at all, and after
// it did, each saw the other's sentence in 113 ms and 56 ms.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { liveAddress, liveRoomFor, liveRoomId } from '../main/team/live-room.mts';

const state = { signedIn: true, me: { id: 'p-maya', name: 'Maya Chen' }, team: { id: 't-1' } };
const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

describe('the room a file opens in', () => {
  it('is the same for every version of the file and every way the project is spelled', () => {
    expect(liveRoomId('t-1', 'Launch', 'launch-plan.md')).toBe(liveRoomId('t-1', 'launch', 'launch-plan.md'));
    expect(liveRoomId('t-1', 'Launch', 'launch-plan.md')).toBe(liveRoomId('t-1', 'Launch', 'launch-plan-v3.md'));
  });

  it('is the same for a teammate\'s copy named after its bytes, and for a file in a folder', () => {
    const one = liveRoomId('t-1', 'Launch', 'launch-leads.csv');
    expect(liveRoomId('t-1', 'Launch', '09450eccb664-launch-leads.csv')).toBe(one);
    expect(liveRoomId('t-1', 'Launch', 'attachments/09450eccb664-launch-leads.csv')).toBe(one);
    expect(liveRoomId('t-1', 'Launch', 'designs/w-1/launch-leads.csv')).toBe(one);
  });

  it('keeps a name that only looks like it starts with bytes', () => {
    expect(liveRoomId('t-1', 'Launch', 'cafe-plan.md')).not.toBe(liveRoomId('t-1', 'Launch', 'plan.md'));
  });

  it('is another room for another file, another project or another team', () => {
    const one = liveRoomId('t-1', 'Launch', 'launch-plan.md');
    expect(liveRoomId('t-1', 'Launch', 'launch-leads.csv')).not.toBe(one);
    expect(liveRoomId('t-1', 'Hiring', 'launch-plan.md')).not.toBe(one);
    expect(liveRoomId('t-2', 'Launch', 'launch-plan.md')).not.toBe(one);
  });

  it('never carries the file or project name to the relay', () => {
    const id = liveRoomId('t-1', 'Launch', 'launch-plan.md');
    expect(id).not.toMatch(/launch/i);
  });

  it('is handed out for a shared file with Multiplayer on', () => {
    const room = liveRoomFor({ address: 'ws://127.0.0.1:54900', state, multiplayer: true, project: 'Launch', name: 'launch-plan.md', shared: true, owner: true });
    expect(room.url).toBe(`ws://127.0.0.1:54900/room/${encodeURIComponent(liveRoomId('t-1', 'Launch', 'launch-plan.md'))}`);
    expect(room.me).toMatchObject({ name: 'Maya Chen', person: 'p-maya', canSave: true, owner: true, kind: 'person' });
  });

  it('is not handed out without a relay, Multiplayer, a sign-in, a team or a shared project', () => {
    const base = { address: 'ws://x', state, multiplayer: true, project: 'Launch', name: 'a.md', shared: true };
    expect(liveRoomFor({ ...base, address: null })).toBeNull();
    expect(liveRoomFor({ ...base, multiplayer: false })).toBeNull();
    expect(liveRoomFor({ ...base, shared: false })).toBeNull();
    expect(liveRoomFor({ ...base, state: { ...state, signedIn: false } })).toBeNull();
    expect(liveRoomFor({ ...base, state: { ...state, team: null } })).toBeNull();
  });
});

describe('where the relay is', () => {
  it('is the stand-in cloud\'s own door, a configured address, or nowhere', () => {
    expect(liveAddress({ url: 'http://127.0.0.1:54900/', standin: true })).toBe('ws://127.0.0.1:54900');
    expect(liveAddress({ url: 'https://x.supabase.co', live: 'wss://live.example/' })).toBe('wss://live.example');
    expect(liveAddress({ url: 'https://x.supabase.co' })).toBeNull();
    expect(liveAddress(null)).toBeNull();
  });
});

describe('the views a shared file opens in', () => {
  it('pass the project name, which a teammate\'s copy knows only from the card', () => {
    expect(read('renderer/src/threads/TeammateThread.tsx')).toContain('project={card.project ?? null}');
    expect(read('renderer/src/files/FilesPlace.tsx')).toContain('project={view?.project ?? null}');
  });
  it('keep a project\'s own documents out of live rooms, and let a thread\'s files in', () => {
    const pane = read('renderer/src/components/DocPane.tsx');
    expect(pane).toMatch(/const threadsFile = \/\^\(\?:\\\.\\\/\)\?designs\\\//);
    expect(pane).toContain('useLiveTicket(threadsFile ?');
  });
});
