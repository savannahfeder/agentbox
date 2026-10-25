// THE TWO SETTINGS FOR CHATS YOU STARTED YOURSELF SAY WHEN EACH APPLIES.
//
// Settings › Running had "Agents you started yourself: Show in your inbox —
// None. Claude Code started in a terminal, not from here. None reach your
// inbox." and, right under it, "Bring in new chats" (w-62228098e6). Both power
// testers stopped on it: with the first at None, does turning the second on do
// anything, and which one wins? They answer different moments: the first is a
// session while it runs, the second a chat once it has stopped. So they sit in
// one group and each says its moment.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { searchSettings } from '../renderer/src/settings-search';

const settings = fs.readFileSync(new URL('../renderer/src/components/Settings.tsx', import.meta.url), 'utf8');
const group = settings.slice(settings.indexOf('<Group id="outside"'), settings.indexOf('</Group>', settings.indexOf('<Group id="outside"')));

describe('chats you started yourself, in Settings', () => {
  it('are one group with a row for while they run and one for once they stop', () => {
    expect(group).toContain('label="Show while they run"');
    expect(group).toContain('label="Bring in new chats"');
    expect(settings).not.toContain('<Group id="new-chats"');
  });

  // Both testers turned it on and looked for their chats a few minutes later.
  // A chat comes in after ten quiet minutes (QUIET_MS, main/new-chats-watch.mjs).
  it('says how long a chat is still before it comes in', () => {
    expect(group).toMatch(/after ten quiet minutes/);
  });

  it('never says none reach the inbox, when stopped chats can', () => {
    expect(settings).not.toContain('None reach your inbox.');
    expect(settings).toMatch(/off: 'Each is still in its project’s sidebar\.'/);
  });

  it('is still found by searching for it', () => {
    const hit = searchSettings('bring in new chats', { pages: ['running'] })[0];
    expect(hit).toMatchObject({ page: 'running', label: 'Bring in new chats', anchor: 'outside' });
  });
});
