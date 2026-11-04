type Labelled = { labels?: string[] } | null | undefined;
export interface RouteRecord { to?: string; ask?: string[]; why: string; at: number; by: 'auto' | 'you' }
type Routed = { routed?: RouteRecord | null };
export interface RouteDecision { to?: string; ask?: string[]; why: string }
export interface RouteMate { id: string; name: string; role?: string | null; job?: string | null; goal?: string | null; duties?: { what: string }[]; status?: string; paused?: boolean; endedAt?: number | null }
export const AUTO_LABEL: 'auto';
export const AGENT_WHY: string;
export const NOBODY_WHY: string;
export const FAILED_WHY: string;
export const PICKED_WHY: string;
export function isAuto(item: Labelled): boolean;
export function asksWho(item: (Labelled & Routed) | null | undefined): boolean;
export function routeCandidates<T extends RouteMate>(teammates?: T[]): T[];
export const PRIMARY_WHY: string;
export const PRIMARY_TIE_WHY: string;
export function orPrimary(decision: RouteDecision | null | undefined, primary: { id: string } | null | undefined): RouteDecision;
export function routePrompt(item: { title?: string; body?: string } | null | undefined, candidates: RouteMate[], items?: unknown[], opts?: { primary?: RouteMate | null }): string;
export function readRoute(text: string, candidates: RouteMate[], primary?: { id: string } | null): RouteDecision | null;
export function routedPatch(item: { id?: string; labels?: string[] } | null | undefined, decision: RouteDecision, opts?: { items?: unknown[]; now?: number; by?: 'auto' | 'you' }): { labels: string[]; routed: object; start?: 'later' };
