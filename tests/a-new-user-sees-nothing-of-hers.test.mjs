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

// The ⌘K row itself went on 2026-10-29 as a test rig
// (tests/the-command-bar-holds-no-test-rigs.test.mjs); `npm run fresh` opens it.
describe('⌘K says what setting up again does in a few words', () => {
  // HER LENGTH RULE, AS A NUMBER RATHER THAN AS TASTE.
  it('not a paragraph', () => {
    const row = palette.slice(palette.indexOf("id: 'first-run',"));
    const hint = row.slice(row.indexOf("hint: '") + 7, row.indexOf("',", row.indexOf("hint: '")));
    expect(hint.length).toBeLessThanOrEqual(44);
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
