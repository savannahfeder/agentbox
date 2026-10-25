export type MessageEdit = { text?: string; gone?: true; at: number };
export type EditLine = { on: string; by?: string | null; ts: number; text?: string; gone?: boolean };
export function resolveEdits(
  messages: ReadonlyArray<{ uid?: string | null; by?: string | null }>,
  edits: ReadonlyArray<EditLine>,
): Map<string, MessageEdit>;
export function editOfLine(line: unknown): EditLine | null;
