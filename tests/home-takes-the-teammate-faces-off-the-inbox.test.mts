// On a computer, where the app has Home, the strip of teammate faces at the end
// of the Inbox's tab bar goes: Home's Team card and the Team page answer what
// it did. A phone has no Home and keeps the faces.
//
// Read from App.tsx, since the strip and the sidebar row are wired there.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');

describe('Home and the Inbox face strip', () => {
  it('drops the faces only where there is a Home', () => {
    expect(app).toMatch(/if \(teamTabs && homeOn\) teamTabs\.corner = null;/);
  });
  it('offers the Home row only where there is a Home, and not on a phone', () => {
    expect(app).toMatch(/const homeOn = !onPhone\(\);/);
    expect(app).toMatch(/onHome=\{homeOn \? goHome : undefined\}/);
  });
  it('leaves Home whenever another page is opened from the sidebar', () => {
    expect(app).toMatch(/const openView = \(next: View\) => \{[^\n]*setHomeOpen\(false\); \};/);
  });
});
