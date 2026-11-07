// Measured on two copies at 1440x900: Add people ran to x=1326 and the corner
// (1 of 1, Done, the menu) began at x=1131, so Done sat on Add people; the same 195
// point overlap at 1280x800. The corner was floated over a fixed 64px gap. The usage
// panel took the narrow rail's width, so "This session" ran into "28% used", and a
// pinned panel stayed up over the next screen. And one conversation opened on two
// screens: once opened from Chats, the same row from Needs you landed back in Chats
// with a box reading "Message Maya", not "Reply to Maya", which someone typed past.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

describe('the corner of a thread', () => {
  const css = read('renderer/src/threads/summary.css');
  it('sits in the row, not floated over it', () => {
    const rule = css.match(/:has\(\.thread-crumb\) > \.topbar > \.topbar-right \{([^}]*)\}/)[1];
    expect(rule).toContain('position: static');
    expect(rule).toContain('flex: none');
  });
  it('the header no longer guesses its size', () => {
    const rule = css.match(/\.workspace-task-header:has\(> \.thread-crumb\) \{([^}]*)\}/)[1];
    expect(rule).not.toContain('64px');
  });
});

describe('the usage panel', () => {
  it('has a width of its own on the rail', () => {
    const rule = read('renderer/src/workspace-navigation.css').match(/\.workspace-usage \.usage-panel \{([^}]*)\}/)[1];
    expect(rule).toContain('width: 268px');
    expect(rule).toContain('right: auto');
  });
  it('its name and figure do not run together', () => {
    const rule = read('renderer/src/styles.css').match(/\.usage-lim-top \{([^}]*)\}/)[1];
    expect(rule).toContain('gap: 12px');
    expect(rule).toContain('nowrap');
  });
  it('a key or a press anywhere puts it away', () => {
    const src = read('renderer/src/components/UsagePill.tsx');
    expect(src).toContain('onAnyKey');
    expect(src).toContain("window.addEventListener('click', onDown)");
  });
});

describe('one thread, one screen and one box', () => {
  const app = read('renderer/src/App.tsx');
  it('leaving Chats forgets the conversation open there', () => {
    expect(app.match(/const openView = [^\n]*/)[0]).toContain('setChatsDirect(null)');
    const from = app.indexOf('const goNeedsYou');
    expect(app.slice(from, app.indexOf('\n  };', from))).toContain('setChatsDirect(null)');
  });
  it('the box says the same words wherever it was opened', () => {
    const focus = read('renderer/src/components/Focus.tsx');
    expect(focus).not.toContain("talkWord={inChats ? 'Message'");
    expect(focus).not.toContain('text: `Message ${joinNames(talkNames)}`');
  });
});
