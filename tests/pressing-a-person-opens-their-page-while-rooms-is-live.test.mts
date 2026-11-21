// PRESSING A PERSON OPENS THEIR PAGE WHILE ROOMS IS LIVE (2026-11-11).
//
// Two synthetic testers on one team, 2026-11-11. Pressing a teammate opened
// whichever of two conversations was written in last: their page with the
// Rooms chat, or the older direct record drawn as a focused thread. After a
// shared link wrote into the direct record, Team > People > Lena opened that
// record, "an agent thread with Done and Runs on Cloud although this is a
// person conversation", and it started at 4:23 without the 4:16 and 4:19
// messages in the chat. With Rooms live a person now always opens their page;
// an older direct conversation is one quiet button on it. With Rooms off,
// pressing a person does what it did.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { personPressOpens } from '../renderer/src/team/one-conversation.ts';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');

describe('what pressing a person opens', () => {
  it('is their page while Rooms is live, even when the direct record is newer', () => {
    expect(personPressOpens({ roomsLive: true, direct: { at: 200 }, room: { at: 100 } })).toBe('place');
  });

  it('is their page while Rooms is live with only a direct record', () => {
    expect(personPressOpens({ roomsLive: true, direct: { at: 200 }, room: null })).toBe('place');
  });

  it('is their page while Rooms is live with a newer chat', () => {
    expect(personPressOpens({ roomsLive: true, direct: { at: 100 }, room: { at: 200 } })).toBe('place');
  });

  it('is unchanged with Rooms off: the direct record when it is the newer', () => {
    expect(personPressOpens({ roomsLive: false, direct: { at: 200 }, room: { at: 100 } })).toBe('direct');
    expect(personPressOpens({ roomsLive: false, direct: { at: 200 }, room: null })).toBe('direct');
    expect(personPressOpens({ roomsLive: false, direct: { at: 100 }, room: { at: 200 } })).toBe('place');
    expect(personPressOpens({ roomsLive: false, direct: null, room: null })).toBe('place');
  });
});

describe('the app', () => {
  it('asks that rule when a person is pressed', () => {
    expect(app).toMatch(/const personDirect = \(personId: string\) => \{[\s\S]{0,400}?return personPressOpens\(\{ roomsLive: roomsUi\.live, direct, room: room && \{ at: room\.lastAt \} \}\) === 'direct' \? direct : null;/);
  });

  it('offers an older direct conversation on the page as one quiet button', () => {
    expect(app).toMatch(/const earlier = roomsUi\.live \? directWith\(id\) : null;/);
    expect(app).toMatch(/\{earlier && <PlaceAction quiet onClick=\{\(\) => \{ setChatsPlace\(null\); setChatsDirect\(earlier\.id\); setFocused\(earlier\.item\); markSeen\(earlier\.item\); \}\} title=\{`Your messages with \$\{first\} from before this chat`\}>Earlier messages<\/PlaceAction>\}/);
  });

  it('opens the chat, not the old record, from a person\'s Messages while Rooms is live', () => {
    expect(app).toMatch(/const chat = person \? personChats\.get\(person\) : undefined;\s*const talk = person && !\(roomsUi\.live && chat\) \? directWith\(person\) : null;/);
  });

  it('still opens a task row from Needs you as its task', () => {
    expect(app).toMatch(/const onYou = mineInNeeds\.filter\(/);
    expect(app).toMatch(/listPart\('Tasks you gave', given\.map\(\(i\) => itemRow\(/);
    expect(app).toMatch(/const itemRow = \(i: WorkItem, word: string, tone: PlaceRow\['tone'\]\): PlaceRow => \(\{ key: `\$\{i\.product\}\/\$\{i\.id\}`, title: rowTitle\(i\), word, at: i\.updatedAt, tone, onOpen: \(\) => openItem\(i\) \}\);/);
  });
});
