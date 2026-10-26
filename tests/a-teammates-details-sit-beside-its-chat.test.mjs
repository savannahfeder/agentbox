// "The about page is a bit funky. I thought the sidebar that was normally open
// showed info about the agent. If we have a separate page, not sure there is a
// need for the sidebar." Round 6 had put every fact about a teammate in a
// sidebar on its About page, so its chat had none, and About drew its name
// twice (in the bar and again over the page), the facts in a second column,
// and every memory in that column, ten lines deep. Its goal also read "without
// me bringing it., counted as proposals you approve": the goal's own full stop
// stayed in when "counted as" was added. Measured on the founder's screenshot
// of a Growth marketer. Now the facts sit beside the chat, open unless you
// hide them, and About is one column of words with everything it knows.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const { firstSentence, goalLine, titleAside } = await import('../renderer/src/teammates/chat-lines.ts');
const page = fs.readFileSync(new URL('../renderer/src/teammates/TeammatesPage.tsx', import.meta.url), 'utf8');
const fn = (name) => page.slice(page.indexOf(`function ${name}(`), page.indexOf('\nfunction ', page.indexOf(`function ${name}(`) + 10));

describe('a teammate\'s chat', () => {
  it('has its details beside it, unless its log is open in their place', () => {
    expect(page).toMatch(/shown\.kind === 'log'\s*\? <LogPanel [^\n]*\n\s*: details && <Details /);
    expect(fn('Details')).toMatch(/<aside className="gr-side tq-side tq-details"/);
    for (const k of ['Job', 'Model', 'Works in', 'On its own', 'Playbooks', 'This week', 'Knows']) expect(fn('Details')).toContain(`<dt>${k}</dt>`);
  });

  it('shows the last three things it knows, and links to the rest on About', () => {
    expect(fn('Details')).toMatch(/const knows = t\.memory\.slice\(-3\)/);
    expect(fn('Details')).toMatch(/t\.memory\.length > knows\.length && <Inline onClick=\{about\}>All \{t\.memory\.length\}<\/Inline>/);
  });

  // The New teammate page kept the older panel of headed sections and chips,
  // so the panel changed look the moment you answered it.
  it('is the same list on a new teammate\'s page, before you have answered it', () => {
    const fresh = fn('NewTeammate');
    const panel = fresh.slice(fresh.indexOf('<aside'), fresh.indexOf('</aside>'));
    expect(panel).toMatch(/<aside className="gr-side tq-side tq-details"/);
    expect(panel).toMatch(/<dt>Works in<\/dt>\s*<dd>\{real\.length > 1\s*\? <PickOne /);
    expect(panel).not.toMatch(/tq-sec|tq-chip/);
  });

  it('can hide them from the ⋯ menu, for every teammate at once', () => {
    expect(fn('TeammateMenu')).toMatch(/details \? 'Hide details' : 'Show details'/);
    expect(page).toMatch(/localStorage\.getItem\(DETAILS_KEY\) !== 'hidden'/);
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
