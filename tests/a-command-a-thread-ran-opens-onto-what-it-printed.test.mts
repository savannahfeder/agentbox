// A COMMAND A THREAD RAN OPENS ONTO WHAT IT PRINTED.
//
// QA (F-204): in a finished thread, Ran commands listed `npm test` and nothing
// else, so nobody could check what the test run printed. The run log a worker
// writes (`traceStreamLine`) kept each tool call and dropped every tool result,
// so the thread's work lines always had empty output. Measured by passing a
// real stream-json call and its result through the writer and the thread
// parser and reading the work line's output.
import { describe, it, expect } from 'vitest';
import { traceStreamLine } from '../main/harnesses/claude-stream.mts';
import { runNodes } from '../renderer/src/item-thread.ts';
import { traceLines } from '../renderer/src/terminal.ts';

const call = (id, command) => JSON.stringify({
  type: 'assistant',
  message: { content: [{ type: 'tool_use', id, name: 'Bash', input: { command } }] },
});
const result = (id, content, isError = false) => JSON.stringify({
  type: 'user',
  message: { content: [{ type: 'tool_result', tool_use_id: id, content, is_error: isError }] },
});
const said = (text) => JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text }] } });

const thread = (...lines) => {
  const text = lines.map(traceStreamLine).filter((l) => l != null).join('\n');
  return runNodes({ text, startedAt: Date.parse('2026-11-04T00:00:00Z') });
};
const work = (nodes) => nodes.filter((n) => n.kind === 'work');

describe('what a command printed', () => {
  it('is on its line', () => {
    const [w] = work(thread(call('t1', 'npm test'), result('t1', 'ok 1 isEven\n# pass 10\n# fail 0\n')));
    expect(w.output).toBe('ok 1 isEven\n# pass 10\n# fail 0');
    expect(w.lines).toBe(3);
    expect(w.failed).toBe(false);
  });

  it('keeps blank lines, the first one too', () => {
    const [w] = work(thread(call('t1', 'npx vitest run'), result('t1', '\n RUN  v3\n\n ✓ a.test.ts')));
    expect(w.output).toBe('\n RUN  v3\n\n ✓ a.test.ts');
    expect(w.lines).toBe(4);
  });

  it('a result given as text blocks reads the same', () => {
    const [w] = work(thread(call('t1', 'npm test'), result('t1', [{ type: 'text', text: 'done' }])));
    expect(w.output).toBe('done');
  });

  it('a failed command says it failed', () => {
    const [w] = work(thread(call('t1', 'npm test'), result('t1', 'Exit code 1\nnot ok 2', true)));
    expect(w.failed).toBe(true);
    expect(w.output).toBe('Exit code 1\nnot ok 2');
  });

  it('two calls in one message each get their own', () => {
    const both = JSON.stringify({
      type: 'assistant',
      message: { content: [
        { type: 'tool_use', id: 'a', name: 'Bash', input: { command: 'ls' } },
        { type: 'tool_use', id: 'b', name: 'Bash', input: { command: 'pwd' } },
      ] },
    });
    const ws = work(thread(both, result('b', '/repo'), result('a', 'src\ntest')));
    expect(ws.map((w) => w.output)).toEqual(['src\ntest', '/repo']);
  });

  it('a very long output is cut on the way in, and says how long it was', () => {
    const long = Array.from({ length: 5000 }, (_, i) => `line ${i}`).join('\n');
    const [w] = work(thread(call('t1', 'cat big'), result('t1', long)));
    expect(w.lines).toBe(5000);
    expect(w.output.split('\n').length).toBeLessThan(5000);
    expect(w.output.startsWith('line 0\nline 1')).toBe(true);
  });

  it('must NOT become something the agent said', () => {
    const nodes = thread(said('Running the tests.'), call('t1', 'npm test'), result('t1', '# pass 10'), said('All pass.'));
    expect(nodes.filter((n) => n.who === 'it').map((n) => n.text)).toEqual(['Running the tests.', 'All pass.']);
  });

  it('must NOT attach to a call it does not answer', () => {
    const [w] = work(thread(call('t1', 'npm test'), result('other', 'stray')));
    expect(w.output).toBe('');
  });

  it('an older log with no output still reads', () => {
    const lines = traceLines({ text: '00:00:01  [Bash] npm test\n00:00:02  Done.', startedAt: Date.parse('2026-11-04T00:00:00Z') });
    expect(lines.map((l) => l.kind)).toEqual(['tool', 'say']);
  });
});
