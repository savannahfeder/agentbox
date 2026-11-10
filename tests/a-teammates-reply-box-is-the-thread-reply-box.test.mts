// "It's super different from our usual messages. For one thing I know that
// Command+Enter is the only way to send a usual chat message." (2026-11-09,
// with a picture of a thread's reply box.) The box under an AI teammate's chat
// was the group chat's box: Enter sent, a formatting and emoji bar sat on the
// left, and no microphone. A teammate is an agent, so its box is now the one
// you reply to an agent with: the same field that grows, ⌘↵ to send and Enter
// for a new line, and the paperclip, microphone and Send at the right of the
// bar. Its ask that the box grows as you write is kept below; what still holds
// for the group chat's own box is the-group-chats-box-grows-and-offers-no-at.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { keyInTheReplyBox } from '../renderer/src/reply-keys.ts';

const read = (f) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');
const page = read('renderer/src/teammates/TeammatesPage.tsx');
const composer = /function Composer\([\s\S]*?\n}\n/.exec(page)?.[0] ?? '';

describe('the reply box in a teammate chat', () => {
  it('is the thread reply box: its card, its field and its bar', () => {
    expect(composer).toMatch(/<div className="dock-card tq-compose">/);
    expect(composer).toMatch(/<textarea[^>]*className="dock-input"/);
    expect(composer).toMatch(/<div className="compose-sentence dock-bar">/);
    expect(composer).not.toMatch(/<RichReply|<FormatBar/);
  });

  it('sends on ⌘↵ and nothing else, as a message to an agent does', () => {
    expect(composer).toMatch(/keyInTheReplyBox\(\{ toPeople: false,/);
    expect(keyInTheReplyBox({ toPeople: false, key: 'Enter', meta: true })).toBe('send');
    expect(keyInTheReplyBox({ toPeople: false, key: 'Enter', ctrl: true })).toBe('send');
    expect(keyInTheReplyBox({ toPeople: false, key: 'Enter' })).toBe('leave');
    expect(keyInTheReplyBox({ toPeople: false, key: 'Enter', shift: true })).toBe('leave');
    expect(composer).toMatch(/sendKeyFor\(false\)/);
  });

  it('grows as you write, the way the thread box does', () => {
    expect(composer).toMatch(/useEffect\(\(\) => \{ applyDockHeight\(box\.current\); \}\);/);
  });

  it('has the paperclip and the microphone beside Send', () => {
    expect(composer).toMatch(/className="tc-icon dock-clip"[^>]*aria-label="Attach files"/);
    expect(composer).toMatch(/<MicButton talk=\{talk\} \/>/);
    expect(composer).toMatch(/talk\.on \? <Listening talk=\{talk\} \/>/);
  });

  it('leaves the job and voice fields as plain text fields', () => {
    expect(page).toMatch(/<textarea className="tq-field" rows=\{6\}/);
    expect(page).toMatch(/<textarea className="tq-field tq-voice-own"/);
  });
});
