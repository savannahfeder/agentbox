// A NEW USER WHO IS ACTUALLY NEW.
//
// It was doing that on purpose and nothing had told her. The row passed
// `withAgents: true`, which symlinks her `~/.claude` into the throwaway home,
// so the fresh copy read the Claude Code sessions already running on this Mac
// and put them in its inbox, and the walk's finish card offered her real
// agents. Measured that night with the app's own discovery: three sessions
// found with her folder linked, none without it.
//
// FOR A FEW HOURS THAT WAS TWO ROWS, ONE BLANK AND ONE WITH HER AGENTS
// LINKED.Three rows about being a new user is our test rig in everybody's
// command bar, so the shipped row is the blank one, which is what a stranger
// off the website gets and the only honest way to judge the walk. The other run
// is not lost and is not a row: `npm run fresh -- --with-agents` still does it,
// and the home-making below is still tested both ways, because the finish
// card's offer of her agents can only be seen on the linked one.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareHome, makeHome } from '../shared/fresh-user-home.mjs';
import { readAgentFiles } from '../main/agent-files.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const palette = read('renderer/src/components/Palette.tsx');
const app = read('renderer/src/App.tsx');

describe('⌘K offers one new user, and it is the blank one', () => {
  it('has the blank row and no second row beside it', () => {
    expect(palette).toContain("id: 'fresh-user',");
    expect(palette).toContain('run: () => onFreshUser(false),');
    expect(palette).not.toContain("id: 'fresh-user-agents',");
    expect(palette).not.toContain('run: () => onFreshUser(true),');
  });

  it('never hands the palette a fresh user without saying which kind', () => {
    // The bug was a hard-coded `true` in App.tsx. If it comes back, the row
    // silently goes back to showing her own sessions and nothing fails.
    expect(app).not.toContain('api.openFreshUser(true)');
    expect(app).toContain('api.openFreshUser(withAgents)');
    expect(app).toContain('const openAsNewUser = useCallback(async (withAgents: boolean)');
  });

  // HER LENGTH RULE, AS A NUMBER RATHER THAN AS TASTE.
  it('says what the two onboarding rows do in a few words, not a paragraph', () => {
    const hintOf = (id) => {
      const row = palette.slice(palette.indexOf(`id: '${id}',`));
      return row.slice(row.indexOf("hint: '") + 7, row.indexOf("',", row.indexOf("hint: '")));
    };
    for (const id of ['first-run', 'fresh-user']) {
      expect(hintOf(id).length).toBeLessThanOrEqual(44);
    }
    // And the blank row still says the thing that makes it worth pressing.
    expect(hintOf('fresh-user')).toContain('nothing set up');
  });

  it('can be found by the words she would type for it', () => {
    const at = (id) => palette.slice(palette.indexOf(`id: '${id}',`), palette.indexOf(`id: '${id}',`) + 400);
    expect(at('fresh-user')).toMatch(/keywords:.*\bblank\b/);
    // The row that went is still reachable by the words that were on it.
    expect(at('fresh-user')).toMatch(/keywords:.*\bagents\b/);
  });

  it('drops the no-agents note on the blank run, where it is the point', () => {
    // Left in, it reads as a fault: "There is no ~/.claude on this Mac" is
    // written for the other row.
    expect(app).toContain("withAgents || !n.includes('.claude')");
  });
});

describe('a throwaway home with no agents', () => {
  it('offers nothing to import, which is what a stranger gets', () => {
    const realHome = fs.mkdtempSync(path.join(os.tmpdir(), 'agentbox-test-real-home-'));
    fs.mkdirSync(path.join(realHome, '.claude/agents'), { recursive: true });
    fs.writeFileSync(
      path.join(realHome, '.claude/agents/leon-okafor-qa.md'),
      '---\nname: leon-okafor-qa\ndescription: Walks the app as Leon.\n---\n\nBody.\n',
    );

    const blank = prepareHome(makeHome(new Date('2026-08-23T06:10:00Z')), { realHome, withAgents: false });
    const linked = prepareHome(makeHome(new Date('2026-08-23T06:11:00Z')), { realHome, withAgents: true });

    expect(blank.agents).toBe(false);
    expect(readAgentFiles({ home: blank.home }).user).toEqual([]);

    // And the other row still sees them, so the finish card has an offer.
    expect(linked.agents).toBe(true);
    expect(readAgentFiles({ home: linked.home }).user.map((a) => a.name)).toEqual(['leon-okafor-qa']);

    for (const dir of [blank.home, linked.home, realHome]) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('still links Claude Code and the keychain, or the copy cannot run anything', () => {
    const realHome = fs.mkdtempSync(path.join(os.tmpdir(), 'agentbox-test-real-home-'));
    fs.mkdirSync(path.join(realHome, '.local/bin'), { recursive: true });
    fs.writeFileSync(path.join(realHome, '.local/bin/claude'), '#!/bin/sh\n');
    fs.mkdirSync(path.join(realHome, 'Library/Keychains'), { recursive: true });

    const blank = prepareHome(makeHome(new Date('2026-08-23T06:12:00Z')), { realHome, withAgents: false });
    expect(blank.claudeBin).toBe(true);
    expect(blank.keychain).toBe(true);
    expect(fs.existsSync(path.join(blank.home, '.claude'))).toBe(false);

    for (const dir of [blank.home, realHome]) fs.rmSync(dir, { recursive: true, force: true });
  });
});
