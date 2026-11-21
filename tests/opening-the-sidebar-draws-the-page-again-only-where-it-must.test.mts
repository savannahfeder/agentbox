// OPENING THE SIDEBAR DRAWS THE PAGE AGAIN ONLY WHERE IT MUST (w-07de09be0f, 2026-11-21).
//
// "When I open the sidebar, there's this weird lag. It feels like it's going at
// 5 frames per second." The sidebar opens by moving the page over, so the
// page's width changes on every frame of the slide, and every frame was
// answered by drawing again: the sky (its own test), the whole app, which kept
// the body's width as state, an open conversation, which kept its pane's, and
// every row of a long Inbox, laid out and painted though most were off screen.
// Traced in Chromium on the built screen at 1710x1063 with 330 threads, the
// main thread's time over one opening and closing: Home 1054 -> 266 ms, the
// Inbox 1105 -> 456 ms, a 40-turn thread 481 -> 202 ms; each frame of the
// Inbox's slide 57 -> 18 ms.
import fs from 'node:fs';
import { describe, it, expect } from 'vitest';
import { artifactPlacement, keptWidth } from '../renderer/src/artifact-layout.ts';
import { THREAD_WIDTH, clampThreadWidth, paneForThread } from '../renderer/src/team/chat-threads.ts';

const read = (p: string) => fs.readFileSync(new URL(`../renderer/src/${p}`, import.meta.url), 'utf8');
const app = read('App.tsx');
const focus = read('components/Focus.tsx');
const docPane = read('components/DocPane.tsx');
const pages = read('threads/pages.css');
const styles = read('styles.css');

describe('the body width the app keeps', () => {
  it('stays put while the sidebar narrows the page with no file open', () => {
    // A 1710-wide window's body, folded and then open.
    expect(keptWidth(1606, 1442, false)).toBe(1606);
    expect(keptWidth(1606, 1517.25, false)).toBe(1606);
  });
  it('moves when the width crosses where a file stops fitting beside the chat', () => {
    expect(keptWidth(1100, 950, false)).toBe(950);
    expect(keptWidth(950, 1100, false)).toBe(1100);
    expect(keptWidth(1200, 1000, false)).toBe(1200);
    expect(keptWidth(1200, 999.5, false)).toBe(999.5);
  });
  it('follows every width while a file is open, whose split it sets', () => {
    expect(keptWidth(1606, 1442, true)).toBe(1442);
  });
  it('never places a file differently from the exact width', () => {
    for (const was of [600, 999, 1000, 1400, 2000]) for (const width of [500, 998, 999.9, 1000, 1001, 1600]) {
      expect(artifactPlacement('beside', keptWidth(was, width, false))).toBe(artifactPlacement('beside', width));
    }
  });
  it('is what the app stores, and a file opens at the exact width before its first paint', () => {
    expect(app).toContain('setArtifactWidth((was) => keptWidth(was, width, fileOpen));');
    expect(app).toContain('useLayoutEffect(() => { if (fileOpen) setArtifactWidth(bodyWidth.current); }, [fileOpen]);');
  });
});

describe('the pane width a conversation keeps', () => {
  it('is measured only for a chat, whose thread panel is the one thing that reads it', () => {
    expect(focus).toMatch(/if \(!pane \|\| !direct\) return undefined;\n\s*const measure = \(\) => setPaneWidth\(paneForThread\(pane\.clientWidth\)\);/);
  });
  it('is the same for any pane wider than the panel can use', () => {
    expect(paneForThread(1442)).toBe(paneForThread(1606));
    expect(paneForThread(THREAD_WIDTH.max + THREAD_WIDTH.chat + 1)).toBe(THREAD_WIDTH.max + THREAD_WIDTH.chat);
  });
  it('keeps a narrower pane exactly', () => {
    expect(paneForThread(1100)).toBe(1100);
    expect(paneForThread(THREAD_WIDTH.max + THREAD_WIDTH.chat - 1)).toBe(THREAD_WIDTH.max + THREAD_WIDTH.chat - 1);
  });
  it('draws the thread panel exactly as wide as the real pane would', () => {
    for (const want of [100, 320, 480, 600, 760, 900]) for (const pane of [600, 900, 1319, 1320, 1321, 1442, 1606, 3000]) {
      expect(clampThreadWidth(want, paneForThread(pane))).toBe(clampThreadWidth(want, pane));
    }
  });
});

it("a file's pane keeps its card edge when only the card's width changed", () => {
  expect(docPane).toContain('setEdge((was) => (was.x === next.x && was.y === next.y && was.h === next.h && was.r === next.r ? was : next));');
});

describe('a long Inbox', () => {
  const rule = pages.match(/\.th-table \.row\[data-item-id\] \{ content-visibility: auto; contain-intrinsic-size: auto (\d+)px; \}/);
  it('skips a thread row far off screen', () => {
    expect(rule).not.toBeNull();
  });
  it("holds a skipped row at a row's own height, so the scrollbar does not lurch", () => {
    const pad = styles.match(/\n\.row \{[^}]*padding: (\d+)px \S+ (\d+)px/);
    const line = pages.match(/\.th-grid > div \{ line-height: (\d+)px; \}/);
    expect(Number(rule![1])).toBe(Number(pad![1]) + Number(line![1]) + Number(pad![2]));
  });
  it('leaves the phone layout alone, whose rows are of more than one height', () => {
    const phone = read('phone.css').match(/@media \(max-width: (\d+)px\), \(max-height: (\d+)px\) \{/);
    const desk = pages.match(/@media \(min-width: (\d+)px\) and \(min-height: (\d+)px\) \{\s*\.th-table \.row\[data-item-id\] \{ content-visibility: auto;/);
    expect(phone).not.toBeNull();
    expect(desk).not.toBeNull();
    expect(Number(desk![1])).toBe(Number(phone![1]) + 1);
    expect(Number(desk![2])).toBe(Number(phone![2]) + 1);
    expect(pages.match(/content-visibility/g)).toHaveLength(1);
  });
  it('leaves the column headings and section labels drawn, which are not thread rows', () => {
    const pagesTsx = read('threads/Pages.tsx');
    const heads = pagesTsx.match(/<div className=\{?[`"]row th-head[^>]*>/g) ?? [];
    expect(heads.length).toBeGreaterThan(0);
    for (const h of heads) expect(h).not.toContain('data-item-id');
    expect(read('components/List.tsx')).toContain('data-item-id={item.id}');
  });
});
