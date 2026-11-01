// THE GROUPS TAB SHOWS ON THE PHONE ONLY WITH GROUPS ON.
//
// What was missing (2026-10-28, w-9f9c2570e2): the iPhone app's bottom bar had
// Needs you, In progress, Later and Done, and no way into Groups at all. Groups
// is an alpha feature switched on in the computer's Settings, Alpha features
// (`alphaRooms`), and the phone learns it only from the settings copy the
// computer sends (shared/phone-settings.mjs `alpha.rooms`). Measured with
// settings rows in the shape a computer sends: the tab is there after Done
// when the newest computer says on, and not when it says off, says nothing,
// or no computer has sent settings yet.
import { describe, it, expect } from 'vitest';
import { groupsOn } from '../renderer/src/phone-groups';
import { bottomTabs } from '../mobile/src/lib/groups';

const row = (device, at, rooms) => ({ device, name: device, updated_at: new Date(at).toISOString(), settings: { v: 1, workspace: rooms === undefined ? {} : { alpha: { rooms } } } });

describe('whether Groups is on, by the computer’s settings', () => {
  it('on when the computer says so', () => {
    expect(groupsOn([row('aaaaaaaaaaaa', 1000, true)])).toBe(true);
  });
  it('off when it says off, says nothing, or there is no computer', () => {
    expect(groupsOn([row('aaaaaaaaaaaa', 1000, false)])).toBe(false);
    expect(groupsOn([row('aaaaaaaaaaaa', 1000, undefined)])).toBe(false);
    expect(groupsOn([])).toBe(false);
    expect(groupsOn(null)).toBe(false);
    expect(groupsOn([{ device: 'x', name: 'x', updated_at: 'nonsense', settings: null }])).toBe(false);
  });
  it('the computer heard from last decides', () => {
    expect(groupsOn([row('old000000000', 1000, true), row('new000000000', 2000, false)])).toBe(false);
    expect(groupsOn([row('old000000000', 1000, false), row('new000000000', 2000, true)])).toBe(true);
  });
  it('only a real yes turns it on', () => {
    expect(groupsOn([row('aaaaaaaaaaaa', 1000, 'yes')])).toBe(false);
  });
});

describe('the bottom bar', () => {
  // 2026-10-31: the web app's team tabs, with your groups under Chats.
  it('is Needs you, Everything else and Chats when Groups is on', () => {
    const tabs = bottomTabs(true);
    expect(tabs.map((t) => t.label)).toEqual(['Needs you', 'Everything else', 'Chats']);
    expect(tabs.at(-1).id).toBe('chats');
  });
  it('has the four tabs and no Chats when it is off', () => {
    expect(bottomTabs(false).map((t) => t.label)).toEqual(['Needs you', 'In progress', 'Later', 'Done']);
  });
});
