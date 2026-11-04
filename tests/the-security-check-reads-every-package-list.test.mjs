// THE SECURITY CHECK READS EVERY PACKAGE LIST (w-0240d72133).
//
// A stranger ran an audit on the public repo and posted nine advisories, while
// our weekly check said "found 0 vulnerabilities". It ran
// `npm audit --omit=dev --audit-level=critical` in the root folder only, so it
// never read mobile/ or relay/, skipped every dev package (the text editor the
// renderer bundles among them) and passed anything below critical. Measured:
// the new check run over the old lockfiles fails on node-forge in mobile and
// undici in relay.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { blocking, FOLDERS, KNOWN } from '../scripts/audit-packages.mjs';

const root = new URL('..', import.meta.url).pathname;
const src = (rel) => fs.readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

const advisory = (severity, id, name = 'pkg') => ({
  name, severity, title: `${severity} thing`, url: `https://github.com/advisories/${id}`, range: '<9',
});
const auditOf = (...vias) => ({
  vulnerabilities: { pkg: { severity: 'high', via: vias }, parent: { severity: 'high', via: ['pkg'] } },
});

describe('what fails the check', () => {
  it('fails on a high or a critical advisory', () => {
    expect(blocking(auditOf(advisory('high', 'GHSA-aaaa')), {}).map((f) => f.id)).toEqual(['GHSA-aaaa']);
    expect(blocking(auditOf(advisory('critical', 'GHSA-bbbb')), {}).map((f) => f.id)).toEqual(['GHSA-bbbb']);
  });

  it('passes a moderate or a low one', () => {
    expect(blocking(auditOf(advisory('moderate', 'GHSA-cccc'), advisory('low', 'GHSA-dddd')), {})).toEqual([]);
  });

  it('passes a known advisory and only that one', () => {
    const audit = auditOf(advisory('critical', 'GHSA-known'), advisory('high', 'GHSA-other'));
    expect(blocking(audit, { 'GHSA-known': 'why' }).map((f) => f.id)).toEqual(['GHSA-other']);
  });

  it('names each advisory once, however many packages pull it in', () => {
    const a = advisory('high', 'GHSA-eeee');
    const audit = { vulnerabilities: { x: { via: [a] }, y: { via: [a] } } };
    expect(blocking(audit, {})).toHaveLength(1);
  });

  it('gives every known advisory a reason', () => {
    for (const [id, why] of Object.entries(KNOWN)) {
      expect(id).toMatch(/^GHSA-/);
      expect(why.length).toBeGreaterThan(20);
    }
  });
});

describe('what the check reads', () => {
  it('covers every lockfile in the repository', () => {
    const locks = execFileSync('git', ['ls-files', '*package-lock.json'], { cwd: root, encoding: 'utf8' })
      .split('\n').filter(Boolean).map((f) => f.replace(/\/?package-lock\.json$/, '') || '.');
    expect([...FOLDERS].sort()).toEqual(locks.sort());
  });

  it('reads dev packages too', () => {
    expect(src('scripts/audit-packages.mjs')).toMatch(/\['audit', '--package-lock-only', '--json'\]/);
  });

  it('is what the security workflow runs, in place of the root-only audit', () => {
    const workflow = src('.github/workflows/security.yml');
    expect(workflow).toMatch(/run: node scripts\/audit-packages\.mjs/);
    expect(workflow).not.toMatch(/--omit=dev|--audit-level=critical/);
  });
});
