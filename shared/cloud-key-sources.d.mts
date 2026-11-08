export type KeySource = { place: 'keychain' | 'file' | 'shell'; from: string; entry?: string };
export declare const KEY_PLACES: readonly ['keychain', 'file', 'shell'];
export declare function keySource(src?: { place?: unknown; from?: unknown; entry?: unknown }): KeySource | null;
export declare function keySourceFromWords(text: string | null | undefined): KeySource | null;
export declare function keySourceLine(src: KeySource): string;
export declare function keySourceWords(src: KeySource): string;
