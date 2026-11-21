// THE TUTORIAL STARTS ON THE INBOX WHEREVER IT WAS ASKED FROM (w-fbe5e95dea, 2026-11-10).
//
// A round-seven tester took the tutorial from ⌘K on the Team page, twice: its
// first card said "This is your inbox" over Everyone's activity. Starting it
// set the view to the inbox but left Team, Today and the Chats page drawn over
// it. It now puts every one of them away first. Since 2026-11-21 ⌘K's tutorial
// is the walkthrough the first run ends on (`beginWalkthrough`).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
const body = (name) => app.slice(app.indexOf(`const ${name} = useCallback`), app.indexOf('\n  }, [', app.indexOf(`const ${name} = useCallback`)));
const fn = body('startTutorial');

describe('starting the tutorial', () => {
  it('leaves Team, Today, the board of a person and the Chats page for the inbox', () => {
    expect(fn).toMatch(/setTeamOpen\(false\); setChatsPlace\(null\); setEvPick\(null\); setTodayOn\(false\); setTasksOn\(false\);/);
    expect(fn).toMatch(/beginWalkthrough\(\)/);
    expect(body('beginWalkthrough')).toMatch(/setView\('inbox'\)/);
  });
});
