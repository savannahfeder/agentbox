// TWEAKS: the taste calls that have to be made with her own inbox in front of
// her, gathered in one panel instead of scattered through ⌘K.
//
// A command is something you RUN and then forget; a tweak is something you SIT
// IN and compare, and comparing means seeing the options together with the one
// you are on marked. Five treatments were rejected from screenshots before this
// existed, each round costing a build and a restart.
//
// The shape is deliberately a registry rather than a settings screen. A tweak
// is a name, a storage key, an attribute on <html>, and a list of options; the
// CSS answers the attribute. None of this is meant to survive: a tweak that
// stops being a question stops being a tweak.
//
// Two questions have already been through that whole life: the row treatment
// and the compose glyph both shipped here, got picked, and came straight back
// out along with their losers and their CSS the same day (2026-08-12). Being
// deleted and re-added is not churn in this file, it is the file working.

export interface TweakOption {
  id: string;
  label: string;
  hint: string;
}

export interface Tweak {
  id: string;
  label: string;
  note: string;
  attr: string;
  key: string;
  def: string;
  options: TweakOption[];
}

export const TWEAKS: Tweak[] = [
  {
    id: 'headline',
    label: 'The headline metric',
    note: 'The blue panel was the loudest thing in the rail and nothing about the number is urgent. Same information, without a filled background.',
    attr: 'data-headline',
    key: 'zero.headlineStyle',
    def: 'bare',
    options: [
      { id: 'bare', label: 'Bare', hint: 'no container at all, just the number and its label' },
      { id: 'ruled', label: 'Ruled', hint: 'a hairline above and below, like a stat block' },
      { id: 'framed', label: 'Framed', hint: 'a hairline box, no fill' },
      { id: 'inline', label: 'Inline', hint: 'the number and the label on one line' },
      { id: 'quiet', label: 'Quiet wash', hint: 'a card again, but neutral rather than blue' },
    ],
  },
];

export type TweakValues = Record<string, string>;

const byId = (id: string) => TWEAKS.find((t) => t.id === id);

// An unreadable stored value falls back to the tweak's own default rather than
// to nothing, so a typo in a settings file, or an option deleted between
// releases, cannot leave the app with an attribute nothing styles.
export function resolveTweak(tweakId: string, stored: string | null | undefined): string {
  const tweak = byId(tweakId);
  if (!tweak) return '';
  return tweak.options.some((o) => o.id === stored) ? (stored as string) : tweak.def;
}

export function readTweaks(read: (key: string) => string | null): TweakValues {
  const out: TweakValues = {};
  for (const t of TWEAKS) out[t.id] = resolveTweak(t.id, read(t.key));
  return out;
}

export function applyTweaks(
  values: TweakValues,
  root: { setAttribute(k: string, v: string): void } = document.documentElement,
): void {
  for (const t of TWEAKS) root.setAttribute(t.attr, values[t.id] ?? t.def);
}
