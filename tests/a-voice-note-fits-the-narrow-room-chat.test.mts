// A VOICE NOTE FITS THE NARROW ROOM CHAT.
//
// In the room chat beside the board, a voice note waiting to be sent ran past
// the right edge of the box and hid its own remove button. Its 44 bars were
// each held at 2px with 2px between, so the waveform alone was 174px and the
// whole note about 342px, in a box with 294px inside it. Measured by laying the
// note out in headless Chrome at that width before and after (the harness is
// not kept); held here by the rules that let it shrink: the bars give up their
// spacing first and then their width, down to a floor the note still fits at,
// and every box around them may be narrower than its contents.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { THREAD_WIDTH } from '../renderer/src/team/chat-threads.ts';

const css = fs.readFileSync(new URL('../renderer/src/team/voice-note.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const rule = (sel) => {
  const at = css.split('}').find((r) => r.split('{')[0].split(',').map((s) => s.trim()).includes(sel));
  if (!at) throw new Error(`no rule for ${sel}`);
  return Object.fromEntries(at.split('{')[1].split(';').map((d) => d.split(':').map((s) => s.trim())).filter(([k, v]) => k && v));
};
const px = (v) => Number(String(v).replace('px', ''));

describe('a voice note in a narrow chat', () => {
  it('has bars that shrink, never wider than they were and never gone', () => {
    const bar = rule('.voice-bars span');
    expect(bar.flex).toBe('0 1 2px');
    expect(px(bar['min-width'])).toBe(1);
  });

  it('spreads its bars over the width it gets, and stops at a floor the note fits at', () => {
    const bars = rule('.voice-bars');
    expect(bars['justify-content']).toBe('space-between');
    expect(px(bars.gap)).toBe(1);
    // A width, not a flex basis: a chat sizes the note from its contents' widths, and a basis alone left it at the floor everywhere.
    expect(px(bars.width)).toBe(174);
    expect(bars.flex).toBe('0 1 auto');
    const floor = px(bars['min-width']);
    // play 28, time 30, speed 34, three gaps of 10, padding 16, border 2, remove 28
    expect(floor + 28 + 30 + 34 + 30 + 16 + 2 + 28).toBeLessThanOrEqual(294);
    expect(floor).toBeGreaterThanOrEqual(44 + 43);
  });

  it('lets every box around the bars be narrower than its contents', () => {
    expect(rule('.voice-note')['min-width']).toBe('0');
    expect(rule('.attach-voice')['min-width']).toBe('0');
    expect(rule('.attach-voice')['max-width']).toBe('100%');
    expect(rule('.attach-voice .voice-note').flex).toBe('0 1 auto');
  });

  it('keeps the button that takes it out of the box at its full size', () => {
    expect(rule('.attach-voice-remove').flex).toBe('none');
  });
});

// Codex found the direct chat's thread panel, dragged to its narrowest, still
// too narrow: 320px less its border, 28px each side and the box's border
// leaves 261px, and the note with its speed needs 268px inside 16px padding.
describe('a voice note in the thread panel at its narrowest', () => {
  const box = THREAD_WIDTH.min - 1 - 2 * 28 - 2;
  const narrow = css.match(/@container \(width < (\d+)px\) \{([^}]*\{[^}]*\})\s*\}/);

  it('lets the speed go from a note still waiting to be sent, and only in a box that narrow', () => {
    expect(narrow).not.toBeNull();
    expect(narrow[2]).toMatch(/\.attach-voice \.voice-speed \{ display: none; \}/);
    expect(box).toBeLessThan(Number(narrow[1]));
    // Wide enough for the note with its speed beyond the threshold: 268px inside 16px padding each side.
    expect(Number(narrow[1]) - 32).toBeGreaterThanOrEqual(268);
  });

  it('fits there without it', () => {
    const floor = px(rule('.voice-bars')['min-width']);
    expect(floor + 28 + 30 + 20 + 16 + 2 + 28).toBeLessThanOrEqual(box - 32);
  });
});
