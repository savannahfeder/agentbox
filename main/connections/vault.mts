// WHERE A CONNECTION'S TOKENS LIVE: one sealed file beside the team session,
// outside the store, because every worker can read the store.
//
// There is no plain fallback. No encryption means no connection, and it says so.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { AuthorizationServerMetadata, OAuthClientInformationMixed, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { CatalogTool, ConnectionState } from '../../shared/connections-catalog.mts';
import { Name } from '../../shared/product-name.mjs';

export const CANNOT_ENCRYPT = `This computer cannot encrypt a sign-in right now, so ${Name} will not keep one. Nothing was saved.`;

export interface ConnectionsCipher {
  /** Absent on the app's own cipher, which learns it by sealing. */
  available?(): boolean;
  encrypt(text: string): Buffer | null;
  decrypt(buf: Buffer): string | null;
}

/** What the last check found. `accepted` holds the fingerprints of the tools the person last saw. */
export interface ConnectionStatus {
  state?: ConnectionState;
  at?: number;
  since?: number;
  tries?: number;
  workedAt?: number | null;
  toolCount?: number;
  read?: string | null;
  seen?: number | null;
  tools?: Tool[];
  accepted?: Record<string, string> | null;
  changed?: string[];
}

export interface ConnectionFailure {
  at: number;
  tool: string;
  wrote: boolean;
  why: string;
}

/** What a sign-in left: from the OAuth dance, or a pasted key as `tokens.access_token`. */
export interface SignInGot {
  tokens: OAuthTokens;
  client?: OAuthClientInformationMixed | null;
  authServer?: string;
  metadata?: AuthorizationServerMetadata;
}

export interface SignedIn extends SignInGot {
  expiresAt: number | null;
  person: string | null;
  chosen?: string[];
  activity?: { lastUsedAt: number | null; failures: ConnectionFailure[] };
  status?: ConnectionStatus;
  warnedFor?: number | null;
}

export interface VaultData {
  connections?: Record<string, SignedIn>;
  custom?: Record<string, CatalogTool>;
}

export interface ConnectionVault {
  file: string;
  canEncrypt(): boolean;
  mayEncrypt(): boolean;
  read(): Promise<VaultData>;
  readNow(): VaultData;
  update<T>(change: (data: VaultData) => T | Promise<T>): Promise<T>;
}

export function connectionVault({ file, cipher }: { file: string; cipher: ConnectionsCipher | null | undefined }): ConnectionVault {
  // A cipher without `available` (the app's own, main/main.mts) learns it by
  // sealing, which asks the Mac's keychain, so only keeping a sign-in asks:
  // `can` probes, `mayBe` is what the page shows before anyone presses Connect.
  const mayBe = () => { try { return cipher?.available ? !!cipher.available() : !!cipher?.encrypt; } catch { return false; } };
  const can = () => { try { return cipher?.available ? !!cipher.available() : cipher?.encrypt?.('') != null; } catch { return false; } };
  // A Mac with no connections never asks the keychain, as a worker starts or at all.
  const there = () => fs.existsSync(file);
  // One at a time: a refresh and a status update both rewrite the whole file.
  let queue: Promise<unknown> = Promise.resolve();
  // Only reached once `mayBe` or `can` has found a cipher.
  const load = (): VaultData => {
    let raw;
    try { raw = fs.readFileSync(file); } catch { return {}; }
    try {
      const text = cipher!.decrypt(raw);
      return text == null ? {} : JSON.parse(text);
    } catch (err) {
      console.warn('zero: the connections file could not be read, so its sign-ins are lost:', (err as Error | null)?.message ?? err);
      return {};
    }
  };
  return {
    file,
    canEncrypt: can,
    mayEncrypt: mayBe,
    async read() {
      await queue;
      return there() && mayBe() ? load() : {};
    },
    // For a worker's start, which cannot wait. Writes land by rename, so this
    // sees the last whole file.
    readNow: () => (there() && mayBe() ? load() : {}),
    update<T>(change: (data: VaultData) => T | Promise<T>): Promise<T> {
      const run = queue.then(async () => {
        if (!can()) throw new Error(CANNOT_ENCRYPT);
        const data = load();
        const out = await change(data);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        const tmp = `${file}.${crypto.randomUUID()}.tmp`;
        // `can` above found a cipher that seals.
        fs.writeFileSync(tmp, cipher!.encrypt(JSON.stringify(data))!, { mode: 0o600 });
        fs.renameSync(tmp, file);
        return out;
      });
      queue = run.catch(() => {});
      return run;
    },
  };
}
