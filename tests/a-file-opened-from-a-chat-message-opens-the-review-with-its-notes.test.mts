// A FILE OPENED FROM A CHAT MESSAGE OPENS THE REVIEW, WITH ITS NOTES (2026-11-11).
//
// Two of three testers on one team, round two, both their top complaint: the
// clinic-checkout.html sent in a chat opened a page with only Close, while
// Files and Needs you showed Lena's note and the reply to it. Measured from
// the code: a chat sent a file to the big review only when `opensBigInAGroup`
// said so, which is pictures, films, PDFs, decks, documents and tables. A page
// (.html) or a text file went to FileSheet, which draws the bytes and a Close
// button. And the group's view asked Files for the notes of reviewable copies
// only, so even opened big a page would have had no notes from Files.
//
// Every file the review can draw now opens there. What must NOT: a link to a
// web address, which stays a web link, and a file the review cannot draw (a
// zip, a spreadsheet), which still opens on its own to be saved.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { attachedName, opensInTheReview } from '../renderer/src/team/rooms/room-chat-rules.ts';
import { otherFilesInLines, threadFiles } from '../shared/artifact-marks.mts';

const chat = fs.readFileSync(new URL('../renderer/src/team/rooms/RoomChat.tsx', import.meta.url), 'utf8');
const view = fs.readFileSync(new URL('../renderer/src/team/rooms/RoomFileView.tsx', import.meta.url), 'utf8');

describe('which files a chat opens in the review', () => {
  it('opens a page sent in the chat there', () => {
    expect(opensInTheReview('mvwy0003-cccc-clinic-checkout.html')).toBe(true);
    expect(opensInTheReview('landing.htm')).toBe(true);
  });

  it('still opens every kind it opened before', () => {
    for (const name of ['shot.png', 'demo.mp4', 'plan.pdf', 'pitch.pptx', 'notes.md', 'leads.csv', 'export.tsv']) expect(opensInTheReview(name), name).toBe(true);
  });

  it('opens a text file or a script there too, which the review draws as code', () => {
    expect(opensInTheReview('steps.txt')).toBe(true);
    expect(opensInTheReview('config.json')).toBe(true);
  });

  it('leaves a file the review cannot draw to open on its own', () => {
    for (const name of ['bundle.zip', 'sheet.xlsx', 'contract.docx', 'noext']) expect(opensInTheReview(name), name).toBe(false);
  });
});

describe('what in a message is a file sent in the chat', () => {
  it('is a link into the chat\'s attachments', () => {
    expect(attachedName('attachments/mvwy0003-cccc-clinic-checkout.html')).toBe('mvwy0003-cccc-clinic-checkout.html');
  });

  it('is never a web address, even one ending in .html', () => {
    expect(attachedName('https://example.com/clinic-checkout.html')).toBe(null);
    expect(attachedName('http://example.com/attachments/clinic-checkout.html')).toBe(null);
  });

  it('is never a path that climbs out of the attachments', () => {
    expect(attachedName('attachments/../secret.html')).toBe(null);
    expect(attachedName('attachments/sub/page.html')).toBe(null);
  });
});

describe('the chat', () => {
  it('opens a file in the review by the rule above, not by the group-only one', () => {
    expect(chat).toMatch(/if \(!calls\.files \|\| !opensInTheReview\(name\)\) return false;/);
    expect(chat).not.toMatch(/opensBigInAGroup/);
  });

  it('takes the file a link names by the rule above, and draws any other link as a web link', () => {
    expect(chat).toMatch(/const name = href \? attachedName\(href\) : null;/);
    expect(chat).toMatch(/return <ChatLink href=\{href\}>\{children\}<\/ChatLink>;/);
  });
});

describe('a page opened from a chat', () => {
  const lines = [{ id: 'm1', ts: 1, source: 'founder', by: 'u-lena', patch: { body: 'Checkout for review\n\n[clinic-checkout.html](attachments/mvwy0003-cccc-clinic-checkout.html)' } }];

  it('is a copy the chat can ask Files about', () => {
    const copies = threadFiles(otherFilesInLines(lines)).flatMap((f) => f.versions.map((v) => v.path));
    expect(copies).toEqual(['attachments/mvwy0003-cccc-clinic-checkout.html']);
  });

  it('asks Files for the notes of its pages too, not only of what it reviews', () => {
    expect(view).toMatch(/threadFiles\(\[\.\.\.filesInLines\(lines\), \.\.\.otherFilesInLines\(lines\)\]\)/);
  });
});
