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
import { TeammateCard, TeammateStanding } from '../renderer/src/threads/Summary.tsx';
import { commentWhere } from '../renderer/src/threads/message-kind';

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
  it('heads the page with the state, the line and when it moved', () => {
    const card = { personId: 'dev', threadId: 't', visible: true, title: 'Reminder emails', project: 'Sandbox', state: 'waiting', priority: 2, problem: 'x', progress: null, solution: null, blockedBy: [], blocks: [], people: null, updatedAt: 1_000 };
    const html = renderToStaticMarkup(React.createElement(TeammateStanding, { card, person: { id: 'dev', name: 'Dev Rao' }, now: 61_000 }));
    expect(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()).toBe('Waiting on Dev The agent stopped. Dev looks at it next. Updated 1 min ago');
  });
});

describe('the files it made are listed beside it', () => {
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
    const html = renderToStaticMarkup(React.createElement(TeammateCard, { card, person: null, files: [{ src: 'attachments/a.md', name: 'apology-draft.md', notes: 2, open: () => {} }] }));
    expect(html).toContain('<span class="ts-tk-fname">apology-draft.md</span><span class="ts-tk-notes">2 notes</span>');
  });
  it('and draw no "Blocked by Nothing" when nothing blocks it', () => {
    const card = { personId: 'dev', threadId: 't', visible: true, title: 'x', project: null, state: 'waiting', priority: null, problem: 'x', progress: null, solution: null, blockedBy: [], blocks: [], people: null, updatedAt: 1 };
    const html = renderToStaticMarkup(React.createElement(TeammateCard, { card, person: null }));
    expect(html).not.toContain('Blocked by');
    expect(html).not.toContain('Nothing');
  });
});

describe('the comment box says where the words go, and keeps saying it', () => {
  it('as a line under the box, not a placeholder', () => {
    expect(commentWhere('Dev')).toBe("Goes to Dev's Needs you. It does not start an agent.");
    const src = read('renderer/src/threads/TeammateThread.tsx');
    expect(src).toContain('<p className="tp-comment-where">{commentWhere(owner)}</p>');
    expect(src).not.toMatch(/placeholder=\{`Comment to \$\{owner\}\. This starts no agent\.`\}/);
  });
});

describe('the page uses the window', () => {
  const css = read('renderer/src/threads/pages.css');
  it('puts the conversation and what it is about side by side', () => {
    expect(rule(css, '.tp-grid')).toMatch(/grid-template-columns: minmax\(0, 1fr\) 340px/);
    expect(read('renderer/src/threads/TeammateThread.tsx')).toMatch(/<aside className="tp-side"/);
  });
  it('no longer caps the whole page at 760px', () => {
    expect(css).not.toMatch(/\.th-card-page \{[^}]*max-width: 760px/);
    expect(rule(css, '.tp-page')).not.toMatch(/max-width/);
  });
});
