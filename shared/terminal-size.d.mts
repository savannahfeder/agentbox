export const SIZE_KEY: string;
export const TERMINAL_MIN: { height: number; width: number };
export function dragSize(dimension: 'height' | 'width', start: number, delta: number, room: number): number;
export function readSavedSize(raw: string | null | undefined): { height?: number; width?: number };
