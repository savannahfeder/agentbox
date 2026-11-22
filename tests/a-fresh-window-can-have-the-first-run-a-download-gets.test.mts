// A FRESH WINDOW CAN HAVE THE FIRST RUN A DOWNLOAD GETS (w-1e52420829, 2026-11-12).
//
// The founder asked to test the onboarding and was opened a plain fresh-user
// window. It has no team cloud and none of her chats, by design, so it showed
// two setup steps where a download shows seven: no account, no plan, no
// invite, no chats to bring in. She took that for the product. `--team` now
// hands the window the team cloud this computer already has, and the command
// says what a window without it leaves out.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { teamConfigToUse } from '../shared/fresh-user-home.mts';
import { nameSlug } from '../shared/product-name.mjs';

const script = fs.readFileSync(new URL('../scripts/fresh-user.mjs', import.meta.url), 'utf8');
const inRepo = path.join('/repo', 'cloud', 'team.config.json');
const onMac = path.join('/Users/someone', `.${nameSlug}`, 'team.config.json');
const find = (there: string[], env: NodeJS.ProcessEnv = {}) =>
  teamConfigToUse({ repo: '/repo', realHome: '/Users/someone', env, exists: (f) => there.includes(String(f)) });

describe('the team cloud a fresh window is handed', () => {
  it('is the one named in the environment, when that file is there', () => {
    expect(find(['/x/team.json', inRepo, onMac], { AGENTBOX_TEAM_CONFIG: '/x/team.json' })).toBe('/x/team.json');
  });
  it('else the checkout’s own, else the one kept on this computer', () => {
    expect(find([inRepo, onMac])).toBe(inRepo);
    expect(find([onMac])).toBe(onMac);
  });
  it('is none when no file is there, a named one included', () => {
    expect(find([])).toBeNull();
    expect(find([], { AGENTBOX_TEAM_CONFIG: '/gone/team.json' })).toBeNull();
  });
});

describe('npm run fresh', () => {
  it('hands the window that file only when asked with --team', () => {
    expect(script).toMatch(/const team = args\.has\('--team'\) \? teamConfigToUse\(\{ repo \}\) : null;/);
    expect(script).toMatch(/env: \{ \.\.\.freshEnv\(home\), \.\.\.\(team \? \{ AGENTBOX_TEAM_CONFIG: team \} : \{\}\) \}/);
  });
  it('says what a window without a team cloud or her chats leaves out', () => {
    expect(script).toMatch(/no account, plan or invite step/);
    expect(script).toMatch(/npm run fresh -- --with-agents --team/);
  });
});
