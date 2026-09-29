// THE HOME FOLDER IS SAID BY MAIN, NOT GUESSED FROM THE STORE PATH.
//
// Found on, 2026-08-25, while working out how a tester's onboarding ended up
// pointing a project at her whole home folder.
//
// The renderer kept one value called `home` and got it like this:
//
//   setHome((s.workspace?.storePath || '').replace(/\/[^/]*$/, ''))
//
// `storePath` is the ACCOUNT ROOT, `<storeRoot>/accounts/<accountId>`. Taking
// the last segment off it gives `<storeRoot>/accounts`, which on a stranger's
// Mac is `~/Store/accounts`. It is not a home folder and it never was.
//
// Two screens read that value as a home and both were wrong with it:
//
//   * the walk's folder screen shortens the chosen path with it, so nothing
//     ever shortened to `~` and the second screen anybody sees showed a full
//     `/Users/<name>/...` path;
//   * the New Project card proposes a parent folder and JUDGES that parent
//     against the home it is handed. With the wrong home, a Mac with no
//     projects yet was proposed `~/Store/accounts/dev`, which puts the first
//     project's code inside Agentbox's own store, and a Mac whose only project
//     lives in `~/Documents` was proposed `~/Documents` itself, which is one of
//     the seven folders macOS guards and the exact thing this row exists to
//     stop us proposing.
//
// So main says it. The test is here rather than in a screen test because the
// defect is a VALUE, and the two consequences are in different files.

import { describe, expect, it } from 'vitest';
import os from 'node:os';
import { proposeParent, checkProjectFolder } from '../shared/project-folder-check.mjs';
import { shortPath } from '../renderer/src/onboarding.ts';
import { NAME } from '../shared/product-name.mjs';

/**
 * What the renderer used to compute, kept here so the wrongness is visible
 *  rather than described. */
const guessed = (storePath) => storePath.replace(/\/[^/]*$/, '');

const STORE = '/Users/esther/Store/accounts/00000000-0000-4000-8000-000000000000';
const HOME = '/Users/esther';

describe('the home folder the renderer works with', () => {
  it('is not what taking a segment off the store path gives you', () => {
    expect(guessed(STORE)).toBe('/Users/esther/Store/accounts');
    expect(guessed(STORE)).not.toBe(HOME);
  });

  it('is carried on the settings payload, from os.homedir()', async () => {
    const { readSettings } = await import('../main/settings.mjs');
    const supervisor = {
      paused: false,
      sessions: new Map(),
      status: () => ({ capacity: 3, pausedProducts: [], accountTrouble: {} }),
      readStanding: () => '',
      readWritingRules: () => '',
      readFinishing: () => '',
      readProjectInstructions: () => '',
      projectSessionArgs: () => null,
      isDriven: () => false,
      // The engine settings the payload now carries. A one-engine Mac, which is
      // what every assertion in this file is about, and the shape
      // `Supervisor#engineChoices` really answers with.
      engineChoices: () => [{ id: 'claude', label: 'Claude Code', word: 'Claude Code' }],
      engineFacts: () => ({ choices: [], workspace: 'claude', byItem: {} }),
      // And whether this Mac has asked to hear about Codex at all, which is what
      // the Codex connection card is drawn on. False here, as it is on every Mac
      // until somebody writes the moment into zero.config.json.
      engineChoiceOpened: () => false,
    };
    const { workspace } = readSettings({
      config: {
        accountRoot: STORE, storeRoot: '/Users/esther/Agentbox', appDir: os.tmpdir(),
        maxConcurrentSessions: 3, sessionArgs: [], authProfiles: [],
        claudeBin: '/bin/false', claudeFound: false, claudeCertain: true,
      },
      supervisor,
      store: { listProducts: () => [] },
    });
    // The one it says, and the one it must never go back to saying.
    expect(workspace.homePath).toBe(os.homedir());
    expect(workspace.homePath).not.toBe(guessed(workspace.storePath));
  });
});

describe('what the wrong home was costing', () => {
  it(`proposed the first project inside ${NAME}'s own store`, () => {
    expect(proposeParent([], { home: guessed(STORE) })).toBe('/Users/esther/Store/accounts/dev');
    expect(proposeParent([], { home: HOME })).toBe('/Users/esther/dev');
  });

  it('proposed a guarded folder as the parent of the next project', () => {
    const only = ['/Users/esther/Documents/app'];
    // ~/Documents is refused as a project outright, and it was being proposed
    // as the place to make the next one.
    expect(checkProjectFolder('/Users/esther/Documents', { home: HOME }).ok).toBe(false);
    expect(proposeParent(only, { home: guessed(STORE) })).toBe('/Users/esther/Documents');
    expect(proposeParent(only, { home: HOME })).toBe('/Users/esther/dev');
  });

  it('never shortened a path to ~ on the folder screen', () => {
    expect(shortPath('/Users/esther/code/apollo', guessed(STORE))).toBe('/Users/esther/code/apollo');
    expect(shortPath('/Users/esther/code/apollo', HOME)).toBe('~/code/apollo');
  });
});
