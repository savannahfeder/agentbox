// THE BARS ARE ONE HEIGHT AND THE COMPOSER ONE STYLE (2026-11-21).
//
// A polish pass on the founder's screenshots of every page, dark and light.
// New thread dimmed the page with its own brown veil and a blur, so in light
// the page went muddy grey while the command bar used the plain scrim. Its
// "TO" and "MODEL" were 11px mono capitals beside sentence-case values. On the
// page, the Agent and Opus 5.5 chips had no mark while every chip beside them
// did. A thread's bar was 56 high against the Inbox's 64, so the arrows
// jumped 4 points going in and out, and its Done and More buttons were 30 with
// a faint line beside the Inbox's 32 with the stronger one. Search in the
// sidebar had a hairline under it that no other row had. Measured in the
// running app at 1512 by 945 by reading the bars' and buttons' boxes.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (f: string) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');
const rule = (css: string, sel: string) =>
  css.match(new RegExp(`(^|\\n)${sel.replace(/[.[\]="()>:]/g, '\\$&')}\\s*\\{([^}]*)\\}`))?.[2] ?? '';
const value = (body: string, prop: string) => body.match(new RegExp(`(^|[;\\s])${prop}:\\s*([^;]+)`))?.[2].trim();

const composerCss = read('renderer/src/threads/thread-composer.css');
const composer = read('renderer/src/threads/ThreadComposer.tsx');
const summary = read('renderer/src/threads/summary.css');
const pages = read('renderer/src/threads/pages.css');
const nav = read('renderer/src/workspace-navigation.css');

describe('the New thread dialog', () => {
  it('dims the page with the command bar’s scrim, no tint or blur of its own', () => {
    const veil = rule(composerCss, '.modal-backdrop.tc-veil');
    expect(veil).toContain('place-items: center');
    expect(veil).not.toMatch(/background|backdrop-filter/);
  });

  it('labels To and Model in the text font, sentence case, 13px', () => {
    const label = rule(composerCss, '.tc-label');
    expect(value(label, 'font-size')).toBe('13px');
    expect(value(label, 'color')).toBe('var(--text-faint)');
    expect(label).not.toMatch(/mono|uppercase|letter-spacing/);
  });
});

describe('the chips on the page', () => {
  it('To wears the agent face inline as well as in the dialog', () => {
    expect(composer).not.toContain('inline ? null : onAuto');
    expect(composer).toMatch(/: onAuto \? <AutoFace \/> : <AgentFace \/>\}/);
    expect(value(rule(composerCss, '.tc-chip > .agent-face'), 'width')).toBe('14px');
  });

  it('Model wears its engine’s mark at 14', () => {
    const trigger = composer.match(/onClick=\{\(\) => toggle\('model'\)\}[\s\S]*?<\/button>/)?.[0] ?? '';
    expect(trigger).toContain('<EngineLogo engine={pick.engine} size={14} />');
  });
});

describe('the thread bar and the Inbox bar', () => {
  it('are the same height, so the arrows stay put', () => {
    const inbox = value(rule(nav, '.workspace-layout > .topbar'), 'height');
    const thread = value(rule(summary, '.workspace-layout.workspace-task:has(.thread-crumb) > .topbar'), 'height');
    expect(inbox).toBe('64px');
    expect(thread).toBe(inbox);
  });

  it('draw their buttons the same height with the same line', () => {
    const newThread = rule(pages, '.th-new');
    for (const sel of ['.ts-done', '.ts-more']) {
      const b = rule(summary, sel);
      expect(value(b, 'height')).toBe(value(newThread, 'height'));
      expect(value(b, 'border')).toBe(value(newThread, 'border'));
    }
    expect(value(rule(summary, '.ts-top .crumb-aside .tm-add-people'), 'height')).toBe('32px');
  });
});

describe('Search in the sidebar', () => {
  it('has no line under it', () => {
    expect(nav).not.toMatch(/\.workspace-find button::after/);
  });
});
