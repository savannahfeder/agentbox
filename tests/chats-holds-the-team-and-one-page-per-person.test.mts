// CHATS HOLDS THE TEAM, AND ONE PAGE PER PERSON.
//
// The owner, 2026-11-02: the Team page in the sidebar was hard to read (two
// people side by side) and its Tasks did not belong there; "maybe the team page
// could be merged with the chats page... It's kind of weird for us to have two
// UIs for chats with people... we should only have one." And "No messages with
// person X yet" read as anything but a chat. On the layout "chats":
//   - Chats' list opens with Team, the team's day, one person under another
//   - a person or an AI teammate in that list opens the one page a face opens
//     (their chat, what they are on, what waits between you), inside Chats
//   - the sidebar has no Team page; tasks stay on each person's page
//   - an empty chat says how to start it
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (f) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');
const app = read('renderer/src/App.tsx');

describe('the chats layout', () => {
  it('is the home whenever there is a team, and one list without one', () => {
    expect(app).toContain("const homeLayout: HomeLayout = teamMode ? 'chats' : 'list';");
  });

  it('opens a person or an AI teammate from Chats on their one page', () => {
    expect(app).toMatch(/onTeammate: \(id\) => \(homeLayout === 'chats' \? openChatsPlace\(`mate:\$\{id\}`\) : teammatesUi\.go\(id\)\)/);
    expect(app).toMatch(/chatsPlaceShown \? <ChatsFrame current=\{chatsListKey\}>/);
  });

  it('puts Team first in the Chats list, drawn one person under another', () => {
    expect(read('renderer/src/teammates/ChatsColumn.tsx')).toMatch(/c\.onTeam && <button type="button" className=\{`cx-row cx-team/);
    expect(read('renderer/src/team/today.css')).toMatch(/\.cx-frame-main \.td-people \{ columns: 1;/);
  });

  it('has no Team page in the sidebar', () => {
    expect(app).not.toContain('onTasks={');
  });

  it('opens a face from Needs you on the same page in Chats', () => {
    expect(app).toMatch(/if \(homeLayout === 'chats' && !tabAsked && pressOpensIn\(key, evTeamKey \? `room:\$\{evTeamKey\}` : null\) === 'place'\) \{ openChatsPlace\(key\); return; \}/);
  });
});

describe('an empty chat', () => {
  it('says how to start it, in the shape of a chat', () => {
    const page = read('renderer/src/team/everything/PlacePage.tsx');
    expect(page).toMatch(/export function EmptyChat/);
    expect(app).not.toMatch(/No messages with \{first\} yet\./);
    expect(app).toMatch(/<EmptyChat name=\{first\} \/>/);
  });

  it('draws no back link where there is nothing to go back to', () => {
    expect(read('renderer/src/team/everything/PlacePage.tsx')).toMatch(/\{onBack && <button type="button" className="pl-back"/);
  });
});
