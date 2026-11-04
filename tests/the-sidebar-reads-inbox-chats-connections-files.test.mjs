// THE SIDEBAR READS INBOX, CHATS, CONNECTIONS, FILES.
//
// The owner, 2026-11-02: "In the sidebar, I think the order of priority should
// be: 1. Inbox 2. Chats 3. Connections 4. Files". It read Inbox, Files,
// Connections, then Chats, because Chats came in through the slot drawn after
// the whole list of tabs.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const nav = fs.readFileSync(path.join(import.meta.dirname, '..', 'renderer/src/components/WorkspaceNavigation.tsx'), 'utf8');
const at = (needle) => { const i = nav.indexOf(needle); expect(i).toBeGreaterThan(-1); return i; };

describe('the sidebar', () => {
  it('puts Chats right under Inbox, then Connections, then Files', () => {
    const inbox = at('data-tab="inbox"');
    const chats = at('{groups}');
    const connections = at('data-tab="connections"');
    const files = at('data-tab="files"');
    expect(inbox).toBeLessThan(chats);
    expect(chats).toBeLessThan(connections);
    expect(connections).toBeLessThan(files);
  });

  it('keeps the same 3px step between every row', () => {
    const css = fs.readFileSync(path.join(import.meta.dirname, '..', 'renderer/src/workspace-navigation.css'), 'utf8');
    expect(css).toMatch(/\.workspace-tabs\.workspace-places \{ margin-top: 3px; \}/);
  });
});
