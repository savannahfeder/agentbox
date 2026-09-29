// HER RULES: FINDABLE BY THE WORD SHE TYPES, AND KEPT WHERE NO AGENT MOVES
// THEM (w-3dc46f3a67, 2026-09-21).
//
// Two defects, one row, and they were found the same way: she pressed ⌘K, typed
// "stand", and her screenshot shows "Nothing matches “stand”" under the box.
//
// THE FIRST IS THE NAME. The row said "Your rules…", the palette filters on a
// row's label plus its keywords (../renderer/src/palette-rows), and no row in
// the app contained the word "standing" or the word "instructions". Her own
// standing instructions file has told every agent for weeks that she opens this
// with ⌘K, "Standing instructions", so the app and her rules disagreed about
// the name of the same box and hers was the one that was right.
//
// THE SECOND IS THE FOLDER, and it is the expensive one. The file was
// `dataDir/briefs/founder.md`, and running from source `dataDir` is the git
// checkout. Every worker in the fleet is granted git checkout, git stash, git
// merge and git branch in that same clone. Measured on her repo that day: the
// whole history of briefs/founder.md was four commits, all of them an agent's,
// and the working copy matched the newest one exactly, so no version anywhere
// held a word she had typed after the first three rules. Nothing failed
// loudly. That is the whole problem.
//
// So what she writes now lives in her own data folder, which is the folder a
// packaged build already used, and what we SHIP stays in the checkout and is
// read as the fallback. These tests pin the line between those two.

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { matchesQuery } from '../renderer/src/palette-rows';
import { Supervisor } from '../main/supervisor.mjs';
import { carryHerBriefsAcross, joinMessageRules, readInstruction, readSystemTemplate, writeInstruction } from '../main/instruction-settings.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(repo, p), 'utf8');
const defaults = JSON.parse(read('shared/instruction-defaults.json'));

/* ------------------------------ the ⌘K row ------------------------------- */

/** The row's own object literal, so a keyword added to a neighbour cannot make
 *  this file pass. Same shape as tests/importing-agents-has-its-own-row. */
const row = (() => {
  const palette = read('renderer/src/components/Palette.tsx');
  const at = palette.indexOf("id: 'standing'");
  expect(at, 'no standing row in ⌘K').toBeGreaterThan(-1);
  const text = palette.slice(at, palette.indexOf('},', at));
  const field = (name) => text.match(new RegExp(`${name}: '([^']*)'`))?.[1] ?? '';
  return { label: field('label'), hint: field('hint'), keywords: field('keywords') };
})();

describe('⌘K finds her rules by the words she types', () => {
  it('is called what she named it', () => {
    // "Standing instructions…" was turned down as a name, and this one was
    // picked out of the set of options that followed. It reads
    // against "Instructions for this project" on a project's own settings page:
    // general, against this one.
    expect(row.label).toBe('General agent instructions…');
    expect(row.hint).toBeTruthy();
  });

  it('says the same words in all three places that open the same file', () => {
    // The whole defect was two surfaces onto one file under two names. The
    // Settings box said "Your rules", ⌘K said something else, and she could
    // find neither by typing what she calls it.
    expect(read('renderer/src/components/InstructionSettings.tsx'))
      .toContain("label:'General agent instructions'");
    expect(read('renderer/src/components/Standing.tsx'))
      .toContain("sentence: 'General agent instructions.");
  });

  it('matches "stand", which is the query in her screenshot', () => {
    expect(matchesQuery('stand', row), 'her own screenshot still finds nothing').toBe(true);
  });

  it('matches the other words she would try', () => {
    for (const typed of ['standing', 'instructions', 'standing instructions', 'my rules', 'guidelines']) {
      expect(matchesQuery(typed, row), `typing "${typed}" found nothing`).toBe(true);
    }
  });

  it('is still found by "rules", which is what the row said until today', () => {
    expect(matchesQuery('rules', row), 'the old label finds nothing').toBe(true);
    expect(matchesQuery('your rules', row)).toBe(true);
  });

  it('is not fuzzy about it: a word that is nowhere does not match', () => {
    expect(matchesQuery('mountain', row)).toBe(false);
  });
});

/* ---------------------- where what she writes lives ---------------------- */

let checkout;
let hers;

const supervisor = () => {
  const s = Object.create(Supervisor.prototype);
  s.appDir = checkout;
  s.dataDir = checkout;
  s.userDir = hers;
  s.config = { sessionArgs: [], personalSessionArgs: [], personalProducts: [] };
  return s;
};

const inCheckout = (file, text) => {
  fs.mkdirSync(path.join(checkout, 'briefs'), { recursive: true });
  fs.writeFileSync(path.join(checkout, 'briefs', file), text, 'utf8');
};

// The two old message files are not on the allowlist any more, so the join's
// cases put them in her folder by hand, which is where a machine that ran the
// old version would have them.
const writeInstructionAt = (dir, file, text) => {
  fs.mkdirSync(path.join(dir, 'briefs'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'briefs', file), text, 'utf8');
};

beforeEach(() => {
  checkout = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-checkout-'));
  hers = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-hers-'));
});
afterEach(() => {
  fs.rmSync(checkout, { recursive: true, force: true });
  fs.rmSync(hers, { recursive: true, force: true });
});

describe('her own writing is read from her folder and not from the checkout', () => {
  it('reads the rules she typed, and ignores a copy sitting in the repo', () => {
    // This is the exact failure: an agent's copy in the checkout, hers in her
    // folder, and the fleet briefed with whichever one the app reads.
    inCheckout('founder.md', 'WHAT AN AGENT COMMITTED');
    writeInstruction(hers, 'rules', 'Never give me a number you did not measure.');
    expect(supervisor().standingInstructions()).toBe('Never give me a number you did not measure.');
  });

  it('saves what she types into her folder, leaving the checkout alone', () => {
    inCheckout('founder.md', 'WHAT AN AGENT COMMITTED');
    supervisor().writeStanding('Tell me every time whether it is merged.');
    expect(fs.readFileSync(path.join(hers, 'briefs', 'founder.md'), 'utf8'))
      .toBe('Tell me every time whether it is merged.');
    // Nothing of ours was rewritten, so merging this can lose nothing.
    expect(fs.readFileSync(path.join(checkout, 'briefs', 'founder.md'), 'utf8'))
      .toBe('WHAT AN AGENT COMMITTED');
  });

  it('does the same for the rules about how agents write to her', () => {
    inCheckout('message-rules.md', 'OURS');
    writeInstruction(hers, 'messages', 'No em dashes.');
    expect(supervisor().messageRules()).toContain('No em dashes.');
    expect(supervisor().messageRules()).not.toContain('OURS');
  });

  it('a checkout that loses her file does not take her rules with it', () => {
    // The move is what this buys: `git checkout -- briefs/` in the clone the
    // fleet works in, and her rules are still there.
    writeInstruction(hers, 'rules', 'Put the answer on the work item.');
    fs.rmSync(path.join(checkout, 'briefs'), { recursive: true, force: true });
    expect(supervisor().standingInstructions()).toBe('Put the answer on the work item.');
  });
});

describe('what we ship still comes from the checkout', () => {
  it('briefs the shipped worker brief when she has never edited one', () => {
    inCheckout('worker.md', 'THE SHIPPED BRIEF');
    expect(readSystemTemplate(checkout, hers)).toBe('THE SHIPPED BRIEF');
  });

  it('lets her copy shadow it once she has one', () => {
    inCheckout('worker.md', 'THE SHIPPED BRIEF');
    writeInstruction(hers, 'system', 'MINE');
    expect(readSystemTemplate(checkout, hers)).toBe('MINE');
  });

  it('falls back to the shipped message rules, which is what the two paths were for', () => {
    // The two sides were the same file while both were the checkout, so the
    // fallback below could never run in development and editing the box
    // overwrote the default.
    inCheckout('message-rules.md', 'HOW TO WRITE TO HER');
    const sup = supervisor();
    expect(sup.messageRulesFile()).not.toBe(sup.messageRulesDefaultFile());
    expect(sup.readMessageRules()).toBe('HOW TO WRITE TO HER');
    sup.writeMessageRules('HOW I WANT IT');
    expect(sup.readMessageRules()).toBe('HOW I WANT IT');
    expect(fs.readFileSync(path.join(checkout, 'briefs', 'message-rules.md'), 'utf8')).toBe('HOW TO WRITE TO HER');
  });
});

/* ------------------------- carrying the text over ------------------------ */

describe('the move carries her text across once and never eats anything', () => {
  it('carries what she wrote', () => {
    inCheckout('founder.md', 'HER RULES');
    inCheckout('message-rules.md', 'HOW AGENTS WRITE TO HER');
    expect(carryHerBriefsAcross(checkout, hers).sort()).toEqual(['messages', 'rules']);
    expect(readInstruction(hers, 'rules').text).toBe('HER RULES');
    expect(readInstruction(hers, 'messages').text).toBe('HOW AGENTS WRITE TO HER');
  });

  it('leaves the checkout copy where it is, so merging the move cannot lose a word', () => {
    inCheckout('founder.md', 'HER RULES');
    carryHerBriefsAcross(checkout, hers);
    expect(fs.readFileSync(path.join(checkout, 'briefs', 'founder.md'), 'utf8')).toBe('HER RULES');
  });

  it('does NOT carry a file that is only our shipped default', () => {
    // Copying one of those into her folder freezes it: her "edit" would shadow
    // every future release's version of the same file, forever.
    inCheckout('message-rules.md', defaults.messages);
    inCheckout('worker.md', defaults.system);
    expect(carryHerBriefsAcross(checkout, hers)).toEqual([]);
    expect(fs.existsSync(path.join(hers, 'briefs', 'message-rules.md'))).toBe(false);
    expect(fs.existsSync(path.join(hers, 'briefs', 'worker.md'))).toBe(false);
  });

  it('DOES carry one of those once she has written over it', () => {
    inCheckout('message-rules.md', `${defaults.messages}\n\nAnd say whether it is merged.`);
    expect(carryHerBriefsAcross(checkout, hers)).toEqual(['messages']);
  });

  it('never overwrites what is already in her folder', () => {
    writeInstruction(hers, 'rules', 'WHAT SHE HAS NOW');
    inCheckout('founder.md', 'AN OLDER COPY FROM THE REPO');
    expect(carryHerBriefsAcross(checkout, hers)).toEqual([]);
    expect(readInstruction(hers, 'rules').text).toBe('WHAT SHE HAS NOW');
  });

  it('does nothing at all when the two folders are the same one', () => {
    inCheckout('founder.md', 'HER RULES');
    expect(carryHerBriefsAcross(checkout, checkout)).toEqual([]);
  });

  it('says nothing and throws nothing when there is no checkout copy to carry', () => {
    expect(carryHerBriefsAcross(checkout, hers)).toEqual([]);
  });

  it('runs at startup, before the supervisor that reads the files', () => {
    const main = read('main/main.mjs');
    expect(main).toContain('carryHerBriefsAcross(appDir, userDir)');
    expect(main.indexOf('carryHerBriefsAcross(appDir, userDir)'))
      .toBeLessThan(main.indexOf('new Supervisor('));
  });

  it('is the founder\'s own folder that the Settings boxes write to', () => {
    const ipc = read('main/ipc.mjs');
    expect(ipc).toContain('readInstruction(supervisor.userDir, id, supervisor.appDir)');
    expect(ipc).toContain('writeInstruction(supervisor.userDir, id, text)');
  });
});

/* ------------------- two message files becoming one ---------------------- */

// w-3dc46f3a67. Five separately adjustable prompt layers were too many for the
// user to manage. The writing rules and the finishing rules are
// one document, so the two old files have to arrive inside it exactly once.
describe('the two message documents are joined once', () => {
  it('puts her writing rules above the ending rules, in one file', () => {
    writeInstructionAt(hers, 'writing-rules.md', 'Open with what happened.');
    writeInstructionAt(hers, 'finishing.md', 'End with a pick.');
    const joined = joinMessageRules(checkout, hers);
    const text = readInstruction(hers, 'messages').text;
    expect(text).toContain('Open with what happened.');
    expect(text).toContain('End with a pick.');
    expect(text.indexOf('Open with what happened.')).toBeLessThan(text.indexOf('End with a pick.'));
    expect(joined.writing).toBe('Open with what happened.'.length);
  });

  // HER OWN CASE, measured before this was written: she has writing rules and
  // has never touched the finishing ones. Dropping the half she never edited
  // would quietly stop every task ending the way it does today, so the shipped
  // text comes across as the second half.
  it('takes the shipped ending rules when she never wrote her own', () => {
    writeInstructionAt(hers, 'writing-rules.md', 'Open with what happened.');
    inCheckout('message-rules.md', 'THE SHIPPED ENDING');
    joinMessageRules(checkout, hers);
    const text = readInstruction(hers, 'messages').text;
    expect(text).toContain('Open with what happened.');
    expect(text).toContain(defaults.messages.trim().slice(0, 60));
  });

  // The fresh install, and the reason this is not just "copy both files": with
  // nothing of hers to keep, writing anything at all would freeze our default
  // in her folder and no later release would ever reach her.
  it('writes nothing at all when she wrote neither', () => {
    inCheckout('message-rules.md', defaults.messages);
    expect(joinMessageRules(checkout, hers)).toBe(null);
    expect(fs.existsSync(path.join(hers, 'briefs', 'message-rules.md'))).toBe(false);
  });

  it('never runs twice over a file she already has', () => {
    writeInstruction(hers, 'messages', 'WHAT SHE HAS NOW');
    writeInstructionAt(hers, 'writing-rules.md', 'AN OLDER HALF');
    expect(joinMessageRules(checkout, hers)).toBe(null);
    expect(readInstruction(hers, 'messages').text).toBe('WHAT SHE HAS NOW');
  });

  it('leaves the two old files alone, so nothing is destroyed by the join', () => {
    writeInstructionAt(hers, 'writing-rules.md', 'Open with what happened.');
    joinMessageRules(checkout, hers);
    expect(fs.readFileSync(path.join(hers, 'briefs', 'writing-rules.md'), 'utf8'))
      .toBe('Open with what happened.');
  });

  it('runs at startup, after the carry and before the supervisor', () => {
    const main = read('main/main.mjs');
    expect(main).toContain('joinMessageRules(appDir, userDir)');
    expect(main.indexOf('carryHerBriefsAcross(appDir, userDir)'))
      .toBeLessThan(main.indexOf('joinMessageRules(appDir, userDir)'));
    expect(main.indexOf('joinMessageRules(appDir, userDir)'))
      .toBeLessThan(main.indexOf('new Supervisor('));
  });
});
