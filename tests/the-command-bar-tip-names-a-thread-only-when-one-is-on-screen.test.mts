// THE COMMAND BAR TIP NAMES A THREAD ONLY WHEN ONE IS ON SCREEN (w-fbe5e95dea, 2026-11-10).
//
// A tester opened Ctrl K from Home during the walkthrough and was told to "type
// urgent and press Enter to make the selected thread urgent", with no thread
// selected anywhere on screen: Home has no list, and the command acts on the
// inbox's selection behind it. The tip offers urgent only for an open thread
// or a row selected in a list on screen.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const tour = fs.readFileSync(new URL('../renderer/src/components/Tour.tsx', import.meta.url), 'utf8');

describe('the tip inside the command bar', () => {
  it('asks for urgent only with an open thread or a selected row on screen', () => {
    expect(tour).toMatch(/const here = document\.querySelector\('\.focus-body'\) \? 'this thread' : document\.querySelector\('\.list-pane \.row\.selected'\) \? 'the selected thread' : null;/);
    expect(tour).toMatch(/return urgent && here/);
  });
});
