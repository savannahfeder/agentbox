// COMMENTS YOU HAVE NOT SENT SHOW UNDER EVERY PICTURE, AND SEND ALL TAKES THEM ALL.
//
// The open picture said "2 not sent" in small grey words at the top of its
// comments, and counted only that picture. Someone left comments on three
// pictures, never saw it, and thought sending was broken. Measured on main:
// notesToSendTheAgent took one version, so the third comment, on the other
// picture, was in no count and no Send.
//
// The approved design is a bar under the picture: "3 comments not sent to your
// agent, 1 on another picture" with Send all and ⌘↵, and a dot beside each
// comment that says Not sent.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { notesToSendTheAgentAnywhere, unsentWords } from '../renderer/src/artifact-pins.ts';

const people = [{ id: 'u-me', name: 'Sam Rivera' }, { id: 'u-maya', name: 'Maya Chen' }];
const v = (id, more = {}) => ({ id, path: `designs/w-1/${id}`, name: id, by: null, at: 0, n: 1, agent: '', ...more });
const families = [
  { key: 'a', versions: [v('step-1.png')] },
  { key: 'b', versions: [v('step-2.png')] },
  { key: 'c', versions: [v('notes.md')] },
  { key: 'd', versions: [v('mine.png', { agent: undefined })] },
];
const note = (id, file, more = {}) => ({ id, file, place: { kind: 'whole' }, text: 'Cut this', by: 'u-me', ts: 1, mentions: [], wait: true, ...more });
const anywhere = (notes, here = 'step-1.png') => notesToSendTheAgentAnywhere({ notes }, families, here, people, 'u-me');

describe('what Send all hands over', () => {
  it('your waiting comments on every file the agent made, not only the open one', () => {
    expect(anywhere([note('n1', 'step-1.png'), note('n2', 'step-1.png'), note('n3', 'step-2.png')])).toEqual({ ids: ['n1', 'n2', 'n3'], elsewhere: 1, elsewhereKind: 'picture' });
  });
  it('leaves out a teammate\'s, a sent one, a resolved one, and one on a file you made yourself', () => {
    const notes = [note('m', 'step-2.png', { by: 'u-maya' }), note('s', 'step-2.png', { sent: true }), note('r', 'step-1.png', { resolved: true }), note('y', 'mine.png')];
    expect(anywhere(notes)).toEqual({ ids: [], elsewhere: 0, elsewhereKind: 'picture' });
  });
  it('a comment elsewhere on a document makes the others files, not pictures', () => {
    expect(anywhere([note('n1', 'step-2.png'), note('n2', 'notes.md')]).elsewhereKind).toBe('file');
  });
});

describe('what the bar says', () => {
  it('counts every comment, and how many are on another picture', () => {
    expect(unsentWords(3, 1, 'picture')).toBe('3 comments not sent to your agent, 1 on another picture');
    expect(unsentWords(4, 2, 'picture')).toBe('4 comments not sent to your agent, 2 on other pictures');
  });
  it('one comment, here', () => {
    expect(unsentWords(1, 0, 'picture')).toBe('1 comment not sent to your agent');
  });
  it('all of them elsewhere says so once', () => {
    expect(unsentWords(1, 1, 'picture')).toBe('1 comment not sent to your agent, on another picture');
    expect(unsentWords(2, 2, 'file')).toBe('2 comments not sent to your agent, on other files');
  });
});

describe('the picture view', () => {
  const view = fs.readFileSync(new URL('../renderer/src/components/ArtifactView.tsx', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../renderer/src/components/artifact-view.css', import.meta.url), 'utf8');
  it('draws the bar on the stage, not at the top of the comments', () => {
    const stage = view.slice(view.indexOf('className="av-stage"'), view.indexOf('className="av-side"'));
    expect(stage).toMatch(/className="av-unsent-bar"/);
    expect(view).not.toMatch(/className="av-unsent"/);
  });
  it('Send all hands over every waiting comment, and ⌘↵ does the same', () => {
    expect(view).toMatch(/toAgent\(unsent\.ids\)/);
    expect(view).toMatch(/Send all/);
    expect(view).toMatch(/e\.key === 'Enter' && \(e\.metaKey \|\| e\.ctrlKey\)/);
  });
  it('sits above the zoom control', () => {
    expect(css).toMatch(/\.av-unsent-bar \{[^}]*bottom: 72px/);
  });
  it('a waiting comment carries a dot', () => {
    expect(css).toMatch(/\.av-note-sent\.is-waiting::before/);
  });
});
