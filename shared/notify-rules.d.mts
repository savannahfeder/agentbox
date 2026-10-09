// Types for shared/notify-rules.mjs, which is plain ESM so that main (Node)
// and the screen (Vite) can share one copy of the rule about when Agentbox is
// allowed to interrupt you. The screen asks only `isNew`, which is the
// question before "are you away"; the rest is main's.

export const AWAY_AFTER_MS: number;

export function atTheApp(state?: { focused?: boolean; idleMs?: number }): boolean;

// `known` is the ids on the snapshot before this one, and null means there has
// not been one. Empty and never-looked are different facts, and the module
// says what reading one as the other cost.
export function isNew(known: ReadonlySet<string> | null | undefined, id: string): boolean;

export function clip(text: unknown, max?: number): string;

export function shouldSpeak(state?: {
  spoke?: boolean;
  spokeAsk?: boolean;
  waiting?: ReadonlyArray<{ kind?: string } | null | undefined>;
}): boolean;

export function banner(
  waiting: ReadonlyArray<{ id?: string; title?: unknown; kind?: string } | null | undefined> | null | undefined,
): { title: string; body: string; open: string | null } | null;
