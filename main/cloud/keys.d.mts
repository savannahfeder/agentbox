export { keyLabel } from '../../shared/cloud-keys.mjs';

/** The bucket the keys go to: anything that can put and delete an object by name. */
export interface KeyStorage {
  put(key: string, body: string): Promise<unknown>;
  del?(key: string): Promise<unknown>;
}
export interface SavedKey { name: string; savedAt: number | null; label: string | null }

export declare const cloudKeysPath: (home?: string) => string;
export declare function cloudKeyNames(opts?: { home?: string }): SavedKey[];
export declare function keysCarried(opts?: { home?: string }): { name: string; key: string }[];
export declare function saveCloudKey(name: string, value: string, opts: { storage: KeyStorage; home?: string; now?: number; label?: string | null }): Promise<{ name: string; savedAt: number }>;
export declare function removeCloudKey(name: string, opts: { storage: KeyStorage; home?: string; now?: number }): Promise<boolean>;
