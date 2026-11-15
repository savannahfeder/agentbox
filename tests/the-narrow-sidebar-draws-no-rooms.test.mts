// THE NARROW SIDEBAR DRAWS NO ROOMS (w-af4b1dcbc6, 2026-10-21).
//
// Folded to its 38-point strip, the sidebar still drew the whole Rooms section
// under Messages: the fold arrow, one # per room and the New room plus. Every
// room wears the same #, so the strip was a column of marks nobody could tell
// apart. Asked for: "get rid of the downward arrow, the different channels, and
// the little plus icon. We don't need those in a condensed sidebar because you
// can't really tell which channel it is anyway."
//
// Measured by drawing the section through useRooms with two rooms: narrow, it
// drew the Rooms header, both rooms and New room, exactly as wide did. Since
// Groups (w-dcaa2c122e, 2026-10-23) the sidebar has no rows for rooms of its
// own. With Groups on it stays narrow, holding one Groups row, and names the
// groups only while it is pointed at and wide
// (tests/with-groups-the-sidebar-stays-narrow-and-widens-when-pointed-at).
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, afterEach } from 'vitest';
import { WorkspaceNavigation } from '../renderer/src/components/WorkspaceNavigation.tsx';

const had = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
afterEach(() => {
  if (had) Object.defineProperty(globalThis, 'localStorage', had);
  else delete globalThis.localStorage;
});
const sidebar = (collapsed) => {
  Object.defineProperty(globalThis, 'localStorage', { value: { getItem: () => null, setItem() {}, removeItem() {} }, configurable: true, writable: true });
  return renderToStaticMarkup(createElement(WorkspaceNavigation, {
    view: 'inbox', collapsed, inboxLabel: 'Inbox', onToggle() {}, onView() {}, onSearch() {}, onCompose() {}, onSettings() {}, onUpdate() {},
  }));
};

for (const collapsed of [true, false]) {
  describe(collapsed ? 'the narrow sidebar' : 'the wide sidebar', () => {
    const html = sidebar(collapsed);
    it('has no Rooms or Messages row, header or fold arrow', () => {
      expect(html).not.toContain('aria-label="Rooms"');
      expect(html).not.toContain('aria-label="Messages"');
      expect(html).not.toContain('rm-sec');
    });
    it('has no row for any room, and no New room plus', () => {
      expect(html).not.toContain('rm-nav');
      expect(html).not.toContain('rm-add');
      expect(html).not.toContain('New room');
    });
  });
}
