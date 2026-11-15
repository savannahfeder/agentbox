// THE TERMINAL STAYS BESIDE THE SUMMARY, NOT UNDER IT (w-0ecaecb7ab, 2026-10-01).
//
// With a thread's summary open, opening its terminal drew the terminal across
// the whole width of the page, right edge included. The summary panel is laid
// over the right of the page from top to bottom (`.ts-panel`, absolute,
// top 0 bottom 0), so the two overlapped: on her screenshot the terminal's
// "zsh / End shell / close" sat on top of the panel's SOLUTION paragraph, and
// the panel's last line ran through the terminal's screen. The conversation and
// the reply dock already gave up the panel's width (summary.css); the terminal
// was the one sibling that did not.
//
// The terminal now gives up the same width, in both of its placements, so it
// covers the conversation only. The conversation keeps scrolling in what is
// left above it, and the panel keeps its full height and its own scroll.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import postcss from 'postcss';

const sheets = [
  'renderer/src/styles.css',
  'renderer/src/threads/summary.css',
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

describe('with the summary open', () => {
  it('the terminal at the bottom gives up the panel’s width', () => {
    expect(decls('.focus-pane[data-summary="open"] > .task-terminal')['margin-right']).toBe('var(--ts-panel-w)');
  });

  it('the terminal at the side sits left of the panel rather than on it', () => {
    // The side terminal is pinned at right 0; the same margin is what moves an
    // absolutely placed box in from that edge, so one rule covers both.
    const side = decls('.task-terminal-side');
    expect(side.position).toBe('absolute');
    expect(side.right).toBe('0');
    expect(decls('.focus-pane[data-summary="open"] > .task-terminal')['margin-right']).toBe('var(--ts-panel-w)');
  });

  it('the panel keeps its full height and scrolls on its own', () => {
    const panel = decls('.ts-panel');
    expect(panel).toMatchObject({ position: 'absolute', top: '0', bottom: '0', right: '0', 'overflow-y': 'auto' });
  });
});

describe('the conversation the terminal covers', () => {
  it('shrinks to what is left and scrolls to show the rest', () => {
    expect(decls('.focus-pane')).toMatchObject({ display: 'flex', 'flex-direction': 'column' });
    expect(decls('.focus-scroll')).toMatchObject({ flex: '1', 'overflow-y': 'auto', 'min-height': '0' });
    expect(decls('.task-terminal')['flex-shrink']).toBe('0');
  });
});

describe('with the summary closed', () => {
  it('the terminal keeps the full width: nothing narrows it unconditionally', () => {
    expect(decls('.task-terminal')['margin-right']).toBeUndefined();
    expect(decls('.task-terminal-bottom')['margin-right']).toBeUndefined();
    expect(decls('.task-terminal-side')['margin-right']).toBeUndefined();
  });
});
