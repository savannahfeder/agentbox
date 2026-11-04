// Types for main/artifact-path.mjs, which stays .mjs while plain Node on the Mac loads it.
import fsDefault from 'node:fs';
export interface ArtifactProduct {
    slug?: string;
    name?: string;
    dir?: string;
    repoPath?: string | null;
    team?: {
        direct?: boolean;
    } | null;
}
export type ArtifactFound = {
    ok: true;
    path: string;
    carry?: unknown;
} | {
    ok: false;
    error: string;
    waits?: boolean;
    coming?: boolean;
    carry?: unknown;
};
export type ArtifactFs = Pick<typeof fsDefault, 'existsSync'> & {
    promises: Pick<typeof fsDefault.promises, 'readdir' | 'stat'>;
};
export interface ArtifactRequest {
    src: unknown;
    product?: string | null;
    products?: ArtifactProduct[];
    accountRoot?: string | null;
    storeRoot?: string | null;
    fs?: ArtifactFs;
    now?: number;
    fresh?: boolean;
    nameOf?: ((id: string) => string | null) | null;
    thread?: unknown;
}
export declare function artifactRoots(prod: ArtifactProduct | null | undefined): string[];
export declare const HUNT_FRESH_MS = 5000;
export declare function notFoundMessage(raw: string, own: ArtifactProduct | null | undefined, product: string | null | undefined): string;
export declare function resolveArtifact({ src, product, products, accountRoot, storeRoot, fs, now, fresh, nameOf, thread }: ArtifactRequest): Promise<ArtifactFound>;
