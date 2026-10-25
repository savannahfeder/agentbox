// WHICH CLAUDE ACCOUNT A CLOUD SIGN-IN IS, BY ITS ORGANIZATION.
//
// The profile lookup refuses these sign-ins (403, no user:profile scope), so
// the cloud cannot learn an account's email. A free token count answers with
// the `anthropic-organization-id` header instead, which is the same for two
// sign-ins of one account (measured 2026-10-16). It is asked by a short run in
// the cloud, with that account's own sign-in, so the sign-in never comes to
// this Mac; only the id does.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { EventEmitter } from 'node:events';
import { execFileSync } from 'node:child_process';
import { cloudRun } from './run.mjs';
import { loginObjectKey } from './logins.mjs';
import { Name, nameSlug } from '../../shared/product-name.mjs';

const MARK = 'agentbox-org:';
const SANDBOX_NODE = '/usr/local/bin/node';
const PROBE = `fetch('https://api.anthropic.com/v1/messages/count_tokens',{method:'POST',headers:{Authorization:'Bearer '+process.env.CLAUDE_CODE_OAUTH_TOKEN,'anthropic-beta':'oauth-2025-04-20','anthropic-version':'2023-06-01','content-type':'application/json'},body:JSON.stringify({model:'claude-haiku-4-5',messages:[{role:'user',content:'hi'}]})}).then(r=>console.log('${MARK}'+(r.headers.get('anthropic-organization-id')||''))).catch(()=>console.log('${MARK}'))`;

/** The id on the probe's own line, when it is one; null otherwise. */
export function orgFromOutput(text) {
  const line = String(text ?? '').split('\n').find((l) => l.startsWith(MARK));
  const id = line?.slice(MARK.length).trim();
  return id && /^[0-9a-f-]{8,64}$/i.test(id) ? id : null;
}

/** The organization of one cloud Claude account, or null when the cloud would not say. */
export async function readCloudOrg(rec, { transport, storage }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentbox-org-'));
  try {
    const git = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'pipe' });
    git('init', '-q', '-b', 'main', '.');
    git('-c', `user.name=${Name}`, '-c', `user.email=${nameSlug}@localhost`, 'commit', '-q', '--allow-empty', '-m', 'org check');
    git('checkout', '-q', '-b', 'agentbox/org-check');
    const stdout = new PassThrough();
    let out = '';
    stdout.on('data', (d) => { out += d; });
    const stdin = new PassThrough();
    stdin.end();
    await cloudRun({
      argv: ['-e', PROBE], env: { PATH: process.env.PATH, ZERO_ITEM: 'org-check' }, cwd: dir,
      transport, storage, login: { engine: 'claude', id: rec.id, key: loginObjectKey('claude', rec.id) },
      remoteCommand: SANDBOX_NODE, stdin, stdout, stderr: new PassThrough(),
      homeDir: path.join(dir, 'home'), watchParent: false, signals: new EventEmitter(),
    });
    return orgFromOutput(out);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
