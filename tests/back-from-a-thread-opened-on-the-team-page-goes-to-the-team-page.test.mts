// BACK FROM A THREAD OPENED ON THE TEAM PAGE GOES TO THE TEAM PAGE.
//
// What broke: on the Team page's Standup, a teammate's "Test day in the cloud"
// link opened the thread, and Back from there went to the Inbox. The trail
// never recorded the Team page, so Back skipped it for the last place it knew.
// Measured by reading the trail: walking Inbox, Standup, thread and stepping
// back landed on the Inbox.
//
// Since 2026-11-21 the arrows walk only threads and are drawn only on the
// inbox, so the Team page has none. A teammate's thread opened there keeps
// its own back, which names the Standup and goes to it.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { onInboxPage, stopOnScreen } from '../renderer/src/back-and-forward';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => fs.readFileSync(path.join(here, '..', rel), 'utf8');
const app = read('renderer/src/App.tsx');

describe('a thread opened on the Team page', () => {
  it('is not on the inbox page, so no arrows are drawn over it', () => {
    // App.tsx hands the arrows a teammate's thread only when its back says Inbox.
    expect(app).toMatch(/card: openCard && onTeammateThread && !roomsUi\.roomName \?/);
    expect(app).toContain('const onTeammateThread = teamShown && !!openCard && !cardFromPlace;');
    expect(onInboxPage({ thread: null, card: null, group: null, list: null })).toBe(false);
    expect(stopOnScreen({ thread: null, card: null, group: null, list: null })).toBeNull();
  });

  it('keeps its own back, which names the Standup or the teammate it was opened from', () => {
    expect(app).toContain("backLabel={roomsUi.roomName ?? (cardFromPlace ? (chatsPlace === 'team' ? 'Standup' : members.find((m) => m.key === chatsPlace)?.name ?? 'Team') : 'Inbox')}");
    // It closes the thread and leaves the Team page under it on screen.
    expect(app).toContain('onBack={() => { setOpenCard(null); setTeamOpen(false); }}');
  });

  it('shows that back with its arrow, which is hidden only while the arrows are drawn', () => {
    const css = read('renderer/src/styles.css');
    expect(css).toMatch(/\.app\.back-forward-on \.thread-crumb-back svg \{ display: none; \}/);
    expect(read('renderer/src/threads/Summary.tsx')).toMatch(/className="back-esc thread-crumb-back"[^>]*onClick=\{onBack\}/);
  });

  // A chat is on the trail only once it is opened in the inbox
  // (a-chat-opened-from-needs-you-stays-in-the-inbox).
  it('is not on the trail, and nor is the Team page itself', () => {
    const hook = read('renderer/src/back-and-forward.ts');
    const stop = hook.slice(hook.indexOf('export type Stop'), hook.indexOf('export type Trail'));
    expect(stop).not.toMatch(/'team'|'teammate'|'home'|'files'|'settings'|'connections'/);
  });
});
