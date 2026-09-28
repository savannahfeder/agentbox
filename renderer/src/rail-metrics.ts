// PURE. What the rail shows when a product has written nothing yet.
//
// A product whose dashboard ledger is empty came back as a name, a stage pill
// and a derived headline, and nothing else: no metrics, no next move. Beside a
// product that HAS written some, it read as a different, poorer panel. The
// founder asked for the opposite (2026-08-12): "make sure all companies have
// the stuff in the sidebar... if it doesnt have this info just say so, at least
// it'll encourage people to connect analytics."
//
// So the rail always draws the same skeleton, and the empty slots say what
// would fill them. This does NOT soften the dashboard's rule, it is that rule
// applied: absence of data and a real zero never look the same, an unmeasured
// number says so and says what would fill it, and nothing here ever invents a
// figure. The only thing being asserted is the QUESTION, which is true of every
// company whether or not anyone has answered it yet.

export interface RailRow {
  label: string;
  value: string;
  unit?: string;
  unmeasured?: boolean;
}

// The four a founder is answering whether they have measured them or not. The
// unit is what would fill the slot, in the words someone would act on.
const STANDARD: Array<{ label: string; unit: string }> = [
  { label: 'Next milestone', unit: 'set it on the dashboard' },
  { label: 'Signups this week', unit: 'connect analytics' },
  { label: 'Revenue', unit: 'connect payments' },
  { label: 'Churn', unit: 'needs 30 days of data' },
];

const key = (label: string) => label.trim().toLowerCase();

// Real rows first, in the order the product wrote them, then the standard ones
// it has not answered. Never more than `limit`, so a product with plenty of its
// own metrics is not padded with questions it has outgrown.
export function railRows(rows: RailRow[] | null | undefined, limit = 4): RailRow[] {
  const real = (rows ?? []).filter((r) => r && r.label);
  const seen = new Set(real.map((r) => key(r.label)));
  const filled: RailRow[] = [...real];
  for (const s of STANDARD) {
    if (filled.length >= limit) break;
    if (seen.has(key(s.label))) continue;
    filled.push({ label: s.label, value: '', unit: s.unit, unmeasured: true });
  }
  return filled.slice(0, limit);
}

// What the value column prints. An unmeasured row is a sentence, not a number,
// and it names the thing that would turn it into one.
export function railValue(row: RailRow): string {
  if (!row.unmeasured) return row.value;
  return row.unit ? `unmeasured, ${row.unit}` : 'unmeasured';
}

// The headline card. Every product gets one, because a company whose ledger is
// empty getting a grey sentence where every other company gets the blue panel
// made the youngest products look like the broken ones.
//
// The number is the only thing that differs. An em dash is not a figure: it
// cannot be read as zero, as a count, or as a measurement, which is exactly
// what "absence of data and a real zero never look the same" asks for. The
// unit line then carries the useful half, what would turn the dash into a
// number.
export function railHeadline(
  headline: RailRow | null | undefined,
  stage?: string,
): { value: string; label: string; unit: string; unmeasured: boolean } {
  if (headline && !headline.unmeasured && headline.value) {
    return { value: headline.value, label: headline.label, unit: headline.unit ?? '', unmeasured: false };
  }
  const label = headline?.label || (stage === 'launched' ? 'Weekly active' : 'Steps to launch');
  const unit = headline?.unit
    || (stage === 'launched'
      ? 'no metrics recorded yet, they appear as the analytics work lands'
      : 'no path recorded yet, an agent writes one as the product takes shape');
  return { value: '—', label, unit, unmeasured: true };
}

// The next move, which the dashboard promises always exists. The app only
// REFLECTS one, so when a product has not recorded one the honest answer is to
// say that rather than to invent a move or to drop the section and leave the
// panel looking like the product has nothing going on.
export function railIntent(intent: string | null | undefined): { text: string; unmeasured: boolean } {
  const t = (intent ?? '').trim();
  return t ? { text: t, unmeasured: false } : { text: 'Not recorded yet.', unmeasured: true };
}
