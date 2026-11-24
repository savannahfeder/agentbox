import type { ReactNode } from 'react';

// Drawn on a 16 grid and shown at 16 points. Every level line, upright line
// and circle edge is centred on a half point, so its 1 point line fills whole
// pixels. A 24 grid icon squeezed to this size starts between pixels and blurs.
export const SIDEBAR_GLYPHS = {
  search: <><circle cx="7" cy="7" r="4.5" /><path d="M10.25 10.25 13.5 13.5" /></>,
  compose: <><path d="M8 13.5h5.5" /><path d="M2.5 13.5l.75-3.25 7-7a1.42 1.42 0 0 1 2 2l-7 7z" /></>,
  home: <><path d="M2.5 6.5 8 2l5.5 4.5v6a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1z" /><path d="M6.5 13.5V10a1.5 1.5 0 0 1 3 0v3.5" /></>,
  inbox: <path d="M2.5 4.5h11M2.5 8.5h11M2.5 12.5h7" />,
  tray: <><path d="M2.5 9.5 4.1 3.6a1.5 1.5 0 0 1 1.45-1.1h4.9a1.5 1.5 0 0 1 1.45 1.1l1.6 5.9V12a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 12z" /><path d="M2.5 9.5h3l.5 1h4l.5-1h3" /></>,
  team: <><circle cx="6" cy="5" r="2.5" /><path d="M1.5 13.5c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4" /><path d="M10.5 2.6a2.5 2.5 0 0 1 0 4.8M12 9.75c1.5.5 2.5 1.75 2.5 3.75" /></>,
  connections: <><path d="M6.5 9.13a3 3 0 0 0 4.24 0l1.88-1.88a3 3 0 0 0-4.24-4.24l-.75.75" /><path d="M9.5 6.87a3 3 0 0 0-4.24 0L3.38 8.75a3 3 0 0 0 4.24 4.24l.75-.75" /></>,
  files: <><path d="M4.5 2.5h4l4 4v6a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1z" /><path d="M8.5 2.5v4h4" /></>,
  instructions: <><path d="M4.5 2.5h4l4 4v6a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1z" /><path d="M8.5 2.5v4h4" /><path d="M6 9.5h4M6 11.5h2.5" /></>,
  signin: <><circle cx="8" cy="5" r="2.5" /><path d="M3 13.5c.5-2.6 2.5-4 5-4s4.5 1.4 5 4" /></>,
  feedback: <><path d="M2.5 7.5 13.5 2.5l-3 11-3-4z" /><path d="M7.5 9.5 13.5 2.5" /></>,
  settings: <><path d="M2.5 5.5h5M11.5 5.5h2M2.5 10.5h2M8.5 10.5h5" /><circle cx="9.5" cy="5.5" r="2" /><circle cx="6.5" cy="10.5" r="2" /></>,
  restart: <><path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9" /><path d="M13.5 2.5v3h-3" /></>,
  move: <><path d="M2.5 9.5v3a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-3" /><path d="M7.5 2.5v7" /><path d="M5 7 7.5 9.5 10 7" /></>,
} satisfies Record<string, ReactNode>;

export type SidebarGlyphName = keyof typeof SIDEBAR_GLYPHS;

export function SidebarGlyph({ name }: { name: SidebarGlyphName }) {
  return <svg className="sb-glyph" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{SIDEBAR_GLYPHS[name]}</svg>;
}
