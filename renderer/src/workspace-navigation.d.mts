export function workspaceNavigationShown(state: {inFullScreen?: boolean; restBarUp?: boolean; walking?: boolean}): boolean;
export function workspacePageTitle(view: string, doneNoun?: string): string;
export function workspaceDestinations(state?: {scheduledCount?: number; view?: string; doneNoun?: string}): [string, string][];

export function searchFieldInStrip(state?: {searching?: boolean; workspaceNavigation?: boolean; focused?: boolean; settingsOpen?: boolean}): boolean;
