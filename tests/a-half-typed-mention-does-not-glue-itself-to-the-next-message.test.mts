// A HALF-TYPED MENTION DOES NOT GLUE ITSELF TO THE NEXT MESSAGE.
//
// Maya typed "@De" in a task thread's box and left. An
// hour later she typed her real message there and it went out as "@DeJordan: my
// agent could not post the plans doc". The draft was kept with the caret at its end,
// and the @ menu had offered nothing, because Dev was not on the thread.
//
// Also here: typing before the box has the keyboard ("Typed 340 characters into
// body", nothing on screen), @ and Add people on a one-to-one task, and whose name
// the box wears when an agent wrote the message it answers.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { dropHalfMention, keyInTheReplyBox, keyOnAnOpenThread, replyName } from '../renderer/src/reply-keys.ts';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('a draft coming back to its box', () => {
  it('loses a half-typed mention at its end', () => {
    expect(dropHalfMention('@De')).toBe('');
    expect(dropHalfMention('Could you ask @De')).toBe('Could you ask ');
    expect(dropHalfMention('@')).toBe('');
  });
  it('keeps a mention that was chosen, words after one, and an address', () => {
    expect(dropHalfMention('@Dev ')).toBe('@Dev ');
    expect(dropHalfMention('@Dev can you look')).toBe('@Dev can you look');
    expect(dropHalfMention('mail me at sam@lumen.test')).toBe('mail me at sam@lumen.test');
    expect(dropHalfMention('')).toBe('');
  });
  it('the box does it only where it talks to people', () => {
    expect(read('renderer/src/components/Focus.tsx')).toMatch(/useState\(\(\) => \(talkTo\?\.length \? dropHalfMention\(readDraft\(item\)\) : readDraft\(item\)\)\)/);
  });
});

describe('the @ menu in a task with one person', () => {
  const src = read('renderer/src/team/ChatAgents.tsx');
  it('offers someone not on the thread, and says so', () => {
    expect(src).toMatch(/kind: 'add'/);
    expect(src).toContain('not on this thread: add');
  });
  it('picking them takes the fragment out and goes to Add people', () => {
    expect(src).toMatch(/row\.kind === 'add'[\s\S]{0,200}zero:add-people/);
  });
  it('Add people answers that on a conversation too, and the task\'s bar draws it', () => {
    expect(read('renderer/src/team/TeamFocus.tsx')).toMatch(/const ask = \(\) => \{ if \(isDirect\(product\)\) onAdd\(item\); else setOpen\(true\); \}/);
    expect(read('renderer/src/components/Focus.tsx')).toMatch(/\{\(direct \|\| summarised\) && <ConversationAside item=\{item\} onAddPeople=\{onAddPeople\} \/>\}<\/>/);
  });
});

describe('words typed before the box has the keyboard', () => {
  const key = (k, o = {}) => keyOnAnOpenThread({ key: k, justChanged: false, ...o });
  it('every letter and space after the first follows it in, shortcut letters too', () => {
    for (const k of ['j', 'e', 'r', ' ', 'n']) expect(key(k, { stillTyping: true })).toBe('to the box');
  });
  it('a first letter still goes in, and shortcuts still work when nothing is being typed', () => {
    expect(key('h')).toBe('to the box');
    expect(key('j')).toBe('shortcut');
    expect(key('e')).toBe('shortcut');
    expect(key(' ')).toBe('shortcut');
  });
  it('Escape, arrows and Enter are never words', () => {
    for (const k of ['Escape', 'ArrowDown', 'Enter']) expect(key(k, { stillTyping: true })).toBe('shortcut');
  });
  it('the app says so for a second after a key went in', () => {
    const app = read('renderer/src/App.tsx');
    expect(app).toMatch(/stillTyping: Date\.now\(\) - typedIntoBoxAt\.current < STILL_TYPING_MS/);
    expect(app).toMatch(/typedIntoBoxAt\.current = Date\.now\(\);/);
  });
});

describe('Enter, talking to people', () => {
  it('sends, and Shift+Enter is a new line', () => {
    expect(keyInTheReplyBox({ toPeople: true, key: 'Enter' })).toBe('send');
    expect(keyInTheReplyBox({ toPeople: true, key: 'Enter', shift: true })).toBe('new line');
  });
  it('a brief to an agent still takes the chord', () => {
    expect(keyInTheReplyBox({ toPeople: false, key: 'Enter' })).toBe('leave');
    expect(keyInTheReplyBox({ toPeople: false, key: 'Enter', meta: true })).toBe('send');
  });
  it('every box to a person says so: the reply box, a chat thread, a teammate\'s thread', () => {
    expect(read('renderer/src/components/Focus.tsx')).toContain('const enterSends = !!talkTo?.length && !onPhone();');
    expect(read('renderer/src/team/ThreadPanel.tsx')).toMatch(/e\.key === 'Enter' && !e\.shiftKey && !e\.isComposing\) \{ e\.preventDefault\(\); void send\(\)/);
    expect(read('renderer/src/threads/TeammateThread.tsx')).toMatch(/e\.key === 'Enter' && !e\.shiftKey[^\n]*void send\(\)/);
  });
});

describe('the name on the box', () => {
  const ME = 'jordan';
  const nameOf = () => 'Maya Chen';
  const chat = (...lines) => ({ talk: { chat: lines } });
  const voice = { name: 'Chief of staff' };
  it('names the agent and whose it is when an agent wrote the message it answers', () => {
    expect(replyName(chat({ by: 'maya', voice }), ME, nameOf)).toBe('Chief of staff, Maya\'s');
  });
  it('names nobody special when a person wrote it', () => {
    expect(replyName(chat({ by: 'maya', voice }, { by: 'maya' }), ME, nameOf)).toBeNull();
  });
  it('your own words since do not hide who you are answering', () => {
    expect(replyName(chat({ by: 'maya', voice }, { by: ME }), ME, nameOf)).toBe('Chief of staff, Maya\'s');
  });
  it('a row with no record says nothing', () => {
    expect(replyName({}, ME, nameOf)).toBeNull();
  });
  it('the box and its folded line use it, on a one-to-one only', () => {
    const f = read('renderer/src/components/Focus.tsx');
    expect(f).toMatch(/const talkAnswer = talkNames\?\.length === 1 && teamCtx \? replyName\(item, teamCtx\.me/);
    expect(f).toMatch(/text: `Reply to \$\{talkAnswer \?\? joinNames\(talkNames\)\}`/);
  });
});
