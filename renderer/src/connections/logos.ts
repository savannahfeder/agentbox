// The tools' own logos in colour, one file per catalogue id. From gilbarbara/logos
// (CC0), stripped of editor metadata; HubSpot and Stripe, which it has only as
// wordmarks, are the Simple Icons (CC0) marks in their brand colours.
const FILES: Record<string, string> = Object.fromEntries(
  Object.entries(import.meta.glob('./logos/*.svg', { eager: true, query: '?url', import: 'default' }))
    .map(([file, url]) => [file.replace(/^.*\/|\.svg$/g, ''), url as string]),
);

/** Black or near-black marks, drawn light in Dark so they do not vanish. */
export const DARK_INK: ReadonlySet<string> = new Set(['github', 'intercom', 'sentry', 'vercel']);

export const logoOf = (id: string): string | null => FILES[id] ?? null;
