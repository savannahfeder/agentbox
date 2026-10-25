// "It's also not using my profile picture in chats, which is a bit strange."
// Your messages in the team chat drew your initials in a grey square while
// the sidebar's corner, Groups and the inbox all drew your photo. The page was
// handed your name and nothing else. Now it is handed your photo too, the one
// the sidebar draws, and falls back to initials only when there is none.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const read = (f) => fs.readFileSync(new URL(`../renderer/src/${f}`, import.meta.url), 'utf8');

describe('your messages in the team chat', () => {
  it('carry your photo when you have one, and your initials when you do not', () => {
    const page = read('teammates/TeammatesPage.tsx');
    expect(page).toMatch(/mine \? \(mePic \? <img className="rm-pic tq-you tq-ph" src=\{mePic\} alt="" referrerPolicy="no-referrer" \/> : <span className="rm-pic rm-ini tq-you"/);
  });

  it('are handed the same photo the sidebar draws for you', () => {
    const app = read('App.tsx');
    expect(app).toMatch(/mePic: team\?\.byId\.get\(team\.me \?\? ''\)\?\.avatarUrl \?\? null,/);
    expect(read('teammates/useTeammates.tsx')).toMatch(/mePic=\{mePic\}/);
  });
});
