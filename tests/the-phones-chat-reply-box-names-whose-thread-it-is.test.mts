// In a chat thread the desktop's reply box says "Reply to Sam O." under a
// teammate's message and "Reply in thread" under your own (2026-11-22). The
// phone parity round of 2026-11-25 found the phone's box saying "Reply in
// thread" under everyone's, so it never said who you were answering.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

describe("the phone's chat reply box", () => {
  it('takes its words from the desktop rule, with the phone own nameOf', () => {
    const src = fs.readFileSync(new URL('../mobile/src/ui/Groups.tsx', import.meta.url), 'utf8');
    expect(src).toContain("placeholder={root ? replyBoxWords(root, g.meId, nameOf) : `Message ${groupName(room)}`}");
    expect(src).toMatch(/import \{[^}]*replyBoxWords[^}]*\} from '..\/..\/..\/renderer\/src\/team\/rooms\/room-chat-rules'/);
  });
});
