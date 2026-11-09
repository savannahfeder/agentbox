import type * as Y from 'yjs';
export interface LiveGrid { grid: string[][]; rowIds: string[]; colIds: string[] }
export function isSeeded(doc: Y.Doc): boolean;
export function seedGrid(doc: Y.Doc, grid: string[][]): void;
export function gridOf(doc: Y.Doc): LiveGrid;
export function putGrid(doc: Y.Doc, before: LiveGrid, next: string[][]): void;
