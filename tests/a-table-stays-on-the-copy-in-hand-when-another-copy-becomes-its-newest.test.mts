// On 2026-11-16 a power tester opened a thread's "Checked copy",
// designs/<thread>/fintech-leads-v2.csv with eight rows, and sent a note on its
// Ramp cell. The view jumped to "fintech-leads.csv v2 of 2" with 28 rows, and
// the note became "From v1". Replayed from the tester's store: the copy was
// byte for byte the original sheet, so it is v1, and another thread's
// fintech-leads-v2.csv (28 rows) is v2 of the same file. Sending the note gave
// the thread a line, the view read the versions again, and a table follows to
// its newest when the newest was open. That rule is for a table being typed
// into, whose every save is a new version at the same path.
import { it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { staysOnNewest } from '../renderer/src/table-follows.ts';

it('stays on the copy in hand when the newest version is a file at another path', () => {
  expect(staysOnNewest({ kind: 'table', wasNewest: true, samePath: false })).toBe(false);
});

it('still follows a table saved over the same path, as typing into it does', () => {
  expect(staysOnNewest({ kind: 'table', wasNewest: true, samePath: true })).toBe(true);
});

it('is asked with the path of the copy in hand and the newest one', () => {
  const view = fs.readFileSync(path.join(import.meta.dirname, '..', 'renderer/src/components/ArtifactView.tsx'), 'utf8');
  expect(view).toMatch(/staysOnNewest\(\{ kind: viewKind\(same\.v\.path\), wasNewest: newestInHand\.current, samePath: [^}]*placed\?\.held\?\.path[^}]*\}\)/);
});
