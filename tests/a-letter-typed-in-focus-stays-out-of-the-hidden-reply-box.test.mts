// After editing a document in Focus, the thread's reply box held a stray "A"
// nobody typed there. A power tester saw it twice; driving the browser copy,
// "Ab" typed in Focus before the cursor was in the page left "A" as the
// thread's draft. A letter with no box under it goes to the open thread's reply
// box, and in Focus that box is behind the document, out of sight.
import { it, expect } from 'vitest';
import fs from 'node:fs';
import { keyOnAnOpenThread } from '../renderer/src/reply-keys';

it('a letter goes to the reply box only while that box is on screen', () => {
  for (const key of ['A', 'a', 'h', '.', '1']) {
    expect(keyOnAnOpenThread({ key, justChanged: false, boxOnScreen: false })).toBe('shortcut');
    expect(keyOnAnOpenThread({ key, justChanged: false, boxOnScreen: true })).toBe('to the box');
  }
});

it('keeps a sentence already going in the box going', () => {
  expect(keyOnAnOpenThread({ key: 'b', justChanged: false, stillTyping: true, boxOnScreen: true })).toBe('to the box');
  expect(keyOnAnOpenThread({ key: 'b', justChanged: false, stillTyping: true, boxOnScreen: false })).toBe('shortcut');
});

it('the app says the box is hidden while a document has the whole window', () => {
  const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
  expect(app).toMatch(/keyOnAnOpenThread\(\{[^}]*boxOnScreen: !fullScreenDoc/);
});
