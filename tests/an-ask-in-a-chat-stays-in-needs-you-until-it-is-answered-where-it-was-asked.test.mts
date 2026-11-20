// AN ASK IN A CHAT STAYS IN NEEDS YOU UNTIL IT IS ANSWERED WHERE IT WAS ASKED (2026-11-20).
//
// Fourth synthetic team run, read off the stand-in cloud's messages:
// - Lena sent Priya "Review and send back: ..." in their chat. Priya read it
//   and wrote "Got it, looking now!", and the ask left her Needs you. It was
//   meant to stay while her review was open, but that rule asked whether
//   Lena's thread still waited on Priya, and a second ask Lena made on the
//   same thread (to Sam) had put its wait on Sam.
// - Sam asked Theo "Help with this step: ...". Theo wrote in their chat, and
//   the ask went: only a review ask was kept, never a help ask.
// An ask (help or review) to me now stays until I answer it on its thread,
// send the review back on its files, press Mark done, or the thread is done.
// Measured on two Macs over the in-memory cloud.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createRooms, roomPrefsFile } from '../main/team/rooms.mts';
import { askWords } from '../shared/thread-ask.mts';
import { personWait } from '../shared/thread-waits.mts';

const T = Date.UTC(2026, 10, 20, 5, 17);
const flush = () => new Promise((r) => setTimeout(r, 0));
const timers = { setTimeout: (fn: () => void) => { const h = { off: false }; queueMicrotask(() => { if (!h.off) fn(); }); return h; }, clearTimeout: (h: { off: boolean } | null) => { if (h) h.off = true; } };

type Card = { personId: string; threadId: string; state: string; blockedBy: { id: string; title: null; want?: string }[] };
type Talk = { kind: string; owner: string; threadId: string; by: string; at?: number };

describe('an ask to me in our chat', () => {
  let clock = T;
  let cards: Card[] = [];
  let talk: Talk[] = [];
  type Mac = { id: string; name: string; backend: ReturnType<typeof memoryBackend>; rooms: ReturnType<typeof createRooms> };
  let sam: Mac; let theo: Mac;
  let room = '';
  const ask = (want: 'help' | 'review') => askWords({ want, title: 'Payments API input validation gaps', link: `https://app.agentbox.ac/t/${sam.id}/w-gaps`, note: 'Could you pick one?' });
  const theosRow = async () => { await flush(); await theo.rooms.refresh(); return theo.rooms.state().mentions.find((m) => m.roomId === room) ?? null; };

  beforeEach(async () => {
    clock = T; cards = []; talk = [];
    const cloud = createMemoryCloud();
    cloud.now = () => clock;
    let teamState: { team: { id: string } | null; people: { id: string; name: string }[]; cards: Card[] } = { team: null, people: [], cards: [] };
    const mk = (name: string): Mac => {
      const id = signUpMemory(cloud, { email: `${name.split(' ')[0].toLowerCase()}@team.test`, name });
      const backend = memoryBackend(cloud, id);
      const rooms = createRooms({
        backend: () => backend, me: () => ({ id, name, avatarUrl: null, status: null }), team: () => ({ ...teamState, cards }), enabled: () => true,
        device: () => '0123456789ab', presenceFacts: () => ({ running: [], items: [], products: [], summary: null }),
        prefsFile: roomPrefsFile(fs.mkdtempSync(path.join(os.tmpdir(), `ask-${name.split(' ')[0]}-`))), now: () => clock, timers,
        threadTalk: () => talk,
      });
      return { id, name, backend, rooms };
    };
    sam = mk('Sam Ortiz');
    theo = mk('Theo Okafor');
    const team = await sam.backend.createTeam('Agentbox Team');
    await sam.backend.invite(team.id, 'theo@team.test');
    await theo.backend.acceptInvite(team.id);
    teamState = { team: { id: team.id }, people: [sam, theo].map((m) => ({ id: m.id, name: m.name })), cards };
    for (const m of [sam, theo]) await m.rooms.start();
    room = await sam.rooms.create({ name: 'Theo Okafor', kind: 'group', people: [sam.id, theo.id] });
    await theo.rooms.refresh();
  });

  const sendAsk = async (want: 'help' | 'review', waitsOn: string) => {
    cards.push({ personId: sam.id, threadId: 'w-gaps', state: 'waiting', blockedBy: [{ id: personWait(waitsOn), title: null, want }] });
    clock += 1000;
    await sam.rooms.send(room, ask(want));
  };
  const readAndReply = async (words: string) => {
    clock += 60_000;
    await theo.rooms.markRead(room);
    await theo.rooms.send(room, words);
  };

  it('a help ask stays after I read the chat and write in it: the reported case', async () => {
    await sendAsk('help', theo.id);
    await readAndReply('On it after lunch');
    expect((await theosRow())?.body).toBe(ask('help'));
  });

  it('a review ask stays though the thread now waits on someone else for another ask', async () => {
    await sendAsk('review', theo.id);
    cards[0].blockedBy = [{ id: personWait('p-someone-else'), title: null, want: 'help' }];
    await readAndReply('Got it, looking now!');
    expect((await theosRow())?.body).toBe(ask('review'));
  });

  it('goes once I answer it on its thread', async () => {
    await sendAsk('help', theo.id);
    await readAndReply('On it');
    talk = [{ kind: 'comment', owner: sam.id, threadId: 'w-gaps', by: theo.id, at: clock + 5 }];
    clock += 10;
    expect(await theosRow()).toBeNull();
  });

  it('goes once I press Mark done, or the thread is done', async () => {
    await sendAsk('help', theo.id);
    await readAndReply('On it');
    await theo.rooms.markDone(room);
    expect(await theosRow()).toBeNull();
  });

  it('must NOT keep an ask from a thread that is done', async () => {
    await sendAsk('help', theo.id);
    cards[0].state = 'done';
    await readAndReply('Done already?');
    expect(await theosRow()).toBeNull();
  });

  it('must NOT keep an ordinary message once I answered it', async () => {
    clock += 1000;
    await sam.rooms.send(room, 'Lunch at one?');
    await readAndReply('Yes');
    expect(await theosRow()).toBeNull();
  });
});
