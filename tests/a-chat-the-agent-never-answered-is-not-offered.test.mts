// A CHAT THE AGENT NEVER ANSWERED IS NOT OFFERED (w-31c71743b5, 2026-10-29).
//
// Measured in a fresh window on the founder's computer: the newest Claude Code
// chat was "hello" and Claude Code's own usage-limit line, nothing more. It was
// offered first at setup, brought in, and opened on "You / hello / Started in
// Claude Code" with no answer under it: the first thing a new person judges
// the app by. A chat is offered when the agent said something in it, or when
// its end has not been read yet.
import { it, expect } from 'vitest';
import { chatChoices } from '../renderer/src/first-run.ts';

const HOME = '/Users/someone';
const chat = (when, over = {}) => ({ folder: `${HOME}/dev/app`, when, lastSaid: 'Fixed the test.', ...over });

it('leaves out a chat whose end was read and the agent said nothing', () => {
  expect(chatChoices([chat(2, { lastSaid: '' }), chat(1)], { home: HOME }).map((t) => t.when)).toEqual([1]);
});

it('and one where it said only blank lines', () => {
  expect(chatChoices([chat(1, { lastSaid: ' \n ' })], { home: HOME })).toEqual([]);
});

it('keeps a chat whose end the list has not read yet', () => {
  expect(chatChoices([chat(1, { lastSaid: '', endUnknown: true })], { home: HOME })).toHaveLength(1);
});

it('keeps a chat that carries no reading of its end at all', () => {
  expect(chatChoices([chat(1, { lastSaid: undefined })], { home: HOME })).toHaveLength(1);
});
