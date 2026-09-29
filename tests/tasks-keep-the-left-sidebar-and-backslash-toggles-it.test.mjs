// 2026-09-14: tasks still opened the retired right rail and backslash changed
// that hidden panel. A task must use the same left navigation/card as its list.
import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { workspaceNavigationShown } from '../renderer/src/workspace-navigation.mjs';
const app = readFileSync(new URL('../renderer/src/App.tsx', import.meta.url),'utf8');
it('keeps navigation on opened tasks and during onboarding', () => {
  // The walk keeps it too since w-ec62ab6b38 (2026-09-28), so the tutorial
  // teaches the same layout people use afterwards.
  expect(workspaceNavigationShown({inFullScreen:true})).toBe(true);
  expect(workspaceNavigationShown({inFullScreen:true,walking:true})).toBe(true);
});
it('uses the same state for the key and the collapse button', () => {
  expect(app).toContain('const toggleWorkspace = togglePanel;');
  expect(app).toContain('const workspaceCollapsed = !panelUp;');
});
it('never renders the retired project rail', () => {
  expect(app).not.toContain('<Rail');
});
