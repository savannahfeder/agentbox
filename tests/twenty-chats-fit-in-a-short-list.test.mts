// TWENTY CHATS FIT IN A SHORT LIST (w-fbe5e95dea, 2026-11-10).
//
// The setup lists every recent chat, and with twenty the founder found the
// list "def too long/takes up too much space": two-line rows 62px tall, the
// list reaching half the window. Each chat is now one line, its age beside
// its title, and the list shows five before it scrolls.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const split = fs.readFileSync(new URL('../renderer/src/components/SetupSplit.tsx', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../renderer/src/components/setup-split.css', import.meta.url), 'utf8');

describe("the setup's chats", () => {
  it('are one line each, with the age at the end', () => {
    expect(split).toMatch(/<div className="ss-list ss-chats">/);
    expect(split).toMatch(/className=\{`ss-row ss-press ss-chat/);
    expect(split).toMatch(/<span className="ss-meta">/);
  });
  it('show five rows before the list scrolls', () => {
    expect(css).toMatch(/\.setup-split \.ss-chats \{ max-height: 230px; \}/);
    expect(css).toMatch(/\.setup-split \.ss-chat \{[^}]*min-height: 46px;/);
  });
});
