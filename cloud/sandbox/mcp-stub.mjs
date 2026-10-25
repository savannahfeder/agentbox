#!/usr/bin/env node
// STANDS IN FOR ONE OF THE APP'S MCP SERVERS INSIDE A CLOUD SANDBOX.
//
// The harness starts this exactly as it would start the real server (the
// sandbox's copy of `--mcp-config` names it), and this does nothing but carry
// lines: every line the harness writes goes over the sandbox server's bridge
// socket, out to the Mac as an event, into the REAL server running there; every
// line that server answers comes back the same way and is written here, whole.
// It knows no MCP. Usage: mcp-stub.mjs <server name>.
import net from 'node:net';

const server = process.argv[2];
// A harness that starts its tools with a bare environment (Codex does) still
// finds the image's bridge at its fixed place.
const sockPath = process.env.AGENTBOX_BRIDGE_SOCK || '/tmp/agentbox-bridge.sock';
if (!server || !sockPath) {
  process.stderr.write('mcp-stub: needs a server name and AGENTBOX_BRIDGE_SOCK\n');
  process.exit(2);
}

const sock = net.connect(sockPath);
sock.on('error', (err) => {
  process.stderr.write(`mcp-stub: bridge unavailable: ${err.message}\n`);
  process.exit(1);
});
sock.on('connect', () => {
  sock.write(JSON.stringify({ server }) + '\n');
  process.stdin.pipe(sock, { end: false });
  process.stdin.on('end', () => sock.end());
});
// Lines from the Mac arrive as written: whole lines, in order, each ending in
// a newline, so they can go straight to stdout.
sock.pipe(process.stdout);
// Once the Mac's side closes, everything it sent is written out before this
// goes: a large last reply must not be cut off by the exit.
sock.on('close', () => process.stdout.write('', () => process.exit(0)));
