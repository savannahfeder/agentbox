// A PICTURE IN A MESSAGE NEVER SHOWS ITS BRACKETS.
//
// A teammate read `![shot.png](attachments/abc-shot.png)` as words. Measured by
// handing each reader of a message that one line: a card's summary line kept it
// whole, a title kept it or came out as "!shot.png See", a person's message drew
// it as typed unless it stood alone on its line, and a picture that could not be
// fetched said "missing image: attachments/abc-shot.png".
//
// Now the picture is drawn wherever a message can draw one, a line that cannot
// draw leaves it out, and a picture that cannot be fetched is a tile with its name.
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { firstSentence } from '../shared/thread-cards.mts';
import { shortTitle, withoutFiles } from '../shared/thread-title.mts';
import { typedParts } from '../renderer/src/typed-message.ts';
import { teamToday } from '../renderer/src/team/today.ts';
import { ArtifactImg } from '../renderer/src/components/Focus.tsx';

const PIC = '![shot.png](attachments/abc-shot.png)';
const FILE = '[notes.pdf](attachments/abc-notes.pdf)';

describe('a line that cannot draw a picture', () => {
  it('the summary leaves it out', () => {
    expect(firstSentence(`See this\n\n${PIC}`)).toBe('See this');
    expect(firstSentence(`${PIC}\n\nSee this`)).toBe('See this');
    expect(firstSentence(PIC)).toBe('');
  });
  it('the title leaves it out, and is the file\'s name when nothing else was said', () => {
    expect(shortTitle(`See this\n\n${PIC}`)).toBe('See this');
    expect(shortTitle(`${PIC}\n\nSee this`)).toBe('See this');
    expect(shortTitle(PIC)).toBe('shot.png');
  });
  it('a file\'s link becomes its name', () => {
    expect(withoutFiles(`Read ${FILE} first`)).toBe('Read notes.pdf first');
  });
  it('words quoting the syntax in backticks, and a plain link, are left alone', () => {
    const quoted = 'the line `![x](attachments/y.png)` showed';
    expect(withoutFiles(quoted)).toBe(quoted);
    expect(withoutFiles('the [guide](https://example.com/guide)')).toBe('the [guide](https://example.com/guide)');
  });
  it('a message with neither comes back as it was', () => {
    expect(withoutFiles('one\n\ntwo ')).toBe('one\n\ntwo ');
  });
  it('Today says the words of a mention, not the link', () => {
    const day = teamToday({
      range: 'today', now: 2, me: 'me', items: [], products: [], cards: [], decisions: [], needs: [], mates: [], mateOf: () => null,
      people: [{ id: 'dev', name: 'Dev' }],
      mentions: [{ id: 'x', messageId: 'm', roomId: 'r', roomName: 'T', by: 'dev', byName: 'Dev', body: `Maya, look\n\n${PIC}`, at: 1 }],
    });
    expect(day.people.find((p) => p.key === 'person:dev').waitingOnYou[0].title).toBe('Maya, look');
  });
});

describe('a person\'s message, which is drawn as typed', () => {
  it('draws a picture standing alone, as it did', () => {
    expect(typedParts(`hello\n\n${PIC}`)).toEqual([{ text: 'hello' }, { embed: PIC }]);
  });
  it('draws a picture on a quoted line', () => {
    expect(typedParts(`> ${PIC}\nYes`)).toEqual([{ embed: PIC }, { text: 'Yes' }]);
  });
  it('draws an attached picture in the middle of a line', () => {
    expect(typedParts(`See ${PIC} here`)).toEqual([{ text: 'See' }, { embed: PIC }, { text: 'here' }]);
  });
  it('two on one line are two pictures', () => {
    expect(typedParts(`${PIC} ${PIC}`)).toEqual([{ embed: PIC }, { embed: PIC }]);
  });
  it('leaves words quoting the syntax in backticks', () => {
    const text = 'the line `![x](attachments/y.png)` showed';
    expect(typedParts(text)).toEqual([{ text }]);
  });
  it('leaves a picture from elsewhere in a sentence as typed', () => {
    const text = 'see ![x](https://example.com/y.png) there';
    expect(typedParts(text)).toEqual([{ text }]);
  });
});

describe('a picture that cannot be fetched', () => {
  const draw = (props) => renderToStaticMarkup(createElement(ArtifactImg, props));
  it('is a tile with its short name, not a path', () => {
    const html = draw({ src: 'attachments/mt0reku0-ab12cd-shot.png', roots: [] });
    expect(html).toContain('message-file');
    expect(html).toContain('>shot.png<');
    expect(html).not.toContain('attachments/');
    expect(html).not.toContain('missing image');
  });
  it('one that is there is still drawn', () => {
    expect(draw({ src: 'attachments/a.png', roots: ['/x'], onOpen: () => {} })).toMatch(/<img/);
  });
  it('a path an agent named that is not an attachment still says it is missing', () => {
    expect(draw({ src: 'designs/gone.png', roots: [] })).toContain('missing image: designs/gone.png');
  });
});
