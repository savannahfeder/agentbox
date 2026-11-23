// THE TERMINAL TAKES THE WIDTH OF THE CONVERSATION (w-0ecaecb7ab, 2026-10-01).
//
// With a thread's side summary open, the terminal was drawn across the whole
// page, over the panel. That panel went in 2026-11 (w-d143fcb40a); what stays
// pinned is that the conversation shrinks to what the terminal leaves and
// scrolls, and that nothing narrows the terminal for good.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import postcss from 'postcss';

const sheets = [
  'renderer/src/styles.css',
  'renderer/src/components/task-terminal.css',
].map((f) => postcss.parse(readFileSync(f, 'utf8')));

// Declarations of every top-level rule (outside media queries) whose selector
// list contains `selector` exactly.
const decls = (selector) => {
  const out = {};
  for (const css of sheets) {
    css.walkRules((r) => {
      if (r.parent?.type === 'atrule') return;
      if (!r.selectors.includes(selector)) return;
      r.walkDecls((d) => { out[d.prop] = d.value; });
    });
  }
  return out;
};

describe('the conversation the terminal covers', () => {
  it('shrinks to what is left and scrolls to show the rest', () => {
    expect(decls('.focus-pane')).toMatchObject({ display: 'flex', 'flex-direction': 'column' });
    expect(decls('.focus-scroll')).toMatchObject({ flex: '1', 'overflow-y': 'auto', 'min-height': '0' });
    expect(decls('.task-terminal')['flex-shrink']).toBe('0');
  });
});

describe('nothing beside it', () => {
  it('the terminal keeps the full width: nothing narrows it unconditionally', () => {
    expect(decls('.task-terminal')['margin-right']).toBeUndefined();
    expect(decls('.task-terminal-bottom')['margin-right']).toBeUndefined();
    expect(decls('.task-terminal-side')['margin-right']).toBeUndefined();
  });
});
