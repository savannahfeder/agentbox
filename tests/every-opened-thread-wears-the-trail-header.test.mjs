// EVERY OPENED THREAD WEARS THE TRAIL (w-dcaa2c122e, 2026-10-24).
//
// "When you click into an inbox item, the header should be this one ... I
// believe you're using an old header from before, which is no longer active."
// The trail, "‹ Needs you / name", was drawn only on a thread with a summary
// and no document open. Measured on the stage: a thread with its document
// open, a conversation and an agent's chat all drew the old band of title
// over status, 88 points tall against the trail's 56. And with a document
// open its conversation started 28 points in, where every other page now
// starts 44 in: "it doesn't really have enough padding on the left side".
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const focus = read('../renderer/src/components/Focus.tsx');
const byline = read('../renderer/src/components/Byline.tsx');
const app = read('../renderer/src/App.tsx');
const summary = read('../renderer/src/threads/summary.css');
const rooms = read('../renderer/src/team/rooms/rooms.css');

describe('the bar over an opened thread', () => {
  it('is the trail whenever the thread was opened from a list, summary or not, document or not', () => {
    // A person's chat drawn inside Chats wears the Chats bar instead (a-persons-chat-opened-from-chats-keeps-the-chats-list).
    expect(focus).toMatch(/const barContent = inChats\s*\?[^;]*?: crumbFrom\s*\? <><ThreadCrumb /);
    expect(focus).not.toContain('summaryOffered && crumbFrom');
  });
  it('is the old band only where nothing says where it was opened from', () => {
    expect(focus).toMatch(/: <>\{backButton\}\{bandLine\}<\/>;/);
  });
});

describe('a conversation', () => {
  it('keeps its faces and Add people, at the far end of the trail', () => {
    expect(focus).toContain('{direct && <ConversationAside item={item} onAddPeople={onAddPeople} />}');
    expect(byline).toMatch(/export function ConversationAside[\s\S]{0,400}<TeamPeople item=\{item\} \/>[\s\S]{0,200}<AddPeople /);
    expect(summary).toMatch(/\.crumb-aside \{ margin-left: auto;/);
  });
  it('opened over a group, says it came from Groups', () => {
    expect(app).toContain("directOpen && roomsUi.openId ? 'Groups'");
  });
});

describe('with a document open, with Groups on', () => {
  it('the conversation and its reply box start on the 44-point edge, under the trail’s arrow', () => {
    expect(rooms).toContain('.workspace-layout.gt-inset[data-artifact-layout="beside"] .focus { padding-left: 44px; }');
    expect(rooms).toContain('.workspace-layout.gt-inset[data-artifact-layout="beside"] .focus-dock { padding-left: 44px; }');
    expect(rooms).toContain('.workspace-layout.gt-inset.workspace-task > .topbar { padding-left: 36px; }');
  });
});
