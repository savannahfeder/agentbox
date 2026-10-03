// THE APP IS CALLED AGENTBOX WITH A CAPITAL A, EVERYWHERE (w-23fa810982, 2026-10-02).
//
// The name was kept lowercase on purpose mid-sentence, so pressing Restart to
// update read "Updating. agentbox restarts by itself in about a minute." and
// the window title, the Dock and every "quit and reopen agentbox" said the same.
// The ask: capitalise it, there and everywhere else in the app. Measured
// before this change: NAME was 'agentbox', and it fed 70 sentences.
//
// The capital has one cost to watch: lines the app wrote to disk under the old
// spelling. A relayed message starts "Relayed from agentbox," in transcripts
// that already exist, and must still be recognised as the app talking, never
// quoted back as something the person typed.

import { describe, expect, it } from 'vitest';
import { NAME, Name, nameSlug, ENV_PREFIX, possessive } from '../shared/product-name.mjs';
import { SAY } from '../renderer/src/update-row.ts';
import { __wasRelayed, fromTheApp } from '../main/agents.mjs';

describe('the name', () => {
  it('is Agentbox mid-sentence as well as at the start of one', () => {
    expect(NAME).toBe('Agentbox');
    expect(Name).toBe('Agentbox');
    expect(possessive).toBe("Agentbox's");
  });

  it('reads with a capital in the restart line that showed it lowercase', () => {
    expect(SAY.installing).toBe('Updating. Agentbox restarts by itself in about a minute.');
    expect(SAY.installing).not.toMatch(/\bagentbox\b/);
  });

  // The slug names folders and the store's MCP server, and the prefix names
  // env vars. Neither is something you read, and both must not move.
  it('leaves the slug and the env prefix exactly as they were', () => {
    expect(nameSlug).toBe('agentbox');
    expect(ENV_PREFIX).toBe('AGENTBOX');
  });
});

describe('what the app wrote under the old spelling', () => {
  it('still recognises a relayed line written lowercase', () => {
    expect(__wasRelayed('Relayed from agentbox, the inbox your user reads.')).toBe(true);
  });

  it('recognises the line it writes now', () => {
    expect(fromTheApp('hi').startsWith('Relayed from Agentbox,')).toBe(true);
    expect(__wasRelayed(fromTheApp('hi').replace(/\s+/g, ' '))).toBe(true);
  });

  it('does not take a person saying the name for the app talking', () => {
    expect(__wasRelayed('agentbox, relayed from somewhere')).toBe(false);
    expect(__wasRelayed('I relayed from agentbox yesterday')).toBe(false);
  });
});
