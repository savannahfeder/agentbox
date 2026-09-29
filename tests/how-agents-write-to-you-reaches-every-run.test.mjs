// How agents write to her reaches EVERY run, or it is not the thing she asked
// for.
//
// The writing rules lived inside the worker brief, which not every run was
// given. So this rides in the system prompt at spawnPlan, the one place a
// session's arguments are built, and these tests pin both halves: every kind of
// run gets it, and emptying the box takes it away everywhere.
//
// IT IS ONE DOCUMENT NOW, AND THIS FILE USED TO BE ABOUT HALF OF IT
// (w-3dc46f3a67, 2026-09-22). `writing-rules.md` shaped the messages during a
// task and `finishing.md` shaped the last one. Five separately adjustable
// prompt layers were too many for the user to manage. They are one file,
// `message-rules.md`, under one box called "How agents write to you", and the
// cases below cover the whole of it.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';
import { NAME } from '../shared/product-name.mjs';

let appDir;
let dataDir;

const supervisor = (over = {}) => {
  const s = Object.create(Supervisor.prototype);
  s.appDir = appDir;
  s.dataDir = dataDir;
  // Where HER copy lives, which since w-3dc46f3a67 is her own data folder and
  // never the checkout. This file already kept the two folders apart, which is
  // why it was already testing the real two-path behaviour.
  s.userDir = dataDir;
  s.config = {
    sessionArgs: ['--allowedTools', 'mcp__agentbox'],
  };
  s.buildBrief = () => 'THE BRIEF';
  return Object.assign(s, over);
};

const item = (over = {}) => ({ id: 'w-1', product: 'acme', title: 'do the thing', ...over });
const product = { slug: 'acme', name: 'Acme', dir: '/tmp/acme-nowhere', repoPath: null };

const shipDefault = (text) => {
  fs.mkdirSync(path.join(appDir, 'briefs'), { recursive: true });
  fs.writeFileSync(path.join(appDir, 'briefs', 'message-rules.md'), text, 'utf8');
};

const injected = (args) => {
  const at = args.indexOf('--append-system-prompt');
  return at === -1 ? undefined : args[at + 1];
};

beforeEach(() => {
  appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-msg-app-'));
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-msg-data-'));
});
afterEach(() => {
  fs.rmSync(appDir, { recursive: true, force: true });
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe('who gets it', () => {
  it('a product worker', () => {
    shipDefault('Line one is the ask, in bold.');
    const { args } = supervisor().spawnPlan(item(), product, {});
    expect(injected(args)).toContain('Line one is the ask, in bold.');
  });

  // A thread she answers three days later is still a run, and the last message
  // of it is still the one she reads. A personal task was a case of its own
  // here until personal projects were deleted (w-d19d6d387c, 2026-09-22).
  it('a resumed session carrying her reply', () => {
    shipDefault('Line one is the ask, in bold.');
    const s = supervisor();
    const { args } = s.spawnPlan(item({ answer: 'yes' }), product, {
      continuation: true, resumeSessionId: 'session-abc',
    });
    expect(args).toContain('--resume');
    expect(injected(args)).toContain('Line one is the ask, in bold.');
  });
});

describe('turning it off', () => {
  // Emptying the box in settings is the whole mechanism. It leaves an empty
  // file rather than deleting one, so this must not read as "not set up yet"
  // and fall back to the shipped text.
  it('an emptied box removes it from every run', () => {
    shipDefault('Line one is the ask, in bold.');
    const s = supervisor();
    s.writeMessageRules('');
    expect(s.messageRules()).toBe(null);
    expect(injected(s.spawnPlan(item(), product, {}).args)).toBe(undefined);
  });

  it('whitespace alone is empty', () => {
    shipDefault('Line one is the ask, in bold.');
    const s = supervisor();
    s.writeMessageRules('\n  \n');
    expect(s.messageRules()).toBe(null);
  });
});

describe('her copy against the shipped one', () => {
  // A packaged build cannot write to itself, so the default ships in the bundle
  // and her edit lands in the writable data folder. Her copy wins.
  it('her edit outranks the shipped text', () => {
    shipDefault('SHIPPED');
    const s = supervisor();
    s.writeMessageRules('MINE');
    expect(s.messageRules()).toContain('MINE');
    expect(s.messageRules()).not.toContain('SHIPPED');
    expect(fs.readFileSync(path.join(dataDir, 'briefs', 'message-rules.md'), 'utf8')).toBe('MINE');
    // And nothing was written into the bundle.
    expect(fs.readFileSync(path.join(appDir, 'briefs', 'message-rules.md'), 'utf8')).toBe('SHIPPED');
  });

  // The box has to open filled in on a machine she has never edited it on,
  // otherwise it reads as a feature that was never turned on.
  it('the settings box opens on the shipped text before she has edited it', () => {
    shipDefault('SHIPPED');
    expect(supervisor().readMessageRules()).toBe('SHIPPED');
  });

  it('the settings box opens on her own text after she has', () => {
    shipDefault('SHIPPED');
    const s = supervisor();
    s.writeMessageRules('MINE');
    expect(s.readMessageRules()).toBe('MINE');
  });

  it('says nothing at all when there is no file anywhere', () => {
    const s = supervisor();
    expect(s.messageRules()).toBe(null);
    expect(s.readMessageRules()).toBe('');
    expect(injected(s.spawnPlan(item(), product, {}).args)).toBe(undefined);
  });
});

describe('what it says and where it sits', () => {
  // Her rules are hers and these are ours. Reading order is the only thing that
  // says which wins, so the block goes last and says so out loud as well.
  it('sits under her standing instructions and defers to them', () => {
    shipDefault('FINISHING TEXT');
    const s = supervisor({ standingInstructions: () => 'HER RULE' });
    const system = injected(s.spawnPlan(item(), product, {}).args);
    expect(system.indexOf('HER RULE')).toBeLessThan(system.indexOf('FINISHING TEXT'));
    expect(system).toContain('outranks');
  });

  it('sits under a project rule too', () => {
    shipDefault('FINISHING TEXT');
    const s = supervisor({ projectInstructions: () => 'PROJECT RULE' });
    const system = injected(s.spawnPlan(item(), product, {}).args);
    expect(system.indexOf('PROJECT RULE')).toBeLessThan(system.indexOf('FINISHING TEXT'));
  });
});

// The shipped file is the feature. A default that stops asking for the bold
// first line, or stops offering her a pick, is the regression this whole item
// was filed about, and it would ship silently.
describe(`the text ${NAME} ships`, () => {
  const shipped = fs.readFileSync(
    new URL('../briefs/message-rules.md', import.meta.url),
    'utf8',
  );

  it('asks for the one bold line first', () => {
    expect(shipped).toMatch(/\*\*Line one is the thing they have to say back/);
  });

  // The second hole the real test found, same evening. A run put a plain
  // 135-character sentence on line one, so the row clipped it mid-point and
  // the bold never rendered. SUMMARY_BUDGET is 112, hence the number here.
  it('says the message starts with the asterisks, and gives the row budget', () => {
    expect(shipped).toContain('YOUR MESSAGE BEGINS WITH THE TWO ASTERISKS');
    expect(shipped).toMatch(/under 110 characters/);
  });

  // The one the six-run A/B caught (2026-08-23). The prompt already said the
  // message begins with the asterisks, and one run of three still opened "Suite
  // is green and nothing is committed" above its bold line, which is the
  // sentence her row would then have carried. So the rule names that sentence
  // out loud rather than leaving it to the general ban.
  it('names the housekeeping sentence as the one that may not go first', () => {
    expect(shipped).toMatch(/housekeeping/i);
    expect(shipped).toMatch(/nothing is committed/i);
    expect(shipped).toMatch(/above the bold line/i);
  });

  it('asks for an Options section with one recommendation', () => {
    expect(shipped).toContain('## Options');
    expect(shipped).toContain('(recommended)');
  });

  // The hole the real test found (2026-08-23). A run that had edited a file
  // and left it uncommitted still called itself settled and offered her
  // nothing, and the old wording allowed it.
  it('makes a run that changed something always offer a pick', () => {
    expect(shipped).toContain('IF YOUR RUN CHANGED ANYTHING, THERE IS SOMETHING TO DECIDE');
    expect(shipped).toMatch(/only run that ends with no options\s+is one that changed nothing/);
  });

  // The hole SHE found, reading the first real example (2026-08-23): the bold
  // line asked whether to keep the fsync stub and option one asked whether to
  // commit the branch. The old text asked for a good opening line and,
  // separately, for good options, and never said they had to be the same
  // decision.
  it('binds line one to the options as one question', () => {
    expect(shipped).toContain('LINE ONE AND THE OPTIONS ARE ONE QUESTION, NOT TWO');
    expect(shipped).toMatch(/write line one LAST/);
    expect(shipped).toMatch(/if someone said option one\s+out loud, it has to answer line one/);
  });

  it('sends them up the conversation for the detail instead of repeating it', () => {
    expect(shipped).toMatch(/already in the conversation above this message/);
    expect(shipped).toMatch(/the detail is one scroll up/);
  });

  it('keeps her two standing rules in it', () => {
    expect(shipped).toContain('Never give a number you did not measure');
    expect(shipped).toMatch(/Under 200 words/);
  });

  // THE HALF THIS FILE DID NOT HAVE (2026-08-28). Every rule above is written
  // for a run that DID something and now needs a decision, and there was no
  // branch at all for the run that was simply asked a question.
  //
  // Measured on her personal store the same day: of the 10 results written
  // since these rules landed on 08-23, 8 carry an Options section and 7 open
  // with a bold question, against 0 of the 91 written before. The shape is the
  // file's doing, which is why the correction belongs in the file.
  describe('a run that was asked a question, not given a job', () => {
    it('branches on what was asked before any of the rest applies', () => {
      expect(shipped).toContain('FIRST, WHAT WERE YOU ASKED FOR');
      // Flattened: the sentence wraps, and where it wraps moves whenever the
      // paragraph around it is edited.
      expect(shipped.replace(/\s+/g, ' '))
        .toContain('WHEN YOU WERE ASKED A QUESTION INSTEAD, THE ANSWER IS THE WHOLE DELIVERABLE');
      // Before the bold-line rule, or it fires first and the branch is dead.
      expect(shipped.indexOf('FIRST, WHAT WERE YOU ASKED FOR'))
        .toBeLessThan(shipped.indexOf('**Line one is the thing they have to say back'));
    });

    it('puts the answer on line one instead of a question back', () => {
      expect(shipped).toMatch(/line one is instead the most useful sentence of your\s+answer/);
    });

    it('takes the word cap off the answer they actually asked for', () => {
      expect(shipped).toContain('THAT CAP IS ON REPORTING YOUR OWN WORK, NOT ON ANSWERING THEM');
      expect(shipped).toMatch(/the ask sets the size/);
    });

    it('bans an option made out of work they did not ask for', () => {
      expect(shipped.replace(/\s+/g, ' ')).toContain('NEVER INVENT A PICK OUT OF WORK');
      expect(shipped).toMatch(/AND READING CHANGES NOTHING/);
    });
  });

  // It is pasted in front of every run there is, including the cheap ones, so
  // its size is a real cost and not a style note. The writing rules are 15,000
  // characters and that is exactly why they could not go here.
  //
  // Raised from 3000 to 5200 by, deliberately and at a price: the question
  // branch above is 2,064 characters that ride on every run, cheap ones
  // included. It buys back a whole class of run this file was silently making
  // worse, which the old cap was not weighing at all. Measured against the old
  // text on her own failing case, four runs an arm: the answer moved from 280
  // words to 611-894, line one carried the answer instead of an offer in 4 of
  // 4, and no run invented an option out of work she had not asked for.
  //
  // Raised again from 5200 to 5400 by, for 221 characters: the rule that a
  // closing message repeating an answer already written to the row repeats it
  // WORD FOR WORD.Measured on her store the same day: 108 of the 300 rows that
  // draw a thread said one bold line twice running. The fold that landed in
  // item-thread.ts the same afternoon can merge an exact copy and provably
  // cannot merge a reworded one, so the file that tells every worker how to
  // close is the only place the reword can be stopped.
  //
  // The first is gone. A file about saying things once should not.
  //
  // Raised from 5400 to 5800 by, for 406 characters: the answer is in the
  // message and not in a report beside it, and steps she takes are a numbered
  // list of five at most. Measured on her store that day: 641 of 1,880
  // agent-written rows opened a document beside the card by itself, and 466 of
  // those landed on a page of words. The app now opens only a drawing
  // (message-artifacts.ts); this file is where every run learns to stop writing
  // the report that used to fill the pane.
  it('stays small enough to sit on every run', () => {
    expect(shipped.length).toBeLessThan(5800);
  });

  // THE SECOND COPY IS NOT ASKED FOR ANY MORE, AND THAT REPLACES THE RULE THAT
  // USED TO BE PINNED HERE.
  //
  // What stood here demanded the opposite: a closing message repeating an
  // answer already on the row had to repeat it WORD FOR WORD, because the fold
  // in item-thread.ts can merge an exact copy and provably cannot merge a
  // reworded one. It was a reasonable rule and it could not be followed.
  // Measured over a whole store, replaying every run: of 1,803
  // runs that wrote an answer to a row, 830 typed it again as their closing
  // message, and only 157 of those 830 came out word for word. A writer told to
  // repeat itself rewrites instead, which is what writers do. The fold catches
  // most of what that produces, 608 of the 830 would be drawn twice and 127
  // still were, and one of the 127 is the row the bug was reported on
  // (w-94b3af4e70).
  //
  // So the cause is gone rather than the symptom patched: the brief was
  // changed so the answer is written once. Two things follow for this file. The demand is inverted, and the
  // reasoning stays HERE rather than in the brief, because the brief rides on
  // every run and its 5,800 characters are a real cost.
  //
  // The fold stays where it is. It still covers the rows already written, two
  // runs answering the same row, and any worker that repeats itself anyway.
  //
  // AND THAT DID NOT HOLD EITHER (w-23d09d72ce, 2026-09-28). The reported run
  // had "THE ANSWER IS WRITTEN ONCE" in its own brief, wrote its
  // answer to the row at 2:15:40pm and said it again, reworded, at 2:15:43pm.
  // Its first round on the same row did the same. A rule asking a Claude Code
  // session not to end on its answer asks it to stop being one. So the rule
  // now points the other way: the last message IS the answer, and the app
  // writes it onto the row (`closingMessageIsTheAnswer`, main/supervisor.mjs),
  // which is how a copy with no store tools has always worked.
  it('makes the last message the answer and asks for no second copy on the row', () => {
    expect(shipped).toContain('THE ANSWER IS WRITTEN ONCE, AND THIS MESSAGE IS IT');
    expect(shipped).toMatch(/writes your last message onto the row/);
    expect(shipped).toMatch(/never\s+write the answer onto the row yourself/);
    // Both older demands, in any of their wordings, are gone.
    expect(shipped).not.toMatch(/already on the row, this message is not it/);
    expect(shipped).not.toContain('IF YOU ALREADY WROTE THIS ANSWER ONTO THE ROW');
    expect(shipped).not.toMatch(/THOSE SAME\s+WORDS/);
  });
});
