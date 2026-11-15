// A THREAD IN A GROUP TAKES YOUR TYPING, AND LETS YOU BACK OUT.
//
// Working a day in a group opened from Team, a tester pressed Reply in thread
// under Dev's message. The thread took the chat's place with no title and no
// way back, and its reply box was drawn but not focused, so the first letter
// typed ("N") opened a new agent thread and the rest of a message meant for
// Dev went in as an agent's prompt. Escape did nothing, and pressing the group
// in the list did nothing either. The group page passes its own (empty) head,
// which hid the thread's Back bar.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const chat = fs.readFileSync(path.join(import.meta.dirname, '..', 'renderer/src/team/rooms/RoomChat.tsx'), 'utf8');

describe('a thread in a group chat', () => {
  it('shows its Back bar even where the page draws its own header', () => {
    expect(chat).toMatch(/\{root \? <div className="rm-chat-head rm-thread-head">/);
    expect(chat).not.toMatch(/\{head \?\? <div className="rm-chat-head">\n\s+\{root/);
  });
  it('closes on Escape, before the window treats Escape as going back', () => {
    expect(chat).toMatch(/if \(!root\) return undefined;\n\s+const esc = \(e: KeyboardEvent\) => \{ if \(e\.key === 'Escape'\) \{ e\.preventDefault\(\); e\.stopImmediatePropagation\(\); setThread\(null\); \} \};/);
  });
  it('puts the cursor in its reply box when it opens', () => {
    expect(chat).toMatch(/useEffect\(\(\) => \{ if \(takesTyping\) requestAnimationFrame\(\(\) => ref\.current\?\.focus\(\)\); \}, \[\]\);/);
    expect(chat).toMatch(/takesTyping=\{full \|\| !!thread\}/);
  });
  it('says how many replies only when there are some', () => {
    expect(chat).toContain("{(replies.get(root.id)?.length ?? 0) > 0 && <span className=\"rm-label\"");
  });
});
