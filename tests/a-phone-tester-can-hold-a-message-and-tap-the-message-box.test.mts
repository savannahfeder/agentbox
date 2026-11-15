// A PHONE TESTER CAN HOLD A MESSAGE AND TAP THE MESSAGE BOX (w-47416cec15).
//
// 2026-11-15, before the App Store build's chats went to testers: report,
// block, edit and delete all sit behind holding a message, and the phone tool
// had no way to hold, so no tester could reach any of them. And `tap "Message
// Astral"` answered "Nothing to tap" while look listed it: look names an input
// by its placeholder, tap only matched a label or inner text.
import { describe, it, expect } from 'vitest';
import { HOLD_MS, targetScript } from '../.claude/skills/product-loop/scripts/phone.mjs';
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
