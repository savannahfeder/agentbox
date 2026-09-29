// Which project the new-task card is pointed at.
//
// This is three lines of logic and it lives in its own file because the bug it
// replaces was invisible in a diff. The card used to hold the selection as an
// INDEX into the displayed chip row, and an index is a promise the row cannot
// keep: the row changes length when a hidden project is revealed, when one is
// hidden, and when the user drags a chip. With a real picker that had hidden
// projects, opening the menu and clicking the "N hidden" pill moved the card
// off one project and onto another, silently, and the next thing typed would
// have gone there.
//
// So the selection is a SLUG, and this module is the only thing that turns one
// into a project. Nothing here counts chips.

export interface ProjectLike { slug: string; name: string }

// The project the card is for.
//
// `all` is every project and `shown` is the chip row, which may be shorter.
// Resolution goes against `all` on purpose: hiding a project is a filing
// decision about this picker and not an off switch (a hidden project still
// ranks and still runs agents), so one she chose stays chosen when the row it
// lives on is collapsed again. Only when her remembered slug names nothing at
// all does the card fall back, to the first chip she can actually see.
export function resolveProject<T extends ProjectLike>(
  all: readonly T[],
  shown: readonly T[],
  slug: string,
): T | null {
  return all.find((p) => p.slug === slug) ?? shown[0] ?? all[0] ?? null;
}

// Tab, and shift-Tab, across the chip row.
//
// Stepping is the one place a position is legitimate, because "the next chip"
// is a question about the row. It is computed fresh from where she is NOW
// rather than from a remembered slot. A current project that is not on the row
// (hidden, but still selected) starts her at the near end of it instead of
// nowhere: Tab gives her the first chip, shift-Tab the last.
export function stepProject<T extends ProjectLike>(
  shown: readonly T[],
  current: string,
  dir: 1 | -1,
): T | null {
  if (!shown.length) return null;
  const at = shown.findIndex((p) => p.slug === current);
  const from = at >= 0 ? at : (dir > 0 ? -1 : 0);
  return shown[(from + dir + shown.length) % shown.length] ?? null;
}

/* ------------------------- AND WHICH ONE IS REMEMBERED --------------------- */

/**
 * The slot the compose card opens on. One name for it, in the module that
 *  already owns which project the card is pointed at, because the string was
 *  written out by hand in five places in App.tsx and read in two more. */
export const LAST_PRODUCT_KEY = 'zero.lastProduct';

/**
 * Remember a project, or forget the slot entirely with `null`.
 *
 *  It does not refuse a practice project, on purpose: the walk deliberately
 *  points the card at Practice for the beats that file into it. What must never
 *  happen is the slot still saying Practice AFTER the walk, and that is
 *  `forgetPracticeProject` below and `finishRun` in App.tsx.
 *
 *  Never throws. A full disk, or Safari's private mode in the shot harness, is
 *  not a reason to fail the click that made a project. */
export function rememberProject(slug: string | null): void {
  try {
    if (slug) localStorage.setItem(LAST_PRODUCT_KEY, slug);
    else localStorage.removeItem(LAST_PRODUCT_KEY);
  } catch { /* the card falls back to the first chip, which is the old behaviour */ }
}

export function rememberedProject(): string | null {
  try { return localStorage.getItem(LAST_PRODUCT_KEY); } catch { return null; }
}

/**
 * WHETHER THE REMEMBERED SLOT IS POINTING SOMEWHERE NOBODY MAY FILE INTO.
 *
 *  Two shapes, and they are different failures:
 *
 *   - The slug names a project the store reports as `practice`. A walk that was
 *     quit, or one that ended before this was fixed, leaves the slot saying so
 *     and the compose card then opens on Practice — where the supervisor will
 *     never run anything, and an agent can end up run in the practice project
 *     by accident.
 *   - The slug is the reserved practice slug and there is no such project at
 *     all. The folder is deleted at the end of the walk now (main/store.mjs), so
 *     this is the ordinary leftover, and it is worth forgetting rather than
 *     leaving to be adopted later by anything that happens to take that name.
 *
 *  A slug naming nothing else is deliberately LEFT ALONE: `resolveProject`
 *  already falls back for it, and a project that is merely missing today may be
 *  a symlinked one that is back tomorrow.
 *
 *  Archived projects never appear in `products` at all (`listProducts` skips
 *  them), so "never resolves to an archived project" is the same test as "names
 *  nothing", and the fallback covers it. */
export function practiceRemembered(
  products: readonly { slug: string; practice?: boolean }[],
  slug: string | null,
  { practiceSlug = 'practice' } = {},
): boolean {
  if (!slug) return false;
  const found = products.find((p) => p.slug === slug);
  if (found) return found.practice === true;
  return slug === practiceSlug;
}
