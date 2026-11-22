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
import { catchUpPrompt, cleanCatchUp, catchUpResult, EARLIER_MOST, turnsBefore } from '../main/catch-up.mts';

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

// Measured 2026-11-21 on a real chat carried on in its terminal: opened with
// "Look at this folder, then ask me one short question about what to build
// here first", answered "A list of products" in the terminal. The rewrite of
// the agent's next answer saw only the opening and that answer, asked the
// question again, and named "dd-landing", a folder from the person's own Claude
// Code settings, as the project. It now gets the project and what was said last.
describe('a chat carried on where it started', () => {
  const carried = {
    body: 'Look at this folder, then ask me one short question about what to build here first.',
    saidOutside: 'A list of products. Then a three-bullet plan for that page.',
    result: 'The wait is running in the background. I will send the plan when it finishes.',
    project: 'Shop',
  };
  it('names the project the chat is in', () => {
    expect(catchUpPrompt(carried)).toContain('--- the project ---\nShop\n');
  });
  it('carries what the person said last, between the opening and the answer', () => {
    const p = catchUpPrompt(carried);
    expect(p.indexOf('A list of products')).toBeGreaterThan(p.indexOf('Look at this folder'));
    expect(p.indexOf('A list of products')).toBeLessThan(p.indexOf('The wait is running'));
  });
  // Measured 2026-11-21 on a real chat five replies into its terminal: "Include
  // tax. Reply with the word ok only." was answered "ok", and the rewrite, shown
  // only the opening and that, asked whether to write the README summary that
  // had been written 24 minutes before.
  const line = (source, patch) => ({ ts: 1, source, patch });
  const history = [
    line('agent', { title: 'README project summary', status: 'open', labels: ['thread-import'] }),
    line('founder', { body: 'Tell me what this project does.' }),
    line('agent', { result: 'It is a throwaway project.', chatAt: 1 }),
    line('agent', { label: 'Kestrel', problem: 'What it does.', result: '**Next?**' }),
    line('founder', { saidOutside: 'Name the checkout module.' }),
    line('system', { chatAt: 2 }),
    line('agent', { result: '**Claude Code stopped to ask you a question. Answer it there.**' }),
    line('agent', { result: 'I would name it cart. Include tax?', chatAt: 3 }),
    line('founder', { saidOutside: 'Include tax. Reply with the word ok only.' }),
    line('agent', { result: 'ok', chatAt: 4 }),
  ];
  it('carries the turns between the opening and what was said last', () => {
    expect(turnsBefore(history)).toEqual(['Agent: It is a throwaway project.', 'Person: Name the checkout module.', 'Agent: I would name it cart. Include tax?']);
    const p = catchUpPrompt({ body: 'Tell me what this project does.', saidOutside: 'Include tax. Reply with the word ok only.', result: 'ok', earlier: turnsBefore(history) });
    const at = (words) => p.indexOf(words);
    expect(at('Tell me what this project does.')).toBeLessThan(at('Agent: It is a throwaway project.'));
    expect(at('Agent: I would name it cart. Include tax?')).toBeLessThan(at('Include tax. Reply with the word ok only.'));
    expect(p).toContain('where it stands now');
  });
  it('carries the newest few of a long one, each cut short', () => {
    const long = Array.from({ length: 20 }, (_, i) => [line('founder', { saidOutside: `ask ${i}` }), line('agent', { result: `answer ${i} ${'x'.repeat(5000)}` })]).flat();
    const turns = turnsBefore(long);
    expect(turns).toHaveLength(EARLIER_MOST);
    expect(turns.at(-1)).toMatch(/^Agent: answer 18 /);
    expect(Math.max(...turns.map((t) => t.length))).toBeLessThan(800);
    // Both ends, with the gap marked: a draft cut short was taken for one its agent never finished.
    const [one] = turnsBefore([line('agent', { result: `Here is the plan. ${'x'.repeat(5000)} Shall I start?` }), line('founder', { saidOutside: 'Yes.' })]);
    expect(one).toMatch(/^Agent: Here is the plan\. .* \[left out here\] .*Shall I start\?$/);
    expect(turnsBefore([line('agent', { result: 'y'.repeat(700) }), line('founder', { saidOutside: 'Yes.' })])).toEqual([`Agent: ${'y'.repeat(700)}`]);
  });
  it('has none for a chat only brought in, and takes nothing an agent wrote as yours', () => {
    expect(turnsBefore(history.slice(0, 4))).toEqual([]);
    expect(turnsBefore([])).toEqual([]);
    expect(turnsBefore([line('agent', { saidOutside: 'Ship it.' }), line('agent', { result: 'Done.' })])).toEqual([]);
  });

  it('a chat that was only brought in reads as it did, with no empty parts', () => {
    const p = catchUpPrompt(chat);
    expect(p).not.toContain('--- the project ---');
    expect(p).not.toContain('then said');
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
  // Seen on a real chat whose agent had marked its own: "One per type (recommended) recommended".
  it('marks the recommended one once, when the agent had marked it too', () => {
    const card = cleanCatchUp(JSON.stringify({ ...JSON.parse(reply), options: ['One per type (Recommended)', 'One per cart', 'Keep (recommended) as a word'] }));
    expect(card.options).toEqual(['One per type', 'One per cart', 'Keep (recommended) as a word']);
    expect(catchUpResult(card)).toContain('1. One per type (recommended)\n2. One per cart\n');
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
