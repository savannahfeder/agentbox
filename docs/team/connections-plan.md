# Connections: the plan

## Since then (2026-10-31, later)

The owner asked for "Keep a copy in Files" after all, so point 6 below is replaced: a copy is a
file on a closed thread of a project, so the project decides who reads it and there is no second
permissions system. A person starts it per tool and chooses the project.

The catalogue is in `shared/connections-catalog.mts`. Each address's public sign-in details were
read with no account on 2026-10-31. These can register themselves: Notion, Linear, Atlassian,
Sentry, Stripe, Intercom, monday.com, Airtable, ClickUp, Vercel. These need a client made in the
vendor's console: Slack, HubSpot, Google Drive, Gmail, Google Calendar, Salesforce, Asana. GitHub
takes a personal access token. Figma lists only approved clients. No real account has been tried.

## Codex's review changed this plan (2026-10-31, gpt-6.1-sol)

Approved as a smaller, read-only first version. What changed, and it overrides anything below:

1. No token ever leaves the app. The proxy is a dumb stdio forwarder: it sends bounded MCP
   requests to the app over a run-scoped channel, tied to connection, person and run. Vendor
   HTTP, refresh and authorization all happen inside the app. There is no call that returns a
   token (a worker can read whatever its children are handed, main/approvals.mts says why).
2. The app enforces the policy, not the engine: cloud defaults bypass engine approvals. Only
   tools on an explicit read list pass. Unknown tools are denied, and a changed tool list is
   flagged. Writes use the app's own card and signed decision, or wait. No heuristic for what
   writes, and no blanket "Agents may write".
3. Say plainly that a connection needs its owner's app online. Reuse the cloud run's MCP relay
   (main/cloud/run.mts); stdio fits it. Test both engines, and resumed Codex threads.
4. OAuth differs per vendor: Linear documents localhost OAuth, Slack does not support dynamic
   registration. Start with one real flow, Linear; the catalog records each vendor's needs. No
   six-vendor promise.
5. Tokens: never fall back to a plain file. No encryption means no connection, and it says so.
   Serialize refresh, keep rotation, bound retries, never replay a write.
6. "Bring it home" is cut from v1: copies are a second permissions system. Agents may still
   save what they read into Files as they would any work. Comes back later with source
   selection, consent, deletion and ownership.
7. One synthetic protocol fixture, not vendor impersonations. Real-account checks are a separate
   step that needs a person to sign in. A check tells apart: not signed in, not allowed, empty,
   temporarily down. A failed daily check does not remove a connection that works.

The owner wants Agentbox to be the company brain: agents and people reach Notion, Linear,
Slack, HubSpot, Drive and GitHub from here, and what matters is stored here until the other
tools are no longer needed. Connecting has to be "quick, elegant, and robust, with certainty
it works".

## Facts this is built on

- Workers are Claude Code and Codex. Both speak MCP. Claude workers take `--mcp-config`
  (main/supervisor.mts `mcpServers()`, about line 11861, written per spawn) and also see the
  user's own MCP servers, since there is no `--strict-mcp-config`. Codex workers take
  `mcpServers` in thread params (`codexThreadParamsFor`).
- Vendors ship official remote MCP servers over HTTP with OAuth: Notion, Linear, Slack,
  HubSpot, GitHub, Atlassian. Google Drive has none we can rely on from every engine.
- Workers run headless, so they cannot finish an OAuth browser flow.
- The store is readable by every worker, so no token may live in it. The team session already
  lives outside the store for this reason (main/team/session.mts).
- Agents run on the person's own subscription; each person has their own copy of the app.

## What to build

### 1. The app is the MCP client that signs in and checks

A new `main/connections/` module, using the MCP SDK the app already depends on:

- A short catalog in `shared/connections-catalog.mts`: name, the vendor's MCP address,
  auth kind (oauth or token), a safe read tool to try for each (Linear `list_issues`, Notion
  `search`), and how to tell a write tool.
- Sign in: the app runs the OAuth flow itself (dynamic client registration, PKCE, a loopback
  callback, the system browser) and keeps tokens in the safeStorage-encrypted file beside the
  team session, outside the store. Token-kind tools take a pasted key, kept the same way.
- Check: connect, `tools/list`, call the safe read, with a hard deadline. No model turn, no
  usage spent. The result is kept: Works, with the tool count, one line of what it read and
  the time; or Not working, with the plain reason and what to do. A check runs after sign-in,
  on opening the page if the last is over a day old, and when a worker's run reports an auth
  failure for that server. "Works" is only ever said on a real read.

### 2. Workers get them through the app

- `mcpServers()` and the Codex thread params add each connection that last checked Works,
  over a small local proxy the app runs (a stdio MCP server, `mcp/connection-proxy.mts`, that
  takes the connection's name, gets the token from the app over its existing local socket and
  forwards to the vendor). So no token reaches a worker's environment, files or transcript,
  and Agentbox can log and gate each call.
- Refresh on 401 happens in the proxy, invisibly.
- Writes: a tool the catalog marks as writing goes through the existing permission prompt
  unless the person turned on "Agents may write to Linear". Reading is allowed by default.
- A connection is one person's: their agents and AI teammates use it. The team sees who has
  connected what, so a teammate knows to ask. No shared tokens in this version.

### 3. The page

"Connections" in the sidebar under Files, and in Command K: a calm grid of tiles, one per
tool: logo mark, name, state word (Works 2 min ago, Not connected, Not working), and who on
the team has it. A tile opens a small sheet: Connect, Check now, what it can do (tools listed
plainly, reads and writes apart), "Agents may write", Disconnect. An agent that needs a tool
nobody has connected says so in the thread with a one-press link to this page.

### 4. Bring it home

On a working connection, "Keep a copy in Files" starts an AI teammate with a standing job:
keep markdown copies of what matters from that tool (open Linear issues, Notion pages named by
the person, HubSpot deals) in the project's `sources/<tool>/` folder, each with where it came
from, its address and when fetched. These appear in the Files place with "From Linear", are
searched like any file, and can be read by every agent through team_read. Copies of a tool
are shared with the team as files are, only when the person who connected it says so.

### 5. Testing with certainty

- `cloud/standin/tools-mcp.mjs`: a local HTTP MCP server that plays Linear, Notion and HubSpot
  with Lumen's data, real tool names and shapes, a working OAuth flow, and switches for: token
  expired, server down, 500s, slow answers, revoked access. Catalog entries pointing at it
  appear only under an env flag, never in an installed build.
- Tests over it: sign in, check, a worker's proxy call, refresh on 401, a revoked token turning
  a tile to Not working, a write stopped at the permission prompt, a token appearing in no
  store file, env, log or transcript.
- End to end: a copy of the app connects these stand-ins, and its real Claude agents use them.

## Order

Stand-in tools, then client and check, then the page, then proxy and worker wiring, then bring
it home. Each committed separately.

## Open questions for the reviewer

1. Is a proxy the right way to keep tokens out of workers, or does it break something in how
   Claude Code or Codex treat stdio MCP servers (tool grants `mcp__x__y`, approvals, cloud runs)?
2. Do vendors' MCP OAuth servers accept a loopback redirect from a client that is not Claude?
3. What is missing that will make this fail for a real team? What would you cut?
