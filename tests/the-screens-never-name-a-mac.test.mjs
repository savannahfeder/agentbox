// THE PLAN QUESTION SAID "CHECK THIS MAC" ON A LINUX MACHINE.
//
// Measured 2026-10-07 on the setup screen: the last row read
// "I am not sure, check this Mac for me". The same word was on the lines
// beside it, the folder refusal, settings, and the sentence under the agent
// stepper. Those are sentences a person reads. A comment that records a
// measurement, and a path such as Contents/MacOS, are not.
//
// The reported row, the checking line and the empty line on either side of
// it, and one path that must keep the letters MacOS because that is the
// bundle, not a sentence.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { COPY as plan } from '../renderer/src/plan-setup.ts';
import { COPY as walk } from '../renderer/src/onboarding.ts';
import { CARD } from '../renderer/src/agent-import-card.ts';
import { checkProjectFolder } from '../shared/project-folder-check.mjs';
import { troubleSentence } from '../shared/spawn-trouble.mjs';
import { CODEX_MODES } from '../shared/codex-modes.mjs';
import { agentImportRow } from '../shared/agent-import.mjs';
import { machineNote } from '../main/machine.mjs';

const APPLE = /\bMac\b|macOS|\bApple\b|\biPhone\b|\biPad\b|\bFinder\b/;

const SPOKEN_FILES = [
  'renderer/src/plan-setup.ts',
  'renderer/src/onboarding.ts',
  'renderer/src/agent-import-card.ts',
  'renderer/src/components/Settings.tsx',
  'renderer/src/team/TeamPage.tsx',
  'designs/remote-continuation/RemoteContinuationPreview.tsx',
  'renderer/src/components/RemoteControl.tsx',
  'renderer/src/components/Palette.tsx',
  'renderer/src/api.ts',
  'shared/project-folder-check.mjs',
  'shared/spawn-trouble.mjs',
  'shared/agent-import.mjs',
  'shared/codex-modes.mjs',
  'shared/demo-world.mjs',
  'main/machine.mjs',
  'main/memory-gate.mjs',
  'main/settings.mjs',
  'main/supervisor.mjs',
  'main/fresh-user.mjs',
  'main/team/projects.mjs',
  'main/team/index.mjs',
  'main/notify.mjs',
  'main/ship-queue.mjs',
  'mcp/core/page.mjs',
];

function codeOnly(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function literals(src) {
  return [...codeOnly(src).matchAll(/`[^`]*`|'[^'\n]*'|"[^"\n]*"/g)].map((m) => m[0]);
}

// JSX writes a sentence between tags, so a string scan alone misses it.
function outsideStrings(src) {
  return codeOnly(src).replace(/`[^`]*`|'[^'\n]*'|"[^"\n]*"/g, '""');
}

describe('the sentences a person reads', () => {
  it('asks to check this computer, not a Mac', () => {
    expect(plan.notSure).toBe('I am not sure, check this computer for me');
    expect(plan.checking).toBe('Checking this computer…');
    expect(plan.nothingHere).toBe('Nothing is set up on this computer yet. Pick the plan you pay for above.');
  });

  it('names this computer on the lines beside that row', () => {
    expect(walk.folderPick).toBe('Choose a folder on this computer');
    expect(walk.missing).not.toMatch(APPLE);
    expect(walk.intro[0].line).toBe('It works on your computer and writes back here when it finishes or gets stuck');
    expect(walk.bringHead).toBe('Add the agents already on this computer.');
    expect(CARD.head).toBe(walk.bringHead);
    expect(CARD.reading).toBe('Reading this computer…');
  });

  it('still says which folders the system asks about, without naming macOS', () => {
    const home = checkProjectFolder('/Users/esther', { home: '/Users/esther' });
    expect(home.ok).toBe(false);
    expect(home.say).toContain('Downloads');
    expect(home.say).toContain('Music');
    expect(home.say).toContain('every app');
    expect(home.say).not.toMatch(APPLE);
    expect(checkProjectFolder('/Users/esther/Downloads', { home: '/Users/esther' }).say).not.toMatch(APPLE);
    expect(checkProjectFolder('/System', { home: '/Users/esther' }).say).not.toMatch(APPLE);
  });

  it('keeps the Chrome bundle path, which is a file and not a sentence', () => {
    const page = fs.readFileSync(new URL('../mcp/core/page.mjs', import.meta.url), 'utf8');
    expect(page).toContain('Contents/MacOS/Google Chrome');
    expect(literals(page).filter((s) => APPLE.test(s))).toEqual([]);
  });

  it('does not name a Mac in any other sentence those screens return', () => {
    const said = [
      troubleSentence('nope'),
      CODEX_MODES['full-access'].what,
      agentImportRow({ title: 'Reviewer', name: 'reviewer', scope: 'user', path: '/tmp/reviewer.md' }).body,
      machineNote({ slots: 2, memGb: 8, cores: 8 }),
    ];
    for (const line of said) expect(line).not.toMatch(APPLE);

    const hits = [];
    for (const file of SPOKEN_FILES) {
      const src = fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
      for (const lit of literals(src)) {
        if (APPLE.test(lit)) hits.push(`${file}: ${lit.slice(0, 140)}`);
      }
      const bare = outsideStrings(src).match(APPLE);
      if (bare) hits.push(`${file}: ${bare[0]} outside a string`);
    }
    expect(hits).toEqual([]);
  });
});
