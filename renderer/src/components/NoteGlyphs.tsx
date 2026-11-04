// The big file view's button icons: one 16 grid, one stroke, drawn at 14.
const PATHS = {
  pin: <><path d="M8 14.2s-4.3-4.1-4.3-7.4a4.3 4.3 0 0 1 8.6 0c0 3.3-4.3 7.4-4.3 7.4z" /><circle cx="8" cy="6.8" r="1.5" /></>,
  reply: <path d="M6.5 4 3 7.5 6.5 11M3.5 7.5h6a3.5 3.5 0 0 1 3.5 3.5v1" />,
  check: <path d="m3.2 8.4 3.1 3.1 6.5-6.8" />,
  undo: <path d="M5.5 3.5 2.8 6.2l2.7 2.7M3.2 6.2h6.3a3.6 3.6 0 0 1 0 7.2H7" />,
  send: <path d="M8 13V3.5M4 7.3 8 3.3l4 4" />,
  add: <path d="M8 3.5v9M3.5 8h9" />,
  edit: <path d="M10.6 3.2 12.8 5.4 6 12.2l-2.9.7.7-2.9z" />,
  sides: <><rect x="2.5" y="3.5" width="11" height="9" rx="1.2" /><path d="M8 3.5v9" /></>,
  outside: <path d="M9.5 2.8h3.7v3.7m0-3.7L8 8M6.5 3.5H4a1 1 0 0 0-1 1V12a1 1 0 0 0 1 1h7.5a1 1 0 0 0 1-1V9.5" />,
  picture: <><rect x="2.5" y="3" width="11" height="10" rx="1.5" /><circle cx="6" cy="6.5" r="1.1" /><path d="m3 12 3.5-3.5 2.5 2.5 1.5-1.5 2.5 2.5" /></>,
  down: <path d="m4.5 6.5 3.5 3.5 3.5-3.5" />,
  up: <path d="m4.5 9.5 3.5-3.5 3.5 3.5" />,
  back: <path d="M12.5 8h-9M7 4.5 3.5 8 7 11.5" />,
} as const;

export type GlyphName = keyof typeof PATHS;

export function NoteGlyph({ name }: { name: GlyphName }) {
  return <svg className="av-glyph" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {PATHS[name]}
  </svg>;
}
