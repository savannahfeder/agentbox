// THE TUTORIAL LOOKS AROUND FIRST, AND ANSWERS A REPLY.
//
// Her three notes after walking the downloaded app as a new user, 2026-10-06
// (w-9f6975906c):
//
//   "hitting 'to' doesn't matter because we're in single player mode so it's
//    only ever 'to' the agent."
//   "your first task doesn't let you actually reply but forces you to do 'e'"
//   "it's hard to understand the app as a whole because it just jumps to
//    creating a new task without spending a second on the interface"
//
// What was measured by driving a throwaway new-user copy of the app end to end
// before the change: the walk went hand-off, plus, To, send, with nothing
// said about the inbox in between; the new thread card opened with an empty
// box, because it mounted one beat before the walk handed it the words; a
// reply on her first thread moved the walk on but nothing ever answered it,
// so the thread sat in In progress for the rest of the walk; and a new user's
// last screen was "No agents to bring across yet" over a ~/.claude/agents
// path. After the change, all four are gone, and the same drive goes welcome
// to landing with a reply on the way.
//
// One describe per change. Everything here is behaviour, except where the
// wording IS the behaviour (what the reply card tells her to do).

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ANCHOR, BEAT, COACHED, FLOOR, START, STEPS, advance, beatRows, coach, finishCard, readFirstRun,
  replyAnswered, replyWritten, skipStep, walkMayOpen, walkRows,
} from '../renderer/src/onboarding.ts';
import { PRACTICE_ANSWER, PRACTICE_REPLY, PRACTICE_REPLY_ANSWER, PRACTICE_SLUG } from '../shared/first-run-practice.mjs';
import { answerSettled } from '../shared/answers.mjs';
import { Store } from '../main/store.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const app = read('renderer/src/App.tsx');
const loud = (say) => `${say.lead}${say.key ?? ''}${say.tail}`;

describe('1. the beat about To is gone', () => {
  it('is not a step, not coached, and rings nothing', () => {
    expect(STEPS).not.toContain('who');
    expect(COACHED).not.toContain('who');
    expect(BEAT.who).toBeUndefined();
    expect(ANCHOR.who).toBeUndefined();
  });

  it('goes from opening the card straight to sending it', () => {
    expect(STEPS.indexOf('task')).toBe(STEPS.indexOf('make') + 1);
    expect(app).toMatch(/if \(run\?\.step !== 'make' \|\| modal !== 'compose'\) return;\s*\n\s*setRun\(\(r\) => \(r \? stepTo\(r, 'task'\) : r\)\);/);
  });

  it('resumes a walk saved on it at the send, with the card open', () => {
    const store = new Map([['zero.firstRun', JSON.stringify({ step: 'who', product: 'p', practice: 'practice' })]]);
    const run = readFirstRun({ getItem: (k) => store.get(k) ?? null, setItem() {}, removeItem() {} });
    expect(run.step).toBe('task');
  });

  it('still resumes the retired theme step at the hand-off, which `look` meant before', () => {
    const store = new Map([['zero.firstRun', JSON.stringify({ step: 'look', product: 'p' })]]);
    const run = readFirstRun({ getItem: (k) => store.get(k) ?? null, setItem() {}, removeItem() {} });
    expect(run.step).toBe('hand');
  });
});

describe('2. the card opens with the practice thread already written in it', () => {
  it('hands the card its words on the beat that opens it, not one beat later', () => {
    // The card reads `initial` once, when it mounts, and it mounts on `make`.
    expect(app).toMatch(/const walkCard = run\?\.step === 'make' \|\| run\?\.step === 'task';/);
    expect(app).toMatch(/initial=\{walkCard \? \{ body: `\$\{TASK_TITLE\}\\n\\n\$\{TASK_BODY\}` \} : composeInitial\}/);
  });
});

describe('3. a look around before the first thread', () => {
  it('is two stops between the hand-off and the plus', () => {
    expect(STEPS.slice(STEPS.indexOf('hand'), STEPS.indexOf('make') + 1)).toEqual(['hand', 'tour', 'tabs', 'make']);
    expect(advance({ ...START, step: 'hand', product: 'mine' }, { t: 'practice', product: PRACTICE_SLUG, examples: ['a'] }).step).toBe('tour');
  });

  it('rings the list and then the tabs', () => {
    expect(ANCHOR.tour[0]).toBe('.list-pane .list');
    expect(ANCHOR.tabs).toContain('.workspace-navigation .workspace-tabs');
  });

  it('says what each is in one sentence and moves on with a Next, by key or click', () => {
    for (const step of ['tour', 'tabs']) {
      const say = coach(step, 0);
      expect(say.next, step).toBe(true);
      expect(say.key, step).toBe('↵');
      expect(say.lead.split(/[.!?]\s/).length, step).toBeLessThanOrEqual(2);
    }
    expect(coach('tour', 0).quiet).toContain('inbox');
    // IN THE ORDER THE STRIP DRAWS THEM, quiet line first (2026-10-24). The
    // card named Later and Done above Needs you, which is the tab the person
    // is standing on.
    expect(coach('tabs', 0).quiet).toMatch(/Needs you[\s\S]*In progress/);
    expect(loud(coach('tabs', 0))).toMatch(/Later[\s\S]*Done/);
    // THE CASE THAT MUST NOT MATCH: no other card grows a Next.
    for (const step of COACHED.filter((s) => s !== 'tour' && s !== 'tabs')) {
      expect(coach(step, 0)?.next, step).toBeUndefined();
    }
  });

  it('stands on a practice inbox with its examples in it, and keeps them there after', () => {
    const rows = [{ id: 'a' }, { id: 'b' }, { id: 'mine' }];
    const run = { ...START, practice: PRACTICE_SLUG, examples: ['a', 'b'], item: null };
    expect(walkRows(rows, { ...run, step: 'tour' }).map((r) => r.id)).toEqual(['a', 'b']);
    expect(walkRows(rows, { ...run, step: 'open', item: 'mine' }).map((r) => r.id)).toEqual(['a', 'b', 'mine']);
  });

  it('lets ↵ on the card move the walk on and never reach the app underneath', () => {
    const card = read('renderer/src/components/Onboarding.tsx');
    expect(card).toMatch(/if \(say\.next && keyToken\(e\) === say\.key && next\.current\) \{\s*\n\s*e\.preventDefault\(\);\s*\n\s*e\.stopPropagation\(\);\s*\n\s*e\.stopImmediatePropagation\(\);\s*\n\s*next\.current\(\);/);
    expect(card).toMatch(/onNext=\{say\.next \? \(\) => go\(run\.step\) : say\.anyKey \? onShut : undefined\}/);
  });
});

describe('4. a reply on her first thread is answered', () => {
  it('tells her what to reply with, and that closing it is the other way', () => {
    const first = coach('answer', 0);
    expect(first.quiet).toContain('shorter');
    // R is the cap, the app's reply key (hers, 2026-10-06: "it's actually R to
    // reply"), and E is the beat's second key, so it is not a wrong press.
    expect(loud(first)).toBe('Press R or click the reply box to ask for that, or E to mark it done.');
    expect(first.key).toBe('R');
    expect(first.alt).toBe('E');
    // And once the change has come back, marking it done is the one thing left.
    const after = coach('answer', 0, { replies: 1 });
    expect(loud(after)).toBe('Press E to mark it done.');
    expect(coach('open', 0, { replies: 1 }).quiet).toContain('made the change');
    // The offer and the answer to it are the two practice strings.
    expect(PRACTICE_ANSWER).toContain('shorter');
    expect(PRACTICE_REPLY_ANSWER.toLowerCase()).toContain('shorter now');
  });

  it('sends it back to work from her open thread, and only from there', () => {
    const open = { ...START, step: 'answer', item: 'mine', sentAt: 1 };
    const back = advance(open, { t: 'replied', at: 50 });
    expect(back).toMatchObject({ step: 'working', sentAt: 50, replies: 1 });
    expect(advance(advance(back, { t: 'answered' }), { t: 'answered' }).step).toBe('open');
    // THE CASES THAT MUST NOT MATCH: a reply anywhere else moves nothing, and
    // a walk with no thread of its own has nothing to send back.
    for (const step of ['open', 'working', 'clear', 'unblock', 'where']) {
      const run = { ...START, step, item: 'mine' };
      expect(advance(run, { t: 'replied', at: 5 }), step).toBe(run);
    }
    const none = { ...START, step: 'answer', item: null };
    expect(advance(none, { t: 'replied', at: 5 })).toBe(none);
  });

  it('knows a reply is in, and when it has been answered, off the ledger stamps', () => {
    const stamped = (answer, result) => ({ wrote: { answer: answer && { ts: answer }, result: result && { ts: result } } });
    expect(replyWritten(stamped(20, 10))).toBe(true);
    expect(replyAnswered(stamped(20, 10))).toBe(false);
    expect(replyWritten(stamped(20, 30))).toBe(false);
    expect(replyAnswered(stamped(20, 30))).toBe(true);
    // A row nobody has replied to is neither, whatever its result says.
    expect(replyWritten(stamped(0, 10))).toBe(false);
    expect(replyAnswered(stamped(0, 10))).toBe(false);
  });

  it('writes the reply at once in the walk, rather than after the undo window', () => {
    const fn = app.slice(app.indexOf('const answerWith = useCallback'), app.indexOf('A LIVE CORRECTION IS HELD'));
    expect(fn).toMatch(/runRef\.current\?\.step === 'answer' && runRef\.current\.item === item\.id/);
    expect(fn).toMatch(/await api\.answer\(/);
    expect(fn).toMatch(/fire\(\{ t: 'replied', at: Date\.now\(\) \}\)/);
  });

  it('picks her own thread on the beat that opens it, wherever the list put it', () => {
    expect(app).toMatch(/const walkOpenAt = run\?\.step === 'open' && run\.item \? list\.findIndex\(\(i\) => i\.id === run\.item\) : -1;/);
    // And ↵ aimed at an example on that beat is the wrong row.
    const rows = [{ id: 'ex' }, { id: 'mine' }];
    expect(beatRows('open', { ...START, step: 'open', item: 'mine', examples: ['ex'] }, rows, -1, -1)).toEqual(['mine']);
  });

  // MEASURED IN THE BUILT APP BEFORE THIS LINE EXISTED: the shorter answer was
  // written and the row stayed in In progress, because a reply only counts as
  // answered once the supervisor has marked it delivered, and in the practice
  // project no session ever runs to mark it.
  it('answers it in the store, settled, so it comes back to Needs you rather than sitting in In progress', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reply-answered-'));
    const home = process.env.ASTRAL_HOME;
    process.env.ASTRAL_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'reply-answered-home-'));
    try {
      const store = new Store({ accountRoot: dir, products: [], personalProducts: [] });
      await store.init();
      store.watch = () => {};
      const made = store.createPractice();
      const item = store.fileItem(made.slug, { title: 'Add a summary', kind: 'task', labels: ['first-run'] });
      store.finishFirstRunTask(made.slug, item.id);
      store.answerItem(made.slug, item.id, { answer: 'Make it shorter, please.' });
      const before = store.readItem(made.slug, item.id);
      expect(replyWritten(before)).toBe(true);
      expect(answerSettled(before)).toBe(false);
      store.finishFirstRunTask(made.slug, item.id, 1);
      const after = store.readItem(made.slug, item.id);
      expect(after.result).toBe(PRACTICE_REPLY_ANSWER);
      expect(replyAnswered(after)).toBe(true);
      expect(answerSettled(after)).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
      if (home === undefined) delete process.env.ASTRAL_HOME; else process.env.ASTRAL_HOME = home;
    }
  });
});

describe('4b. the tutorial page can be skipped from the page itself', () => {
  // Her words, 2026-10-06: "this is a tutorial page. Add a skip button,
  // obviously a secondary button, so it is not as focused."
  it('draws a quiet Skip under Start, wired to the same exit as the corner Skip', () => {
    const card = read('renderer/src/components/Onboarding.tsx');
    const css = read('renderer/src/styles.css');
    expect(card).toMatch(/skip=\{COPY\.handSkip\}\s*\n\s*onSkip=\{onLeave\}/);
    expect(card).toMatch(/className="fr-finish-skip" onClick=\{onSkip\}/);
    expect(app).toMatch(/onLeave=\{\(\) => finishRun\(\[\], \{ celebrate: false \}\)\}/);
    // Secondary: no border and no fill, unlike Start.
    const rule = css.slice(css.indexOf('.fr-finish-skip {'), css.indexOf('}', css.indexOf('.fr-finish-skip {')));
    expect(rule).toMatch(/border: 0/);
    expect(rule).toMatch(/background: none/);
  });
});

describe('4c. R replies, and the reply is written in when the box opens', () => {
  // Hers, 2026-10-06: "it's actually R to reply (and when they do that or
  // click the inbox have it auto-write something)". MEASURED in the built app
  // before this: the card's only key was E, so R was answered as a wrong press;
  // and a reply saved before the thread opened made the box open focused, so R
  // typed into it ("rMake it shorter, please.").
  it('writes the reply in when the box opens on her first answer, not before', () => {
    expect(PRACTICE_REPLY).toBe('Make it shorter, please.');
    expect(app).toMatch(/if \(run\?\.step !== 'answer' \|\| run\.replies \|\| !run\.item \|\| modal !== 'reply'\) return;/);
    expect(app).toMatch(/if \(restoreDraft\(ref, PRACTICE_REPLY\)\) window\.dispatchEvent\(new CustomEvent\('zero:reply-restored'/);
    // THE CASE THAT MUST NOT MATCH: nothing is written on the beat before it.
    expect(app).not.toMatch(/run\?\.step !== 'open' \|\| run\.replies/);
  });

  it('lets E through as the second key rather than a wrong one', () => {
    const card = read('renderer/src/components/Onboarding.tsx');
    expect(card).toMatch(/if \(say\.alt && keyToken\(e\) === say\.alt\) return;/);
  });
});

describe('4g. every card has a quiet Skip this step, and every skip moves on', () => {
  // Hers, 2026-10-06: "make sure there's a way to bypass each step, for
  // instance, a very subtle little button on each card that allows you to skip
  // it, because we keep getting stuck here and losing those users." Driven in
  // the built app: Skip clicked on every card from the look around to ⌘K went
  // tour, tabs, make, clear, snooze, unblock, where, board, command and landed.
  const run = {
    ...START, practice: PRACTICE_SLUG, item: 'mine', examples: ['done-1', 'done-2', 'later', 'stuck'],
  };
  const rows = run.examples.map((id) => ({ id }));
  const skip = (step) => skipStep({ ...run, step }, rows, 3, 2);

  it('moves the look around and the tour beats to the next one', () => {
    expect(skip('tour').step).toBe('tabs');
    expect(skip('tabs').step).toBe('make');
    expect(skip('where').step).toBe('board');
    expect(skip('board').step).toBe('command');
  });

  it('takes her own thread off and goes to clearing, from any of its five beats', () => {
    for (const step of ['make', 'task', 'working', 'open', 'answer']) {
      const next = skip(step);
      expect(next.step, step).toBe('clear');
      expect(next.hidden, step).toEqual(['mine']);
    }
  });

  it('hides the rows a row beat is about, so its own check moves it on', () => {
    expect(skip('clear').hidden).toEqual(['done-1', 'done-2']);
    expect(skip('snooze').hidden).toEqual(['later']);
    expect(skip('unblock').hidden).toEqual(['stuck']);
    // And the walk's lists stop drawing them.
    expect(walkRows(rows, { ...skip('clear'), step: 'snooze' }).map((r) => r.id)).toEqual(['later', 'stuck']);
    // THE CASE THAT MUST NOT MATCH: the last beat is the app's to end.
    expect(skipStep({ ...run, step: 'command' }, rows, 3, 2)).toBeNull();
  });

  it('draws the button on the card and wires it to the app', () => {
    const card = read('renderer/src/components/Onboarding.tsx');
    expect(card).toMatch(/\{onSkip \? <button type="button" className="fr-skip-step" onClick=\{onSkip\}>Skip this step<\/button> : null\}/);
    expect(card).toMatch(/onSkip=\{onSkipStep\}/);
    expect(app).toMatch(/const next = skipStep\(r, inbox, WAITING_AT, LATER_AT\);/);
    expect(app).toMatch(/if \(afterCommand\(r\) === 'end'\) \{ finishRun\(\[\], \{ practised: true \}\); return; \}\s*\n\s*setRun\(stepTo\(r, 'done'\)\);/);
    const css = read('renderer/src/styles.css');
    const rule = css.slice(css.indexOf('.fr-tether .fr-skip-step {'), css.indexOf('}', css.indexOf('.fr-tether .fr-skip-step {')));
    expect(rule).toMatch(/pointer-events: auto/);
    expect(rule).toMatch(/color: var\(--text-dim\)/);
  });
});

describe('4f. a thread opened too early never leaves the walk stuck', () => {
  // Hers, 2026-10-06, with a picture of "Write the agenda for the offsite."
  // open under a card saying press Return to open her own: "I clicked into a
  // page prematurely and got stuck here, and the return isn't doing anything.
  // We want to prevent users from being able to get stuck." Driven in the
  // built app after the fix: a click on an example during the look around opens
  // nothing; a running thread clicked while hers runs is closed at once; and on
  // the beat that opens hers, Return opens hers with the pointer on an example.
  it('lets a thread be open only where the beat is about it', () => {
    const run = (step) => ({ step, item: 'mine' });
    expect(walkMayOpen(run('open'), 'mine', 'stuck')).toBe(true);
    expect(walkMayOpen(run('answer'), 'mine', 'stuck')).toBe(true);
    expect(walkMayOpen(run('unblock'), 'stuck', 'stuck')).toBe(true);
    // THE CASES THAT MUST NOT MATCH.
    expect(walkMayOpen(run('open'), 'example', 'stuck')).toBe(false);
    expect(walkMayOpen(run('unblock'), 'mine', 'stuck')).toBe(false);
    for (const step of ['tour', 'tabs', 'make', 'task', 'working', 'clear', 'snooze', 'where', 'board', 'command']) {
      expect(walkMayOpen(run(step), 'mine', 'stuck'), step).toBe(false);
    }
    expect(app).toMatch(/if \(walkMayOpen\(run, focused\.id, waitingId\(run, WAITING_AT\)\)\) return;\s*\n\s*setFocused\(null\);/);
  });

  // AND THE SAME FOR E AND L ON THE ROW BEATS, hers, 2026-10-06, with the ring
  // on the contact list and the pointer on the budget row: "It got stuck here
  // even though I'm hitting E". Driven after the fix: E closed the ringed row
  // twice with the pointer resting on the budget row, and E on the budget row's
  // own beat was still refused.
  it('aims the beat\'s key at the ringed row wherever the pointer is, unless it rests on another right row', () => {
    expect(app).toMatch(/const walkAim = run\?\.step === 'open' && run\.item\s*\n\s*\? run\.item\s*\n\s*: walkBeat\.length \? \(hoveredId && walkBeat\.includes\(hoveredId\) \? hoveredId : walkBeat\[0\]\) : null;/);
    expect(app).toMatch(/const walkOwn = walkAim \? list\.find\(\(i\) => i\.id === walkAim\) : undefined;/);
    expect(app).toMatch(/const pointed: WorkItem \| undefined = walkOwn\s*\n\s*\?\? \(hoveredId/);
  });

  it('holds every click on the app while a look-around card is up, and nudges its Next', () => {
    const card = read('renderer/src/components/Onboarding.tsx');
    expect(card).toMatch(/lookOnly\.current = !!say\.next;/);
    expect(card).toMatch(/const stray = lookOnly\.current\s*\n\s*\? !!el && typeof el\.closest === 'function' && !el\.closest\(NOT_THE_APP\) && pressCounts\(el\)\s*\n\s*: strayClick\(e\.target, live\);/);
  });
});

describe('4e. with the reply box open, the card asks to send it, not for R', () => {
  // Hers, 2026-10-06, with a picture of "Make it shorter, please.r": "If I type
  // R here, it just adds R to the input field rather than actually moving to
  // the next step." The card kept saying "Press R" over an open, focused box.
  // Driven in the built app after the fix: opened by R, by a click, and still
  // open after Escape, the card says ⌘↵, and ⌘↵ sends it back to work.
  it('switches to ⌘↵ and Send once the box is open, and back is not needed', () => {
    const open = coach('answer', 0, { replying: true });
    expect(open.key).toBe('⌘↵');
    expect(loud(open)).toBe('Press ⌘↵ or click Send to ask for it.');
    expect(open.alt).toBeUndefined();
    // THE CASE THAT MUST NOT MATCH: closed, it still names R; after a reply,
    // marking it done wins whatever the box is doing.
    expect(coach('answer', 0).key).toBe('R');
    expect(coach('answer', 0, { replying: true, replies: 1 }).key).toBe('E');
  });

  it('reads the open box off the app and off where the typing cursor is', () => {
    const card = read('renderer/src/components/Onboarding.tsx');
    expect(app).toMatch(/replying=\{modal === 'reply'\}/);
    expect(card).toMatch(/replying: !!replying \|\| inReply/);
    expect(card).toMatch(/el\.closest\('\.focus-dock'\)/);
  });

  it('keeps the corner Skip in the strip under the sidebar, clear of Settings and of the edge', () => {
    // Measured in the built app at 1440x900: Skip 878 to 900, Settings 838 to
    // 874. It was 38 tall from 14 up and sat on Settings.
    // AND OFF THE WINDOW'S OWN EDGE SINCE 2026-10-24. At bottom 0 the word sat
    // on the bottom edge with its descenders 4px off it, reported from the QA
    // box; FLOOR is what everything else the walk draws is held off an edge by,
    // and Settings above it still clears the word by 8.
    const css = read('renderer/src/styles.css');
    const rule = css.slice(css.indexOf('.fr-out {'), css.indexOf('}', css.indexOf('.fr-out {')));
    expect(rule).toMatch(/bottom: 10px; height: 22px;/);
    expect(FLOOR).toBe(10);
  });
});

describe('4d. on the ⌘K list any key or click finishes, and runs nothing', () => {
  // Hers, 2026-10-06: "i keep accidentally hitting these commands like making a
  // new project in tutorial. it should just respond with any key to moving to
  // the next step". Driven in the built app: N on the open list ended the
  // tutorial and no New project card opened.
  it('says so on the card and takes any key, even inside the list\'s own field', () => {
    const open = coach('command', 0, { palette: true });
    expect(open.anyKey).toBe(true);
    expect(`${open.lead}${open.tail}`).toBe('Press any key to finish.');
    const card = read('renderer/src/components/Onboarding.tsx');
    expect(card).toMatch(/if \(\['Meta', 'Shift', 'Alt', 'Control', 'CapsLock'\]\.includes\(e\.key\)\) return;\s*\n\s*move\(e\);/);
    expect(card).toMatch(/el\.closest\('\.modal\.palette'\)\) move\(e\);/);
    expect(app).toMatch(/onShut=\{\(\) => setModal\(null\)\}/);
    // THE CASE THAT MUST NOT MATCH: the half before the list opens still
    // wants ⌘K and nothing else.
    expect(coach('command', 0).anyKey).toBeUndefined();
    expect(coach('command', 0).key).toBe('⌘K');
  });
});

describe('5. a new user is not told they have no agents', () => {
  it('goes straight to the landing when there is nothing to bring in', () => {
    expect(finishCard({ missing: false }, { read: true, some: false })).toMatchObject({ show: false, skip: true });
    // THE CASES THAT MUST NOT MATCH: agents found still get the card, and a
    // Mac with no Claude Code is still stopped.
    expect(finishCard({ missing: false }, { read: true, some: true })).toMatchObject({ show: true, blocked: false });
    expect(finishCard({ missing: true }, { read: true, some: false })).toMatchObject({ show: true, blocked: true });
  });
});

describe('6. the board and the tab tour end where they should', () => {
  it('keeps the board up under its own card until B takes it back to the list', () => {
    expect(loud(coach('board', 0, { board: true }))).toBe('Press B again to go back to the list.');
    expect(app).toMatch(/if \(!boardSeen\.current\) return;/);
  });

  // ROUND TWO: the look around names all four tabs before the first thread, so
  // the tour after inbox zero is one stop, In progress, where the agent she
  // answered is working. Every persona tester and Codex named the five presses
  // of Tab as the longest stretch of the walk.
  it('makes In progress the tab tour\'s one stop, and never All', () => {
    expect(app).toMatch(/if \(view === 'progress'\) \{ toured\.current\.add\(view\); return; \}\s*\n\s*if \(!toured\.current\.has\('progress'\)\) return;/);
    expect(loud(coach('where', 0, { view: 'progress', tabs: ['inbox', 'progress', 'snoozed', 'done', 'all'] }))).toBe('Press ⇥ or click another tab to go on.');
    // Still the payoff on that stop: the agent she answered, working.
    expect(coach('where', 0, { view: 'progress' }).quiet).toBe('The agent you answered is here, working without you.');
    // And the look around is where Later and Done are said now, on its loud
    // line, under the quiet one naming the two tabs before them.
    expect(loud(coach('tabs', 0))).toMatch(/Later[\s\S]*Done/);
  });
});
