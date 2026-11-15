// AN IMPORTED CHAT ENDS ON THE AGENT'S WORDS, NOT A USAGE LIMIT (w-31c71743b5, 2026-10-29).
//
// Measured in a fresh window on the founder's computer: the chat offered at
// setup had run into Claude Code's weekly limit, and it was brought in reading
// "You've hit your weekly limit · resets 12pm" as the agent's answer. Claude
// Code writes that line itself, marked `isApiErrorMessage`, model
// `<synthetic>`. The agent's last real reply is what the chat ended on.
import { it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readTranscriptTail } from '../main/agent-sessions.mts';

let dir;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chat-end-')); });
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const write = (rows) => {
  const file = path.join(dir, 'a.jsonl');
  fs.writeFileSync(file, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  return file;
};
const user = (text) => ({ type: 'user', message: { role: 'user', content: text } });
const said = (text, extra = {}) => ({ type: 'assistant', message: { role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'text', text }] }, ...extra });
const limit = said("You've hit your weekly limit · resets 12pm (America/Los_Angeles)", { isApiErrorMessage: true, apiError: 'usage_limit_reached', error: 'rate_limit' });

it('skips the limit line Claude Code wrote after the agent answered', () => {
  expect(readTranscriptTail(write([user('fix it'), said('Fixed. Merge it?'), limit])).lastSaid).toBe('Fixed. Merge it?');
});

it('keeps the agent\'s last answer when the limit was all a later turn got', () => {
  expect(readTranscriptTail(write([user('fix it'), said('Fixed. Merge it?'), user('test'), limit])).lastSaid).toBe('Fixed. Merge it?');
});

it('but not when a later turn had a real answer', () => {
  expect(readTranscriptTail(write([user('fix it'), said('Fixed.'), user('and the docs'), said('Docs done.')])).lastSaid).toBe('Docs done.');
});

it('leaves an ordinary reply alone', () => {
  expect(readTranscriptTail(write([user('fix it'), said('One.'), said('Two.')])).lastSaid).toBe('One.\n\nTwo.');
});
