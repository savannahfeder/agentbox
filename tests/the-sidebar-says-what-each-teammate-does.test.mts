// "I also think it'd be really useful to be able to see what each character is
// doing, basically its job title, in the sidebar because I can't remember who
// Juno and Mira are functionally." The sidebar showed a teammate's name and
// what it was on, and its role only on its own page, in the agent's own
// casing ("video producer"). The role followed the name in the sidebar; since
// round 6 the name is the role, shown in the Chats list, and a role is drawn
// with a capital first letter wherever it still shows.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const { roleLabel } = await import('../renderer/src/teammates/chat-lines.ts');
const read = (f) => fs.readFileSync(new URL(`../renderer/src/teammates/${f}`, import.meta.url), 'utf8');

describe('a teammate\'s role', () => {
  it('starts with a capital and keeps the rest as written', () => {
    expect(roleLabel('video producer')).toBe('Video producer');
    expect(roleLabel('QA lead for iOS')).toBe('QA lead for iOS');
    expect(roleLabel('  growth marketer ')).toBe('Growth marketer');
  });

  it('is nothing when there is none, so no gap is drawn for it', () => {
    expect(roleLabel(null)).toBe('');
    expect(roleLabel('   ')).toBe('');
  });

  // Teammates are named by their role now ("Marketing lead"), so the Chats
  // list shows each one by its name alone, and the old sidebar rows that put
  // a role after a person's name are gone (round 6).
  it('is the name each teammate goes by in the Chats list', () => {
    expect(read('ChatsColumn.tsx')).toMatch(/<TeammateMark t=\{t\} \/><span className="cx-n">\{rowName\(t\)\}<\/span>/);
  });

  it('is drawn with a capital at the top of its page, when it is not already its name', async () => {
    const { titleAside } = await import('../renderer/src/teammates/chat-lines.ts');
    expect(titleAside('chat', 'video producer')).toBe('Video producer');
    expect(read('TeammatesPage.tsx')).toMatch(/<span className="tq-role">\{titleAside\(shown\.kind, t\.role, t\)\}<\/span>/);
  });
});
