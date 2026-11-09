import type { Span } from './markdown';

/**
 * Whether a line is drawn where a drag picks part of it. On iOS a `<Text
 * selectable>` only copies the whole line, so plain words go in a TextInput
 * nobody can type into. A link cannot be pressed inside one, so a line that
 * holds one stays as text. Android and the web already select a range.
 */
export const dragSelects = (spans: Span[], os: string): boolean => os === 'ios' && !spans.some((s) => s.mention);
