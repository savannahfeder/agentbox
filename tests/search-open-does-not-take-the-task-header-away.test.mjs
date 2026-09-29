// The top strip when a search is open and she opens a result.
//
// The cause: in the workspace layout the strip carries the
// opened task's title and byline: App.tsx puts `.workspace-task-header` there
// and Focus.tsx portals its band into it. The search field was tested first, so
// with a query open the host was never rendered, the band fell back to drawing
// inside the pane, and the strip kept its 88 point task height holding nothing
// but a field. Measured in the real renderer, headless at
// 1440 by 940, before the fix: 88 points of empty bar, then a second 79 point
// header at y=128, and the first line of prose pushed from y=228 to y=300.
//
// THE FIELD WAITS, IT DOES NOT CLOSE. `search` is untouched, so escape out of
// the task still goes back to the results with the query still in the box.

import { describe, expect, it } from 'vitest';
import { searchFieldInStrip } from '../renderer/src/workspace-navigation.mjs';

describe('what the strip carries', () => {
  it('draws the field on the list, which is every search she has ever run', () => {
    expect(searchFieldInStrip({ searching: true, workspaceNavigation: true, focused: false })).toBe(true);
  });

  it('draws nothing when she is not searching', () => {
    expect(searchFieldInStrip({ searching: false, workspaceNavigation: true, focused: false })).toBe(false);
    expect(searchFieldInStrip({ searching: false, workspaceNavigation: true, focused: true })).toBe(false);
  });

  it('gives the strip back to the task the moment she opens a result', () => {
    expect(searchFieldInStrip({ searching: true, workspaceNavigation: true, focused: true })).toBe(false);
  });

  it('keeps the field over Settings, which has no task header to draw', () => {
    expect(searchFieldInStrip({ searching: true, workspaceNavigation: true, focused: true, settingsOpen: true })).toBe(true);
  });

  it('changes nothing outside the workspace layout, where the strip is the tab row', () => {
    expect(searchFieldInStrip({ searching: true, workspaceNavigation: false, focused: true })).toBe(true);
    expect(searchFieldInStrip({ searching: true, workspaceNavigation: false, focused: false })).toBe(true);
  });

  it('defaults to silence rather than to a field', () => {
    expect(searchFieldInStrip()).toBe(false);
  });
});
