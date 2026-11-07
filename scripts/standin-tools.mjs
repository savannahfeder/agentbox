#!/usr/bin/env node
// NOTION, LINEAR, SLACK AND HUBSPOT ON THIS MACHINE, WITH NO ACCOUNT.
//
//   node scripts/standin-tools.mjs --base-port 55300 --file /tmp/standins.json
//
// One server per tool, with its tool names, a sign-in like the vendor's (Notion
// and Linear let an app register itself, Slack and HubSpot take only a client
// made in their console), and the switches in cloud/standin/tools-mcp.mjs for an
// expired token and an outage. `--file` gets the AGENTBOX_TOOLS_STANDINS list,
// and `--state-dir` keeps their sign-ins across a restart.
//
// The tool names come from the vendors' docs. The shapes of the answers are our
// best reading of them and have never been compared with a real account.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { startToolsFixture } from '../cloud/standin/tools-mcp.mjs';
import { OWN_CLIENT_REDIRECT } from '../shared/connections-catalog.mjs';

const schema = (properties = {}, required = []) => ({ type: 'object', properties, required });
const t = (name, description, properties, required) => ({ name, description, inputSchema: schema(properties, required) });
const notThere = (text, what) => ({ isError: true, ...text(`Could not find ${what}`) });

const ISSUES = [
  {
    id: 'LUM-41', title: 'Group bookings: a clinic can hold a block of six', status: 'In Progress', priority: { value: 2, name: 'High' }, assignee: 'Dev Okafor', project: 'Group bookings', team: 'Lumen',
    labels: ['Feature'], url: 'https://linear.app/lumen/issue/LUM-41/group-bookings', createdAt: '2026-10-12T15:04:00.000Z', updatedAt: '2026-10-30T18:22:00.000Z',
    description: 'A clinic asks for six slots for one patient group and holds them for 24 hours.\n\n## What done looks like\n\n- The block shows on the calendar as one row\n- A held block lets go after 24 hours\n- Reminders go out once per person',
    comments: [{ author: 'Sofia Reyes', body: 'Waitlist clinics asked for this first.', createdAt: '2026-10-20T09:12:00.000Z' }],
  },
  {
    id: 'LUM-44', title: 'New onboarding drops people at the calendar step', status: 'Todo', priority: { value: 1, name: 'Urgent' }, assignee: 'Sofia Reyes', project: 'Onboarding', team: 'Lumen',
    labels: ['Bug'], url: 'https://linear.app/lumen/issue/LUM-44/onboarding-calendar-step', createdAt: '2026-10-24T11:40:00.000Z', updatedAt: '2026-10-29T10:02:00.000Z',
    description: 'Three of six clinics stalled here last week.', comments: [],
  },
  {
    id: 'LUM-47', title: 'Reminder texts go out twice on daylight saving day', status: 'Backlog', priority: { value: 3, name: 'Medium' }, assignee: 'Dev Okafor', project: null, team: 'Lumen',
    labels: ['Bug'], url: 'https://linear.app/lumen/issue/LUM-47/reminder-texts-twice', createdAt: '2026-10-26T08:00:00.000Z', updatedAt: '2026-10-26T08:00:00.000Z',
    description: 'One clinic reported it, twice.', comments: [],
  },
];

const PAGES = [
  {
    id: '1f2a9c3e-7b10-4a55-9d21-6c1f0e7a4b11', title: 'Launch plan for group bookings', url: 'https://www.notion.so/lumen/Launch-plan-for-group-bookings-1f2a9c3e7b104a559d216c1f0e7a4b11', timestamp: '2026-10-30T16:10:00.000Z',
    content: '# Launch plan for group bookings\n\nTwo weeks out. Six paying clinics first, then the waitlist of 40.\n\n## This week\n\n- [x] Pricing agreed at $49 a block\n- [ ] Clinic email drafted\n- [ ] Support trained\n\n## Who does what\n\n| Who | What |\n| --- | --- |\n| Maya | Clinic email |\n| Dev | Rollout switch |\n| Sofia | Support notes |\n\n> Do not promise the waitlist a date until the first six are live.\n',
  },
  {
    id: '8c4d1e22-03ab-4f7c-b6a0-91d2e5c07f33', title: 'Onboarding notes', url: 'https://www.notion.so/lumen/Onboarding-notes-8c4d1e2203ab4f7cb6a091d2e5c07f33', timestamp: '2026-10-27T09:30:00.000Z',
    content: '# Onboarding notes\n\nWhat each clinic asked in its first call.\n\n- Northside asked who sees the patient list.\n- Harbor asked to import last year\'s bookings.\n',
  },
];

const DEALS = [
  { id: '48213', properties: { dealname: 'Northside Clinic, group plan', amount: '14400', dealstage: 'contractsent', pipeline: 'default', closedate: '2026-11-14T00:00:00Z', hubspot_owner_name: 'Maya Chen', hs_lastmodifieddate: '2026-10-30T14:00:00Z', description: 'Six sites. Wants group bookings live before they sign.' }, url: 'https://app.hubspot.com/contacts/4404211/deal/48213' },
  { id: '48277', properties: { dealname: 'Harbor Physio, pilot', amount: '2400', dealstage: 'qualifiedtobuy', pipeline: 'default', closedate: '2026-12-01T00:00:00Z', hubspot_owner_name: 'Maya Chen', hs_lastmodifieddate: '2026-10-22T10:00:00Z', description: 'Single site pilot.' }, url: 'https://app.hubspot.com/contacts/4404211/deal/48277' },
];

const CHANNELS = [{ id: 'C07LAUNCH', name: 'launch' }, { id: 'C07SUPPRT', name: 'support' }];
const MESSAGES = {
  C07LAUNCH: [
    { ts: '1793450000.000100', user_name: 'Maya Chen', text: 'Are we telling the waitlist a date this week?', reply_count: 2, permalink: 'https://lumen.slack.com/archives/C07LAUNCH/p1793450000000100' },
    { ts: '1793453600.000200', user_name: 'Dev Okafor', text: 'Rollout switch is in, off by default.', reply_count: 0, permalink: 'https://lumen.slack.com/archives/C07LAUNCH/p1793453600000200' },
  ],
  C07SUPPRT: [],
};
const REPLIES = {
  '1793450000.000100': [
    { ts: '1793450060.000100', user_name: 'Sofia Reyes', text: 'Not until the first six are live.' },
    { ts: '1793450120.000100', user_name: 'Maya Chen', text: 'Agreed. I will say so in the clinic email.' },
  ],
};

const PLAYS = {
  notion: {
    name: 'Notion',
    askedFor: 'read your pages',
    tools: [
      t('notion-list-recent-pages', 'List pages you recently opened.', {}),
      t('notion-search', 'Search pages.', { query: { type: 'string' } }, ['query']),
      t('notion-fetch', 'Read a page by its id or address.', { id: { type: 'string' } }, ['id']),
      t('notion-get-self', 'Who this sign-in is.', {}),
      t('notion-create-pages', 'Create pages.', { pages: { type: 'array' } }, ['pages']),
      t('notion-delete-pages', 'Move pages to Trash.', { ids: { type: 'array' } }, ['ids']),
    ],
    call(name, args, { switches, writes, text }) {
      if (name === 'notion-list-recent-pages') return text({ results: switches.empty ? [] : PAGES.map(({ content: _c, ...p }) => ({ ...p, type: 'page' })) });
      if (name === 'notion-search') { const q = String(args.query ?? '').toLowerCase(); return text({ type: 'workspace_search', results: PAGES.filter((p) => `${p.title} ${p.content}`.toLowerCase().includes(q)).map(({ content: _c, ...p }) => ({ ...p, type: 'page' })) }); }
      if (name === 'notion-fetch') {
        const p = PAGES.find((x) => x.id === args.id || x.url === args.id);
        if (!p) return notThere(text, `page ${args.id}`);
        return text({ metadata: { type: 'page' }, title: p.title, url: p.url, text: `<page url="${p.url}">\n<properties>\n{"title":"${p.title}"}\n</properties>\n<content>\n${p.content}</content>\n</page>` });
      }
      if (name === 'notion-get-self') return text({ type: 'person', name: 'Stand-in person' });
      if (name === 'notion-create-pages') { writes.push(args); return text({ pages: [{ id: 'new-page' }] }); }
      return notThere(text, `tool ${name}`);
    },
  },
  linear: {
    name: 'Linear',
    askedFor: 'read your issues',
    tools: [
      t('list_issues', 'List issues.', { limit: { type: 'number' } }),
      t('get_issue', 'Read an issue by its id.', { id: { type: 'string' } }, ['id']),
      t('list_teams', 'List teams.', {}),
      t('create_issue', 'Create an issue.', { title: { type: 'string' } }, ['title']),
      t('delete_issue', 'Delete an issue.', { id: { type: 'string' } }, ['id']),
    ],
    call(name, args, { switches, writes, text }) {
      if (name === 'list_issues') return text({ issues: switches.empty ? [] : ISSUES.slice(0, Number(args.limit) || ISSUES.length).map(({ comments: _c, ...i }) => i), hasNextPage: false });
      if (name === 'get_issue') { const i = ISSUES.find((x) => x.id === args.id); return i ? text(i) : notThere(text, `issue ${args.id}`); }
      if (name === 'list_teams') return text({ teams: [{ id: 'lumen', name: 'Lumen' }] });
      if (name === 'create_issue') { writes.push(args); return text({ id: `LUM-${50 + writes.length}`, title: args.title }); }
      return notThere(text, `tool ${name}`);
    },
  },
  slack: {
    name: 'Slack',
    askedFor: 'read your channels',
    registered: { clientId: 'standin-slack-client', clientSecret: 'standin-slack-secret', redirects: [OWN_CLIENT_REDIRECT] },
    tools: [
      t('slack_read_user_profile', 'Read a person\'s profile, yours when no one is named.', { user_id: { type: 'string' } }),
      t('slack_search_channels', 'Find channels by name.', { query: { type: 'string' } }, ['query']),
      t('slack_read_channel', 'Read a channel\'s newest messages.', { channel_id: { type: 'string' }, limit: { type: 'number' } }, ['channel_id']),
      t('slack_read_thread', 'Read a message\'s replies.', { channel_id: { type: 'string' }, message_ts: { type: 'string' } }, ['channel_id', 'message_ts']),
      t('slack_send_message', 'Post a message.', { channel_id: { type: 'string' }, text: { type: 'string' } }, ['channel_id', 'text']),
      t('slack_delete_channel', 'Delete a channel.', { channel_id: { type: 'string' } }, ['channel_id']),
    ],
    call(name, args, { switches, writes, text }) {
      if (name === 'slack_read_user_profile') return text({ user: { id: 'U07STANDIN', display_name: 'Stand-in person' } });
      if (name === 'slack_search_channels') { const q = String(args.query ?? '').replace(/^#/, '').toLowerCase(); return text({ channels: CHANNELS.filter((c) => c.name === q) }); }
      if (name === 'slack_read_channel') { const m = MESSAGES[args.channel_id]; return m ? text({ messages: switches.empty ? [] : m }) : notThere(text, `channel ${args.channel_id}`); }
      if (name === 'slack_read_thread') return text({ messages: REPLIES[args.message_ts] ?? [] });
      if (name === 'slack_send_message') { writes.push(args); return text({ ok: true }); }
      return notThere(text, `tool ${name}`);
    },
  },
  hubspot: {
    name: 'HubSpot',
    askedFor: 'read your deals',
    registered: { clientId: 'standin-hubspot-client', clientSecret: 'standin-hubspot-secret', redirects: [OWN_CLIENT_REDIRECT] },
    tools: [
      t('get_user_details', 'Who this sign-in is.', {}),
      t('search_crm_objects', 'Search CRM records of one kind.', { objectType: { type: 'string' }, limit: { type: 'number' } }, ['objectType']),
      t('get_crm_objects', 'Read CRM records by id.', { objectType: { type: 'string' }, ids: { type: 'array' } }, ['objectType', 'ids']),
      t('manage_crm_objects', 'Create or change CRM records.', { objectType: { type: 'string' } }, ['objectType']),
    ],
    call(name, args, { switches, writes, text }) {
      if (name === 'get_user_details') return text({ user: { id: 7, name: 'Stand-in person' }, portalId: 4404211 });
      if (name === 'search_crm_objects') { const rows = args.objectType === 'deals' && !switches.empty ? DEALS : []; return text({ total: rows.length, results: rows }); }
      if (name === 'get_crm_objects') return text({ results: DEALS.filter((d) => (args.ids ?? []).includes(d.id)) });
      if (name === 'manage_crm_objects') { writes.push(args); return text({ ok: true }); }
      return notThere(text, `tool ${name}`);
    },
  },
};

export const STANDIN_KINDS = Object.keys(PLAYS);
/** What a person pastes for the tools that take only a client made in their console. */
export const standInClient = (kind) => PLAYS[kind]?.registered ?? null;

export function startStandin(kind, { port = 0, redirects = null, stateFile = null } = {}) {
  const play = PLAYS[kind];
  if (!play) throw new Error(`no stand-in for ${kind}`);
  return startToolsFixture({ port, stateFile, play: redirects && play.registered ? { ...play, registered: { ...play.registered, redirects } } : play });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (flag) => { const i = process.argv.indexOf(flag); return i > 0 ? process.argv[i + 1] : null; };
  const base = Number(arg('--base-port') ?? 55300);
  const stateDir = arg('--state-dir');
  const running = await Promise.all(STANDIN_KINDS.map((kind, i) => startStandin(kind, { port: base + i, stateFile: stateDir ? path.join(stateDir, `standin-${kind}.json`) : null })));
  const list = Object.fromEntries(STANDIN_KINDS.map((kind, i) => [kind, running[i].mcpUrl]));
  if (arg('--file')) fs.writeFileSync(arg('--file'), JSON.stringify(list));
  console.log(JSON.stringify(list));
  for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => Promise.all(running.map((r) => r.stop())).then(() => process.exit(0)));
}
