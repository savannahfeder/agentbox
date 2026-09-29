// Types for shared/claude-usage.mjs, which the renderer imports and which is
// plain JavaScript because main imports it too. Hand-written and short: the
// module is one parser and the timezone arithmetic under it.
//
// The words the panel prints moved to shared/usage.mjs on 2026-09-05, and their
// declarations went with them. `UsageLimit` is declared there too, because a
// limit is a limit whichever coding agent reported it.

import type { UsageLimit } from './usage.d.mts';

export declare function resetAt(text: string, now?: number, zoneNow?: string | null): number | null;
export declare function readUsage(text: string | null | undefined, now?: number, zoneNow?: string | null): UsageLimit[];
export declare function pillText(
  limits: UsageLimit[] | null | undefined,
  now?: number,
): { used: string; when: string | null } | null;
