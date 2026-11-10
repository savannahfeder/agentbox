// A VOICE NOTE IS A FILE THAT KNOWS ITS LENGTH.
//
// Chats had no way to send a voice note. One is now an attached file whose name
// carries its length, so the link a message already writes for a file is all a
// reader needs to draw the note at its length before it has loaded, and the
// conversation list can say "Voice note 0:12" instead of a file name. Measured
// here: the name round-trips, only a voice note's own name matches (not a
// sound a worker named, not a file that merely contains the words), the clock
// reads like a phone's, and the bars follow the loud and quiet parts.
import { describe, it, expect } from 'vitest';
import { VOICE_MAX_MS, peaksOf, voiceClock, voiceNoteName, voiceNoteOf, voiceSaid } from '../renderer/src/team/voice-note.ts';

describe('the name', () => {
  it('carries the length and reads back from the link the app writes', () => {
    expect(voiceNoteName(12_400)).toBe('voice-note-12400ms.webm');
    expect(voiceNoteOf('attachments/lq2x-ab12cd-voice-note-12400ms.webm')).toEqual({ ms: 12_400 });
    expect(voiceNoteOf('voice-note-900ms.m4a')).toEqual({ ms: 900 });
  });

  it('is never longer than a note may be, nor zero', () => {
    expect(voiceNoteName(VOICE_MAX_MS + 5_000)).toBe(`voice-note-${VOICE_MAX_MS}ms.webm`);
    expect(voiceNoteName(0)).toBe('voice-note-1ms.webm');
  });

  it('does not match a sound that is not a voice note', () => {
    expect(voiceNoteOf('attachments/samples/take-3.webm')).toBeNull();
    expect(voiceNoteOf('attachments/my-voice-note-draft.webm')).toBeNull();
    expect(voiceNoteOf('attachments/voice-note-12400ms.webm.txt')).toBeNull();
    expect(voiceNoteOf('attachments/notvoice-note-12ms.png')).toBeNull();
    expect(voiceNoteOf(undefined)).toBeNull();
  });
});

describe('the clock', () => {
  it('reads minutes and padded seconds', () => {
    expect(voiceClock(0)).toBe('0:00');
    expect(voiceClock(7_400)).toBe('0:07');
    expect(voiceClock(59_600)).toBe('1:00');
    expect(voiceClock(83_000)).toBe('1:23');
  });
});

describe('the bars', () => {
  it('are tall where it is loud and short where it is quiet', () => {
    const quietThenLoud = [...Array(100).fill(0.01), ...Array(100).fill(0.8)];
    const bars = peaksOf(quietThenLoud, 4);
    expect(bars).toHaveLength(4);
    expect(bars[3]).toBe(1);
    expect(bars[0]).toBeLessThan(0.2);
  });

  it('still draws a short bar for silence', () => {
    expect(peaksOf(new Float32Array(50), 5).every((b) => b > 0)).toBe(true);
    expect(peaksOf([], 3)).toHaveLength(3);
  });
});

describe('the one-line preview', () => {
  it('says a voice note and its length instead of the link', () => {
    expect(voiceSaid('[voice-note-12400ms.webm](attachments/a-b-voice-note-12400ms.webm)')).toBe('Voice note 0:12');
    expect(voiceSaid('listen\n[voice-note-3000ms.webm](attachments/a-voice-note-3000ms.webm)')).toBe('listen\nVoice note 0:03');
  });

  it('leaves any other link as it was', () => {
    expect(voiceSaid('[shot.png](attachments/a-shot.png)')).toBe('[shot.png](attachments/a-shot.png)');
  });
});
