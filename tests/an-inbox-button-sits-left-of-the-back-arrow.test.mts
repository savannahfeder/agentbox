// AN INBOX BUTTON SITS LEFT OF THE BACK ARROW.
//
// What was missing: from a thread you had reached by stepping from another
// thread, back walked through the threads, and the one way straight to the
// inbox was the crumb's "Needs you", which did not read as the inbox: "I didn't
// even realize that was a place I could go." The person also kept reaching for
// the spot left of the arrows expecting a button there. Measured by reading
// BackForward.tsx (two buttons, back and forward) and the crumb App.tsx hands
// a thread from the Needs you tab ("Needs you").

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HINTS } from '../renderer/src/hint-plate';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => fs.readFileSync(path.join(here, '..', rel), 'utf8');

describe('the Inbox button', () => {
  const bf = read('renderer/src/components/BackForward.tsx');

  it('comes before the back arrow and wears the sidebar inbox icon', () => {
    const inbox = bf.indexOf('aria-label="Inbox"');
    const backArrow = bf.indexOf('onClick={onBack}');
    expect(inbox).toBeGreaterThan(-1);
    expect(inbox).toBeLessThan(backArrow);
    expect(bf).toContain('M5 7h14M5 12h14M5 17h9');
    expect(read('renderer/src/components/WorkspaceNavigation.tsx')).toContain('M5 7h14M5 12h14M5 17h9');
  });

  it('names esc on its plate, since it is only drawn where esc goes to the inbox', () => {
    expect(bf).toContain('data-hint="inbox"');
    expect(HINTS.inbox).toEqual([{ key: 'esc', what: 'Inbox' }]);
    expect(HINTS).not.toHaveProperty('inbox-esc');
  });

  // Reported: it showed on every page, and on Chats it pushed the forward
  // arrow into the page's name. On the inbox it led to the inbox itself.
  it('is drawn only on an inbox thread, and opens the inbox', () => {
    const app = read('renderer/src/App.tsx');
    const tag = app.split('\n').find((l) => l.includes('<BackForward ')) ?? '';
    expect(tag).toContain("onInbox={onInboxThread ? () => openView('inbox') : undefined}");
    expect(app).toContain('const onInboxThread = !!focused && !settingsOpen && !inChats;');
    expect(bf).toMatch(/\{onInbox && <button/);
  });
});

describe('the top line of a thread from Needs you', () => {
  it('says Inbox, the word the sidebar uses', () => {
    const app = read('renderer/src/App.tsx');
    const crumb = app.slice(app.indexOf('crumbFrom={teamOpen'), app.indexOf('crumbFrom={teamOpen') + 500);
    expect(crumb).toMatch(/crumbTabNow === 'inbox' \? 'Inbox'/);
    expect(crumb).not.toMatch(/needsWord/);
  });
});
