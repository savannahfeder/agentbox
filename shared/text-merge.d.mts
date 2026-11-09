export interface TextChange { start: number; end: number; text: string }
export function changes(a: string, b: string): TextChange[];
export function changeSize(a: string, b: string): number;
export function mergeText(base: string, head: string, mine: string, opts?: { overlap?: 'mine' | 'head' }): { text: string; clashes: { base: string; head: string; mine: string }[]; ambiguous: boolean };
