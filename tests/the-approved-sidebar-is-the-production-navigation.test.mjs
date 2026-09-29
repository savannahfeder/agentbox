// the founder approved the Workspace preview for the app on 2026-09-14.
// Navigation belongs on the left for ordinary lists, including empty lists;
// opened tasks, resting and the guided first run keep their dedicated layouts.
// The guided first run stopped being one of those on w-ec62ab6b38 (2026-09-28):
// the tutorial now runs in the window with the sidebar in it.
import { it, expect } from 'vitest';
import { workspaceNavigationShown } from '../renderer/src/workspace-navigation.mjs';
it('shows the sidebar on normal and empty lists', () => {
  expect(workspaceNavigationShown({})).toBe(true);
  expect(workspaceNavigationShown({inFullScreen:false,walking:false})).toBe(true);
});
it('shows the sidebar during the tutorial as well', () => {
  expect(workspaceNavigationShown({walking:true})).toBe(true);
});
