// From the power test of 2026-10-25 (two testers, an hour, teammates):
// - "Pausing a teammate shows nothing on its chat or in the list": the menu
//   closed and the header, the row and its cards looked exactly as before.
// - "Two teammates both called 'New teammate' in the Chats list": until its
//   setup run named it, every draft had the same name, so you clicked each to
//   find which was which.
// - "Read all 9 threads behind them first" sat in a new teammate's chat under
//   "You", though the app wrote it when you pressed Make a teammate.
// - "You've asked for this 9 times this month. Like these:" over one line: the
//   same words asked nine times were listed once, with nothing saying so.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { offerFrom } from '../shared/teammates.mjs';

const { rowName, titleAside } = await import('../renderer/src/teammates/chat-lines.ts');
const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

describe('a paused teammate', () => {
  it('says Paused beside its name in the bar, except on About', () => {
    expect(titleAside('chat', 'Support lead', { paused: true })).toBe('Paused');
    expect(titleAside('log', null, { paused: true })).toBe('Paused');
    expect(titleAside('about', null, { paused: true })).toBe('About');
    expect(titleAside('chat', 'Support lead', { paused: false })).toBe('Support lead');
  });

  // "Messaging a paused teammate starts work right away, nothing mentions
  // it's paused ... don't know what pause actually stops."
  it('says beside its chat what pausing stops: it still answers you, and does nothing on its own', () => {
    expect(read('renderer/src/teammates/TeammatesPage.tsx')).toMatch(/const now = nowLine\(t\) === 'Paused' \? 'Paused\. It still answers you, and does nothing on its own\.' : nowLine\(t\);/);
  });

  it('says Paused on its row in the Chats list, unless something waits on you there', () => {
    expect(read('renderer/src/teammates/ChatsColumn.tsx')).toMatch(/waitsOnYou\(t\) \? <i className="cx-need"[^>]*\/> : t\.paused \? <span className="cx-st">Paused<\/span> : t\.primary \? <span className="cx-st">Primary<\/span> : null/);
  });

  it('says Primary on the primary\'s row, below Paused and anything waiting on you', () => {
    expect(read('renderer/src/teammates/ChatsColumn.tsx')).toContain('t.primary ? <span className="cx-st">Primary</span>');
  });
});

describe('a new teammate still setting itself up', () => {
  const draft = { name: 'New teammate', status: 'draft', job: 'watch ci on the payments api and fix flaky tests before they block a deploy' };

  it('goes by what you asked of it in the list until it names itself', () => {
    expect(rowName(draft)).toBe('Watch ci on the payments api…');
    expect(rowName({ ...draft, job: 'weekly summary' })).toBe('Weekly summary');
  });

  it('keeps its own name once it has one, or when there are no words to go by', () => {
    expect(rowName({ ...draft, name: 'Quality lead' })).toBe('Quality lead');
    expect(rowName({ ...draft, status: 'active' })).toBe('New teammate');
    expect(rowName({ ...draft, job: null })).toBe('New teammate');
  });

  it('says Setting up beside its name in the bar', () => {
    expect(titleAside('chat', null, { status: 'draft' })).toBe('Setting up');
  });

  it('shows the app\'s opening words from a suggestion as the suggestion\'s, not as typed by you', () => {
    expect(read('renderer/src/teammates/TeammatesPage.tsx')).toMatch(/m\.setup && m\.threads\?\.length \? 'You, from the suggestion'/);
  });
});

describe('the offer of a teammate', () => {
  it('says how many times you asked each thing it lists', () => {
    const NOW = new Date(2026, 9, 24, 9, 0).getTime();
    const ask = (title, d) => ({ id: `w-${d}`, product: 'p', title, labels: ['founder'], status: 'done', createdAt: NOW - d * 86_400_000 });
    const items = [1, 2, 3, 4].map((d) => ask('Onboarding is confusing people, fix the first screen', d)).concat([ask('Onboarding confusing people, fix the screen', 5)]);
    const offer = offerFrom({ items, now: NOW });
    expect(offer.asked).toEqual([{ title: 'Onboarding is confusing people, fix the first screen', n: 4 }, { title: 'Onboarding confusing people, fix the screen', n: 1 }]);
    expect(read('main/teammates.mjs')).toMatch(/offer\.asked\.map\(\(\{ title, n \}\) => `- \$\{title\}\$\{n > 1 \? ` \(\$\{n\} times\)` : ''\}`\)/);
  });
});
