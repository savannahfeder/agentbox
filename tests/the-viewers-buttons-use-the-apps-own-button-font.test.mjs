// THE VIEWER'S BUTTONS USE THE APP'S OWN BUTTON FONT.
//
// Opening a picture from Files drew "Approve" and "Open outside" in the
// monospaced tag font, while every other button in the app ("New thread",
// "Done", "Add people") is in the body font; seen on a full-window picture of
// the viewer, 2026-11-01. Small tags like "PICTURE" stay monospaced, as the
// inbox's tab labels are.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const css = fs.readFileSync(path.join(import.meta.dirname, '..', 'renderer/src/components/artifact-view.css'), 'utf8');
const rule = (sel) => css.match(new RegExp(`(^|\\n)${sel.replace('.', '\\.')}\\s*\\{([^}]*)\\}`))?.[2] ?? '';

describe('the viewer header', () => {
  it('draws its buttons in the body font', () => {
    expect(rule('.av-btn')).toBeTruthy();
    expect(rule('.av-btn')).not.toMatch(/--mono/);
  });
  it('keeps its kind tag in the tag font', () => {
    expect(rule('.av-kind')).toMatch(/--mono/);
  });
});
