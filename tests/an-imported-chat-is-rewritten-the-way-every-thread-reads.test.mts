// AN IMPORTED CHAT IS REWRITTEN THE WAY EVERY THREAD READS (w-31c71743b5, 2026-10-29).
//
// What broke: a Claude Code chat brought in at setup opened on its raw last
// message, headings and a code block, under the words the person typed as its
// title. The founder: "it has a well-organized title, shows the context
// (basically a summary), clearly says what you need, and gives you three
// options. This doesn't match that at all." The rewrite used to be a whole
// agent run resuming the chat on Claude Code, and measured in a fresh window
// that morning it never landed: the account was at its weekly limit. It is now
// one small-model call, asked on any account or engine with room, and it
// writes the name, the context and the answer with three options.
import { describe, it, expect } from 'vitest';
import { catchUpPrompt, cleanCatchUp, catchUpResult } from '../main/catch-up.mts';

const chat = {
  title: 'can you look at the notes store and tell me whats wrong with it',
  body: 'can you look at the notes store and tell me whats wrong with it',
  result: '## Summary\n\n- `notes` is shared.\n\n```js\nexport function createStore() {}\n```\n\nLet me know if you want me to go ahead.',
};
const reply = JSON.stringify({
  title: 'Notes store fixes',
  context: 'The agent reviewed the notes store and found it shares one list across imports, returns the wrong value from add, and has no tests or delete.',
  ask: 'Should the agent rebuild the notes store?',
  said: 'It has a plan: a createStore function with add, remove and all, plus tests. Nothing has changed yet.',
  options: ['Rebuild it with createStore and tests', 'Only add a way to delete notes', 'Leave it as it is'],
});

describe('what the model is asked', () => {
  const prompt = catchUpPrompt(chat);
  it('carries the opening ask and the last answer', () => {
    expect(prompt).toContain('tell me whats wrong with it');
    expect(prompt).toContain('createStore');
  });
  it('asks for the parts every thread has, and three options', () => {
    for (const key of ['"title"', '"context"', '"ask"', '"said"', '"options"']) expect(prompt).toContain(key);
    expect(prompt).toMatch(/three options/i);
  });
});

describe('what comes back', () => {
  it('reads a clean reply', () => {
    expect(cleanCatchUp(reply)?.title).toBe('Notes store fixes');
  });
  it('reads one wrapped in a code fence or a sentence', () => {
    expect(cleanCatchUp('Here you go:\n```json\n' + reply + '\n```')?.ask).toBe('Should the agent rebuild the notes store?');
  });
  it('turns away anything missing a part, or with fewer than two options', () => {
    expect(cleanCatchUp('')).toBe('');
    expect(cleanCatchUp('not json')).toBe('');
    expect(cleanCatchUp(JSON.stringify({ ...JSON.parse(reply), ask: '' }))).toBe('');
    expect(cleanCatchUp(JSON.stringify({ ...JSON.parse(reply), options: ['one'] }))).toBe('');
  });
  it('keeps at most three options', () => {
    const many = JSON.stringify({ ...JSON.parse(reply), options: ['a', 'b', 'c', 'd'] });
    expect(cleanCatchUp(many).options).toEqual(['a', 'b', 'c']);
  });
});

describe('the answer it writes', () => {
  const out = catchUpResult(cleanCatchUp(reply));
  it('opens on what the person needs, in bold', () => {
    expect(out.split('\n')[0]).toBe('**Should the agent rebuild the notes store?**');
  });
  it('ends on three numbered options, the first recommended', () => {
    expect(out).toContain('## Options\n1. Rebuild it with createStore and tests (recommended)\n2. Only add a way to delete notes\n3. Leave it as it is');
  });
});
