// NO TWO CLOUD UPDATES SHARE A VERSION (w-64116bb761, 2026-10-24).
//
// Supabase records an applied migration by the number before the first
// underscore. Two threads shipped 20261024000000_delete_my_account.sql and
// 20261024000000_general_is_coworking.sql the same day; `supabase db push`
// applied the first, recorded 20261024000000 as done, and never listed the
// second, so the group everyone joins stayed "General" on the hosted cloud.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const dir = path.join(import.meta.dirname, '..', 'cloud/supabase/migrations');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql'));

/** Versions that more than one file claims, with the files that claim them. */
function sharedVersions(names) {
  const by = new Map();
  for (const f of names) {
    const v = f.split('_')[0];
    by.set(v, [...(by.get(v) ?? []), f]);
  }
  return [...by].filter(([, fs2]) => fs2.length > 1).map(([v, fs2]) => `${v}: ${fs2.sort().join(', ')}`);
}

describe('cloud updates', () => {
  it('each has a version of its own', () => {
    expect(sharedVersions(files)).toEqual([]);
  });
  it('each version is fourteen digits, so they sort in the order they were written', () => {
    expect(files.filter((f) => !/^\d{14}_[a-z0-9_]+\.sql$/.test(f))).toEqual([]);
  });
  it('the check sees two files with one version, and not two that only start alike', () => {
    expect(sharedVersions(['20261024000000_a.sql', '20261024000000_b.sql'])).toEqual(['20261024000000: 20261024000000_a.sql, 20261024000000_b.sql']);
    expect(sharedVersions(['20261024000000_a.sql', '20261024000001_a.sql'])).toEqual([]);
  });
});
