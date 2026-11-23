// SETUP SHOWS EACH AGENT'S OWN LOGO (w-9687db6270, 2026-11-22).
//
// The founder, at Pick your agent: "I feel like we should definitely include the
// icons here when we're picking agents. The X is kind of funny". The rows wore
// the letters C and X in a tile. They wear the marks the composer's chip wears.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const split = fs.readFileSync(new URL('../renderer/src/components/SetupSplit.tsx', import.meta.url), 'utf8');
const at = split.indexOf("step === 'agent'");
const agent = split.slice(at, split.indexOf("step === 'look'", at));

describe('Pick your agent', () => {
  it('draws each agent as its maker’s mark, in the tile', () => {
    expect(split).toMatch(/import \{ EngineLogo \} from '\.\/EngineLogos'/);
    expect(agent).toMatch(/<span className="ss-ai"><EngineLogo engine=\{id\}/);
  });
  it('has no letter standing in for one', () => {
    expect(agent).not.toMatch(/'C' : 'X'/);
  });
});
