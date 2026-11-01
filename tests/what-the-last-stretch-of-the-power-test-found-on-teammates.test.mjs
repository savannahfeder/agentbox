// The last stretch of the power test of 2026-10-25, on teammates:
// - "Playbook buttons on a teammate's first message look pressable but do
//   nothing": once you had answered its greeting in your own words, the six
//   starter answers stayed on screen, disabled, looking like the live ones.
// - "Esc on a teammate's About throws me out of Chats to the Threads list":
//   Esc left Chats from any of a teammate's pages instead of going back one.
// - "Sending a New thread to a teammate yanks me out of Threads into its chat
//   mid-burst": the New thread box opened the teammate's chat after sending.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

describe('answers to tap, once you have answered', () => {
  // Your own words to one question by name are lit as its answer since
  // w-615b74b8cb; a plain message under several questions still lights none.
  it('show only the one you picked, and none when you answered in your own words', () => {
    expect(read('renderer/src/teammates/TeammatesPage.tsx')).toMatch(/answered && \(m\.options\.includes\(answered\.text\.trim\(\)\) \|\| answered\.named\)/);
  });
});

describe('Escape on a teammate\'s page', () => {
  it('goes back one step: from About, its Log or a playbook to its chat, and from the chat out of Chats', () => {
    expect(read('renderer/src/App.tsx')).toMatch(/if \(e\.key === 'Escape'\) \{ e\.preventDefault\(\); teammatesUi\.back\(\); \}/);
    expect(read('renderer/src/teammates/useTeammates.tsx')).toMatch(/back: \(\) => \(shown && \(shown\.kind === 'about' \|\| shown\.kind === 'log' \|\| shown\.kind === 'book'\) \? go\(shown\.id\) : leave\(\)\)/);
  });
});

describe('a New thread to a teammate', () => {
  it('leaves you where you were and says who it went to; only a new teammate opens its chat', () => {
    const app = read('renderer/src/App.tsx');
    const send = app.slice(app.indexOf('onToTeammate={async (to, text, product) => {'), app.indexOf('onToTeammate={async (to, text, product) => {') + 900);
    expect(send).toMatch(/if \(to === 'new'\) teammatesUi\.go\(r\.value\?\.teammate\?\.id \?\? 'team'\);\s*else showToast\(`Sent to \$\{snap\.teammates\?\.list\.find\(\(t\) => t\.id === to\)\?\.name \?\? 'your teammate'\}`\);/);
  });
});
