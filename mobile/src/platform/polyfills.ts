// What the shared sign-in client (renderer/src/cloud-rest.ts) takes from a
// browser and a phone's JavaScript does not have: random bytes, ids and a hash.
import * as Crypto from 'expo-crypto';

type Polyfilled = {
  crypto?: {
    getRandomValues?: (bytes: Uint8Array) => Uint8Array;
    randomUUID?: () => string;
    subtle?: { digest?: (alg: string, data: BufferSource) => Promise<ArrayBuffer> };
  };
};
const g = globalThis as Polyfilled;
g.crypto ??= {};
g.crypto.getRandomValues ??= (bytes: Uint8Array) => Crypto.getRandomValues(bytes);
g.crypto.randomUUID ??= () => Crypto.randomUUID();
if (!g.crypto.subtle?.digest) {
  g.crypto.subtle = { ...(g.crypto.subtle ?? {}), digest: (_alg: string, data: BufferSource) => Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, data) };
}
