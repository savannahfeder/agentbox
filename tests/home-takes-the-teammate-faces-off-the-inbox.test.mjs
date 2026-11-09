// With Home on (Alpha features), the strip of teammate faces at the end of the
// Inbox's tab bar goes: Home's Team card and the Team page answer what it did.
// With Home off the app is as it was: no Home row, faces still there.
//
// Read from App.tsx, since the strip and the sidebar row are wired there.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');

describe('Home and the Inbox face strip', () => {
  it('drops the faces only while Home is on', () => {
    expect(app).toMatch(/if \(teamTabs && homeSet\.on\) teamTabs\.corner = null;/);
  });
  it('offers the Home row only while Home is on, and not on a phone', () => {
    expect(app).toMatch(/onHome=\{homeSet\.on && !onPhone\(\) \? goHome : undefined\}/);
  });
  it('leaves Home whenever another page is opened from the sidebar', () => {
    expect(app).toMatch(/const openView = \(next: View\) => \{[^\n]*setHomeOpen\(false\); \};/);
  });
});
