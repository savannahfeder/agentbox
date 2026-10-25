#!/usr/bin/env node
// A STAND-IN FOR THE STORE'S MCP SERVER, RUN ON THE "MAC" IN A CLOUD-RUN TEST.
// It answers `tools/list` with two tools (one the cloud must never see) and
// `tools/call note` by appending to a file on the Mac, so a test can prove the
// call ran here, with the worker's own environment.
import fs from 'node:fs';

const log = process.env.FAKE_STORE_LOG;
// FAKE_STORE_STRICT=1: refuse every call before the handshake, as a real
// server's library does.
const strict = process.env.FAKE_STORE_STRICT === '1';
let ready = false;
let buf = '';
process.stdin.on('data', (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const msg = JSON.parse(buf.slice(0, i));
    buf = buf.slice(i + 1);
    if (strict && !ready && msg.method !== 'initialize' && msg.id !== undefined) {
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, error: { code: -32002, message: 'not initialized' } }) + '\n');
      continue;
    }
    // A real MCP client (Codex, Claude Code) opens with this handshake.
    if (msg.method === 'initialize') {
      ready = true;
      reply(msg.id, { protocolVersion: msg.params?.protocolVersion ?? '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'fake-store', version: '1' } });
    } else if (msg.method === 'tools/list') {
      const schema = { type: 'object', properties: { text: { type: 'string' } } };
      reply(msg.id, { tools: [{ name: 'note', description: 'Write a note on the Mac.', inputSchema: schema }, { name: 'look_at_page', description: 'Look at a page.', inputSchema: schema }] });
    } else if (msg.method === 'tools/call') {
      fs.appendFileSync(log, JSON.stringify({ name: msg.params.name, args: msg.params.arguments, item: process.env.ZERO_ITEM }) + '\n');
      // "REFUSE" in the words: turned down, as a row another session holds is.
      if (String(msg.params.arguments?.text ?? '').includes('REFUSE')) reply(msg.id, { isError: true, content: [{ type: 'text', text: 'another session holds this row' }] });
      else reply(msg.id, { content: [{ type: 'text', text: `noted on the Mac for ${process.env.ZERO_ITEM}` }] });
    } else if (msg.id !== undefined) {
      // Anything else asked (Codex asks resources/list and templates) gets a
      // proper "not here", as the real store server's library answers; a
      // request left unanswered hangs the client.
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: 'Method not found' } }) + '\n');
    }
  }
});
function reply(id, result) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n'); }
