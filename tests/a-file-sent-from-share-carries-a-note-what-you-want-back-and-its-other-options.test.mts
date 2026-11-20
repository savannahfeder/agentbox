// A FILE SENT FROM SHARE CARRIES A NOTE, WHAT YOU WANT BACK, AND ITS OTHER OPTIONS (2026-11-20).
//
// Rerun of Share > Send to on a synthetic team. Lena opened empty-state-a.png
// from her thread, pressed Share and then Priya. It said "Sent to Priya" at
// once: Priya got a bare picture with no question, there was no "Review and
// send back", and option B, a separate file of the same thread, could not go
// with it. Measured on the panel: a person's button called the send straight
// away with only the file on screen.
//
// A person's button now opens the thread's own send sheet (SendSheet): To,
// Review and send back, a note. Above it, the thread's other files can be
// added. The message carries the note under what you asked for, then every
// file, and lands in Priya's Needs you.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createRooms, roomPrefsFile } from '../main/team/rooms.mts';
import { sendFileToChat, fileMessage } from '../main/team/file-to-chat.mts';
import { FileSendSheet } from '../renderer/src/components/ShareLink.tsx';

const ASK = 'which of these two do you prefer?';
const flush = async () => { for (let i = 0; i < 20; i += 1) await new Promise((r) => setImmediate(r)); };
const timers = { setTimeout: (fn: () => void) => { const h = { off: false }; queueMicrotask(() => { if (!h.off) fn(); }); return h; }, clearTimeout: (h: { off: boolean } | null) => { if (h) h.off = true; } };

describe('the message a file goes in', () => {
  const links = [{ name: 'empty-state-a.png', stored: 'aa-empty-state-a.png' }, { name: 'empty-state-b.png', stored: 'bb-empty-state-b.png' }];

  it('says what you want back and your note, then every file as a picture', () => {
    expect(fileMessage({ note: ASK, want: 'review', links })).toBe(
      `Review and send back: ${ASK}\n\n![empty-state-a.png](attachments/aa-empty-state-a.png)\n![empty-state-b.png](attachments/bb-empty-state-b.png)`);
  });

  it('says what you want back with no note', () => {
    expect(fileMessage({ note: '', want: 'review', links: links.slice(0, 1) })).toBe('Review and send back\n\n![empty-state-a.png](attachments/aa-empty-state-a.png)');
  });

  it('is the note alone when you want nothing back, and a page is a link, not a picture', () => {
    expect(fileMessage({ note: ASK, want: null, links: [{ name: 'a.html', stored: 'x-a.html' }] })).toBe(`${ASK}\n\n[a.html](attachments/x-a.html)`);
  });
});

describe('on two computers', () => {
  type Mac = { id: string; name: string; backend: ReturnType<typeof memoryBackend>; rooms: ReturnType<typeof createRooms> };
  let lena: Mac; let priya: Mac; let a: string; let b: string;
  beforeEach(async () => {
    const cloud = createMemoryCloud();
    let teamState: { team: { id: string } | null; people: { id: string; name: string }[]; cards: [] } = { team: null, people: [], cards: [] };
    const mk = (name: string): Mac => {
      const id = signUpMemory(cloud, { email: `${name.split(' ')[0].toLowerCase()}@team.test`, name });
      const backend = memoryBackend(cloud, id);
      const rooms = createRooms({
        backend: () => backend, me: () => ({ id, name, avatarUrl: null, status: null }), team: () => teamState, enabled: () => true,
        device: () => '0123456789ab', presenceFacts: () => ({ running: [], items: [], products: [], summary: null }),
        prefsFile: roomPrefsFile(fs.mkdtempSync(path.join(os.tmpdir(), `opts-${name.split(' ')[0]}-`))), now: () => Date.now(), timers,
      });
      return { id, name, backend, rooms };
    };
    lena = mk('Lena Fischer'); priya = mk('Priya Shah');
    const team = await lena.backend.createTeam('Agentbox Team');
    await lena.backend.invite(team.id, 'priya@team.test');
    await priya.backend.acceptInvite(team.id);
    teamState = { team: { id: team.id }, people: [lena, priya].map((m) => ({ id: m.id, name: m.name })), cards: [] };
    for (const m of [lena, priya]) await m.rooms.start();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'options-'));
    a = path.join(dir, 'empty-state-a.png'); b = path.join(dir, 'empty-state-b.png');
    fs.writeFileSync(a, 'a'); fs.writeFileSync(b, 'b');
  });

  it('Priya gets both options and the question in one message, in her Needs you', async () => {
    const roomId = await sendFileToChat({ rooms: lena.rooms, me: lena.id, to: priya.id, toName: priya.name, files: [a, b], note: ASK, want: 'review' });
    await flush();
    await priya.rooms.refresh();
    const body = (priya.rooms.state().messages?.[roomId] ?? []).at(-1)?.body ?? '';
    expect(body.startsWith(`Review and send back: ${ASK}`)).toBe(true);
    expect(body).toMatch(/!\[empty-state-a\.png\]\(attachments\/[a-f0-9]{8}-empty-state-a\.png\)/);
    expect(body).toMatch(/!\[empty-state-b\.png\]\(attachments\/[a-f0-9]{8}-empty-state-b\.png\)/);
    expect(priya.rooms.state().mentions.map((m: { roomId: string }) => m.roomId)).toEqual([roomId]);
  });

  it('sends nothing when one of the files is gone', async () => {
    await expect(sendFileToChat({ rooms: lena.rooms, me: lena.id, to: priya.id, toName: priya.name, files: [a, `${b}.gone`], note: ASK, want: 'review' })).rejects.toThrow(/could not be read/);
    await lena.rooms.refresh();
    const said = Object.values(lena.rooms.state().messages ?? {}).flat();
    expect(said).toEqual([]);
  });
});

describe('the sheet a person’s button opens', () => {
  const people = [{ id: 'p-priya', name: 'Priya Shah', email: 'priya@team.test', avatarUrl: null }, { id: 'p-theo', name: 'Theo Okafor', email: 'theo@team.test', avatarUrl: null }];
  const draw = (others: string[], also: string[] = []) => renderToStaticMarkup(React.createElement(FileSendSheet, {
    name: 'empty-state-a.png', others, also, onAlso: () => {}, people, to: 'p-priya', onSend: () => {},
  }));

  it('is the thread’s send sheet, to Priya, asking for a review', () => {
    const html = draw([]);
    expect(html).toContain('aria-label="Send to someone"');
    expect(html).toContain('Priya');
    expect(html).toMatch(/aria-pressed="true"[^>]*>Review and send back</);
    expect(html).toContain('Send for review');
    expect(html).not.toContain('Copy link');
  });

  it('offers the thread’s other files beside this one, off until picked', () => {
    expect(draw(['designs/empty-state-b.png'])).toMatch(/aria-pressed="false"[^>]*>empty-state-b\.png</);
    expect(draw(['designs/empty-state-b.png'], ['designs/empty-state-b.png'])).toMatch(/aria-pressed="true"[^>]*>empty-state-b\.png</);
  });

  it('shows no files row when the thread has no other file', () => {
    expect(draw([])).not.toContain('aria-label="Files"');
  });

  it('is what a person’s button opens, and the group’s still sends at once', () => {
    const src = fs.readFileSync(new URL('../renderer/src/components/ShareLink.tsx', import.meta.url), 'utf8');
    expect(src).toContain('<FileSendSheet');
    expect(src).toMatch(/to === 'team' \? void sendTo\(/);
  });
});
