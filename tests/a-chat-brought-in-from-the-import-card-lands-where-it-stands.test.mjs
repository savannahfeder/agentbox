// A CHAT BROUGHT IN FROM THE IMPORT CARD LANDS WHERE IT STANDS.
//
// Setup's last screen and the "Bring in new chats" switch file a chat waiting
// on you in Needs you and a finished one in Done (w-62228098e6), and the
// switch says so in Settings. The ⌘K import card still filed every chat in
// Needs you: a power tester brought in fourteen, opened "Fix the date picker
// on Safari" ("fixed and tested in Safari 18") and "Bump express to 5" ("All
// 214 tests pass") sitting there as Waiting, and closed the finished ones by
// hand. One rule for all three ways in.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const card = fs.readFileSync(new URL('../renderer/src/components/ImportAgents.tsx', import.meta.url), 'utf8');

describe('the import card', () => {
  it('files every chat it brings in by how the chat ended', () => {
    expect(card).toContain("api.importThreads({ product: slug, threads: load.ids, land: 'sorted' })");
    expect(card).not.toMatch(/land\?: 'sorted'/);
  });
});
