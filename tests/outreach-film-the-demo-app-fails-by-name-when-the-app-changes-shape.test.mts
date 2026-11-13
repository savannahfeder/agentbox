// THE FILM'S COPY OF THE APP FAILS BY NAME WHEN THE APP CHANGES SHAPE.
//
// The outreach film drives a build of the app fed a made-up company. That door
// used to be a line patch kept outside the repo; it applied to the 9 Nov app
// and not to the 12 Nov one (api.ts had moved 65 lines). It is now a build
// plugin that wraps api's methods by name, and when a name it needs is gone it
// stops the build saying which, instead of filming the canned fixtures world.
// Measured by building the film's app from today's main (it builds in about
// 50 s) and by the cases below.
import { describe, expect, it } from 'vitest';
import { demoHook, API_METHODS, FIXTURE_NAMES } from '../scripts/outreach-film/demo-hook.mjs';
import { filmFromBrief, MIGRATION_OPTIONS } from '../scripts/outreach-film/lib/assemble.mjs';
import fs from 'node:fs';
import path from 'node:path';

const hook = demoHook();
const api = `export const api = {\n${API_METHODS.map((m) => `  async ${m}() { return '${m}'; },`).join('\n')}\n};\n`;

describe('the demo hook', () => {
  it('adds the door to api.ts and leaves every other file alone', () => {
    const out = hook.transform(api, '/repo/renderer/src/api.ts');
    expect(out.code.startsWith(api)).toBe(true);
    for (const m of API_METHODS) expect(out.code).toContain(`A.${m} =`);
    expect(hook.transform(api, '/repo/renderer/src/other.ts')).toBeNull();
    expect(hook.transform(api, '/repo/renderer/src/api.ts?import')).not.toBeNull();
  });
  it('stops the build when api.ts no longer exports the api object', () => {
    expect(() => hook.transform('export function api() {}', '/repo/renderer/src/api.ts')).toThrow(/no longer exports `const api = \{`/);
  });
  it('hands the film the base world from fixtures.ts, and names a fixture that is gone', () => {
    const fixtures = FIXTURE_NAMES.map((n) => `export const ${n} = {};`).join('\n');
    expect(hook.transform(fixtures, '/repo/renderer/src/fixtures.ts').code).toContain('__FIXTURE__');
    expect(() => hook.transform('export const fixtureSnapshot = {};', '/repo/renderer/src/fixtures.ts')).toThrow(/has no fixtureSettings/);
  });
});

describe('the world the film plays', () => {
  const b = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'scripts/outreach-film/brief.example.json'), 'utf8'));
  const film = filmFromBrief(b, { logo: 'logo.png', site: 'site.png', headlines: 'headlines.png' });
  it('has a thread for every part of her words', () => {
    const keys = [...film.needsYou, ...film.running].map((t) => t.key).filter(Boolean);
    expect(keys.sort()).toEqual(['bug', 'cloud', 'headlines', 'jordan', 'maya', 'migration']);
    expect(film.running.find((t) => t.key === 'cloud').title).toBe(b.running[0].title);
  });
  it('fixes what she presses, whatever the brief says', () => {
    expect(film.needsYou.find((t) => t.key === 'migration').options).toEqual(MIGRATION_OPTIONS);
    expect(film.needsYou.find((t) => t.key === 'headlines').options).toEqual(['The first one', 'The second one', 'The third one']);
    expect(film.needsYou.find((t) => t.key === 'jordan').comment).toBe(b.jordan.comment);
  });
  it('always has the same three teammates', () => {
    expect(film.team.people.map((p) => p.name)).toEqual(['Maya Chen', 'Jordan Lee', 'Sam Patel']);
  });
  it('refuses a thread in a project the brief never named', () => {
    const bad = structuredClone(b); bad.sixth.project = 'Billing';
    expect(() => filmFromBrief(bad, {})).toThrow(/"Billing" is not one of the projects/);
  });
});
