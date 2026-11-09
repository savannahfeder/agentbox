// A PERMISSION CARD SAYS WHO ASKS AND WHAT, IN WORDS, AND ANSWERS TO ⌘1 / ⌘2
// (w-78be9e67e8, design picked 2026-11-08).
//
// What was hard to read, photographed on the built renderer in seven cases:
// the heading was the agent's sentence on one card and "<thread> asks to run"
// on the next, so a thread name read as a command; reading a .env file said
// "asks to run"; the folder came out as "/Users/sam/Desktop/d…"; a plugin
// tool's values were raw JSON; a patch was an uncoloured diff broken mid-word;
// the tool name sat beside the buttons and wrapped onto two lines; nothing said
// whether Claude Code or Codex was asking. And ⌘Y / ⌘N were not keys anyone
// guessed. Plain 1 and 2 could not be used: in a thread they pick an option,
// on the inbox they answer an import row, so a card arriving under a hand
// would take a 1 meant for the thread as a yes.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { approvalView, folderWords, UNREADABLE } from '../renderer/src/approval-card.ts';
import { cardChord } from '../renderer/src/approval-stage.ts';
import { CARD_SETTLES_MS, chordLands } from '../shared/card-settles.mts';

const root = path.resolve(import.meta.dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

describe('what it wants, in words', () => {
  it('takes the agent’s own description, and says "Run a command" without one', () => {
    expect(approvalView({ command: 'npx vitest run a.test.mjs', description: 'Run the phone sign-in test' }, 'Bash'))
      .toMatchObject({ title: 'Run the phone sign-in test', body: { kind: 'text', text: 'npx vitest run a.test.mjs' } });
    expect(approvalView({ command: 'rm -rf node_modules' }, 'Bash').title).toBe('Run a command');
  });

  it('says Read for a file it asks to read, never "run"', () => {
    expect(approvalView({ file_path: '/Users/sam/dev/app/.env.local' }, 'Read'))
      .toMatchObject({ title: 'Read .env.local', body: { text: '/Users/sam/dev/app/.env.local' } });
  });

  it('names a host it asks to reach when there is no command', () => {
    expect(approvalView({ host: 'drive.google.com over https' }).title).toBe('Reach drive.google.com over https');
  });

  it('draws a one-file change as coloured lines with the counts, under its file name', () => {
    const v = approvalView({ changes: 'Edit /r/src/math.js\n@@ -1,2 +1,2 @@\n a\n-b\n+c\n+d' }, 'Edit');
    expect(v.title).toBe('Change math.js');
    expect(v.where).toBe('In /r/src');
    expect(v.body).toMatchObject({ kind: 'diff', added: 2, removed: 1 });
    expect(v.body.lines.map((l) => l.mark)).toEqual(['same', 'del', 'add', 'add']);
    expect(v.body.lines.some((l) => l.text.startsWith('Edit '))).toBe(false);
  });

  it('says Write, Delete and Move for those, and counts the files when there are several', () => {
    expect(approvalView({ changes: 'Write /r/notes.txt\nhello' }).title).toBe('Write notes.txt');
    expect(approvalView({ changes: 'Delete /r/gone.txt\nold' }).title).toBe('Delete gone.txt');
    expect(approvalView({ changes: 'Move /r/old.txt -> /r/new.txt' }).title).toBe('Move old.txt to new.txt');
    const two = approvalView({ changes: 'Write /r/a.txt\na\n\nDelete /r/b.txt\nb' });
    expect(two.title).toBe('Change 2 files');
    expect(two.body.lines.filter((l) => l.mark === 'head').map((l) => l.text)).toEqual(['Write /r/a.txt', 'Delete /r/b.txt']);
  });

  it('shows a plugin tool’s values as labelled lines, not JSON', () => {
    const v = approvalView({ id: 'w-1', labels: ['founder', 'ship'], note: 'Labelled ship.', opts: { a: 1 } }, 'mcp__agentbox__update_work_item');
    expect(v.title).toBe('Use update work item in Agentbox');
    expect(v.where).toBe('With the Agentbox tool update_work_item');
    expect(v.body.rows).toEqual([['id', 'w-1'], ['labels', 'founder, ship'], ['note', 'Labelled ship.'], ['opts', '{\n  "a": 1\n}']]);
  });

  it('shows a value with a hidden character escaped, so a yes is about what it says', () => {
    expect(approvalView({ cmd: 'ls\u0007' }, 'mcp__s__t').body.rows).toEqual([['cmd', '"ls\\u0007"']]);
    expect(approvalView({ cmd: 'line one\nline two' }, 'mcp__s__t').body.rows).toEqual([['cmd', 'line one\nline two']]);
  });

  it('says it could not read a request it cannot read', () => {
    expect(approvalView(null, 'mcp__s__t').body).toEqual({ kind: 'text', text: UNREADABLE });
    expect(approvalView({ x: () => 1 }, 'mcp__s__t').body).toEqual({ kind: 'text', text: UNREADABLE });
    expect(approvalView({}, 'Bash').body).toEqual({ kind: 'text', text: UNREADABLE });
  });
});

describe('where, as a person names it', () => {
  it('calls a thread’s task folder its copy of the repository', () => {
    expect(folderWords('/Users/sam/dev/agentbox-team/.claude/worktrees/w-1f2e3d4c5b')).toBe('In this thread’s copy of agentbox-team');
  });
  it('writes the home folder as ~ and leaves any other path whole', () => {
    expect(folderWords('/Users/sam/Desktop/dev/app')).toBe('In ~/Desktop/dev/app');
    expect(folderWords('/home/sam')).toBe('In ~');
    expect(folderWords('/tmp/ab-serve')).toBe('In /tmp/ab-serve');
  });
  // Power test round one: "In /tmp/agentbox-verify/instances/3f5fdf16-power-founder/repos/webs…"
  // lost the end, which is the part that says where.
  it('keeps the end of a long folder, which is the part that says where', () => {
    expect(folderWords('/tmp/agentbox-verify/instances/3f5fdf16-power-founder/repos/website')).toBe('In …/repos/website');
    expect(folderWords('/Users/sam/Desktop/dev/agentbox-team/renderer/src/threads')).toBe('In ~/Desktop/dev/agentbox-team/renderer/src/threads');
    expect(folderWords('/Users/sam/work/clients/northwind/infrastructure/terraform/modules/network')).toBe('In …/modules/network');
  });
});

describe('⌘1 allows and ⌘2 denies, and never in the card’s first moment', () => {
  const key = (k, o = {}) => ({ key: k, metaKey: true, ctrlKey: false, altKey: false, shiftKey: false, ...o });
  const long = 10_000;
  it('answers ⌘1, ⌘2, Ctrl on other keyboards, and the old ⌘Y / ⌘N', () => {
    expect(cardChord(key('1'), 'c', 0, long)).toEqual({ id: 'c', allow: true });
    expect(cardChord(key('2'), 'c', 0, long)).toEqual({ id: 'c', allow: false });
    expect(cardChord(key('1', { metaKey: false, ctrlKey: true }), 'c', 0, long)).toEqual({ id: 'c', allow: true });
    expect(cardChord(key('y'), 'c', 0, long)).toEqual({ id: 'c', allow: true });
    expect(cardChord(key('n'), 'c', 0, long)).toEqual({ id: 'c', allow: false });
  });
  it('never takes a plain 1 or 2, which belong to the thread and the inbox', () => {
    expect(cardChord(key('1', { metaKey: false }), 'c', 0, long)).toBe(null);
    expect(cardChord(key('3'), 'c', 0, long)).toBe(null);
    expect(cardChord(key('1', { shiftKey: true }), 'c', 0, long)).toBe(null);
  });
  it('takes nothing until the card has been up for a moment', () => {
    expect(chordLands(1000, 1000 + CARD_SETTLES_MS - 1)).toBe(false);
    expect(chordLands(1000, 1000 + CARD_SETTLES_MS)).toBe(true);
    expect(chordLands(null, 0)).toBe(true);
    expect(cardChord(key('1'), 'c', 1000, 1000 + CARD_SETTLES_MS - 1)).toBe(null);
  });
  it('is answered the same way in the main process, ahead of the page', () => {
    const main = read('main/main.mts');
    const handler = main.slice(main.indexOf('const allow = CHORD_ANSWERS[key];'), main.indexOf('ipc.answerApproval(front.id, allow);'));
    expect(handler).toContain('if (!chordLands(ipc.cardSentAt(front.id), Date.now())) return;');
    const menu = read('main/menu.mts');
    expect(menu).toContain("accelerator: 'CommandOrControl+1', click: () => onApproval?.(true)");
    expect(menu).toContain("accelerator: 'CommandOrControl+2', click: () => onApproval?.(false)");
  });
});

describe('the card', () => {
  const app = read('renderer/src/App.tsx');
  const card = app.slice(app.indexOf('const view = approvalView(a.input, a.tool);'), app.indexOf("{modal === 'snooze' && snoozeItem && ("));
  it('names the agent and the thread first, and opens the thread from there', () => {
    expect(card).toContain("harnessOf(row) === 'codex' ? 'Codex' : 'Claude Code'");
    expect(card.indexOf('approval-from')).toBeLessThan(card.indexOf('approval-lede'));
    expect(card).toContain('onClick={() => openApprovalRow(a.item)}');
  });
  it('puts each key inside its button, after the word, with no hint line beside them', () => {
    expect(card).toContain("Allow<span className=\"approval-key\">{chord('⌘1')}</span>");
    expect(card).toContain("Deny<span className=\"approval-key\">{chord('⌘2')}</span>");
    expect(card).not.toContain('approval-hint');
    const css = read('renderer/src/styles.css');
    expect(/\.approval-key \{[^}]*\}/.exec(css)[0]).not.toMatch(/border/);
  });
});
