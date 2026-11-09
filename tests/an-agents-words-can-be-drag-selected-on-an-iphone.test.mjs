// What broke (2026-11-08, from the phone app): "Can't seem to select text on
// mobile (like drag and select) eg., what the agent said". The message was
// already drawn as React Native's `<Text selectable>`, which on iOS offers
// Copy for the whole paragraph and never shows drag handles; only Android lets
// you pick part of it. iOS gives a range only to a UITextView, so on an iPhone
// a message's words are drawn in a TextInput that cannot be edited. A line
// holding a link stays as Text, because a TextInput cannot open a link.
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dragSelects } from '../mobile/src/lib/selection';

const md = fs.readFileSync('mobile/src/ui/Markdown.tsx', 'utf8');
const part = fs.readFileSync('mobile/src/ui/Selectable.tsx', 'utf8');
const plain = [{ text: 'The tests are ' }, { text: 'green', bold: true }, { text: ' and ' }, { text: 'npm run ship', code: true }];
const linked = [{ text: 'See ' }, { text: 'the page', mention: { kind: 'page', src: 'designs/w-1/a.html' } }];

describe("an agent's words can be drag-selected on an iPhone", () => {
  it('draws plain words on iOS in the view iOS lets you drag across', () => {
    expect(dragSelects(plain, 'ios')).toBe(true);
    expect(dragSelects([], 'ios')).toBe(true);
  });

  it('keeps a line holding a link as text, so the link still opens', () => {
    expect(dragSelects(linked, 'ios')).toBe(false);
  });

  it('leaves Android and the web on text, which already select a range', () => {
    expect(dragSelects(plain, 'android')).toBe(false);
    expect(dragSelects(plain, 'web')).toBe(false);
  });

  it('draws that view as a TextInput nobody can type into, as tall as its words', () => {
    expect(part).toMatch(/<TextInput[^>]*editable=\{false\}/);
    expect(part).toMatch(/<TextInput[^>]*multiline/);
    expect(part).toMatch(/<TextInput[^>]*scrollEnabled=\{false\}/);
  });

  it("draws a message's paragraphs, headings, code and table cells through it", () => {
    const one = md.slice(md.indexOf('function One('), md.indexOf('function useItalics'));
    expect(one).toMatch(/case 'p': return <Selectable/);
    expect(one).toMatch(/case 'h': return <Selectable/);
    expect(one).toMatch(/<Selectable[^>]*font\.mono/);
    expect(md).toMatch(/<Selectable[^>]*cellText\(r, c\)/);
    expect(one).not.toMatch(/<T selectable/);
  });
});
