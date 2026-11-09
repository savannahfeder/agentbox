export const JOIN_SCHEME: string;
export const JOIN_SITE: string;
export function joinLink(token: string): string;
export function tokenFromLink(text: unknown): string | null;
export function ourLink(url: unknown): boolean;
export function threadAppLink(owner: string, id: string): string | null;
export function threadFromAppLink(text: unknown): { owner: string; id: string } | null;
