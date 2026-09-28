// EVERY AGENT DIES WHEN THE APPROVALS LAUNCHER CANNOT RUN.
//
// It was not parallelism. Every Claude worker died in about four seconds with
//
//   Error: MCP tool mcp__zero-approvals__approval_prompt (passed via
//   --permission-prompt-tool) not found.
//
// because the rename sweep (ec2a58fc, "Take the founder's conversations...")
// reflowed comments and turned line one of scripts/approval-server.sh from
// `#!/bin/bash` into `# !/bin/bash`. A shell running it by hand shrugs that off;
// the CLI spawning it directly gets ENOEXEC (errno -8), the server never comes
// up, and Claude refuses to start a session without its permission tool. Three
// deaths struck her default account, which took Claude's capacity to zero, so
// the only thing still running was the one Codex task. Measured in her store at
// 19:21: four workers dead inside four seconds, all on this line.
//
// So: every shell script in the tree starts with a real shebang, and the
// launcher answers an MCP handshake when spawned exactly the way the CLI does,
// with no shell in between.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const scriptsDir = path.join(repo, 'scripts');

describe('every shell script starts with a real shebang', () => {
  const shells = fs.readdirSync(scriptsDir).filter((f) => f.endsWith('.sh'));

  it('there are shell scripts to check', () => {
    expect(shells).toContain('approval-server.sh');
  });

  for (const f of shells) {
    it(`${f} opens with #!/`, () => {
      const first = fs.readFileSync(path.join(scriptsDir, f), 'utf8').split('\n')[0];
      expect(first).toMatch(/^#!\//);
    });
  }

  it('a commented-out shebang is exactly what the check catches', () => {
    expect('# !/bin/bash').not.toMatch(/^#!\//);
    expect('#!/bin/bash').toMatch(/^#!\//);
  });
});

describe('the approvals launcher runs the way the CLI runs it', () => {
  it('spawned directly, with no shell, it answers an MCP handshake', () => {
    const init = JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '1' } },
    }) + '\n';
    const r = spawnSync(path.join(scriptsDir, 'approval-server.sh'), [], {
      input: init,
      env: { HOME: process.env.HOME, PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin`, ZERO_APPROVALS_DIR: fs.mkdtempSync(path.join(fs.realpathSync(process.env.TMPDIR ?? '/tmp'), 'approvals-')) },
      timeout: 15_000,
    });
    expect(r.error?.code).toBeUndefined();
    expect(String(r.stdout)).toContain('"serverInfo"');
  });
});
