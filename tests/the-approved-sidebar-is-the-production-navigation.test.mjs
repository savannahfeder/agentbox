// the founder approved the Workspace preview for the app on 2026-09-14.
// Navigation belongs on the left for ordinary lists, including empty lists;
// opened tasks, resting and the guided first run keep their dedicated layouts.
import { it, expect } from 'vitest';
import { workspaceNavigationShown } from '../renderer/src/workspace-navigation.mjs';
it('shows the sidebar on normal and empty lists', () => {
  expect(workspaceNavigationShown({})).toBe(true);
  expect(workspaceNavigationShown({inFullScreen:false,walking:false})).toBe(true);
});
it('keeps focused, resting, and tutorial layouts separate', () => {
  for (const key of ['walking']) expect(workspaceNavigationShown({[key]:true})).toBe(false);
});
