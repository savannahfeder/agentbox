// Types for main/team/link-comments.mjs.
export type LinkComment = { token: string; source: string; name: string; byName: string; text: string; at: number };
export type LinkThread = { product: string; thread: string };

export function threadOfSource(source: unknown): LinkThread | null;
export function noteFor(comments: LinkComment[]): string;
export function noticeLinkComments(opts: {
  backend: { newLinkComments?(since: number): Promise<LinkComment[]> } | null | undefined;
  cursor: () => number | null;
  setCursor: (at: number) => void;
  now: () => number;
  readItem: (place: LinkThread) => unknown;
  write: (place: LinkThread, note: string, comment: { name: string; file: string; text: string }) => unknown;
  log?: (line: string) => void;
}): Promise<number>;
