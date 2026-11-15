// THE BIG VIEWER LISTS NOTES THE WAY THE NOTES SIDEBAR DOES (w-858a033e54, 2026-11-09).
//
// What broke: a picture, PDF, film or table opened big kept its notes in a
// column of its own design ("3 not sent" and a Send button over an untitled
// list, a "Comment" button under the box), while a document full screen had
// the notes sidebar: a Notes heading with its count and faces, Unsent with
// Send N, then Sent. The person thought the sidebar's way already held for
// every file. Read off the fixtures app: the table's column had no heading and
// no sections. Both now draw the heading and the sections from one place.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../renderer/src/${p}`, import.meta.url), 'utf8');
const view = read('components/ArtifactView.tsx');
const sidebar = read('components/NotesSidebar.tsx');
const side = view.slice(view.indexOf('<aside className="av-side"'), view.indexOf('</aside>', view.indexOf('<aside className="av-side"')));

describe('one heading and one set of sections', () => {
  it('the sidebar exports them and draws its own with them', () => {
    expect(sidebar).toMatch(/export function NotesHead\(/);
    expect(sidebar).toMatch(/export function NotesSection\(/);
    expect(sidebar).toContain('<NotesHead ');
    expect(sidebar).toContain('<NotesSection ');
  });
  it('the big viewer draws the same ones', () => {
    expect(view).toMatch(/import \{[^}]*NotesHead[^}]*NotesSection[^}]*\} from '\.\/NotesSidebar'/);
    expect(side).toContain('<NotesHead ');
    expect(side.match(/<NotesSection /g)?.length).toBe(2);
  });
  it('the big viewer\'s column is called Notes', () => {
    expect(view).toContain('<aside className="av-side" aria-label="Notes">');
  });
});

describe('Unsent with Send, then Sent', () => {
  it('puts this file\'s notes Send would tell the agent under Unsent, with Send on that line', () => {
    expect(side).toMatch(/<NotesSection word="Unsent" send=\{\{ count: sendNotes\.length, onSend: \(\) => void pressSend\(\) \}\} \/>/);
    expect(view).toContain('const waitingHere = offers.comment ? openNotes.filter((n) => sendNotes.includes(n.id)) : [];');
  });
  it('no longer draws the old "not sent" line over the list', () => {
    expect(view).not.toContain('className="av-unsent"');
  });
  it('keeps the bar under the file that sends every waiting note in the thread', () => {
    expect(view).toContain('className="av-unsent-bar"');
    expect(view).toContain('onClick={() => void sendAll()}>Send all');
  });
  it('a waiting note still says Not sent, with the bar\'s dot', () => {
    expect(view).toMatch(/stillWaiting\(n\) \? \{ words: 'Not sent', went: false \}/);
  });
  it('says Send and the count, in the sidebar and the viewer alike', () => {
    expect(sidebar).toMatch(/Send \{send\.count\}/);
    expect(sidebar).toContain('<NotesSection word={canSend ? \'Unsent\' : \'Notes\'}');
  });
});

describe('the box', () => {
  it('asks for a note, as the sidebar does', () => {
    expect(view).toContain("placeholder={canTag ? 'Add a note, or @ your agent' : 'Add a note'}");
  });
  it('adds a plain note with the return mark, and keeps the words when it goes to someone', () => {
    expect(view).toMatch(/buttonWords === 'Comment' \? <ReturnGlyph \/> : <><NoteGlyph name="send" \/>\{buttonWords\}<\/>/);
  });
});
