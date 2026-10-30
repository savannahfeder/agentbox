// THE FIRST RUN STARTS ON REAL WORK (w-fadbbea8ef, 2026-10-26).
//
// What broke: of 115 installs, 72% replied to an agent during setup, but those
// replies went to the practice tasks; only 17 sent three replies to real agents
// on their first day. The new first run (components/FirstRun.tsx) skips the
// practice round and goes from your own folders and your own Claude Code chats
// to a first real task.
//
// These are its rules, which have no window in them:
//  - Enter ticks the row you are on and ⌘↵ (Ctrl+Enter) moves on. The founder,
//    on the folder screen: "Everyone would assume that Enter selects and
//    deselects a folder", and ⌘↵ is the key "when you're doing multiple things".
//  - The folders offered are the ones your agents already ran in, busiest first,
//    never the home folder or a folder macOS guards.
//  - The chats offered are the newest in the folders you picked, never one that
//    is already in the inbox.
//  - The chats step is skipped when there is nothing to bring in.
//
// Round six, after the founder tried it in a fresh window:
//  - "why is it a requirement that we have them bring in the projects?" It was
//    not. A chat already runs in its own folder, so bringing it in makes that
//    folder's project with nobody asked, and the folder step is gone.
//  - The ideas named the project, so a folder called after a person read
//    "Explain how <their first name> is put together". They name nothing now.
//  - Sending the first task left them on "Add another while it works" with a
//    quiet "Open my inbox" beside Send: "I got kind of stuck here". Sending
//    now lands in the inbox, on In progress, with that task picked.
//  - That folder was the tester's own home folder. The fresh window runs with
//    a throwaway home, so the home check missed it; any user's home is refused.
//
// Round seven: the founder wanted ideas "people would really want to click on
// and say, 'Hey I don't actually have that running'", such as a QA agent that
// tests the app and flags bugs. After the ideas were seen drawn: a look at the
// code first ("start small"), then three jobs that keep running, with the
// week's changes reviewed rather than the day's ("not sure I'm a fan"). A
// repeating idea's first run starts at once, and the first run ends on it.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { listKey, folderChoices, chatChoices, chatsHeadline, projectsToMake, stepsFor, ideasFor, landing, firstRunOf } from '../renderer/src/first-run.ts';
import { isRepeatRule } from '../shared/repeats.mjs';
import { Store } from '../main/store.mjs';

const key = (k, mods = {}) => ({ key: k, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...mods });

describe('the keys on a list screen', () => {
  it('Enter ticks or unticks the row you are on', () => {
    expect(listKey(key('Enter'))).toBe('toggle');
  });
  it('Command or Control with Enter moves on', () => {
    expect(listKey(key('Enter', { metaKey: true }))).toBe('next');
    expect(listKey(key('Enter', { ctrlKey: true }))).toBe('next');
  });
  it('Shift or Option with Enter does neither', () => {
    expect(listKey(key('Enter', { shiftKey: true }))).toBe(null);
    expect(listKey(key('Enter', { altKey: true }))).toBe(null);
  });
  it('Space is not the tick any more', () => {
    expect(listKey(key(' '))).toBe(null);
  });
  it('the arrows move and Escape skips', () => {
    expect(listKey(key('ArrowUp'))).toBe('up');
    expect(listKey(key('ArrowDown'))).toBe('down');
    expect(listKey(key('Escape'))).toBe('skip');
  });
  it('Tab does nothing, with no folder left to rename', () => {
    expect(listKey(key('Tab'))).toBe(null);
  });
});

const HOME = '/Users/you';
const thread = (folder, when, extra = {}) => ({
  id: `t-${folder}-${when}`, source: 'terminal', folder, folderName: folder.split('/').pop(),
  short: folder.replace(HOME, '~'), title: `chat in ${folder} at ${when}`, when, path: `${folder}/${when}.jsonl`, ...extra,
});

describe('the folders offered', () => {
  const threads = [
    thread(`${HOME}/dev/northwind`, 50), thread(`${HOME}/dev/northwind`, 40), thread(`${HOME}/dev/northwind`, 30),
    thread(`${HOME}/dev/website`, 90),
    thread(`${HOME}/dev/api`, 20), thread(`${HOME}/dev/api`, 10),
    thread(HOME, 99),
    thread(`${HOME}/Downloads`, 98),
    thread('', 97),
  ];
  const got = folderChoices(threads, { home: HOME });

  it('are where your chats ran, busiest first, newest breaking a tie', () => {
    expect(got.map((f) => f.short)).toEqual(['~/dev/northwind', '~/dev/api', '~/dev/website']);
    expect(got.map((f) => f.chats)).toEqual([3, 2, 1]);
  });
  it('are named the way a person would name the project', () => {
    expect(got[0].name).toBe('Northwind');
    expect(folderChoices([thread(`${HOME}/dev/agentbox-v2`, 1)], { home: HOME })[0].name).toBe('Agentbox V2');
  });
  it('never offer the home folder, a guarded folder or a chat with no folder', () => {
    const shorts = got.map((f) => f.short);
    expect(shorts).not.toContain('~');
    expect(shorts).not.toContain('~/Downloads');
    expect(got).toHaveLength(3);
  });
  it('stop at five', () => {
    const many = Array.from({ length: 9 }, (_, i) => thread(`${HOME}/dev/p${i}`, i));
    expect(folderChoices(many, { home: HOME })).toHaveLength(5);
  });
  it('still read as ~/ and still refuse a guarded folder before the app knows the home folder', () => {
    const early = folderChoices(threads, { home: '' });
    expect(early.map((f) => f.short)).toEqual(['~/dev/northwind', '~/dev/api', '~/dev/website']);
  });
  it('never offer another user\'s home folder, which is what a window with a throwaway home sees', () => {
    const elsewhere = [thread('/Users/someone', 5, { short: '/Users/someone' }), thread('/home/someone', 4, { short: '/home/someone' }), thread('/Users/someone/dev/app', 3, { short: '/Users/someone/dev/app' })];
    expect(folderChoices(elsewhere, { home: '/tmp/fresh-home' }).map((f) => f.folder)).toEqual(['/Users/someone/dev/app']);
  });
  it('count each chat once even when a folder is written with a trailing slash', () => {
    const two = [thread(`${HOME}/dev/x`, 1), { ...thread(`${HOME}/dev/x/`, 2), folder: `${HOME}/dev/x/` }];
    expect(folderChoices(two, { home: HOME })).toEqual([expect.objectContaining({ chats: 2 })]);
  });
});

describe('the chats offered', () => {
  const threads = [
    thread(`${HOME}/dev/northwind`, 10), thread(`${HOME}/dev/northwind`, 30),
    thread(`${HOME}/dev/northwind`, 20, { imported: true }),
    thread(`${HOME}/dev/website`, 40),
    thread(HOME, 99),
    thread(`${HOME}/Downloads`, 98),
    thread('', 97),
  ];
  const got = chatChoices(threads, { home: HOME });
  it('are the newest from every folder, with no folder to pick first', () => {
    expect(got.map((t) => t.when)).toEqual([40, 30, 10]);
  });
  it('leave out a chat already in the inbox', () => {
    expect(got.some((t) => t.imported)).toBe(false);
  });
  it('leave out a chat whose folder cannot be a project, since it would have nowhere to run', () => {
    expect(got.map((t) => t.folder)).not.toContain(HOME);
    expect(got.map((t) => t.folder)).not.toContain(`${HOME}/Downloads`);
    expect(got.map((t) => t.folder)).not.toContain('');
  });
  it('stop at eight', () => {
    const many = Array.from({ length: 12 }, (_, i) => thread(`${HOME}/dev/n`, i));
    expect(chatChoices(many, { home: HOME })).toHaveLength(8);
  });
});

describe('the projects a press makes', () => {
  const chats = [thread(`${HOME}/dev/northwind`, 3), thread(`${HOME}/dev/northwind/`, 2), thread(`${HOME}/dev/api`, 1)];
  it('are one per folder the chats ran in, named after the folder', () => {
    expect(projectsToMake(chats, [])).toEqual([
      { folder: `${HOME}/dev/northwind`, name: 'Northwind' },
      { folder: `${HOME}/dev/api`, name: 'API' },
    ]);
  });
  it('leave out a folder a project already points at', () => {
    const products = [{ slug: 'api', name: 'Api', repoPath: `${HOME}/dev/api/` }];
    expect(projectsToMake(chats, products).map((p) => p.folder)).toEqual([`${HOME}/dev/northwind`]);
  });
  it('take a free name when one is taken by another folder', () => {
    const products = [{ slug: 'northwind', name: 'Northwind', repoPath: '/elsewhere/northwind' }];
    expect(projectsToMake(chats, products)[0].name).toBe('Northwind 2');
  });
  it('give two folders with one name two names', () => {
    const two = [thread(`${HOME}/a/api`, 2), thread(`${HOME}/b/api`, 1)];
    expect(projectsToMake(two, []).map((p) => p.name)).toEqual(['API', 'API 2']);
  });
});

describe('the steps', () => {
  it('are the chats, a first task and its project when there are chats to bring in', () => {
    expect(stepsFor({ chats: 3 })).toEqual(['chats', 'task', 'where']);
  });
  it('are the first task and its project when there are none', () => {
    expect(stepsFor({ chats: 0 })).toEqual(['task', 'where']);
  });
});

describe('where the first run ends', () => {
  it('is In progress, on the task just sent', () => {
    expect(landing('w-1')).toEqual({ view: 'progress', select: 'w-1' });
  });
  it('is Needs you when no task was sent', () => {
    expect(landing(null)).toEqual({ view: 'inbox', select: null });
  });
});

describe('the words', () => {
  it('name the agent the chats came from, and neither when they came from both', () => {
    expect(chatsHeadline([{ source: 'terminal' }, { source: 'desktop' }])).toBe('Bring in your latest Claude Code chats');
    expect(chatsHeadline([{ source: 'codex' }])).toBe('Bring in your latest Codex chats');
    expect(chatsHeadline([{ source: 'codex' }, { source: 'editor' }])).toBe('Bring in your latest chats');
  });
  it('never name the project, which can be called anything', () => {
    for (const idea of ideasFor()) expect(idea.text.slice(1)).toBe(idea.text.slice(1).toLowerCase());
  });
});

describe('the first task ideas', () => {
  const ideas = ideasFor();
  it('start small, with a look at the code that runs once', () => {
    expect(ideas[0]).toEqual({ text: 'Explain how this project is put together' });
  });
  it('then a QA agent that tests the app every morning', () => {
    expect(ideas[1]).toMatchObject({ text: 'Test the app and flag what’s broken', repeat: { every: 'day', at: '08:00', short: 'Every morning' } });
  });
  it('then a review of the week, not the day, and a security check', () => {
    expect(ideas.map((i) => i.text)).toEqual([
      'Explain how this project is put together',
      'Test the app and flag what’s broken',
      'Review the week’s changes for bugs',
      'Check for security holes and outdated packages',
    ]);
    expect(ideas.some((i) => /day’s changes/.test(i.text))).toBe(false);
  });
  it('keep a schedule the app can keep, said in the words of its own repeat menu', () => {
    const repeating = ideas.filter((i) => i.repeat);
    for (const { repeat } of repeating) expect(isRepeatRule(repeat)).toBe(true);
    expect(repeating.map((i) => i.repeat.label)).toEqual(['Every morning at 8:00am', 'Every Friday at 4:00pm', 'Every Monday at 9:00am']);
    expect(repeating.map((i) => i.repeat.on)).toEqual([undefined, 5, 1]);
  });
});

describe('the run a new repeating task starts with', () => {
  let root, store;
  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'first-run-'));
    const dir = path.join(root, 'p');
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'p', name: 'P' }));
    store = await new Store({ accountRoot: root, products: [] }).init();
  });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  for (const idea of ideasFor().filter((i) => i.repeat)) {
    it(`is the row the store makes for "${idea.text}", whatever the hour`, async () => {
      const { short: _s, label: _l, ...rule } = idea.repeat;
      const made = store.composeRepeat('p', { title: idea.text, ...rule });
      for (const hour of [1, 8, 13, 23]) {
        const now = new Date(2026, 9, 26, hour, 30).getTime();
        const [due] = store.repeats.due(store.productDir('p'), now);
        expect(firstRunOf(made, now)).toBe(due.key && (await store.repeats.serve(store.productDir('p'), made.id, due.key, now)).occurrenceId);
        store.endRepeat('p', made.id);
        Object.assign(made, store.composeRepeat('p', { title: idea.text, ...rule }));
      }
    });
  }
});
