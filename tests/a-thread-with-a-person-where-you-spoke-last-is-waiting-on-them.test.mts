// A THREAD WITH A PERSON WHERE YOU SPOKE LAST IS WAITING ON THEM, IN PROGRESS.
//
// Jordan: "My sent messages still sit under Done today instead
// of Waiting on Maya, Sofia." Dev: "Done is the only way out of Needs you while I
// wait on a person." In progress showed 0 with both of them waiting. A row you
// spoke last on now says on whom it waits, and comes back when they answer.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { iSpokeLast, inMyInbox } from '../shared/team-rules.mts';
import { waitingWord } from '../renderer/src/threads/page-rules.ts';

const ME = 'jordan';
const group = { slug: 'dm', team: { projectId: 'x', direct: true, sharedBy: ME, people: ['maya', 'sofia'] } };
const nameOf = (id) => ({ maya: 'Maya', sofia: 'Sofia' }[id]);
const chat = (...lines) => ({ status: 'open', people: [ME, 'maya', 'sofia'], createdBy: ME, talk: { chat: lines.map(([by, ts]) => ({ by, ts, text: 'x' })), threads: {} }, wrote: {} });

describe('after you send', () => {
  const sent = chat([ME, 100]);
  it('it is waiting on everyone else, by name', () => {
    expect(iSpokeLast(sent, group, ME)).toBe(true);
    expect(inMyInbox(sent, group, ME)).toBe(false);
    expect(waitingWord(sent, group, ME, nameOf)).toBe('Waiting on Maya, Sofia');
  });
  it('one person is named alone', () => {
    const one = { slug: 'dm', team: { projectId: 'x', direct: true, sharedBy: ME, people: ['maya'] } };
    expect(waitingWord({ ...sent, people: [ME, 'maya'] }, one, ME, nameOf)).toBe('Waiting on Maya');
  });
});

describe('when they answer', () => {
  const answered = chat([ME, 100], ['sofia', 200]);
  it('it comes back to you and says so', () => {
    expect(iSpokeLast(answered, group, ME)).toBe(false);
    expect(inMyInbox(answered, group, ME)).toBe(true);
    expect(waitingWord(answered, group, ME, nameOf)).toBe('Waiting on you');
  });
  it('and your own next word sends it out again', () => {
    expect(waitingWord(chat([ME, 100], ['sofia', 200], [ME, 300]), group, ME, nameOf)).toBe('Waiting on Maya, Sofia');
  });
});

describe('the lists', () => {
  const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
  it('In progress holds it', () => {
    const at = app.indexOf('const progress = useMemo');
    expect(app.slice(at, at + 1400)).toMatch(/&& !isTaskRow\(i\)\) return iSpokeLast\(/);
  });
  it('Done does not: nothing is finished', () => {
    const at = app.indexOf('const done = useMemo');
    expect(app.slice(at, at + 500)).not.toMatch(/iSpokeLast/);
  });
  it('the row draws the word over In progress as well as over Waiting', () => {
    const pages = fs.readFileSync(new URL('../renderer/src/threads/Pages.tsx', import.meta.url), 'utf8');
    expect(pages).toMatch(/iSpokeLast\(item, product, team\.me\)/);
  });
  // Seen on screen: the card under Your threads said NOTHING RUNNING over Maya's message to Dev.
  it('and so does the card on the board', () => {
    const pages = fs.readFileSync(new URL('../renderer/src/threads/Pages.tsx', import.meta.url), 'utf8');
    expect(pages).toMatch(/onThem \? <span className="s">\{onThem\}<\/span>/);
  });
});
