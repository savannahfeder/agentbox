// The list moved to shared/shortcuts.mjs (w-7ec8553e23) so the supervisor can
// hand the same keys to every agent. Read that file for why each row reads
// the way it does; this keeps the renderer's imports where they were.
export { SHORTCUTS, everyKey } from '../../shared/shortcuts.mjs';
export type { Shortcut, ShortcutGroup } from '../../shared/shortcuts.mjs';
