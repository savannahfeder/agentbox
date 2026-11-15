// A PICTURE IN A PHONE CHAT OPENS WHEN TAPPED (w-47416cec15).
//
// 2026-11-15, round 2 of the phone testers on the App Store build: "I expected
// tapping the picture to enlarge it, but the chat stayed in place." The
// desktop wraps a chat picture in its file (RoomChat.tsx RoomPicture inside
// RoomFile), so a click opens it; the phone drew the picture with nothing to
// press. A tapped picture now opens as a tapped file does.
import fs from 'node:fs';
import { describe, it, expect } from 'vitest';

const src = fs.readFileSync(new URL('../mobile/src/ui/Groups.tsx', import.meta.url), 'utf8');
const part = (name: string) => src.match(new RegExp(`function ${name}\\(([\\s\\S]*?)\\n\\}\\n`))?.[0] ?? '';

describe('a chat picture on the phone', () => {
  it('is something to press, named for what it does', () => {
    const picture = part('RoomPicture');
    expect(picture).toMatch(/<Pressable[^>]*onPress=/);
    expect(picture).toMatch(/accessibilityLabel=\{`Open \$\{/);
  });
  it('opens the way a chat file opens', () => {
    expect(part('RoomPicture')).toContain('openRoomFile(');
    expect(part('RoomFile')).toContain('openRoomFile(');
  });
  it('a picture that is not here any more is not pressable', () => {
    const picture = part('RoomPicture');
    const gone = picture.slice(picture.indexOf('if (data === null)'), picture.indexOf('\n', picture.indexOf('if (data === null)')));
    expect(gone).not.toContain('Pressable');
  });
});
