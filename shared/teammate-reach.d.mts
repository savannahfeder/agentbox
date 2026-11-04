export const REACH_LABEL: 'teammate-asks-to-write';
export const DONT_SEND: string;
export function reachAudienceOf(row: { labels?: string[]; title?: string } | null | undefined): string | null;
export function audienceWords(out: { room?: unknown; names?: string[] }): string;
