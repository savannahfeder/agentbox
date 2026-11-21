// A TEAMMATE'S THREAD READS LIKE THE OWNER'S (w-f702d60afe, 2026-11-21).
//
// On the tour screens, the same message read differently on the page a
// teammate opens (06-thread, as Theo) and on its owner's own thread. The
// Result block set no line height, so its lines were about 22px apart against
// 26px on the owner's; inline code was the browser's monospace at .87em, not
// the app's mono at the owner's 13px in 16. "What Sam's agent already tried"
// and "Result" were two label styles, and Result sat about 88px under the
// message before it (the turn's 22px frame and 16px margin, the thread's 22px
// gap before its empty last div, then 28px of its own) where the tried label
// sat 28px down. "View the change" was the only button in the body without a
// mark. Measured on the page drawn with these rules (Result 24px under the
// message, as the tried label is under the header); here by reading the rules
// in pages.css and asks.css, and by drawing the ask.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import postcss from 'postcss';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AskBar } from '../renderer/src/team/AskBar.tsx';

const pages = postcss.parse(fs.readFileSync('renderer/src/threads/pages.css', 'utf8'));
const asks = postcss.parse(fs.readFileSync('renderer/src/team/asks.css', 'utf8'));
const decls = (css: postcss.Root, selector: string) => {
  const out: Record<string, string> = {};
  css.walkRules((r) => { if (r.selector === selector) r.walkDecls((d) => { out[d.prop] = d.value; }); });
  return out;
};
const at = (css: postcss.Root, selector: string) => {
  let line = -1;
  css.walkRules((r) => { if (r.selector === selector) line = r.source?.start?.line ?? -1; });
  return line;
};
const BODY = '.tp-col :is(.msg-body, .appendix)';

describe('the messages and the Result', () => {
  it('set lines 1.6 apart, as the owner\'s thread does', () => {
    expect(decls(pages, BODY)['line-height']).toBe('1.6');
    expect(decls(asks, '.ask-bar-note')['line-height']).toBe('1.6');
  });
  it('space paragraphs 8px apart, after the page\'s older rule so it wins', () => {
    expect(decls(pages, `${BODY} p`).margin).toBe('8px 0');
    expect(at(pages, `${BODY} p`)).toBeGreaterThan(at(pages, '.th-work .msg-body p, .th-work .appendix p'));
  });
  it('still start and end a message flush, as the owner\'s does', () => {
    expect(decls(pages, '.tp-col .msg-body > :first-child')['margin-top']).toBe('0');
    expect(decls(pages, '.tp-col .msg-body > :last-child')['margin-bottom']).toBe('0');
  });
  it('draw inline code in the app\'s mono, at 13px in 16, on the work chip', () => {
    const code = decls(pages, `${BODY} :not(pre) > code`);
    expect(code['font-family']).toBe('var(--mono)');
    expect(code['font-size']).toMatch(/em$/);
    expect(parseFloat(code['font-size']) * 16).toBeCloseTo(13, 0);
    expect(code.background).toBe('var(--work-chip)');
    expect(code['border-radius']).toBe('var(--radius)');
  });
});

describe('the section labels', () => {
  it('are one style: 13px, 500, the dim ink, 8px above what they name', () => {
    const tried = decls(pages, '.tp-tried h2');
    const result = decls(pages, '.tp-col .appendix-label');
    for (const label of [tried, result]) {
      expect(label['font-size']).toBe('13px');
      expect(label['font-weight']).toBe('500');
      expect(label.color).toBe('var(--text-dim)');
      expect(label['line-height']).toBe('18px');
    }
    expect(tried.margin).toBe('0 0 8px');
    expect(result['margin-bottom']).toBe('8px');
  });
  it('each sit 24px under what comes before', () => {
    expect(decls(pages, '.tp-top').margin).toBe('0 0 24px');
    expect(decls(pages, '.tp-tried').margin).toMatch(/^24px /);
    expect(decls(pages, '.tp-col .appendix-foot')['margin-top']).toBe('24px');
  });
  it('Result does not also carry the space that frames the turn before it', () => {
    const last = decls(pages, '.tp-col .thread:has(+ .appendix) > .thread-block:nth-last-child(2) > .msg.turn-end');
    expect(last['padding-bottom']).toBe('0');
    expect(last['margin-bottom']).toBe('0');
    expect(last['border-bottom']).toBe('0');
    // The thread ends in an empty div (Thread's scroll foot), which the column's gap spaced like a message.
    expect(decls(pages, '.tp-col .thread:has(+ .appendix) > :last-child:empty').display).toBe('none');
  });
  it('but a turn in the middle of the thread keeps its frame', () => {
    let zeroed = false;
    pages.walkRules((r) => { if (/turn-end/.test(r.selector) && !r.selector.includes(':has(+ .appendix)')) zeroed = true; });
    expect(zeroed).toBe(false);
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
