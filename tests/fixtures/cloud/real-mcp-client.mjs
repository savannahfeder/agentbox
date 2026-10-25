#!/usr/bin/env node
// A STAND-IN HARNESS THAT SPEAKS MCP PROPERLY: the official client library,
// with its handshake, starting the server its first argument names (in a
// cloud sandbox, the stub) the way Codex and Claude Code do, and printing
// what it got back as one JSON line.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const [command, ...args] = process.argv.slice(2);
// A bare environment, as Codex gives a server: only what the entry names.
const transport = new StdioClientTransport({ command, args, env: { AGENTBOX_BRIDGE_SOCK: process.env.AGENTBOX_BRIDGE_SOCK } });
const client = new Client({ name: 'stand-in-harness', version: '1' });
const timer = setTimeout(() => { process.stdout.write(JSON.stringify({ error: 'timed out' }) + '\n'); process.exit(3); }, 20_000);
await client.connect(transport);
const tools = await client.listTools();
const called = await client.callTool({ name: 'note', arguments: { text: 'through the bridge' } });
clearTimeout(timer);
process.stdout.write(JSON.stringify({ tools: tools.tools.map((t) => t.name), said: called.content?.[0]?.text }) + '\n');
await client.close();
process.exit(0);
