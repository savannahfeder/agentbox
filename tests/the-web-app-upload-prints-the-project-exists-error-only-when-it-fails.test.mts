// THE WEB APP UPLOAD PRINTS THE "PROJECT EXISTS" ERROR ONLY WHEN IT FAILS.
//
// What broke (w-40a35411e8, 2026-11-23): every upload first asks Cloudflare to
// make the project, and once it exists wrangler answers with an error line.
// That line went into the ship's output, and when the ship ended non-zero the
// app quoted it to the person as why the branch "did not ship".
//
// The make step's words are now kept back, and shown only when the upload
// itself fails, where they may say why.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const here = path.resolve(import.meta.dirname, '..');
const EXISTS = '✘ [ERROR] A request to the Cloudflare API (/accounts/0000/pages/projects) failed.';
let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'phone-deploy-'));
  for (const f of ['scripts/deploy-phone-site.mjs', 'scripts/phone-site-config.mjs', 'shared/product-name.mjs']) {
    fs.mkdirSync(path.dirname(path.join(tmp, f)), { recursive: true });
    fs.copyFileSync(path.join(here, f), path.join(tmp, f));
  }
  fs.mkdirSync(path.join(tmp, 'phone-site'));
  fs.writeFileSync(path.join(tmp, 'phone-site', 'index.html'), '<html></html>');
  fs.mkdirSync(path.join(tmp, 'bin'));
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

// A stand-in npx: the make step always says the project exists, the upload
// ends with the code given.
function upload(deployExit: number) {
  const npx = path.join(tmp, 'bin', 'npx');
  fs.writeFileSync(npx, `#!/bin/sh\ncase "$*" in\n  *"project create"*) echo '${EXISTS}' >&2; exit 1 ;;\n  *"pages deploy"*) echo 'uploading'; exit ${deployExit} ;;\nesac\n`);
  fs.chmodSync(npx, 0o755);
  return spawnSync(process.execPath, [path.join(tmp, 'scripts', 'deploy-phone-site.mjs')], {
    cwd: tmp, encoding: 'utf8', env: { ...process.env, PATH: `${path.join(tmp, 'bin')}${path.delimiter}${process.env.PATH}`, HOME: tmp },
  });
}

describe('putting the web app up on a project that already exists', () => {
  it('says nothing about the project existing when the upload works', () => {
    const r = upload(0);
    expect(r.status).toBe(0);
    expect(`${r.stdout}${r.stderr}`).toContain('uploading');
    expect(`${r.stdout}${r.stderr}`).not.toContain(EXISTS);
  });

  it('shows what the make step said when the upload fails', () => {
    const r = upload(3);
    expect(r.status).toBe(3);
    expect(r.stderr).toContain(EXISTS);
  });
});
