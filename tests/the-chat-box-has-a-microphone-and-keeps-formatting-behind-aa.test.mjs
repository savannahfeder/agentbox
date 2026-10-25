// THE CHAT BOX HAS A MICROPHONE, AND KEEPS ITS FORMATTING BEHIND Aa.
//
// The box under a chat had eight formatting marks always on screen and no way
// to send a voice note. It now leads with what puts something into a message
// (@, attach, a voice note, emoji), and the marks wait behind Aa. Measured
// here: the order of the bar, that the marks are not drawn until Aa is
// pressed, that the microphone is only where a voice note can go, that a
// recorded note waits in the box as a note you can play rather than as a file
// name, and that the room chat's box is the same bar.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FormatBar } from '../renderer/src/team/FormatBar.tsx';
import { AttachRow } from '../renderer/src/components/AttachRow.tsx';

const src = (rel) => fs.readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
const bar = (props = {}) => renderToStaticMarkup(React.createElement(FormatBar, { box: { current: null }, onChange: () => {}, onAttach: () => {}, onVoice: () => {}, voiceKey: 'direct:p:w-1', ...props }));
const labels = (html) => [...html.matchAll(/aria-label="([^"]+)"/g)].map((m) => m[1]);

describe('the bar under the box', () => {
  it('leads with mention, attach, voice note and emoji, then Aa', () => {
    expect(labels(bar())).toEqual(['Formatting', 'Mention someone', 'Attach a file', 'Record a voice note', 'Add an emoji', 'Formatting marks']);
  });

  it('draws no formatting marks until Aa is pressed', () => {
    const html = bar();
    expect(html).not.toContain('aria-label="Bold"');
    expect(html).not.toContain('fmt-mark');
    expect(html).toMatch(/class="fmt-btn fmt-aa"[^>]*aria-pressed="false"/);
  });

  it('has no microphone where a voice note cannot go, or could not be kept for its conversation', () => {
    expect(labels(bar({ onVoice: undefined }))).not.toContain('Record a voice note');
    expect(labels(bar({ voiceKey: '' }))).not.toContain('Record a voice note');
  });

  it('is told which conversation its notes belong to, in every box that has one', () => {
    expect(src('renderer/src/components/Focus.tsx')).toMatch(/voiceKey=\{`direct:\$\{item\.product\}:\$\{item\.id\}`\}/);
    for (const [file, key] of [['renderer/src/team/ThreadPanel.tsx', /const voiceKey = `thread:\$\{product\}:/], ['renderer/src/team/rooms/RoomChat.tsx', /const voiceKey = `room:\$\{roomId\}:/]]) {
      expect(src(file)).toMatch(key);
      expect(src(file)).toMatch(/voiceKey=\{voiceKey\}/);
    }
  });

  it('is the same bar in a room’s chat, with Return to send', () => {
    const room = src('renderer/src/team/rooms/RoomChat.tsx');
    expect(room).toMatch(/<FormatBar box=/);
    expect(room).toMatch(/<RichReply className="rm-compose-input"/);
    expect(room).toMatch(/e\.key === 'Enter' && !e\.shiftKey/);
  });
});

describe('a recorded note waiting in the box', () => {
  const row = (attachments) => renderToStaticMarkup(React.createElement(AttachRow, { attachments, onRemove: () => {} }));

  it('is drawn as a note you can play, at its length, with a way to take it out', () => {
    const html = row([{ name: 'voice-note-12400ms.webm', dataBase64: 'AAAA', image: false }]);
    expect(html).toContain('class="attach-voice"');
    expect(html).toContain('aria-label="Play voice note"');
    expect(html).toContain('>0:12<');
    expect(html).toContain('aria-label="Remove voice note"');
  });

  it('leaves any other file a chip with its name', () => {
    const html = row([{ name: 'notes.webm', dataBase64: 'AAAA', image: false }]);
    expect(html).not.toContain('attach-voice');
    expect(html).toContain('notes.webm ×');
  });
});
