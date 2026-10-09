// THE "HOW AGENTS WRITE TO YOU" BOX SHOWED THE APP'S OWN MACHINERY
// (w-3ec9f07978, 2026-10-01).
//
// What broke: on the team version, the box on the Instructions page opened on
// 21,743 characters, and not one of them had been typed by the person reading
// it. Measured on the machine it was reported from: the file in the data
// folder was byte for byte the checkout's `briefs/writing-rules.md` joined to
// `briefs/message-rules.md`, written at the app's first start that day.
//
// How: `joinMessageRules` treated a `writing-rules.md` in the CHECKOUT as the
// user's, on the old belief that the writing rules ship empty. In this
// repository they ship 16,000 characters long, so every fresh copy run from
// source joined our two files and saved them as the user's own. Those files
// are the rules the inbox depends on to read a message at all: the bold first
// line the list clips at, the Options section the picker draws, the last
// message being the answer. A person editing them breaks their own inbox.
//
// So the line is drawn where it belongs. The app's message rules are ours,
// ride on every run, and are never in the box. The box holds only what the
// person wrote, starts empty, and rides above ours so their words win.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Supervisor } from '../main/supervisor.mjs';
import {
  carryHerBriefsAcross, joinMessageRules, listVersions, readInstruction, readVersion,
  setAsideShippedMessageRules, writeInstruction,
} from '../main/instruction-settings.mjs';

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const shipped = (name) => fs.readFileSync(path.join(REPO, 'briefs', name), 'utf8');
const WRITING = shipped('writing-rules.md');
const ENDING = shipped('message-rules.md');
// Exactly what the old join wrote into the user's folder.
const OLD_SEED = `${[WRITING.trim(), ENDING.trim()].join('\n\n')}\n`;

let checkout;
let hers;

beforeEach(() => {
  checkout = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-box-app-'));
  hers = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-box-user-'));
  fs.mkdirSync(path.join(checkout, 'briefs'), { recursive: true });
  for (const f of ['writing-rules.md', 'message-rules.md', 'worker.md', 'adhd-mode.md']) {
    fs.copyFileSync(path.join(REPO, 'briefs', f), path.join(checkout, 'briefs', f));
  }
});
afterEach(() => {
  fs.rmSync(checkout, { recursive: true, force: true });
  fs.rmSync(hers, { recursive: true, force: true });
});

const startUp = () => {
  carryHerBriefsAcross(checkout, hers);
  joinMessageRules(checkout, hers);
  setAsideShippedMessageRules(checkout, hers);
};
const supervisor = () => new Supervisor(
  { storeRoot: hers, maxConcurrentSessions: 1 },
  { listItems: () => [], listProducts: () => [], isDue: () => true },
  checkout, checkout, hers,
);
const box = () => readInstruction(hers, 'messages', checkout);
const userFile = () => path.join(hers, 'briefs', 'message-rules.md');

describe('a fresh copy run from source', () => {
  it('opens the box empty, with nothing of ours in it', () => {
    startUp();
    expect(box().text).toBe('');
    expect(box().defaultText).toBe('');
    expect(fs.existsSync(userFile())).toBe(false);
  });

  // The shipped message rules, and only those: a download has never carried
  // the checkout's writing rules (package.json leaves them out), so a run from
  // source is briefed the same as a run from the download.
  it('still briefs every run with the app\'s rules', () => {
    startUp();
    const rules = supervisor().messageRules();
    expect(rules).toContain('LINE ONE AND THE OPTIONS ARE ONE QUESTION, NOT TWO');
    expect(rules).not.toContain('ONE SENTENCE, AND IT FITS');
  });
});

describe('a box already filled with our text by the old join', () => {
  it('is emptied, the reported case', () => {
    writeInstruction(hers, 'messages', OLD_SEED);
    startUp();
    expect(box().text).toBe('');
  });

  it('keeps what it held as a restore point, so nothing is lost', () => {
    writeInstruction(hers, 'messages', OLD_SEED);
    setAsideShippedMessageRules(checkout, hers);
    const versions = listVersions(hers, 'messages');
    expect(versions).toHaveLength(1);
    expect(readVersion(hers, 'messages', versions[0].ts).text).toBe(OLD_SEED);
  });

  it('is emptied when it holds only the shipped ending rules', () => {
    writeInstruction(hers, 'messages', ENDING);
    setAsideShippedMessageRules(checkout, hers);
    expect(box().text).toBe('');
  });

  // The boundary. One line of the person's own makes the whole file theirs,
  // and nothing here is clever enough to cut it apart safely.
  it('is left alone when they added even one line', () => {
    const edited = `${OLD_SEED}\nAnd say whether it is merged.\n`;
    writeInstruction(hers, 'messages', edited);
    setAsideShippedMessageRules(checkout, hers);
    expect(box().text).toBe(edited);
  });

  it('leaves their own short rules alone', () => {
    writeInstruction(hers, 'messages', 'No em dashes.');
    expect(setAsideShippedMessageRules(checkout, hers)).toBe(false);
    expect(box().text).toBe('No em dashes.');
  });

  it('does nothing when there is no file', () => {
    expect(setAsideShippedMessageRules(checkout, hers)).toBe(false);
    expect(fs.existsSync(userFile())).toBe(false);
  });
});

describe('the join no longer copies our files into theirs', () => {
  it('ignores the writing rules in the checkout', () => {
    expect(joinMessageRules(checkout, hers)).toBe(null);
    expect(fs.existsSync(userFile())).toBe(false);
  });

  it('carries their own old writing rules without our ending under them', () => {
    fs.mkdirSync(path.join(hers, 'briefs'), { recursive: true });
    fs.writeFileSync(path.join(hers, 'briefs', 'writing-rules.md'), 'Open with what happened.');
    joinMessageRules(checkout, hers);
    expect(box().text.trim()).toBe('Open with what happened.');
  });
});

describe('what a run is told', () => {
  it('their words ride above ours, and both ride', () => {
    writeInstruction(hers, 'messages', 'No em dashes, ever.');
    const rules = supervisor().messageRules();
    expect(rules).toContain('No em dashes, ever.');
    expect(rules).toMatch(/in their own\s+words/);
    expect(rules).toContain('LINE ONE AND THE OPTIONS ARE ONE QUESTION, NOT TWO');
    expect(rules.indexOf('No em dashes, ever.'))
      .toBeLessThan(rules.indexOf('LINE ONE AND THE OPTIONS ARE ONE QUESTION, NOT TWO'));
  });

  // Emptying the box removes their words, never ours: ours are what keep the
  // inbox able to read a message.
  it('an emptied box leaves the app\'s rules in place', () => {
    writeInstruction(hers, 'messages', '  \n');
    const rules = supervisor().messageRules();
    expect(rules).toContain('LINE ONE AND THE OPTIONS ARE ONE QUESTION, NOT TWO');
    expect(rules).not.toMatch(/in their own\s+words/);
  });

  it('the box reads back only their words', () => {
    const s = supervisor();
    expect(s.readMessageRules()).toBe('');
    s.writeMessageRules('Short, please.');
    expect(s.readMessageRules()).toBe('Short, please.');
  });
});

describe('the page', () => {
  const page = fs.readFileSync(path.join(REPO, 'renderer/src/components/InstructionSettings.tsx'), 'utf8');
  // Since 2026-10-07 both kinds of user instructions share the general box.
  const section = page.slice(page.indexOf('const rules:Section'), page.indexOf('\n', page.indexOf('const rules:Section')));

  it('does not fill the box with the shipped text', () => {
    expect(section).not.toContain('defaults.messages');
    expect(section).toContain("defaultText:''");
  });

  it('keeps the app rules out of the combined user editor', () => {
    expect(page).not.toContain("id:'messages'");
    expect(section).not.toContain('defaults.system');
    expect(page).toContain('instruction-advanced');
  });
});
