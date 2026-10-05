// THE SUMMARY SITS IN THE THREAD PAGE: ITS ENTRY POINT IN THE TOP BAR, THE
// PANEL ON THE RIGHT, THE MODEL IN THE REPLY BOX, AND NONE OF IT ON A MESSAGE.
//
// Approved 2026-10-01 (w-e731ca9376, rounds 7 and 9). Four things about where
// the pieces go, each of which an edit to Focus.tsx could undo without any
// other test noticing:
//   - the Summary button rides in the top bar's corner, beside the thread's
//     menu, so it stays put however far down she reads (the state word moved
//     to the line under the title on 2026-10-01);
//   - the panel is a sibling of the conversation and the reply dock, so both
//     narrow beside it and it scrolls on its own;
//   - the model word moved out of the header and into the reply box's pill;
//   - a message from a person is not work, so it gets no summary and no state,
//     and one quiet line offers to hand it to an agent.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const focus = fs.readFileSync(new URL('../renderer/src/components/Focus.tsx', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../renderer/src/threads/summary.css', import.meta.url), 'utf8');
const summary = fs.readFileSync(new URL('../renderer/src/threads/Summary.tsx', import.meta.url), 'utf8');

describe('the top bar', () => {
  // Since w-e731ca9376 (2026-10-01) the state leads the line under the title
  // and Done is a row in the thread's menu, so the corner holds the Summary
  // button and then the menu's dots.
  // The Summary button left the corner on w-a3482b8c2c: the summary opens from
  // its own rail and closes from beside its title, and the state leads the
  // line under the title only while neither of those is there to say it.
  it('portals only the thread’s menu into the corner', () => {
    const portal = focus.slice(focus.indexOf('createPortal(<span className="ts-top">'));
    expect(portal.startsWith('createPortal(<span className="ts-top">{threadMenu}</span>, cornerHeaderTarget)')).toBe(true);
    expect(focus).toContain('lead={summarised && !summaryOffered ? <ThreadStateMark item={item} /> : null}');
  });
  it('toggles with S only while focus is out of a text field', () => {
    expect(summary).toMatch(/useSummaryShortcut/);
    expect(summary).toMatch(/isContentEditable/);
    expect(focus).toMatch(/useSummaryShortcut\(/);
  });
});

describe('the panel', () => {
  it('is drawn beside the scroll and the dock, not inside either', () => {
    const scroll = focus.indexOf('<div className="focus-scroll"');
    const dock = focus.indexOf('<div className="focus-dock">');
    const panel = focus.indexOf('<SummaryPanel');
    expect(panel).toBeGreaterThan(dock);
    expect(scroll).toBeLessThan(dock);
  });
  it('narrows the conversation and the dock by its own width, and scrolls on its own', () => {
    // 'rail' while it is folded (w-a3482b8c2c), which narrows them by the rail's width instead.
    expect(focus).toMatch(/data-summary=\{summaryShown \? 'open' : summaryOffered \? 'rail' : undefined\}/);
    expect(css).toMatch(/\.focus-pane\[data-summary="open"\] > \.focus-scroll,\s*\.focus-pane\[data-summary="open"\] > \.focus-dock \{ margin-right: var\(--ts-panel-w\); \}/);
    expect(css).toMatch(/\.ts-panel \{[^}]*overflow-y: auto/);
  });
  it('keeps every shape square: no pill radius on anything it draws', () => {
    expect(css).not.toMatch(/border-radius: (1[0-9]|[2-9][0-9])px/);
    expect(css).not.toMatch(/(^|[\s,])\.run[\s,{.:]/m);
  });
});

describe('the model word', () => {
  it('rides at the right end of the reply box’s pill, before its key, and opens the model drawer', () => {
    const pill = focus.indexOf('<span className="dock-pill-text">{folded.text}</span>');
    const word = focus.indexOf('className="ts-model"');
    const key = focus.indexOf('<span className="dock-pill-key"><kbd>R</kbd></span>');
    expect(word).toBeGreaterThan(pill);
    expect(word).toBeLessThan(key);
    expect(focus).toMatch(/openAtStart=\{openModel\}/);
  });
});

describe('a message from a person', () => {
  // THE "HAND IT TO AN AGENT" LINE UNDER A CONVERSATION IS GONE (w-2e8aa16f0f,
  // 2026-10-05): "I don't think 'hand it to an agent to turn it into a task'
  // looks that great or is logically there." It sat under the last message as
  // if it were one more thing said, and it turned the whole conversation into
  // one task. An agent now comes into a conversation with @ in the reply box,
  // working in the project its mention names (team/ChatAgents.tsx). The
  // handler stays on the pane for a message's own action to call.
  it('has no summary and no state, and no line offering to hand it to an agent', () => {
    expect(focus).toMatch(/team\?\.direct === true/);
    expect(focus).toMatch(/onHandToAgent\?: \(item: WorkItem\) => void/);
    expect(focus).not.toContain('Hand it to an agent');
    expect(focus).not.toContain('to turn it into a task.');
    expect(focus).not.toContain('className="ts-hand"');
  });

  it('brings an agent in from the reply box instead', () => {
    expect(focus).toContain('const chat = useChatMentions(');
  });
});
