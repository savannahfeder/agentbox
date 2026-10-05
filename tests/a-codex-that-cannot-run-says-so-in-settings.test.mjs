// A WHOLE ENGINE'S STATE, IN THE PAYLOAD, THAT NO CODE PATH COULD EVER READ.
//
// `_noteProfileTrouble` records what is wrong with an account through
// `_accountKey`, which exists precisely because BOTH engines call their primary
// login 'default' -- so a Codex failure lands under `codex:default` and cannot
// strike her Claude subscription (the 2026-08-24 shape). `status` then exports
// that book verbatim as `accountTrouble`, and the only reader in the app is
// main/settings.mjs, which indexes it by a bare CLAUDE folder name:
//
//     const trouble = troubles[profile] ?? null;
//
// `profile` there comes from `effectiveProfiles`, so it is 'default' or a path.
// It is never `codex:default`. The entry is in the IPC payload and nothing can
// ever match it.
//
// WHAT THAT COSTS HER. Her Codex subscription lapses. Every Codex task stops.
// She opens Settings › General and reads "Signed in to Claude", one green row,
// her plan -- and nothing else. The fleet brake cannot speak either: it is
// armed only by a fast CLAUDE exit with no healthy CLAUDE account left
// (`_healthyProfiles` reads Claude keys only, deliberately), so "No agents can
// start" is structurally unable to be true about Codex. The fact existed on
// individual rows and nowhere else. That is CLAUDE.md's own rule broken: a
// system that swallows something is indistinguishable from the work not
// happening.
//
// ---------------------------------------------------------------------------
// WHERE THE FACT GOES, AND WHY THERE.
//
// NOT AN ACCOUNTS ROW. A previous slice argued that out and it still holds:
// `~/.codex/auth.json` carries `auth_mode` and an opaque `tokens.account_id`,
// no email and no plan (measured on this Mac 2026-09-05, codex-cli 0.148.0),
// and a uuid is not a person. Nothing here invents an identity.
//
// THE CODEX CONNECTION CARD, which already exists and is already drawn exactly
// where this fact matters: on a Mac that has opened the gate
// (`Supervisor#engineChoiceOpened`). It is a card about the ENGINE and not
// about a person, which is the only thing that can honestly be said here.
//
// AND IT IS NOT MERELY AN AVAILABLE SURFACE -- IT IS ONE CURRENTLY SAYING THE
// OPPOSITE OF THE TRUTH. So the sentence is REPLACED while the engine is in
// trouble, which is the same move the Accounts row already makes when it puts
// `accountSentence` over the folder line.
//
// THE CLAUDE PATH IS NOT TOUCHED BY ANY OF IT, and the two blocks at the foot
// of this file are that claim: a Codex trouble must not appear on a Claude
// account row, and a Codex worker must not be counted as one.

import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSettings } from '../main/settings.mjs';
import { forgetCodexBin } from '../main/codex-bin.mjs';
import { Supervisor } from '../main/supervisor.mjs';
import { engineTroubleNote } from '../shared/spawn-trouble.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const settingsTsx = fs.readFileSync(path.join(root, 'renderer/src/components/Settings.tsx'), 'utf8');

const OPENED = '2026-09-04T00:00:00Z';
const emptyStore = { listItems: () => [], listProducts: () => [], isDue: () => true };

/** A file that really is on disk, so the finder is answering about something. */
const realFile = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-bin-'));
  const file = path.join(dir, 'codex');
  fs.writeFileSync(file, '#!/bin/sh\n');
  return file;
};

const build = (overrides = {}) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-trouble-'));
  const config = {
    home: '/nonexistent-home-with-no-second-account',
    storeRoot: dir, accountRoot: dir, appDir: dir,
    claudeBin: '/nonexistent/claude',
    maxConcurrentSessions: 3, authProfiles: ['default'], sessionArgs: [],
    ...overrides,
  };
  const supervisor = new Supervisor(config, emptyStore, dir);
  return { config, supervisor, read: () => readSettings({ config, supervisor, store: emptyStore }).workspace };
};

/**
 * A dead Codex spawn, recorded exactly the way `noteExitForBackoff` records
 *  one: through `_accountKey`, so the key really is `codex:default`. */
const codexDied = (supervisor, raw) => {
  const key = supervisor._accountKey('codex', 'default');
  expect(key).toBe('codex:default');
  return supervisor._noteProfileTrouble(key, raw);
};

beforeEach(() => { forgetCodexBin(); });

/* =============== the book the supervisor keeps, asked properly ============ */

describe('what is wrong with the second engine', () => {
  it('is readable off the supervisor, under the key it was really written at', () => {
    const { supervisor } = build();
    codexDied(supervisor, 'unexpected status 401 Unauthorized: Missing bearer or basic authentication in header');
    expect(supervisor.engineTrouble('codex')?.cause).toBe('signed-out');
  });

  it('is null when nothing has gone wrong on it', () => {
    const { supervisor } = build();
    expect(supervisor.engineTrouble('codex')).toBe(null);
  });

  // THE CASE THAT MUST NOT MATCH, and it is the whole reason `_accountKey`
  // exists: her Claude default login being signed out is not a fact about
  // Codex, and asking about one engine must never answer with the other's.
  it('is not her claude account, whatever that account is doing', () => {
    const { supervisor } = build();
    supervisor._noteProfileTrouble('default', 'Failed to authenticate: OAuth session expired');
    expect(supervisor.engineTrouble('codex')).toBe(null);
    expect(supervisor.engineTrouble('claude')?.cause).toBe('signed-out');
  });

  // AND IT FOLLOWS THE ACCOUNT'S OWN RECOVERY. A surviving run clears the
  // trouble, and the card has to go quiet with it rather than hold a sentence
  // about something that has mended.
  it('clears when a run on that engine survives', () => {
    const { supervisor } = build();
    codexDied(supervisor, 'You have hit your usage limit');
    expect(supervisor.engineTrouble('codex')?.cause).toBe('at-limit');
    supervisor._clearProfileTrouble(supervisor._accountKey('codex', 'default'));
    expect(supervisor.engineTrouble('codex')).toBe(null);
  });
});

/* ===================== and it reaches the settings model ================== */

describe('the codex card', () => {
  const opened = () => build({ engineChoice: OPENED, codexBinConfigured: realFile() });

  it('carries the trouble when the engine cannot run', () => {
    const { supervisor, read } = opened();
    codexDied(supervisor, 'unexpected status 401 Unauthorized: Missing bearer or basic authentication in header');
    const w = read();
    expect(w.codex.found).toBe(true);
    expect(w.codex.trouble).toBe(engineTroubleNote('signed-out'));
    // The sentence has to be one somebody can act on, and the act is a command
    // she can type. `codex login` is the real one (codex-cli 0.148.0, measured
    // on this Mac 2026-09-05).
    expect(w.codex.trouble).toContain('codex login');
  });

  it('carries null when the engine is fine, so the card reads as it always did', () => {
    const w = opened().read();
    expect(w.codex.found).toBe(true);
    expect(w.codex.trouble).toBe(null);
  });

  // A LIMIT IS NOT A THING SHE HAS TO FIX, and the sentence must not tell her
  // it is: it clears itself. Same distinction `troubleRemedy` already draws for
  // Claude Code.
  it('says a limit clears itself rather than asking her to do something', () => {
    const { supervisor, read } = opened();
    codexDied(supervisor, "You've hit your usage limit. Visit https://chatgpt.com/codex/settings/usage");
    expect(read().codex.trouble).toBe(engineTroubleNote('at-limit'));
    expect(read().codex.trouble).not.toContain('codex login');
  });

  // THE GATE STILL DECIDES WHETHER THERE IS A CARD AT ALL. On a Mac that has
  // not opened it, Agentbox has never said the word Codex on any screen, and a
  // trouble sentence would be the app volunteering a topic.
  it('is absent entirely while the gate is shut, trouble or no trouble', () => {
    const { supervisor, read } = build({ codexBinConfigured: realFile() });
    codexDied(supervisor, 'unexpected status 401 Unauthorized');
    expect(read().codex).toBe(null);
  });
});

/* ============= the claude accounts page, which must not move ============== */

describe('her claude accounts', () => {
  it('show no trouble because codex is in trouble', () => {
    const { supervisor, read } = build({ engineChoice: OPENED, codexBinConfigured: realFile() });
    codexDied(supervisor, 'unexpected status 401 Unauthorized');
    const [account] = read().accounts;
    expect(account.profile).toBe('default');
    expect(account.trouble).toBe(null);
    expect(account.state).toBe('live');
  });

  // AND STILL SHOW THEIR OWN, which is the case that must not be broken by
  // scoping anything: this page exists for exactly this sentence.
  it('still show their own trouble', () => {
    const { supervisor, read } = build();
    supervisor._noteProfileTrouble('default', 'Failed to authenticate: OAuth session expired');
    const [account] = read().accounts;
    expect(account.state).toBe('signed-out');
    expect(account.trouble.cause).toBe('signed-out');
  });

  // THE OTHER HALF OF THE SAME COLLISION. A Codex worker's `profile` is also
  // 'default', so the running count on her Claude account row was counting
  // Codex threads as Claude sessions -- the exact confusion `_accountKey` was
  // written to prevent, in a second place.
  it('do not count a codex worker as a session on her claude login', () => {
    const { supervisor, read } = build({ engineChoice: OPENED, codexBinConfigured: realFile() });
    supervisor.sessions.set('w-codex', { itemId: 'w-codex', product: 'agentbox', profile: 'default', engine: 'codex', tail: [] });
    expect(read().accounts[0].running).toBe(0);
  });

  it('still count a claude worker on it', () => {
    const { supervisor, read } = build();
    supervisor.sessions.set('w-claude', { itemId: 'w-claude', product: 'agentbox', profile: 'default', engine: 'claude', tail: [] });
    // And one written before the second engine existed, which carries no
    // engine at all: `_accountKey` reads that as Claude Code, as it must.
    supervisor.sessions.set('w-old', { itemId: 'w-old', product: 'agentbox', profile: 'default', tail: [] });
    expect(read().accounts[0].running).toBe(2);
  });
});

/* ================== and the card really draws the sentence ================ */

describe('the connection card', () => {
  const block = settingsTsx.slice(
    settingsTsx.indexOf('function Connection('),
    settingsTsx.indexOf('/* -------------------------------- updates'),
  );

  // A FACT IN THE PAYLOAD THAT NOTHING DRAWS IS THE DEFECT THIS FILE IS ABOUT,
  // so the card has to be shown reading it.
  it('takes the trouble and says it in place of the connected line', () => {
    expect(block).toContain('trouble');
    expect(block).toMatch(/const say = trouble/);
  });

  /*
   * THE CLAIM IS UNCHANGED AND THE MARKUP UNDER IT IS NOT. Settings stopped
     having a `<CodexCli>` card on 2026-09-21 (w-dc88147919): each coding agent
     is one card now, holding its status, its limits and its accounts together,
     because the page used to describe one agent in three places that never
     touched. So this no longer looks for a prop on a component that is gone.
     What it still refuses is the defect the file is named for: a trouble
     sentence that main computed and the screen re-derived or dropped. */
  it('passes the payload value in rather than deriving a second one', () => {
    expect(settingsTsx).toMatch(/trouble:\s*w\.codex\?\.trouble \?\? null/);
    // Since the redraw (w-ccadd13c46) the agent's page draws its status card
    // whenever there is trouble, and hands it main's sentence untouched.
    expect(settingsTsx).toContain('trouble: agent.trouble, onChecked: load };');
    expect(settingsTsx).toContain("(!agent.found || agent.trouble) && (engine === 'codex' ? <CodexCli {...status} /> : <ClaudeCode {...status} />)");
    // And it is still SAID, not turned into a word of ours.
    expect(settingsTsx).not.toContain("<span className=\"ac-warn\">not running</span>");
  });
});
