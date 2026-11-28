// AN ADDRESS BESIDE A NAMED ONE IN THE INVITE BOX IS STILL INVITED.
//
// A review of the many-emails invite box found three ways an address was lost
// or mangled without a word, each measured by running splitInvites:
// "alice@x.com Bob <bob@y.com>" invited only Bob (the name pattern ran back
// over Alice); Outlook's "Lee, Ann <ann@z.com>" reported "Lee is not an email
// address"; "mailto:a@x.com?subject=hi" invited "a@x.com?subject=hi". And a
// shared file's Add people box, a one-line input, ran a pasted column of
// addresses together, where the Team page's box joins the lines.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { splitInvites } from '../renderer/src/team/invite-list.ts';

describe('a named address does not swallow the one before it', () => {
  it('keeps a bare address typed before "Name <address>" on the same line', () => {
    expect(splitInvites('alice@x.com Bob <bob@y.com>').emails).toEqual(['alice@x.com', 'bob@y.com']);
  });
  it('keeps it across a tab too', () => {
    expect(splitInvites('alice@x.com\tBob Roe <bob@y.com>').emails).toEqual(['alice@x.com', 'bob@y.com']);
  });
  it('still reads a typo with an @ before a named address as not an email', () => {
    const got = splitInvites('alice@ Bob <bob@y.com>');
    expect(got.emails).toEqual(['bob@y.com']);
    expect(got.notEmails).toEqual(['alice@']);
  });
  it('still reports a word on its own line as not an email', () => {
    expect(splitInvites('frank\nBob <bob@y.com>').notEmails).toEqual(['frank']);
  });
});

describe('Outlook and mailto forms', () => {
  it('reads "Last, First <address>" as one person, with nothing left over', () => {
    expect(splitInvites('Lee, Ann <ann@z.com>; Roe, Rick <rick@z.com>')).toEqual({ emails: ['ann@z.com', 'rick@z.com'], onTeam: [], notEmails: [] });
  });
  it('drops the subject from a mailto link', () => {
    expect(splitInvites('mailto:a@x.com?subject=hi').emails).toEqual(['a@x.com']);
  });
  it('leaves the other forms as they were', () => {
    expect(splitInvites('Jane Doe <jane@x.co>, "Roe, Rick" <rick@x.co>\nmailto:sam@x.co').emails).toEqual(['jane@x.co', 'rick@x.co', 'sam@x.co']);
  });
});

describe("a shared file's Add people box", () => {
  it('joins a pasted column of addresses, as the Team page box does', () => {
    const src = fs.readFileSync(path.join(import.meta.dirname, '..', 'renderer/src/components/ShareLink.tsx'), 'utf8');
    expect(src).toMatch(/pastedInvites\(e\.clipboardData\.getData\('text'\)\)/);
  });
});
