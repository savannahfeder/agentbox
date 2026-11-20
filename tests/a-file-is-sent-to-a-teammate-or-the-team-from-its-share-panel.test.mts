// A FILE IS SENT TO A TEAMMATE OR THE TEAM FROM ITS SHARE PANEL (2026-11-20).
//
// On a synthetic team, Lena opened bookings-option-1 v2 in Files and pressed
// Share. The panel offered only a public link: "No public link. Copy link to
// let anyone see it and comment". She wanted to show it to Priya and the team.
// A file could already go into a chat (a room keeps files and opens them with
// notes and Approve) but nothing in Share led there. Measured on the panel:
// it drew the public link and nothing else.
//
// Share now lists the team's group and each teammate. Pressing one puts the
// file in that chat as a message, in the two-person chat for a person (made if
// there is none). No new cloud tables: the room files and messages there are.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createRooms, roomPrefsFile } from '../main/team/rooms.mts';
import { sendFileToChat, TEAM_CHAT } from '../main/team/file-to-chat.mts';
import { SendTo, sendTargets } from '../renderer/src/components/ShareLink.tsx';
import { REQUEST_CHANNELS } from '../shared/bridge-map.mts';

const flush = async () => { for (let i = 0; i < 20; i += 1) await new Promise((r) => setImmediate(r)); };
const timers = { setTimeout: (fn: () => void) => { const h = { off: false }; queueMicrotask(() => { if (!h.off) fn(); }); return h; }, clearTimeout: (h: { off: boolean } | null) => { if (h) h.off = true; } };

describe('sending a file into a chat', () => {
  type Mac = { id: string; name: string; backend: ReturnType<typeof memoryBackend>; rooms: ReturnType<typeof createRooms> };
  let lena: Mac; let priya: Mac; let theo: Mac; let file: string;
  beforeEach(async () => {
    const cloud = createMemoryCloud();
    let teamState: { team: { id: string } | null; people: { id: string; name: string }[]; cards: [] } = { team: null, people: [], cards: [] };
    const mk = (name: string): Mac => {
      const id = signUpMemory(cloud, { email: `${name.split(' ')[0].toLowerCase()}@team.test`, name });
      const backend = memoryBackend(cloud, id);
      const rooms = createRooms({
        backend: () => backend, me: () => ({ id, name, avatarUrl: null, status: null }), team: () => teamState, enabled: () => true,
        device: () => '0123456789ab', presenceFacts: () => ({ running: [], items: [], products: [], summary: null }),
        prefsFile: roomPrefsFile(fs.mkdtempSync(path.join(os.tmpdir(), `send-${name.split(' ')[0]}-`))), now: () => Date.now(), timers,
      });
      return { id, name, backend, rooms };
    };
    lena = mk('Lena Fischer'); priya = mk('Priya Shah'); theo = mk('Theo Okafor');
    const team = await lena.backend.createTeam('Agentbox Team');
    for (const m of [priya, theo]) {
      await lena.backend.invite(team.id, `${m.name.split(' ')[0].toLowerCase()}@team.test`);
      await m.backend.acceptInvite(team.id);
    }
    teamState = { team: { id: team.id }, people: [lena, priya, theo].map((m) => ({ id: m.id, name: m.name })), cards: [] };
    for (const m of [lena, priya, theo]) await m.rooms.start();
    file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'design-')), 'bookings-option-1-v2.html');
    fs.writeFileSync(file, '<h1>Bookings</h1>');
  });
  const said = (m: Mac, roomId: string) => (m.rooms.state().messages?.[roomId] ?? []).map((x: { body: string }) => x.body);

  it('puts it in the chat with Priya, the reported one, and she has it', async () => {
    const roomId = await sendFileToChat({ rooms: lena.rooms, me: lena.id, to: priya.id, toName: priya.name, files: [file] });
    await flush();
    await priya.rooms.refresh();
    const body = said(priya, roomId).at(-1) ?? '';
    expect(body).toMatch(/^\[bookings-option-1-v2\.html\]\(attachments\/[a-f0-9]{8}-bookings-option-1-v2\.html\)$/);
    expect(said(theo, roomId)).toEqual([]);
  });

  it('uses the same chat with her the next time', async () => {
    const first = await sendFileToChat({ rooms: lena.rooms, me: lena.id, to: priya.id, toName: priya.name, files: [file] });
    await lena.rooms.refresh();
    expect(await sendFileToChat({ rooms: lena.rooms, me: lena.id, to: priya.id, toName: priya.name, files: [file] })).toBe(first);
  });

  it('puts it in the team’s group for everyone', async () => {
    const roomId = await sendFileToChat({ rooms: lena.rooms, me: lena.id, to: TEAM_CHAT, toName: 'Agentbox Team', files: [file] });
    const group = lena.rooms.state().rooms.find((r: { teamId?: string | null }) => r.teamId);
    expect(roomId).toBe(group?.id);
    await theo.rooms.refresh();
    expect(said(theo, roomId).at(-1)).toContain('bookings-option-1-v2.html');
  });

  it('says so when there is no file there', async () => {
    await expect(sendFileToChat({ rooms: lena.rooms, me: lena.id, to: priya.id, toName: priya.name, files: [`${file}.gone`] })).rejects.toThrow(/could not be read/);
  });
});

describe('who the Share panel offers', () => {
  const people = [
    { id: 'p-lena', name: 'Lena Fischer', email: 'lena@team.test', avatarUrl: null },
    { id: 'p-priya', name: 'Priya Shah', email: 'priya@team.test', avatarUrl: null },
    { id: 'p-theo', name: 'Theo Okafor', email: 'theo@team.test', avatarUrl: null },
  ];
  const group = { id: 'r-team', name: 'Agentbox Team', teamId: 't-1' };

  it('is the team’s group, then each teammate, never you', () => {
    expect(sendTargets({ me: 'p-lena', people, rooms: [group, { id: 'r-pair', name: 'Theo', teamId: null }] })).toEqual([
      { to: 'team', name: 'Agentbox Team' }, { to: 'p-priya', name: 'Priya' }, { to: 'p-theo', name: 'Theo' },
    ]);
  });

  it('is only the teammates when there is no group', () => {
    expect(sendTargets({ me: 'p-lena', people, rooms: [] }).map((t) => t.to)).toEqual(['p-priya', 'p-theo']);
  });

  it('is nobody for someone with no team', () => {
    expect(sendTargets({ me: 'p-lena', people: [people[0]], rooms: [] })).toEqual([]);
  });

  it('draws each one as a button that names them', () => {
    const html = renderToStaticMarkup(React.createElement(SendTo, { targets: sendTargets({ me: 'p-lena', people, rooms: [group] }), busy: null, sent: null, onPick: () => {} }));
    expect(html).toContain('Send to');
    for (const name of ['Agentbox Team', 'Priya', 'Theo']) expect(html).toContain(`>${name}</button>`);
  });

  it('says where it went once sent', () => {
    const html = renderToStaticMarkup(React.createElement(SendTo, { targets: sendTargets({ me: 'p-lena', people, rooms: [group] }), busy: null, sent: 'p-priya', onPick: () => {} }));
    expect(html).toContain('Sent to Priya');
  });

  it('has a way across from the window', () => {
    expect(REQUEST_CHANNELS.fileToChat).toBe('zero:file-to-chat');
    const preload = fs.readFileSync(new URL('../preload.cjs', import.meta.url), 'utf8');
    expect(preload).toContain("fileToChat: (payload) => ipcRenderer.invoke('zero:file-to-chat', payload)");
  });
});
