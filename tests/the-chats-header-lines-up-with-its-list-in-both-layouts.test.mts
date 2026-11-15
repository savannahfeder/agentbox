// The founder's pictures of the Chats page (2026-10-26) showed the "Chats"
// header's divider 12 px left of the list's edge under it. The header pulls
// itself left by the top bar's padding so it starts where the list does, and
// it pulled by 44 px, the padding of the narrow-rail layout, in the wide
// sidebar layout too, whose top bar pads 32 px. Measured on the stage: rail
// header 82 to 382 and list 82 to 382; wide header 234 to 534 and list 246 to
// 546. It now pulls by the padding of the layout it is in.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const rooms = fs.readFileSync(new URL('../renderer/src/team/rooms/rooms.css', import.meta.url), 'utf8');
const nav = fs.readFileSync(new URL('../renderer/src/workspace-navigation.css', import.meta.url), 'utf8');
const px = (re, text) => Number(re.exec(text)?.[1]);

describe('the Chats header', () => {
  it('pulls left by exactly the top bar\'s padding in the wide sidebar layout', () => {
    const pad = px(/\.workspace-layout > \.topbar \{[^}]*padding: 0 20px 0 ([0-9]+)px/, nav);
    expect(pad).toBe(32);
    expect(px(/\.gc-head \{[^}]*margin-left: -([0-9]+)px/, rooms)).toBe(pad);
  });

  it('and by the rail layout\'s own padding there', () => {
    const pad = px(/\.gt-inset\.workspace-layout > \.topbar \{ padding-left: ([0-9]+)px/, rooms);
    expect(pad).toBe(44);
    expect(px(/\.gt-inset \.gc-head \{ margin-left: -([0-9]+)px; \}/, rooms)).toBe(pad);
  });
});
