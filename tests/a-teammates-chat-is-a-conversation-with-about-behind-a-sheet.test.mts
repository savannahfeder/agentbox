// A TEAMMATE'S CHAT IS A CONVERSATION, WITH ABOUT BEHIND A SHEET.
//
// The owner: "the agents themselves... are in a very large, cluttered area... a
// huge, unclear block of text. Sometimes I might want to go into that chat."
// Measured on the Chief of staff in the audit screenshot: a column of eleven rows
// took 40% of the page beside every chat. Now the chat page draws no such column.
// One quiet About opens a sheet over the chat: what it does, how it writes, what
// it does on its own and knows, with the settings folded. What must stay in
// reach: every setting, its work (Log) and all it remembers (the About page, which
// keeps one column of words).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const { firstSentence, goalLine, titleAside } = await import('../renderer/src/teammates/chat-lines.ts');
const page = fs.readFileSync(new URL('../renderer/src/teammates/TeammatesPage.tsx', import.meta.url), 'utf8');
const hook = fs.readFileSync(new URL('../renderer/src/teammates/useTeammates.tsx', import.meta.url), 'utf8');
const fn = (name) => page.slice(page.indexOf(`function ${name}(`), page.indexOf('\nfunction ', page.indexOf(`function ${name}(`) + 10));

describe('a teammate\'s chat', () => {
  it('draws nothing beside it until you ask: About over it, or its log', () => {
    expect(page).toMatch(/shown\.kind === 'sheet' && <Details /);
    expect(page).toMatch(/shown\.kind === 'log' && <LogPanel /);
    expect(page).not.toMatch(/useDetailsShown|DETAILS_KEY/);
  });

  it('opens About from one quiet word in the bar, which closes it too', () => {
    expect(fn('TeammateMenu')).toMatch(/tq-about-key[\s\S]*onOpen\(shown\.kind === 'sheet' \? t\.id : `sheet:\$\{t\.id\}`\)[^\n]*>About</);
    expect(fn('TeammateMenu')).not.toMatch(/Hide details|Show details/);
  });

  it('closes on Escape, on Close, and on a click anywhere else', () => {
    expect(hook).toMatch(/shown\.kind === 'sheet'[^\n]*\? go\(shown\.id\)/);
    expect(fn('Details')).toMatch(/tq-sheet-away[^\n]*onClick=\{\(\) => onOpen\(t\.id\)\}/);
    expect(fn('Details')).toMatch(/onClick=\{\(\) => onOpen\(t\.id\)\}>Close</);
  });

  it('keeps every setting in the sheet, the rarely changed ones folded', () => {
    const body = fn('Details');
    const folded = body.slice(body.indexOf('<details'), body.indexOf('</details>'));
    for (const k of ['Name', 'Model', 'Works in', 'Can read', 'Your team', 'This week']) expect(folded).toContain(`<dt>${k}</dt>`);
    const open = body.slice(0, body.indexOf('<details'));
    for (const k of ['Job', 'How it writes', 'On its own', 'Knows', 'Playbooks', 'Its work']) expect(open).toContain(`<dt>${k}</dt>`);
  });

  it('keeps its work and everything it remembers one press away', () => {
    expect(fn('Details')).toMatch(/onOpen\(`log:\$\{t\.id\}`\)/);
    expect(fn('Details')).toMatch(/const knows = t\.memory\.slice\(-3\)/);
    expect(fn('Details')).toMatch(/t\.memory\.length > knows\.length && <Inline onClick=\{about\}>All \{t\.memory\.length\}<\/Inline>/);
    expect(fn('Details')).toMatch(/const about = \(\) => onOpen\(`about:\$\{t\.id\}`\)/);
  });

  it('draws no column on a new teammate\'s page either, and still asks where it works', () => {
    const fresh = fn('NewTeammate');
    expect(fresh).not.toMatch(/<aside/);
    expect(fresh).toMatch(/real\.length > 1 && [^\n]*Where does it work\?/);
    expect(fresh).toMatch(/<PickOne value=\{where\?\.slug \?\? ''\} label="Works in"/);
  });

  it('says what it does in its first sentence, however that sentence ends', () => {
    expect(firstSentence('I watch for trends twice a day. Then I write.')).toBe('I watch for trends twice a day.');
    expect(firstSentence('Is it worth a post? Then I write.')).toBe('Is it worth a post?');
    expect(firstSentence('Version 1.5 ships soon. Then more.')).toBe('Version 1.5 ships soon.');
    expect(firstSentence('One line with no stop')).toBe('One line with no stop');
  });
});

describe('About', () => {
  it('is one column, with no sidebar and no second copy of its name', () => {
    const about = fn('About');
    expect(about).not.toMatch(/<aside/);
    expect(about).not.toMatch(/tq-doc-id/);
    expect(about).not.toMatch(/<dt>/);
  });

  // Power test: "Sent a change from the About page and it vanished with no
  // sign it went anywhere." The box emptied and About stayed as it was.
  it('takes you to the chat once you send it a change, where your words and its answer show', () => {
    expect(fn('About')).toMatch(/const sent = \(await call\('post', \{ text, to: \[t\.id\] \}\)\) !== false;\s*if \(sent\) onOpen\(t\.id\);/);
  });

  it('lists everything it knows, each one with a way to forget it', () => {
    expect(fn('About')).toMatch(/<h5>What it knows about you<\/h5>[\s\S]*t\.memory\.map[\s\S]*call\('forget'/);
  });

  it('says About beside its name in the bar, and its role or what it is everywhere else', () => {
    expect(titleAside('about', 'Growth marketer')).toBe('About');
    expect(titleAside('chat', 'growth marketer')).toBe('Growth marketer');
    expect(titleAside('log', null)).toBe('AI teammate');
    expect(titleAside('chat', '  ')).toBe('AI teammate');
  });
});

describe('its goal', () => {
  it('reads as one sentence when it is counted, whatever the goal ends with', () => {
    expect(goalLine('No feature gets past you without me bringing it.', 'Proposals you approve'))
      .toBe('No feature gets past you without me bringing it, counted as proposals you approve.');
    expect(goalLine('Fast answers', 'Questions still open at night.')).toBe('Fast answers, counted as questions still open at night.');
    expect(goalLine('Fast answers;', 'Hours to answer')).toBe('Fast answers, counted as hours to answer.');
  });

  it('is left as written when nothing counts it', () => {
    expect(goalLine('Every bug found before a user finds it.', null)).toBe('Every bug found before a user finds it.');
    expect(goalLine('Every bug found first', '')).toBe('Every bug found first');
  });
});
