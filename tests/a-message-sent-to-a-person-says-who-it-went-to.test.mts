// A MESSAGE SENT TO A PERSON SAYS WHO IT WENT TO (2026-11-11).
//
// Two synthetic testers on one team, 2026-11-11, seen 5 times: Theo sent Lena
// a plain message and the toast read "Payments API auth skip audit Sent",
// though his words were about appointments. The toast draws the title of the
// row it opens over its line, and a conversation's row is titled by whatever
// was first sent in it, here a thread shared earlier. A send into a
// conversation with people now says "Sent to Lena" and draws no thread title;
// a reply to an agent's thread keeps its title.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { sentToWhom, toastTitle } from '../renderer/src/toast-parts.ts';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
const names: Record<string, string> = { 'u-lena': 'Lena Fischer', 'u-sam': 'Sam Ortiz', 'u-theo': 'Theo Okafor' };
const nameOf = (id: string) => names[id];

describe('the line a send into a conversation says', () => {
  it('names the one person it went to', () => {
    expect(sentToWhom({ people: ['u-theo', 'u-lena'], sharedBy: null }, 'u-theo', nameOf)).toBe('Sent to Lena');
  });

  it('names everyone else in a group, and the one who shared it', () => {
    expect(sentToWhom({ people: ['u-theo', 'u-lena'], sharedBy: 'u-sam' }, 'u-theo', nameOf)).toBe('Sent to Lena and Sam');
  });

  it('says only Sent when nobody else can be named', () => {
    expect(sentToWhom({ people: ['u-theo'], sharedBy: null }, 'u-theo', nameOf)).toBe('Sent');
    expect(sentToWhom(null, 'u-theo', nameOf)).toBe('Sent');
  });
});

describe('the title drawn over a toast', () => {
  it('is left off for a conversation with people', () => {
    expect(toastTitle('Payments API auth skip audit', { conversation: true })).toBe(null);
  });

  it('is kept for an agent\'s thread', () => {
    expect(toastTitle('Payments API auth skip audit', { conversation: false })).toBe('Payments API auth skip audit');
  });
});

describe('the app', () => {
  it('says who a reply in a conversation went to', () => {
    expect(app).toMatch(/talking \? sentToWhom\(replyIn\?\.team, snap\?\.team\?\.me\?\.id \?\? null, \(id\) => snap\?\.team\?\.people\.find\(\(p\) => p\.id === id\)\?\.name\) : later/);
  });

  it('draws no thread title over a toast about a conversation', () => {
    expect(app).toMatch(/const aboutTitle = about && toastTitle\(rowTitle\(about\), \{ conversation: !toast\.goes!\.repeat && isConversationRow\(about as WorkItem\) \}\);/);
    expect(app).toMatch(/\{aboutTitle && <span className="toast-title">\{aboutTitle\}<\/span>\}/);
  });

  it('names the people, not a thread, on the line above the reply box', () => {
    expect(app).toMatch(/title=\{sentTo \? reachAudienceOf\(sentTo\) \?\? \(\(isConversationRow\(sentTo\) && othersIn\(/);
  });
});
