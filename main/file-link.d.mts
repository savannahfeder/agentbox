// Types for main/file-link.mjs.
type LinkFs = Pick<typeof import('node:fs'), 'readFileSync' | 'realpathSync'>;

export type LinkKind = 'markdown' | 'page' | 'image' | 'pdf';
export type LinkFile = { kind: LinkKind; type: string; body: string; hash: string; error?: undefined };
export type LinkCopy = LinkFile & { name: string; version: number };

export const LINK_MAX_BYTES: number;
export function linkKindOf(name: unknown): { kind: LinkKind; type: string } | null;
export function linkSource(product: unknown, thread: unknown, family: unknown): string;
export function linkAddress(site: string, token: string): string;
export function linkSiteFor(site: unknown): string | null;
export function fileForLink(file: string, opts?: { fs?: LinkFs }): LinkFile | { error: string };
export function linkCopyOf(file: string, opts?: { fs?: LinkFs }): LinkCopy | { error: string };
export function versionInName(name: unknown): number;
