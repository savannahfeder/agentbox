export interface CatalogEntry {kind: string; name: string; description: string; insert: string; icon: string | null}
export interface Completion {start: number; end: number; trigger: string; query: string}
export function readComposerCatalog(server: {request(method: string, params: unknown): Promise<any>}, cwd: string): Promise<CatalogEntry[]>;
export function completionQuery(text: string, caret?: number): Completion | null;
export function completionMatches<T extends {kind: string; name: string}>(rows: T[], trigger: string, query: string): T[];
export function insertCompletion(text: string, range: {start: number; end: number}, value: string): string;

export function composerReferences(text: string): {type: string; name: string; path: string}[];
export function readPageReferences(server: {request(method: string, params: unknown): Promise<any>}, threadId: string): Promise<CatalogEntry[]>;
export function readBrowserTabs(mcpServers: Record<string, any>, fetcher?: typeof fetch): Promise<CatalogEntry[]>;
