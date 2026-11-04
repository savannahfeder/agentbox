// Types for the part of shared/connections-catalog.mjs the screen reads.

/** A time the way a person says it: "6:05am" today, "yesterday 6:05pm", "Oct 30 6:05pm". */
export function clockAt(ms: number, now?: number): string;

export const GROUPS: readonly { id: 'docs' | 'work' | 'talk' | 'sales' | 'design'; name: string }[];

/** One connection as a worker is told it, in the state the Connections page shows. */
export function connectionLine(t: { id: string; name: string; state: string; given?: boolean; since?: number | null; at?: number | null; endsAt?: number | null }, now?: number): string;

/** What a worker is told about Files against the tools. */
export function filesComeFirst(copies: readonly { name: string; folder: string; projectName: string; count: number; okAt?: number | null }[], now?: number): string;
