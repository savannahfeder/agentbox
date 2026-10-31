// "Some of the pages still click into weirdly without the sidebar navigation."
// The founder's picture: a one-to-one chat opened from the Chats list filled
// the window as a plain thread page, headed "‹ Groups" with a "2 of 10"
// counter drawn over "Add people", and the Chats list gone. Groups and AI
// teammates open inside Chats with the list beside them; a person's chat went
// through the thread page instead (useRooms `onOpenDirect` -> setFocused).
// Reproduced on the stage by pressing Priya in Chats > People: the page read
// "‹ Needs you / Priya Nair" with no list. A person's chat opened from Chats
// now keeps the list on its left and the Chats bar over it, with the person's
// name where a group's goes and no back link or counter.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const app = read('renderer/src/App.tsx');
const focus = read('renderer/src/components/Focus.tsx');
const column = read('renderer/src/teammates/ChatsColumn.tsx');

describe('a person\'s chat opened from the Chats list', () => {
  it('is remembered as opened from Chats, and only while it is the thread on screen', () => {
    expect(app).toMatch(/onOpenDirect: \(id\) => \{[^\n]*setChatsDirect\(id\);/);
    expect(app).toMatch(/const inChats = !!focused && directOpen && !!chatsValue && focused\.id === chatsDirect;/);
  });

  it('sits beside the Chats list, marked as the open chat', () => {
    expect(app).toMatch(/<ChatsFrame current=\{inChats \? `direct:\$\{focused\.id\}` : null\}>/);
    expect(column).toMatch(/export function ChatsFrame\(/);
    expect(column).toMatch(/if \(!current\) return <>\{children\}<\/>;/);
    expect(column).toMatch(/<div className="gr-page tq-chats cx-frame"><div className="gr-body"><ChatsColumn current=\{current\} \/>/);
  });

  it('wears the Chats bar, not the thread page\'s: Chats over the list, its name over the chat', () => {
    // With a team on too: no chat opens under Everything else's cards any more (w-2b3e1a85e5).
    expect(app).toMatch(/focused \? \(inChats \? <><div className="gc-head"><div className="gc-head-col"><span className="workspace-title gc-col-title">Chats<\/span><\/div><div className="workspace-task-header cx-task-header" ref=\{setTaskHeader\} \/><\/div>/);
    expect(app).toMatch(/\$\{focused && !settingsOpen && !inChats \? ' workspace-task' : ''\}/);
    expect(focus).toMatch(/const barContent = inChats\s*\? <><h1 className="workspace-title gc-head-group cx-person"><span className="rm-one">\{threadName\}<\/span><\/h1>/);
  });

  it('has no back link to another list and no counter through one', () => {
    expect(app).toMatch(/queue=\{queueSpot && !inChats \? \{ spot: queueSpot, onStep: stepQueue \} : null\}/);
  });
});

// Measured on the stage at 1512 wide: the name in the bar began at 454 px,
// the words at 478 and the reply box at 486. All three start at 454 now.
describe('its words and its reply box', () => {
  it('start where its name does in the bar above', () => {
    const css = read('renderer/src/teammates/teammates.css');
    expect(css).toMatch(/\.cx-frame-main \.focus \{ margin-left: 40px; \}/);
    expect(css).toMatch(/\.cx-frame-main \.focus-dock-inner \{ margin-left: 40px; \}/);
  });
});
