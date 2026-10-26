// A ROOM READS THE WAY IT WAS APPROVED (w-3d0fa23ffb, 2026-10-20).
//
// Round 23 was approved: "N agents working" under each card, @names that land
// on the right person, and the notice "You are invisible for N more minutes.
// Nobody in your rooms can see you." These are the rules behind those
// pictures, measured on plain data. Its room tabs after Done were replaced by
// the Rooms page (w-a0429b3d5e), and that by Groups
// (tests/groups-opens-the-group-open-last).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { weekRank, agentsWords, mentionsIn, markMentions, invisibleNotice, minutesToMidnight, initialsOf, UNTIL_TURNED_OFF_MS } from '../renderer/src/team/rooms/room-rules.ts';

describe('hours, in words', () => {
  it('whole hours from ten up, one decimal below, and never a 0 for some', async () => {
    const { hoursWords } = await import('../renderer/src/team/rooms/room-rules.ts');
    expect([4810, 41.6, 9.94, 0.25, 0.02, 0].map(hoursWords)).toEqual(['4,810', '42', '9.9', '0.3', 'under 0.1', '0']);
  });
});

describe('a sentence that ends in a name', () => {
  // Seen in Settings 2026-10-21: "Off, rooms show you as Sam R.." with two stops.
  it('takes one full stop, not two, after an initial', async () => {
    const { sentence } = await import('../renderer/src/team/rooms/room-rules.ts');
    expect(sentence('Off, rooms show you as Sam R.')).toBe('Off, rooms show you as Sam R.');
    expect(sentence('Off, rooms show you as Sam Rivera')).toBe('Off, rooms show you as Sam Rivera.');
    expect(sentence('Off, rooms show you as Sam R.  ')).toBe('Off, rooms show you as Sam R.');
  });
});

describe('their activity on their page', () => {
  it('a teammate who shares it, and always my own; never a stranger, never someone who turned it off', async () => {
    const { activityShown } = await import('../renderer/src/team/rooms/room-rules.ts');
    expect(activityShown({ me: false, teammate: true, showActivity: true })).toBe(true);
    expect(activityShown({ me: false, teammate: true, showActivity: false })).toBe(false);
    expect(activityShown({ me: false, teammate: false, showActivity: true })).toBe(false);
    expect(activityShown({ me: true, teammate: false, showActivity: false })).toBe(true);
  });
});

describe('ranks this week', () => {
  const wall = [{ id: 'a', hoursWeek: 30 }, { id: 'b', hoursWeek: 12 }, { id: 'c', hoursWeek: 12 }, { id: 'd', hoursWeek: 0 }];
  it('most hours first, a tie shares a place', () => {
    expect(['a', 'b', 'c', 'd'].map((id) => weekRank(wall, id))).toEqual([1, 2, 2, 4]);
  });
});

describe('words on a card', () => {
  it('agents working', () => {
    expect(agentsWords(4)).toBe('4 agents working');
    expect(agentsWords(1)).toBe('1 agent working');
    expect(agentsWords(0)).toBe('Not running');
    expect(agentsWords(null)).toBe('Not running');
  });
  it('initials when there is no photo', () => {
    expect(initialsOf('Sam R.')).toBe('SA');
    expect(initialsOf('')).toBe('?');
  });
});

describe('@names', () => {
  const people = [{ id: 'm', name: 'Maya C.' }, { id: 't', name: 'Theo B.' }, { id: 'j1', name: 'Jun O.' }, { id: 'j2', name: 'Jun K.' }];
  it('the name on the card, or the first name alone', () => {
    expect(mentionsIn('@Maya C. can you look', people)).toEqual(['m']);
    expect(mentionsIn('thanks @theo!', people)).toEqual(['t']);
  });
  it('a first name two people share names nobody unless the whole name is written', () => {
    expect(mentionsIn('@Jun are you there', people)).toEqual([]);
    expect(mentionsIn('@Jun K. are you there', people)).toEqual(['j2']);
  });
  it('an email or a word that only starts with a name is not a mention', () => {
    expect(mentionsIn('mail maya@x.com', people)).toEqual([]);
    expect(mentionsIn('@Mayan ruins', people)).toEqual([]);
  });
  it('drawn as marks inside the text', () => {
    expect(markMentions('hi @Maya C. and @Theo B.', ['Maya C.', 'Theo B.'])).toEqual([
      { text: 'hi ', mention: false }, { text: '@Maya C.', mention: true }, { text: ' and ', mention: false }, { text: '@Theo B.', mention: true },
    ]);
  });
});

describe('invisible', () => {
  const now = Date.parse('2026-10-22T15:00:00-07:00');
  it('says how long, in plain words', () => {
    expect(invisibleNotice(new Date(now + 52 * 60_000).toISOString(), now)).toBe('You are invisible for 52 more minutes. Nobody in your rooms can see you.');
    expect(invisibleNotice(new Date(now + 30_000).toISOString(), now)).toBe('You are invisible for 1 more minute. Nobody in your rooms can see you.');
    expect(invisibleNotice(new Date(now + 150 * 60_000).toISOString(), now)).toBe('You are invisible for 3 more hours. Nobody in your rooms can see you.');
    expect(invisibleNotice(new Date(now + 59.8 * 60_000).toISOString(), now)).toBe('You are invisible for 1 more hour. Nobody in your rooms can see you.');
    expect(invisibleNotice(new Date(now + 59 * 60_000).toISOString(), now)).toBe('You are invisible for 59 more minutes. Nobody in your rooms can see you.');
    expect(invisibleNotice(new Date(now + UNTIL_TURNED_OFF_MS).toISOString(), now)).toBe('You are invisible until you turn it off. Nobody in your rooms can see you.');
  });
  it('says nothing when it has run out or was never on', () => {
    expect(invisibleNotice(new Date(now - 1).toISOString(), now)).toBeNull();
    expect(invisibleNotice(null, now)).toBeNull();
  });
  it('until tomorrow is until midnight here', () => {
    expect(minutesToMidnight(now)).toBe(9 * 60);
  });
});

describe('leaving a room', () => {
  // Found on the built screens 2026-10-20: with a room's chat full page,
  // clicking Threads only stepped out of full page and the room stayed up.
  it('Escape steps back one level; picking a tab or Threads leaves rooms entirely', () => {
    const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
    expect(app).toMatch(/if \(e\.key === 'Escape'\) \{ e\.preventDefault\(\); roomsUi\.close\(\); \}/);
    expect(app).toMatch(/const openView = \(next: View\) => \{ roomsUi\.leave\(\);/);
    expect(app).toContain('onView={openView}');
    expect(app.match(/onView=\{\(next\) => \{ roomsUi\.leave\(\);/g)).toHaveLength(1);
    expect(app).not.toMatch(/onView=\{\(?next\)? => \{ roomsUi\.close\(\)/);
  });
});

describe('the chat looks as approved', () => {
  // The founder, 2026-10-21, with a picture: the invite and full-page buttons
  // sat right after the room's name; round 23 puts them at the panel's right
  // end. `.ic:first-of-type` never matched, because the name is a button too.
  // And the day labels lose their hairline: "the headers alone are enough".
  const css = fs.readFileSync(new URL('../renderer/src/team/rooms/rooms.css', import.meta.url), 'utf8');
  it('the chat head’s buttons sit at its right end', () => {
    expect(css).toMatch(/\.rm-chat-head \.rm-switch \+ \.ic \{ margin-left: auto; \}/);
    expect(css).not.toMatch(/\.ic:first-of-type/);
  });
  it('a day label in the chat has no rule beside it', () => {
    expect(css).not.toMatch(/\.rm-day::after/);
  });
});

describe('the rest of round 23, checked screen by screen on 2026-10-21', () => {
  const now = Date.parse('2026-10-21T15:00:00-07:00');
  it('an invite you sent says when, or that they joined', async () => {
    const { sentWords } = await import('../renderer/src/team/rooms/room-rules.ts');
    expect(sentWords({ at: now - 3_600_000, joined: false }, now)).toBe('Sent today');
    expect(sentWords({ at: now - 20 * 3_600_000, joined: false }, now)).toBe('Sent yesterday');
    expect(sentWords({ at: Date.parse('2026-10-14T12:00:00-07:00'), joined: false }, now)).toBe('Sent Oct 14');
    expect(sentWords({ at: now - 3_600_000, joined: true }, now)).toBe('Joined');
  });
  it('Find rooms: Popular is most people first, New is newest first', async () => {
    const { findOrder } = await import('../renderer/src/team/rooms/room-rules.ts');
    const rooms = [{ id: 'a', members: 3, createdAt: 30 }, { id: 'b', members: 40, createdAt: 10 }, { id: 'c', members: 3, createdAt: 20 }];
    expect(findOrder(rooms, 'popular').map((r) => r.id)).toEqual(['b', 'c', 'a']);
    expect(findOrder(rooms, 'new').map((r) => r.id)).toEqual(['a', 'c', 'b']);
  });
  // Seen on the invisible screen: my card leaves my own wall, and the chat
  // read its names from the wall, so "@Sam R." lost its mark and my own
  // messages would have read "Someone".
  it('the chat still knows me while I am invisible, and never twice', async () => {
    const { withMe } = await import('../renderer/src/team/rooms/room-rules.ts');
    const maya = { id: 'm', name: 'Maya C.', me: false };
    const me = { id: 's', name: 'Sam R.', me: true };
    expect(withMe([maya], me)).toEqual([maya, me]);
    expect(withMe([maya, me], { ...me, name: 'other' })).toEqual([maya, me]);
    expect(withMe([maya], null)).toEqual([maya]);
  });
  it('while I am invisible a room counts one fewer person, and never below none', async () => {
    const { peopleCount } = await import('../renderer/src/team/rooms/room-rules.ts');
    expect(peopleCount({ members: 15 }, false)).toBe(15);
    expect(peopleCount({ members: 15 }, true)).toBe(14);
    expect(peopleCount({ members: 0 }, true)).toBe(0);
  });
  // A room's chat full page, the messages page, a person's page and Find
  // rooms are pages of their own: their title is in the top bar, and the
  // state tabs are not drawn over them.
  it('a full page has its own title and no state tabs', () => {
    const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
    expect(app).toMatch(/roomShown && roomsUi\.heading \? roomsUi\.heading\.title : <h1 className="workspace-title">Threads<\/h1>/);
    expect(app).toMatch(/\{search === null && !\(roomShown && roomsUi\.heading\) && \(\s*<StateTabs/);
    expect(app).toMatch(/roomShown && roomsUi\.heading\?\.right !== undefined \? roomsUi\.heading\.right : \(?\s*<HeaderActions/);
  });
});

describe('before my room card exists', () => {
  // The founder's first run on the real cloud: no card yet, so her messages
  // read "Someone" and Settings had no Rooms page at all.
  const rooms = fs.readFileSync(new URL('../renderer/src/team/rooms/useRooms.tsx', import.meta.url), 'utf8');
  it('my own messages still carry my name', () => {
    expect(rooms).toMatch(/const meInChat = meId \? \{ id: meId, name: rooms\?\.me\?\.display_name \|\| myName/);
  });
  it('Settings still has its Rooms page, saying the card is on its way', () => {
    expect(rooms).toMatch(/: live \? <RoomsNotReady error=\{rooms\?\.error \?\? null\} \/> : undefined;/);
  });
});

describe('getting to a room, and keys on it', () => {
  // The founder, 2026-10-21: on Messages, clicking Astral in the sidebar did
  // not move her there, and N did nothing on a room's page.
  const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
  const rooms = fs.readFileSync(new URL('../renderer/src/team/rooms/useRooms.tsx', import.meta.url), 'utf8');
  it('opening a room leaves whatever covered it: a thread, a direct chat, the Team page, search', () => {
    expect(rooms).toMatch(/const openRoom = \(id: string\) => \{\s*onLeavePage\(\);/);
    expect(app).toMatch(/onLeavePage: \(\) => \{ setFocused\(null\); setFocusedRepeat\(null\); setTeamOpen\(false\); closeSearch\(\); \}/);
    expect(rooms).not.toMatch(/onLeaveDirect/);
  });
  // Below the guard that swallows a key opening a text field, so the N is
  // not typed into the box it opens (tests/shortcuts-swallow-their-key).
  it('N starts a new thread from a room, as it does everywhere else', () => {
    expect(app).toMatch(/if \(roomShown && e\.key !== 'Tab' && e\.key !== 'n' && e\.key !== 'N'( && e\.key !== '\\\\')?\) \{/);
    const branch = app.indexOf("if ((e.key === 'n' || e.key === 'N') && !roomsUi.dialogOpen) setModal('compose');");
    expect(branch).toBeGreaterThan(app.indexOf('if (opensATextField(e.key)) e.preventDefault();'));
  });
});

describe('the Messages row', () => {
  // The founder picked "two bubbles" on 2026-10-21 over the single square
  // bubble it had, an envelope, a bubble with dots and an at sign.
  it('wears two bubbles, one behind the other', () => {
    const icons = fs.readFileSync(new URL('../renderer/src/team/rooms/icons.tsx', import.meta.url), 'utf8');
    const row = icons.match(/chatNav: \(\) => svg\('([^']*)'/)?.[1];
    expect(row).toBe('<path d="M15 9V4H4v8h2v3l3-3"/><path d="M9 9h11v8h-2v3l-3-3H9z"/>');
  });
});
