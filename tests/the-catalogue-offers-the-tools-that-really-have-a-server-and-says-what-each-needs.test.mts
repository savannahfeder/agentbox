// THE CATALOGUE OFFERS THE TOOLS THAT REALLY HAVE A SERVER, AND SAYS WHAT EACH NEEDS.
//
// What was missing (2026-10-31): the page offered Linear and a test tile, while a
// team asks for all its tools. Measured on 2026-10-31 by asking each address for
// its public sign-in details with no account: Notion, Linear, Atlassian, Sentry,
// Stripe and Intercom let any app register itself. Slack, HubSpot, Google and
// GitHub do not, and Figma lists only clients on its own catalogue, so pressing
// Connect there could only fail. These tests hold those facts and the policy.
import { describe, expect, it } from 'vitest';
import { ACCESS, catalogFor, GROUPS, OWN_CLIENT_REDIRECT } from '../shared/connections-catalog.mts';
import { oneLineRead } from '../main/connections/talk.mts';
import { tilesFound, toolWords } from '../renderer/src/connections/connections-shown';

const real = catalogFor({ env: {}, packaged: true });
const entry = (id) => real.find((e) => e.id === id);

describe('what is offered', () => {
  it('has each tool the owner named, on its true address', () => {
    const want = {
      notion: 'https://mcp.notion.com/mcp',
      linear: 'https://mcp.linear.app/mcp',
      slack: 'https://mcp.slack.com/mcp',
      hubspot: 'https://mcp.hubspot.com/',
      'google-drive': 'https://drivemcp.googleapis.com/mcp/v1',
      gmail: 'https://gmailmcp.googleapis.com/mcp/v1',
      'google-calendar': 'https://calendarmcp.googleapis.com/mcp/v1',
      github: 'https://api.githubcopilot.com/mcp/',
      atlassian: 'https://mcp.atlassian.com/v2/mcp',
      sentry: 'https://mcp.sentry.dev/mcp',
      stripe: 'https://mcp.stripe.com/',
      figma: 'https://mcp.figma.com/mcp',
      intercom: 'https://mcp.intercom.com/mcp',
      salesforce: 'https://api.salesforce.com/platform/mcp/v1/platform/sobject-reads',
    };
    for (const [id, address] of Object.entries(want)) expect(entry(id)?.address, id).toBe(address);
  });

  it('puts every tool in a named group, with no id twice', () => {
    const groups = new Set(GROUPS.map((g) => g.id));
    for (const e of real) expect(groups.has(e.group), e.id).toBe(true);
    expect(new Set(real.map((e) => e.id)).size).toBe(real.length);
  });

  it('only ever points a real tile at https', () => {
    for (const e of real) expect(new URL(e.address).protocol, e.id).toBe('https:');
  });
});

describe('what each one needs is said, and it is what the vendor really asks', () => {
  it('a tool that lets an app register itself needs only a press', () => {
    for (const id of ['notion', 'linear', 'atlassian', 'sentry', 'stripe', 'intercom']) {
      expect(entry(id).access, id).toBe(ACCESS.SIGN_IN);
      expect(entry(id).registration, id).toBe('dynamic');
    }
  });

  it('a tool that refuses self-registration asks for a client made in that tool, and says where', () => {
    for (const id of ['slack', 'hubspot', 'google-drive', 'gmail', 'google-calendar', 'salesforce']) {
      expect(entry(id).access, id).toBe(ACCESS.OWN_CLIENT);
      expect(entry(id).registration, id).toBe('own');
      expect(entry(id).needs?.length, id).toBeGreaterThan(20);
    }
    expect(entry('hubspot').needs).toMatch(/MCP Connector/);
    expect(entry('slack').needs).toMatch(/Slack app/);
    expect(entry('gmail').needs).toMatch(/preview/i);
  });

  it('GitHub takes a personal access token rather than pretending to offer a sign-in', () => {
    expect(entry('github').access).toBe(ACCESS.KEY);
    expect(entry('github').needs).toMatch(/personal access token/i);
  });

  it('Figma says it needs Figma\'s approval, and cannot be pressed', () => {
    expect(entry('figma').access).toBe(ACCESS.VENDOR_APPROVAL);
    expect(entry('figma').needs).toMatch(/Figma/);
    expect(entry('figma').needs).toMatch(/waitlist/);
  });

  it('the address a person gives their own client is a fixed loopback one', () => {
    expect(new URL(OWN_CLIENT_REDIRECT).hostname).toBe('localhost');
    expect(new URL(OWN_CLIENT_REDIRECT).port).not.toBe('');
  });
});

describe('the policy stays a written list', () => {
  it('no tool is on both lists, and a check only ever reads', () => {
    for (const e of real) {
      if (!e.reads) continue;
      expect(e.reads.filter((n) => e.writes.includes(n)), e.id).toEqual([]);
      expect(e.reads, e.id).toContain(e.check.tool);
    }
  });

  it('a tool whose names could not be read in its docs has no guessed list: the person chooses', () => {
    for (const id of ['sentry', 'salesforce']) {
      expect(entry(id).reads, id).toBeNull();
      expect(entry(id).writes, id).toEqual([]);
      expect(entry(id).check, id).toBeNull();
    }
  });

  it('money and sends are never on a read list', () => {
    const stripe = entry('stripe');
    for (const n of ['send_money', 'transfer_money', 'convert_currency']) {
      expect(stripe.reads, n).not.toContain(n);
      expect(stripe.writes, n).not.toContain(n);
    }
    expect(stripe.reads).not.toContain('stripe_api_write');
    expect(entry('slack').reads).not.toContain('slack_send_message');
    expect(entry('gmail').reads).not.toContain('create_draft');
  });
});

describe('what a person reads about a tool', () => {
  it('says each kind of tool name as words, whatever way the vendor spells it', () => {
    expect(toolWords('get_issue')).toBe('Read an issue');
    expect(toolWords('notion-get-users')).toBe('Read users');
    expect(toolWords('notion-create-pages')).toBe('Create pages');
    expect(toolWords('notion-get-self')).toBe('See who is signed in');
    expect(toolWords('notion-fetch')).toBe('Read a page');
    expect(toolWords('getJiraIssue')).toBe('Read a jira issue');
    expect(toolWords('slack_read_channel')).toBe('Read channel');
  });

  it('says a real id beside a title, and leaves a database\'s long id out', () => {
    const line = (row) => oneLineRead({ content: [{ type: 'text', text: JSON.stringify({ results: [row] }) }] });
    expect(line({ id: '1f2a9c3e-7b10-4a55-9d21-6c1f0e7a4b11', title: 'Launch plan' })).toBe('Launch plan');
    expect(line({ id: 'LUM-41', title: 'Group bookings' })).toBe('LUM-41 Group bookings');
    expect(line({ id: '1f2a9c3e-7b10-4a55-9d21-6c1f0e7a4b11' })).toBe('1f2a9c3e-7b10-4a55-9d21-6c1f0e7a4b11');
    expect(line({ id: '48213', properties: { dealname: 'Northside' } })).toBe('48213 Northside');
    const whole = (v) => oneLineRead({ content: [{ type: 'text', text: JSON.stringify(v) }] });
    expect(whole({ user: { id: 'U1', display_name: 'Maya' } })).toBe('Maya');
    expect(whole({ login: 'lumen-dev' })).toBe('lumen-dev');
  });

  it('finds a tool by name or by its group, and not otherwise', () => {
    const groups = [{ id: 'talk', name: 'Messages and calendar' }];
    const tiles = [{ name: 'Slack', group: 'talk' }, { name: 'Notion', group: 'docs' }];
    expect(tilesFound(tiles, 'sla', groups).map((t) => t.name)).toEqual(['Slack']);
    expect(tilesFound(tiles, 'calendar', groups).map((t) => t.name)).toEqual(['Slack']);
    expect(tilesFound(tiles, 'zzz', groups)).toEqual([]);
    expect(tilesFound(tiles, '', groups)).toHaveLength(2);
  });
});

describe('a stand-in takes a real tile\'s place only where it is allowed', () => {
  const at = { notion: 'http://127.0.0.1:9/mcp', linear: 'http://127.0.0.1:8/mcp', figma: 'https://evil.example/mcp' };
  const env = { AGENTBOX_TOOLS_STANDINS: JSON.stringify(at) };

  it('keeps the real tile\'s lists and check, so the same code runs against it', () => {
    const on = catalogFor({ env, packaged: false }).find((e) => e.id === 'notion');
    expect(on.address).toBe(at.notion);
    expect(on.standin).toBe(true);
    expect(on.reads).toEqual(entry('notion').reads);
    expect(on.check).toEqual(entry('notion').check);
  });

  it('never in an installed build', () => {
    expect(catalogFor({ env, packaged: true }).find((e) => e.id === 'notion').address).toBe('https://mcp.notion.com/mcp');
  });

  it('never at an address off this machine', () => {
    expect(catalogFor({ env, packaged: false }).find((e) => e.id === 'figma').address).toBe('https://mcp.figma.com/mcp');
  });

  it('a mangled list changes nothing', () => {
    expect(catalogFor({ env: { AGENTBOX_TOOLS_STANDINS: '{nope' }, packaged: false }).find((e) => e.id === 'notion').address).toBe('https://mcp.notion.com/mcp');
  });
});
