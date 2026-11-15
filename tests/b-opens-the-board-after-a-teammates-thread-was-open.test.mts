// B OPENS THE BOARD AFTER A TEAMMATE'S THREAD WAS OPEN (2026-11-12).
//
// Testers in two rounds pressed B on the Inbox and the list stayed: "Pressing
// B on the Inbox does not switch to the board". Measured in the tester's own
// record: she had opened a teammate's thread, pressed Inbox in the sidebar,
// then B. The sidebar closed the Team page but kept the thread it had open,
// and B's rule refused while any teammate's thread was held, on screen or
// not. B now asks only what is on the screen, and leaving for a list lets the
// held thread go.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
const bKey = app.slice(app.indexOf("case 'b': case 'B':"), app.indexOf("case 'Escape':", app.indexOf("case 'b': case 'B':")));

describe('B on the Inbox', () => {
  it('asks what is on the screen, not whether a teammate\'s thread is still held', () => {
    expect(bKey).toContain('setEvView(flipEvView(evView))');
    expect(bKey).toContain('setInboxDisplay(flipView(inboxDisplay))');
    expect(bKey).not.toMatch(/openCard/);
    expect(bKey.match(/search === null && !teamShown/g)).toHaveLength(2);
  });
  it('still does nothing over a search or the Team page', () => {
    expect(bKey).not.toMatch(/if \(teamMode\) \{\s*e\.preventDefault/);
  });
});

describe('leaving for a list from the sidebar', () => {
  it('lets go of the teammate\'s thread that was open', () => {
    const openView = app.slice(app.indexOf('const openView = (next: View) =>'), app.indexOf('\n', app.indexOf('const openView = (next: View) =>')));
    expect(openView).toContain('setTeamOpen(false); setOpenCard(null);');
  });
});
