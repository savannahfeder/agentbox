// A TEAMMATE'S THREAD READS LIKE THE OWNER'S (w-f702d60afe, 2026-11-21).
//
// On the tour screens, the same message read differently on the page a
// teammate opens (06-thread, as Theo) and on its owner's own thread. The
// Result block set no line height, so its lines were about 22px apart against
// 26px on the owner's; inline code was the browser's monospace at .87em, not
// the app's mono at the owner's 13px in 16. "What Sam's agent already tried"
// and "Result" were two label styles, and Result sat about 88px under the
// message before it. "View the change" was the only button in the body without
// a mark.
//
// CHANGED (w-8a8eac7620): the page now draws its messages in the owner's own
// thread body and its newest answer with the owner's QueueAnswer, and what was
// tried moved into the summary at the top. So this checks that the page keeps
// no type rules of its own, which is how it drifted, and that the tried label
// is the summary's label, not a second style.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import postcss from 'postcss';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AskBar } from '../renderer/src/team/AskBar.tsx';
import { TeammateSummary } from '../renderer/src/threads/Summary.tsx';

const pages = postcss.parse(fs.readFileSync('renderer/src/threads/pages.css', 'utf8'));
const asks = postcss.parse(fs.readFileSync('renderer/src/team/asks.css', 'utf8'));
const styles = postcss.parse(fs.readFileSync('renderer/src/styles.css', 'utf8'));
const page = fs.readFileSync('renderer/src/threads/TeammateThread.tsx', 'utf8');
const owners = fs.readFileSync('renderer/src/components/Focus.tsx', 'utf8');
const decls = (css: postcss.Root, selector: string) => {
  const out: Record<string, string> = {};
  css.walkRules((r) => { if (r.selector === selector) r.walkDecls((d) => { out[d.prop] = d.value; }); });
  return out;
};

describe('the messages and the newest answer', () => {
  it('sit in the owner\'s own thread body and answer', () => {
    expect(owners).toContain('className="focus-body markdown agent-thread"');
    expect(page).toContain('<div className="focus-body markdown agent-thread"');
    expect(page).toContain('<QueueAnswer ');
  });
  it('have no type rules of their own to drift from the owner\'s', () => {
    const own: string[] = [];
    pages.walkRules((r) => { if (/\.tp-(col|thread)\b[^,]*(msg-body|appendix|code|\b(p|ul|ol)\b)/.test(r.selector)) own.push(r.selector); });
    expect(own).toEqual([]);
  });
  it('and the ask\'s words set their lines 1.6 apart, as the owner\'s thread does', () => {
    expect(decls(styles, '.markdown')['line-height']).toBe('1.6');
    expect(decls(asks, '.ask-bar-note')['line-height']).toBe('1.6');
  });
});

describe('the section labels', () => {
  it('are one style: what was tried is labelled as the summary\'s files and what it holds up are', () => {
    const card = { personId: 'sam', threadId: 't', visible: true, title: 'Add an idempotency key', problem: 'Retries charge twice.', progress: 'Found the retry', blocks: [{ id: 'w-x', title: null }] };
    const files = [{ src: 'attachments/a.md', name: 'a.md', notes: 0, open() {} }];
    const html = renderToStaticMarkup(h(TeammateSummary, { card, owner: 'Sam', files } as never));
    expect([...html.matchAll(/<span class="ts-h">([^<]*)<\/span>/g)].map((m) => m[1])).toEqual(['What Sam&#x27;s agent already tried', 'Files', 'Blocks']);
  });
});

describe('View the change', () => {
  const task = { id: 'a', product: 'dm', productName: '', ask: { kind: 'review', owner: 'sam', thread: 't', product: 'api' }, body: '[c](attachments/x.change)' };
  const draw = (props: object) => renderToStaticMarkup(h(AskBar, { task, owner: { id: 'sam', name: 'Sam Lee' }, onHandBack: async () => true, onOpenChange() {}, ...props } as never));
  const button = (html: string) => /<button[^>]*>(?:(?!<\/button>).)*View the change<\/button>/.exec(html)?.[0] ?? '';
  it('carries the code mark the thread bar draws, at 16px and the same stroke', () => {
    const b = button(draw({ answeredBelow: true }));
    expect(b).toContain('<svg');
    expect(b).toContain('width="16"');
    expect(b).toContain('stroke-width="1.4"');
    expect(b).toContain('d="m8.5 7-5 5 5 5"');
    expect(b).toContain('d="m15.5 7 5 5-5 5"');
  });
  it('sets the mark 8px from its words', () => {
    const b = decls(asks, '.ask-bar-acts .ask-bar-change');
    expect(b.display).toBe('inline-flex');
    expect(b.gap).toBe('8px');
  });
  it('leaves the buttons with only words unmarked', () => {
    const html = draw({});
    expect(/<button[^>]*>Looks good<\/button>/.test(html)).toBe(true);
    expect(/<button[^>]*>Needs changes<\/button>/.test(html)).toBe(true);
  });
});
