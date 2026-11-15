// A PHONE TESTER CAN HOLD A MESSAGE AND TAP THE MESSAGE BOX (w-47416cec15).
//
// 2026-11-15, before the App Store build's chats went to testers: report,
// block, edit and delete all sit behind holding a message, and the phone tool
// had no way to hold, so no tester could reach any of them. And `tap "Message
// Astral"` answered "Nothing to tap" while look listed it: look names an input
// by its placeholder, tap only matched a label or inner text.
import { describe, it, expect } from 'vitest';
import { HOLD_MS, PICKER, sampleFor, targetScript } from '../.claude/skills/product-loop/scripts/phone.mjs';
import { phonePrompt } from '../.claude/skills/product-loop/scripts/workday.mjs';

const rect = { left: 0, top: 700, width: 300, height: 40, right: 300, bottom: 740 };
const field = (attrs: Record<string, string>) => ({
  scrollIntoView() {}, getClientRects: () => [rect], getBoundingClientRect: () => rect, innerText: '',
  getAttribute: (k: string) => attrs[k] ?? null,
});
const aim = (els: unknown[], words: string) => new Function('document', `return ${targetScript(words)}`)({ querySelectorAll: () => els });

describe('tap by words', () => {
  it('finds a message box by its placeholder, as look names it', () => {
    expect(aim([field({ placeholder: 'Message Astral' })], 'Message Astral')).toEqual({ x: 150, y: 720 });
  });
  it('still prefers a label over the placeholder', () => {
    expect(aim([field({ 'aria-label': 'Search threads', placeholder: 'Message Astral' })], 'Message')).toBeNull();
  });
  it('does not match a box whose placeholder only contains the words', () => {
    expect(aim([field({ placeholder: 'Send a Message' })], 'Message')).toBeNull();
  });
});

// Same day: both testers logged "Photo library disappears without opening a
// picker". Headless Chrome shows no file chooser, so nothing sent in a chat
// could be tested. The phone now hands over a sample when a picker opens.
describe('a photo or file picker', () => {
  it('hands a photo picker a picture', () => {
    expect(sampleFor('image/*,video/*')).toEqual({ name: 'photo.png', type: 'image/png' });
    expect(sampleFor('image/jpeg')).toEqual({ name: 'photo.png', type: 'image/png' });
  });
  it('hands a file picker a document', () => {
    expect(sampleFor('*/*')).toEqual({ name: 'notes.txt', type: 'text/plain' });
    expect(sampleFor('')).toEqual({ name: 'notes.txt', type: 'text/plain' });
    expect(sampleFor(null)).toEqual({ name: 'notes.txt', type: 'text/plain' });
  });
  it('answers the click a picker opens with, and only on a file input', () => {
    expect(PICKER).toContain("addEventListener('click'");
    expect(PICKER).toContain("type !== 'file'");
    expect(PICKER).toContain("new Event('change')");
  });
  it('is something a tester is told', () => {
    const prompt = phonePrompt({ name: 'Lena', slug: 'x', body: '' } as never, { dir: '/tmp/x', minutes: 30 });
    expect(prompt).toMatch(/sample/);
  });
});

describe('holding', () => {
  it('lasts longer than the app waits before a press becomes a hold', () => {
    expect(HOLD_MS).toBeGreaterThan(500);
    expect(HOLD_MS).toBeLessThan(2000);
  });
  it('is one of the commands a tester is told about', () => {
    const prompt = phonePrompt({ name: 'Lena', slug: 'x', body: '' } as never, { dir: '/tmp/x', minutes: 30 });
    expect(prompt).toMatch(/hold <n\|"words">/);
  });
});
