#!/usr/bin/env node
// The stdio transport. Deliberately the thinnest file in the build: everything
// it knows is how to hand mcp/tools.mjs to a pipe, so the day the app wants HTTP
// instead, the sibling file that does it changes nothing else.
//
// Run it directly:  STORE_ACCOUNT_ID=<id> node mcp/stdio.mjs
// Register it:      claude mcp add <name> -- node /path/to/mcp/stdio.mjs
//
// THE SERVER IS NAMED FROM shared/product-name.mjs AND NOWHERE ELSE, which is
// the same rule the rest of the app already follows. It used to be a literal
// string, because this server was lifted out of another product, and that
// product's name reached every worker as its tool prefix and every brief that
// had to name a tool.
//
// One rule this file exists to enforce: STDOUT BELONGS TO THE PROTOCOL. A stray
// console.log anywhere in the server corrupts the JSON-RPC stream and the client
// sees a parse error rather than whatever was printed, so logging goes to
// stderr, and console.log is rebound below so that a careless one downstream
// cannot take the server down.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { buildTools } from './tools.mjs';
import { NAME, Name, nameSlug } from '../shared/product-name.mjs';

const LOG = `[${nameSlug}-store]`;

console.log = (...args) => console.error(LOG, ...args);

async function main() {
  const { account, tools, claims } = buildTools();

  const server = new McpServer(
    { name: nameSlug, version: '1.0.0' },
    {
      instructions: [
        `${Name} is this founder's product store: several products at once, each with its documents, personas, transcripts, reports, and designs, plus the skills describing how that work is done well.`,
        'It holds the thinking, not the software. Product code lives in ordinary git checkouts (each product\'s repoPath), which you work in with your own tools.',
        'Several sessions may be running against this store at the same time, so claim a work item before acting on it.',
      ].join(' '),
    },
  );

  for (const tool of tools) {
    server.registerTool(tool.name, { description: tool.description, inputSchema: tool.schema }, tool.run);
  }

  // Give held work items back promptly on a clean exit instead of making the
  // next worker wait out a full lease. Best effort by design: the lease is the
  // guarantee, and this is only the courtesy that makes the common case fast.
  const goodbye = () => {
    for (const id of claims.holding()) {
      try { claims.release(id); } catch { /* the lease will handle it */ }
    }
    process.exit(0);
  };
  process.on('SIGINT', goodbye);
  process.on('SIGTERM', goodbye);

  await server.connect(new StdioServerTransport());
  console.error(`${LOG} serving account ${account.accountId} from ${account.root} (${tools.length} tools) for ${NAME}`);
}

main().catch((err) => {
  // A startup failure is almost always configuration (no account, wrong
  // STORE_HOME), so it must be readable on stderr rather than a stack trace
  // the client swallows.
  console.error(`${LOG} failed to start: ${err?.message ?? err}`);
  process.exit(1);
});
