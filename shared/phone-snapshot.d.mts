// Types for shared/phone-snapshot.mjs, for the phone with the computer closed.
export const SNAPSHOT_LIMITS: { lines: number; textChars: number; items: number; bytes: number };
export const PHONE_COMMANDS: string[];
export function hideSecrets(text: string, opts?: { home?: string | null }): string;
export function bytesOf(value: unknown): number;
export function threadSnapshot(item: Record<string, unknown>, history?: unknown[], limits?: typeof SNAPSHOT_LIMITS, opts?: { home?: string | null }): { v: number; item: Record<string, unknown>; history: unknown[]; olderLines: number };
export function threadsWorthCarrying<T>(items: T[], opts?: { now?: number }): T[];
export function snapshotKey(snapshot: unknown): string;
export function madeHere(commandId: string): string;
export function phoneChoices(kind: string, p: Record<string, unknown> | null | undefined): Record<string, unknown>;
export function phoneChoiceOf(saved: unknown, personId: string | null | undefined, every?: string[]): { all: boolean; except: string[] };
export function phoneProjectsOf(saved: unknown, personId: string | null | undefined, every?: string[]): string[];
export function withPhoneProject(saved: unknown, personId: string | null | undefined, slug: string, on: boolean, every?: string[]): { owner: string; all: boolean; except: string[] };
export function withPhoneAll(saved: unknown, personId: string | null | undefined, on: boolean, every?: string[]): { owner: string; all: boolean; except: string[] };
export function checkCommand(cmd: unknown, ctx: { projects: string[]; hasItem: (project: string, id: string) => boolean }): string | null;
export function phoneEligible(products: { slug?: string }[]): string[];
