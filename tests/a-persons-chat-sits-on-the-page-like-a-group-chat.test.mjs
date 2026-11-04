// A PERSON'S CHAT SITS ON THE PAGE, LIKE A GROUP CHAT.
//
// The owner, on a person's page in Team after the hairlines between messages
// went: "what about the left side?" The chat sat in a bordered, rounded box,
// so its left edge drew a second line 24 points from the line beside the Team
// list, and a group chat on the same page has no box at all. The box is gone;
// the messages and the reply box line up with the person's face above them.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const css = fs.readFileSync(path.join(import.meta.dirname, '..', 'renderer/src/team/everything/everything.css'), 'utf8');
const rule = (sel) => new RegExp(`^${sel.replace(/[.]/g, '\\.')} \\{([^}]*)\\}`, 'm').exec(css)?.[1] ?? '';

describe('the chat on a person’s page', () => {
  it('draws no box around itself', () => {
    expect(rule('.pl-chat')).not.toMatch(/border:/);
    expect(rule('.pl-chat')).not.toMatch(/border-radius/);
  });
  it('lines its messages and reply box up with the face in the header', () => {
    expect(css).toMatch(/\.pl-chat \{ --text-x: 6px; \}/);
    expect(css).toMatch(/\.pl-chat \.tq-chat \.tq-lines \{ padding-left: 6px; padding-right: 0; \}/);
    expect(css).toMatch(/\.pl-chat \.rm-compose\.tq-compose \{ margin: 8px 0 0 6px; \}/);
  });
  it('keeps the first message box where the reply box will be', () => {
    expect(css).toMatch(/\.pl-send \{[^}]*padding: 20px 0 0 6px;/);
  });
});
