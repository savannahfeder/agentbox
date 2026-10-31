// A CLEAN INSTALL PRINTS NO DEPRECATION WARNINGS (pull request #47, F-154).
//
// What broke: `npm install` on a fresh clone printed six "npm warn deprecated"
// lines (inflight, glob@7 twice, rimraf@2, lodash.isequal, boolean), all from
// packages nested under electron-builder and electron-updater. Overrides in
// package.json swap them for current versions. Measured by re-resolving the
// lockfile with `npm install --package-lock-only` (no change) and reading which
// of those packages it still installs.
//
// The newer @electron/asar is ESM-only and needs Node 22.12; @electron/universal
// loads it with require(), which only works from there. pdfjs-dist already needed
// 22.13 while package.json said 22, so the floor here is checked against every
// package the lockfile installs rather than against the one that prompted it.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import semver from 'semver';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
const pkg = read('package.json');
const lock = read('package-lock.json');

const DEPRECATED = {
  inflight: () => true,
  boolean: () => true,
  'lodash.isequal': () => true,
  glob: (v) => semver.lt(v, '8.0.0'),
  rimraf: (v) => semver.lt(v, '4.0.0'),
};

// A package is named by where it came from, so an alias installed under an
// old name (lodash.isequal -> fast-deep-equal) is judged as what it really is.
function deprecatedIn(packages) {
  return Object.entries(packages)
    .filter(([where]) => where)
    .map(([where, entry]) => {
      const name = entry.resolved?.match(/registry\.npmjs\.org\/((?:@[^/]+\/)?[^/]+)\/-\//)?.[1]
        ?? where.replace(/.*node_modules\//, '');
      return { name, version: entry.version };
    })
    .filter(({ name, version }) => DEPRECATED[name]?.(version))
    .map(({ name, version }) => `${name}@${version}`);
}

function tooNewFor(floor, packages) {
  return Object.entries(packages)
    .filter(([where, entry]) => where && !entry.optional && entry.engines?.node)
    .filter(([, entry]) => !semver.satisfies(floor, entry.engines.node))
    .map(([where, entry]) => `${where.replace(/.*node_modules\//, '')}@${entry.version} wants ${entry.engines.node}`);
}

const at = (name, version, resolvedAs = name) => ({
  version,
  resolved: `https://registry.npmjs.org/${resolvedAs}/-/${resolvedAs.split('/').pop()}-${version}.tgz`,
});

describe('which packages count as the deprecated ones', () => {
  it('flags glob below 8 and rimraf below 4, and not from there up', () => {
    expect(deprecatedIn({
      'node_modules/glob': at('glob', '7.2.3'),
      'node_modules/a/node_modules/glob': at('glob', '8.0.0'),
      'node_modules/rimraf': at('rimraf', '3.0.2'),
      'node_modules/b/node_modules/rimraf': at('rimraf', '4.0.0'),
    })).toEqual(['glob@7.2.3', 'rimraf@3.0.2']);
  });

  it('does not flag fast-deep-equal installed under the name lodash.isequal', () => {
    const aliased = { ...at('fast-deep-equal', '3.1.3') };
    expect(deprecatedIn({ 'node_modules/electron-updater/node_modules/lodash.isequal': aliased })).toEqual([]);
    expect(deprecatedIn({ 'node_modules/lodash.isequal': at('lodash.isequal', '4.5.0') })).toEqual(['lodash.isequal@4.5.0']);
  });
});

describe('the lockfile', () => {
  it('installs none of the packages npm warns are deprecated', () => {
    expect(deprecatedIn(lock.packages)).toEqual([]);
  });

  it('asks for the same Node as package.json', () => {
    expect(lock.packages[''].engines).toEqual(pkg.engines);
  });
});

describe('the Node the repo asks for', () => {
  const floor = semver.minVersion(pkg.engines.node).version;

  it('runs every package the lockfile installs', () => {
    expect(tooNewFor(floor, lock.packages)).toEqual([]);
  });

  it('is judged on the floor, and an optional platform build does not count', () => {
    const packages = {
      'node_modules/a': { version: '1.0.0', engines: { node: '>=22.12.0' } },
      'node_modules/b': { version: '1.0.0', engines: { node: '>=22.20' }, optional: true },
    };
    expect(tooNewFor('22.12.0', packages)).toEqual([]);
    expect(tooNewFor('22.11.0', packages)).toEqual(['a@1.0.0 wants >=22.12.0']);
  });
});
