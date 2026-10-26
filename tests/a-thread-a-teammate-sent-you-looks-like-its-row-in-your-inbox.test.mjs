// "I didn't know what these components (two cuts of the launch video) that
// end up in my inbox were. I had to open them and realize they were just
// standard tasks that end up in my inbox ... make them look more like inbox
// elements." In a teammate's chat, a thread it sent you was a rounded card
// with an "Open it" button and "Waiting on you" under it, a shape found
// nowhere else in the app, while the same thread sat in Needs you as an
// ordinary row. It is now drawn with the inbox's own row: the teammate, the
// title, its status and when, and a click opens it as a row in the inbox does.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const page = read('renderer/src/teammates/TeammatesPage.tsx');
const card = page.slice(page.indexOf('function SentCard('), page.indexOf('\nfunction ', page.indexOf('function SentCard(') + 10));

describe('a thread a teammate sent you, in its chat', () => {
  it('is the inbox\'s own row inside the inbox\'s own table, not a card with a button', () => {
    expect(card).toMatch(/<div className="th-table tq-inrows">/);
    expect(card).toMatch(/className="row" role="button" tabIndex=\{0\}/);
    expect(card).toMatch(/<ThreadCells item=\{item\} product=\{product\} now=\{now\} \/>/);
    expect(card).not.toMatch(/Open it/);
    expect(card).not.toMatch(/tq-card/);
  });

  it('opens on a click or Enter, as a row in the inbox does', () => {
    expect(card).toMatch(/onClick=\{onOpen\}/);
    expect(card).toMatch(/onKeyDown=\{\(e\) => \{ if \(e\.key === 'Enter'\) \{ e\.preventDefault\(\); onOpen\(\); \} \}\}/);
  });

  it('is drawn from the thread itself, which the app hands the page', () => {
    expect(read('renderer/src/App.tsx')).toMatch(/const teammatesUi = useTeammates\(\{\s*items,/);
    expect(read('renderer/src/teammates/useTeammates.tsx')).toMatch(/<TeammatesPage [^>]*items=\{items\}/);
    expect(card).toMatch(/item: items\.find\(\(i\) => i\.id === r\.item && i\.product === r\.product\) \?\? null/);
  });

  // Two threads sent one after another drew as two lists with a gap between.
  // Since round 12 they show whose they are, as the inbox does
  // (a-thread-a-teammate-sent-you-sits-under-the-inbox-tab-it-is-in).
  it('joins threads sent one after another into one list', () => {
    expect(page).toMatch(/if \(e\.kind === 'run' && e\.verb === 'sent' && sent\) \{ sent\.push\(e as TeamRunLine\); continue; \}/);
    expect(card).toMatch(/\{found\.map\(\(\{ r, item \}\) => \{/);
  });

  it('still reads as a row when the thread is not loaded, with its title and when', () => {
    expect(card).toMatch(/: <RowCells title=\{r\.said \|\| r\.title\} where=\{product\?\.name \?\? ''\} priority=\{null\} updatedAt=\{r\.ts\} now=\{now\} \/>/);
  });
});
