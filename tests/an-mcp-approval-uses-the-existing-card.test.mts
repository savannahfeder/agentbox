// A real personal Claude plugin request reached the existing card on 2026-09-16
// with zero arguments and displayed UNREADABLE. Measure tool identity and every
// argument, while keeping Bash/Read/Codex cards and approval controls unchanged.
import { expect, it } from 'vitest';
import { approvalReads, UNREADABLE } from '../renderer/src/approval-card.ts';

it('names an MCP tool even when it takes no arguments', () => {
  expect(approvalReads({}, 'mcp__parity-fixture__ping')).toEqual({ what: 'asks to use', body: 'parity-fixture / ping\n\nNo arguments.' });
});
it('shows all arguments without interpreting MCP keys as native approval metadata', () => {
  const input = { command: 'literal \\ path\nnext line', host: 'example', changes: 'value', count: 0, enabled: false, optional: null, filters: { labels: ['bug', 'urgent'] } };
  const result = approvalReads(input, 'mcp__github__search_issues');
  expect(result.what).toBe('asks to use');
  expect(result.body).toContain('github / search_issues');
  for (const [key, value] of Object.entries(input)) expect(result.body).toContain(`${key}: ${JSON.stringify(value, null, 2)}`);
});
it('does not silently shorten a consequential argument', () => {
  const content = 'x'.repeat(20000);
  expect(approvalReads({ content }, 'mcp__files__write').body).toContain(content);
});
it.each([null, undefined, 'text', 4, [], true])('keeps malformed MCP arguments explicitly unreadable: %j', (input) => {
  expect(approvalReads(input, 'mcp__server__tool').body).toContain(UNREADABLE);
});
it('keeps native cards unchanged and does not guess from a malformed MCP name', () => {
  expect(approvalReads({ command: 'echo hello' }, 'Bash')).toEqual({ what: 'asks to run', body: 'echo hello' });
  expect(approvalReads({ file_path: '/tmp/a' }, 'Read').body).toBe('/tmp/a');
  expect(approvalReads({ changes: 'diff' }, 'Write').what).toBe('asks to change');
  expect(approvalReads({}, 'mcp__broken').body).toBe(UNREADABLE);
});
