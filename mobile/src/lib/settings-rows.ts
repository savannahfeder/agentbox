// The rows of the desktop's Settings index (renderer/src/settings-search.ts)
// that the phone's own pages draw, so its search never opens a page without
// the row it found.
import { ROOMS_SEARCH_ROWS, roomsPageShown } from './rooms-settings';

const ROWS = [
  'general/Your account', 'general/Counts and crash reports',
  'appearance/Theme',
  'phone/Use it on your phone',
  'alpha/Rooms',
  'claude/Usage', 'claude/Signed in', 'claude/Permission mode',
  'codex/Usage', 'codex/Signed in', 'codex/Permission mode',
  'running/How many run at once', 'running/Hold heavy work when memory is short', 'running/Stop programs agents leave behind',
  'running/Something felt slow', 'running/Agents you started yourself', 'running/Bring in new chats',
  'projects/Projects',
  'team/Team',
];

/** Every row the phone draws for this computer's copy; the cloud's only for an agent the cloud has, Public links only while there are some, Rooms' only while it is on. */
export function phoneSettingsRows(settings: { workspace?: { cloud?: { engines?: string[] } | null; publicLinks?: unknown[]; alpha?: { rooms?: boolean } } } | null | undefined): string[] {
  const cloud = settings?.workspace?.cloud?.engines ?? [];
  return [...ROWS, ...(settings?.workspace?.publicLinks?.length ? ['general/Public links'] : []), ...cloud.map((engine) => `${engine}/Cloud accounts`), ...(roomsPageShown(settings) ? ROOMS_SEARCH_ROWS : [])];
}
