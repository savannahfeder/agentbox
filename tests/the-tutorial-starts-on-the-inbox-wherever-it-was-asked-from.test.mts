// THE TUTORIAL STARTS ON THE INBOX WHEREVER IT WAS ASKED FROM (w-fbe5e95dea, 2026-11-10).
//
// A round-seven tester took the tutorial from ⌘K on the Team page, twice: its
// first card said "This is your inbox" over Everyone's activity. Starting it
// set the view to the inbox but left Team, Today and the Chats page drawn over
// it. It now puts every one of them away first.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
const fn = app.slice(app.indexOf('const startTutorial = useCallback'), app.indexOf('\n  }, [', app.indexOf('const startTutorial = useCallback')));

describe('starting the tutorial', () => {
  it('leaves Team, Today, the board of a person and the Chats page for the inbox', () => {
    expect(fn).toMatch(/setTeamOpen\(false\); setChatsPlace\(null\); setEvPick\(null\); setTodayOn\(false\); setTasksOn\(false\); setHomeOpen\(false\);/);
    expect(fn).toMatch(/setView\('inbox'\)/);
  });
});
