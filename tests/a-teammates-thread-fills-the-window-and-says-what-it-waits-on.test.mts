// A TEAMMATE'S THREAD FILLS THE WINDOW AND SAYS WHAT IT WAITS ON, AND FROM WHOM.
//
// What broke, seen 2026-10-30 at 1440x900 on the team version: opening Dev's
// shared thread drew a 760px column hugging the left edge, half the window
// empty; its state was one grey word in a card ("Waiting on Dev") between
// "Blocked by Nothing" and "Blocks Nothing"; the files the agent made were only
// links inside its answer; and the comment box said "This starts no agent" in a
// placeholder that vanished on the first key. The owner: "it looks visually
// pretty bad, takes up only a tiny part of the screen, and is not exceptionally
// helpful." Measured with the page's CSS and its rendered parts.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { standingLine, filesOnThread } from '../renderer/src/threads/teammate-thread';
import { TeammateSummary, TeammateStanding } from '../renderer/src/threads/Summary.tsx';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const rule = (css, sel) => css.match(new RegExp(`^${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`, 'm'))?.[1] ?? '';

describe('what it waits on, in words', () => {
  it('says whose move it is when the agent has stopped', () => {
    expect(standingLine('waiting', 'Dev', null)).toBe('The agent stopped. Dev looks at it next.');
  });
  it('says it is moving while an agent runs', () => {
    expect(standingLine('running', 'Dev', null)).toBe("Dev's agent is working on it.");
  });
  it('says when it comes back while it waits on something else', () => {
    expect(standingLine('waiting', 'Dev', 'Maya')).toBe('It starts again when that is done.');
  });
  it('says nothing more for a thread that is done or not started', () => {
    expect(standingLine('done', 'Dev', null)).toBe(null);
    expect(standingLine('scheduled', 'Dev', null)).toBe(null);
  });
  // When it moved went up beside whose thread it is (w-8a8eac7620): at the
  // column's right edge it was far from the words it dated.
  it('heads the page with the state and the line', () => {
    const card = { personId: 'dev', threadId: 't', visible: true, title: 'Reminder emails', project: 'Sandbox', state: 'waiting', priority: 2, problem: 'x', progress: null, solution: null, blockedBy: [], blocks: [], people: null, updatedAt: 1_000 };
    const html = renderToStaticMarkup(React.createElement(TeammateStanding, { card, person: { id: 'dev', name: 'Dev Rao' } }));
    expect(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()).toBe('Waiting on Dev The agent stopped. Dev looks at it next.');
  });
});

describe('the files it made are listed in its summary', () => {
  it('once each, by its own name, with the notes on it', () => {
    const lines = [
      { source: 'agent', patch: { result: 'Rules in [reminder-rules.md](attachments/46a7b09ba2b8-reminder-rules.md), a draft in [apology-draft.md](attachments/5429351f754c-apology-draft.md).' } },
      { source: 'agent', patch: { note: 'Again: [reminder-rules.md](attachments/46a7b09ba2b8-reminder-rules.md). A link out [docs](https://example.com) is not a file.' } },
    ];
    expect(filesOnThread(lines, [{ file: 'apology-draft.md' }, { file: 'apology-draft.md' }, { file: 'other.md' }])).toEqual([
      { src: 'attachments/46a7b09ba2b8-reminder-rules.md', name: 'reminder-rules.md', notes: 0 },
      { src: 'attachments/5429351f754c-apology-draft.md', name: 'apology-draft.md', notes: 2 },
    ]);
  });
  it('as tiles with the number of notes on each', () => {
    const card = { personId: 'dev', threadId: 't', visible: true, title: 'x', project: null, state: 'waiting', priority: null, problem: 'x', progress: null, solution: null, blockedBy: [], blocks: [], people: null, updatedAt: 1 };
    const html = renderToStaticMarkup(React.createElement(TeammateSummary, { card, owner: 'Dev', files: [{ src: 'attachments/a.md', name: 'apology-draft.md', notes: 2, open: () => {} }] }));
    expect(html).toContain('<span class="ts-tk-fname">apology-draft.md</span><span class="ts-tk-notes">2 notes</span>');
  });
  it('and draw no "Blocked by Nothing" when nothing blocks it', () => {
    const card = { personId: 'dev', threadId: 't', visible: true, title: 'x', project: null, state: 'waiting', priority: null, problem: 'Reminders went out twice.', progress: null, solution: null, blockedBy: [], blocks: [], people: null, updatedAt: 1 };
    const html = renderToStaticMarkup(React.createElement(TeammateSummary, { card, owner: 'Dev' }));
    expect(html).not.toContain('Blocked by');
    expect(html).not.toContain('Nothing');
  });
});

describe('the comment box explains nothing', () => {
  it('no line under the box, and no explaining placeholder', () => {
    const src = read('renderer/src/threads/TeammateThread.tsx');
    expect(src).not.toContain('tp-comment-where');
    expect(src).not.toMatch(/placeholder=\{`Comment to \$\{owner\}\. This starts no agent\.`\}/);
  });
});

describe('the page uses the window', () => {
  const css = read('renderer/src/threads/pages.css');
  // 2026-11-20 (w-f702d60afe): the two-column page did not match an opened
  // thread of the founder's own. 2026-11-21: it is drawn in the thread page's
  // own column with the reply box at the foot, and About became the summary at
  // its top (w-8a8eac7620), so nothing sits beside it.
  it('sets the conversation in the opened-thread column, with its summary at the top', () => {
    const page = read('renderer/src/threads/TeammateThread.tsx');
    expect(page).toContain('<div className="focus-pane tp-thread">');
    expect(page).toMatch(/<div className="focus-dock" ref=\{dockEl\}>[\s\S]*?<CommentBox /);
    expect(page.indexOf('<TeammateSummary')).toBeLessThan(page.indexOf('<QueueAnswer'));
    expect(page).not.toMatch(/<aside/);
  });
  it('no longer caps the whole page at 760px', () => {
    expect(css).not.toMatch(/\.th-card-page \{[^}]*max-width: 760px/);
    expect(rule(css, '.tp-page')).not.toMatch(/max-width/);
  });
});
