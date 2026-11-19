// THE SUMMARY SITS IN THE THREAD PAGE: ITS ENTRY POINT IN THE TOP BAR, THE
// PANEL ON THE RIGHT, THE MODEL IN THE REPLY BOX, AND NONE OF IT ON A MESSAGE.
//
// Approved 2026-10-01 (w-e731ca9376, rounds 7 and 9). Where the pieces go,
// each of which an edit to Focus.tsx could undo without any other test noticing:
//   - the corner holds the thread's menu, and the state leads the line under
//     the title;
//   - the side panel is gone (w-d143fcb40a): every thread opens on the
//     one-at-a-time page, which keeps its summary on top;
//   - the model word moved out of the header and into the reply box's pill;
//   - a message from a person is not work, so it gets no summary and no state,
//     and one quiet line offers to hand it to an agent.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const focus = fs.readFileSync(new URL('../renderer/src/components/Focus.tsx', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../renderer/src/threads/summary.css', import.meta.url), 'utf8');

describe('the top bar', () => {
  // Since w-e731ca9376 (2026-10-01) the state leads the line under the title
  // and Done is a row in the thread's menu, so the corner holds the Summary
  // button and then the menu's dots.
  // The Summary button left the corner on w-a3482b8c2c: the summary opens from
  // its own rail and closes from beside its title, and the state leads the
  // line under the title only while neither of those is there to say it.
  it('portals only the thread’s menu into the corner', () => {
    const portal = focus.slice(focus.indexOf('createPortal(<span className="ts-top">'));
    // One thing at a time (w-65bcefb857) puts the line saying where an answer
    // went, and its place and arrows, beside the dots, in that mode only.
    // The faces sit with them so the header is one row (2026-11-02); Add
    // people is a row in the menu since w-c25aae4035.
    expect(portal.startsWith('createPortal(<span className="ts-top">{sentUp && aboveDock}{queue && <QueueNav spot={queue.spot} onStep={queue.onStep} />}{crumbFrom && !inChats && (direct || summarised) && <ConversationAside item={item} />}{threadMenu}</span>, cornerHeaderTarget)')).toBe(true);
    expect(focus).toContain('lead={summarised ? <ThreadStateMark item={item} /> : null}');
  });
});

describe('the panel', () => {
  it('is gone: no side panel and no folded strip are drawn beside the conversation', () => {
    expect(focus).not.toMatch(/SummaryPanel|SummaryRail|data-summary=/);
    expect(css).not.toMatch(/\.ts-panel|\.ts-rail/);
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
    expect(focus).toMatch(/onHandToAgent\?: \(item: WorkItem, message\?: AgentTurn\) => void/);
    expect(focus).not.toContain('Hand it to an agent');
    expect(focus).not.toContain('to turn it into a task.');
    expect(focus).not.toContain('className="ts-hand"');
  });

  it('brings an agent in from the reply box instead', () => {
    expect(focus).toContain('const chat = useChatMentions(');
  });
});
