// THE PHONE'S COMMAND LIST TURNS THE CLOUD ON AND OFF.
//
// The desktop's ⌘K has "Turn the cloud on/off" and a row for each way of
// being on (Palette.tsx `cloud-toggle`, cloud-menu.ts `cloudCommands`). The
// phone had the switch only in Settings, and a synthetic tester on 2026-11-08
// typed "cloud" into the phone's search and found nothing but a thread.
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { commandsFor, phoneCommands } from '../mobile/src/lib/palette';

const computer = (cloud) => ({ paused: false, projects: [], order: [], cloud });

describe('the cloud in the command list', () => {
  it('turns it on, with the way it was last on, and offers each way, in the phone\'s words', () => {
    const rows = phoneCommands({ team: false, computer: computer({ mode: 'mac', whenOn: 'all' }) }).filter((c) => c.id.startsWith('cloud-'));
    expect(rows.map((r) => [r.id, r.label, r.act])).toEqual([
      ['cloud-toggle', 'Turn the cloud on', { setting: { scope: 'workspace', key: 'cloudRuns', value: 'all' } }],
      ['cloud-full', 'Cloud on: when your computer is full', { setting: { scope: 'workspace', key: 'cloudRuns', value: 'full' } }],
      ['cloud-all', 'Cloud on: everything', { setting: { scope: 'workspace', key: 'cloudRuns', value: 'all' } }],
    ]);
  });

  it('turns it off while it is on, and marks the way it is on now', () => {
    const rows = phoneCommands({ team: false, computer: computer({ mode: 'full' }) }).filter((c) => c.id.startsWith('cloud-'));
    expect(rows[0]).toMatchObject({ label: 'Turn the cloud off', act: { setting: { value: 'mac' } } });
    expect(rows.find((r) => r.id === 'cloud-full').aside).toBe('On now');
  });

  it('is found by typing cloud', () => {
    const all = phoneCommands({ team: false, computer: computer({ mode: 'mac' }) });
    expect(commandsFor('cloud', all).map((c) => c.id)).toEqual(expect.arrayContaining(['cloud-toggle', 'cloud-full', 'cloud-all']));
  });

  // A tester ran Rank Website first and Pause agents from search, and the list closed without a word.
  it('says what it sent when a command changes the computer\'s settings', () => {
    const src = fs.readFileSync(path.join(import.meta.dirname, '..', 'mobile', 'src', 'app', 'search.tsx'), 'utf8');
    expect(src).toMatch(/'setting' in act\) \{ await s\.change\(act\.setting\); c\.say\(`Sent to your computer: \$\{label\}`\)/);
  });

  it('is not offered on a computer the cloud is not set up for', () => {
    expect(phoneCommands({ team: false, computer: computer(null) }).some((c) => c.id.startsWith('cloud-'))).toBe(false);
  });
});
