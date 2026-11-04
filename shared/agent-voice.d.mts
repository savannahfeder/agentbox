export interface AgentVoice { name: string; id?: string; run?: string }
export const PLAIN_AGENT: string;
export function cleanVoice(v: unknown): AgentVoice | null;
export function voiceName(voice: { name: string }, ownerName: string | null | undefined, opts?: { mine?: boolean }): string;
export function roomBody(voice: AgentVoice, text: string): string;
export function readRoomMessage<T extends { body?: unknown }>(m: T): T & { voice?: AgentVoice };
