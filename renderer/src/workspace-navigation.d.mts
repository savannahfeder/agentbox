export function workspaceNavigationShown(state: {inFullScreen?: boolean; restBarUp?: boolean; walking?: boolean}): boolean;
export function workspacePageTitle(view: string, doneNoun?: string): string;
export function workspaceDestinations(state?: {scheduledCount?: number; view?: string; doneNoun?: string}): [string, string][];

export function searchFieldInStrip(state?: {searching?: boolean; workspaceNavigation?: boolean; focused?: boolean; settingsOpen?: boolean}): boolean;

export function sidebarSlot(e: {key: string; metaKey?: boolean; altKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean; repeat?: boolean; defaultPrevented?: boolean}): 0 | 1 | 2 | 3 | 4;
