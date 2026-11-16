// A PHONE CHAT KEEPS WHAT YOU TYPED WHEN YOU LEAVE IT (w-47416cec15).
//
// 2026-11-15, round 2 of the phone testers on the App Store build: "Type
// draft... Tap Back to Chats, then reopen Launch week. Composer is empty."
// The desktop keeps each chat's unsent words (RoomChat.tsx `drafts`, by
// group and box); the phone held them in the screen's state, so leaving lost
// them, and switching group kept the words in the box for the next group.
import fs from 'node:fs';
import { describe, it, expect } from 'vitest';
import { chatDraft, chatDraftKey, chatFiles, keepChatDraft, keepChatFiles } from '../mobile/src/lib/chat-drafts';

describe('a chat draft', () => {
  it('comes back to the group it was typed in', () => {
    keepChatDraft(chatDraftKey('r-launch', null), 'can check this after the meeting');
    expect(chatDraft(chatDraftKey('r-launch', null))).toBe('can check this after the meeting');
  });
  it('is not the draft of another group, nor of a reply thread in the same group', () => {
    keepChatDraft(chatDraftKey('r-astral', null), 'in the group');
    expect(chatDraft(chatDraftKey('r-other', null))).toBe('');
    expect(chatDraft(chatDraftKey('r-astral', 'm-1'))).toBe('');
    keepChatDraft(chatDraftKey('r-astral', 'm-1'), 'in the thread');
    expect(chatDraft(chatDraftKey('r-astral', null))).toBe('in the group');
  });
  it('is gone once sent, which empties the box', () => {
    keepChatDraft(chatDraftKey('r-sent', null), 'hello');
    keepChatDraft(chatDraftKey('r-sent', null), '');
    expect(chatDraft(chatDraftKey('r-sent', null))).toBe('');
  });
});

// Round 3: the words came back and the attached notes.txt did not, so a
// tester nearly sent a question that said "attached" with nothing on it.
describe('a chat draft’s attachments', () => {
  const file = { name: 'notes.txt', dataBase64: 'aGk=' };
  it('come back with it', () => {
    keepChatFiles(chatDraftKey('r-kai', null), [file]);
    expect(chatFiles(chatDraftKey('r-kai', null))).toEqual([file]);
  });
  it('are not another group’s', () => {
    expect(chatFiles(chatDraftKey('r-maya', null))).toEqual([]);
  });
  it('are gone once sent', () => {
    keepChatFiles(chatDraftKey('r-kai', null), []);
    expect(chatFiles(chatDraftKey('r-kai', null))).toEqual([]);
  });
});

describe('the chat screen', () => {
  it('starts its attachments from the draft and keeps every change', () => {
    const src = fs.readFileSync(new URL('../mobile/src/ui/Groups.tsx', import.meta.url), 'utf8');
    expect(src).toMatch(/useState<Picked\[\]>\(\(\) => chatFiles\(draftKey\)\)/);
    expect(src).toContain('keepChatFiles(draftKey');
  });
  const src = fs.readFileSync(new URL('../mobile/src/ui/Groups.tsx', import.meta.url), 'utf8');
  it('starts its box from the draft and keeps every change', () => {
    expect(src).toMatch(/useState\(\(\) => chatDraft\(draftKey\)\)/);
    expect(src).toContain('keepChatDraft(draftKey');
  });
  it('does not keep the words of a message being edited as a draft', () => {
    expect(src).toMatch(/onEdit=\{\(\) => \{ if \(acting\) \{ setEditing\(acting\); setShown\(acting\.body\)/);
  });
});
