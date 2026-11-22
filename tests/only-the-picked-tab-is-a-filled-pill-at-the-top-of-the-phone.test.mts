// ONLY THE PICKED TAB IS A FILLED PILL AT THE TOP OF THE PHONE (2026-11-22).
// With a permission card put aside, the top bar drew "Review (2)" as a filled
// dark pill, 36 tall, one row above the picked tab, which is the same filled
// dark pill: "it looks the same as the needs you highlighted which is
// confusing; you can't have two cta looking black buttons on there". Measured
// by reading parts.tsx and app/index.tsx: both set `color.graphite` under
// `color.ink` words.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const parts = fs.readFileSync('mobile/src/ui/parts.tsx', 'utf8');
const inbox = fs.readFileSync('mobile/src/app/index.tsx', 'utf8');
const cut = (src: string, from: string) => src.slice(src.indexOf(from), src.indexOf('\n}\n', src.indexOf(from)));
const bar = cut(parts, 'export function TopBar(');
const review = bar.slice(bar.indexOf('{aside && ('), bar.indexOf('{right}'));

describe('the button that brings a permission card back', () => {
  it('is a quiet key, the fill of the round buttons beside it', () => {
    expect(review).toMatch(/backgroundColor: pressed \? color\.picked : color\.round/);
    expect(review).not.toMatch(/color\.graphite|color\.ink/);
  });
  // A dot beside the words made the key 12 wider, and "Inbox" was cut to "Inb…" on a screen 393 wide.
  it('is marked as waiting on you by an orange dot on its corner, which takes no width', () => {
    expect(review).toMatch(/<View style=\{\{ position: 'absolute', top: \d, right: \d, width: \d+, height: \d+, borderRadius: \d+, borderWidth: [\d.]+, borderColor: color\.bg, backgroundColor: color\.accent \}\} \/>/);
    expect(review).toMatch(/height: 36, paddingHorizontal: 1[0-4], justifyContent: 'center'/);
    expect(review).not.toMatch(/gap:/);
  });
  it('still says how many wait and still brings them back', () => {
    expect(review).toMatch(/Review \(\$\{view\.approvals\.length\}\)/);
    expect(review).toMatch(/onPress=\{\(\) => setMinimizedApproval\(null\)\}/);
    expect(review).toMatch(/accessibilityLabel="Review permission"/);
  });
});

describe('the picked tab', () => {
  it('stays the one filled pill', () => {
    expect(cut(inbox, 'function Tabs(')).toMatch(/backgroundColor: on === t\.id \? color\.graphite : 'transparent'/);
    expect(bar).not.toMatch(/color\.graphite/);
  });
});
