// EVERY CHIP IN THE REPLY BOX HAS A MARK (2026-11-21).
//
// From the founder's screens before onboarding ("certain buttons are lacking
// icons"). Under a thread, the reply box's priority chip had its bars, but the
// permission mode ("Auto") and the model ("Codex's own") were bare words, while
// every chip in Home's box carries a 14px mark. In the command bar, Mark done
// and Close task wore the same double tick, so two different acts looked like
// one. Read off the tour screenshots of the reply box and the command bar.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ICONS, iconFor } from '../renderer/src/palette-glyphs.ts';

const read = (f: string) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');
const focus = read('renderer/src/components/Focus.tsx');
const replyModel = read('renderer/src/components/ReplyModel.tsx');

describe('the reply box chips', () => {
  it('the mode chip draws a 14px shield before its word', () => {
    const picker = focus.match(/function ModePicker[\s\S]*?\n}\n/)?.[0] ?? '';
    const chip = picker.match(/\{chip\s*\?[\s\S]*?tc-chip-label[\s\S]*?:/)?.[0] ?? '';
    expect(chip).toMatch(/<ModeMark \/>/);
    const mark = focus.match(/const ModeMark = [\s\S]*?<\/svg>/)?.[0] ?? '';
    expect(mark).toMatch(/width="14" height="14"/);
    expect(mark).toMatch(/stroke="currentColor"/);
  });

  it('the mode word outside a chip stays a bare word', () => {
    const picker = focus.match(/function ModePicker[\s\S]*?\n}\n/)?.[0] ?? '';
    const word = picker.match(/tc-chip-label[\s\S]*?:\s*(titleCase[^\n]*)/)?.[1] ?? '';
    expect(word).not.toContain('ModeMark');
  });

  it('the model chip draws its engine’s logo at 14, as Home does', () => {
    expect(replyModel).toContain("import { EngineLogo } from './EngineLogos'");
    const chip = replyModel.match(/\{chip\s*\?[\s\S]*?tc-chip-label/)?.[0] ?? '';
    expect(chip).toContain('<EngineLogo engine={pick.engine} size={14} />');
  });

  it('the plain model word in a sentence carries no logo', () => {
    const word = replyModel.match(/tc-chip-label[\s\S]*?:\s*(<>[^\n]*)/)?.[1] ?? '';
    expect(word).toBeTruthy();
    expect(word).not.toContain('EngineLogo');
  });
});

describe('a narrow reply bar', () => {
  it('drops the two marks so Auto and the model still fit on one row', () => {
    const narrow = read('renderer/src/narrow-conversation.css');
    const hidden = narrow.match(/\n\s*\.dock-chips \.tc-chip-word,[^{]*\{ display: none; \}/)?.[0] ?? '';
    expect(hidden).toContain('.dock-chips .mode-mark');
    expect(hidden).toContain('.dock-chips .model-pick .engine-logo');
    expect(hidden).not.toContain('.tc-prio');
  });
});

describe('the command bar', () => {
  it('Close task has its own icon, not Mark done’s', () => {
    const close = iconFor({ id: 'close-task', label: 'Close task' });
    const done = iconFor({ id: 'done', label: 'Mark done' });
    expect(done).toBe('done');
    expect(close).not.toBe(done);
    expect(ICONS[close]).not.toEqual(ICONS[done]);
  });

  it('Close task is a ring with a tick in it', () => {
    expect(iconFor({ id: 'close-task', label: 'Close task' })).toBe('closed');
    expect(ICONS.closed).toHaveLength(2);
  });
});
