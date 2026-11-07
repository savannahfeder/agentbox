// THE CLOUD SERVER DEPLOYS AS A FILE LAMBDA CAN START.
//
// On 2026-11-01 a bulk rename of main/ to .mts also renamed the gateway's
// bundle to index.mts. Lambda's Node runtime finds the handler `index.handler`
// only as index.js, index.mjs or index.cjs, so after the next deploy every call
// to the cloud server answered 502 "Internal Server Error" in under a second,
// and every cloud run failed before it started (measured: 214 run logs on
// 2026-11-05 said "the cloud server said 502"). The old check loaded the
// bundle from the build folder under its own name, which Node on a Mac happily
// imports as .mts, so it stayed green. This one opens the zip that is uploaded
// and loads what Lambda would load.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { bundle, HANDLER } from '../scripts/cloud-gateway-setup.mjs';

// What Lambda's Node runtime tries for a handler's module, in its order.
const LAMBDA_LOADS = ['.js', '.mjs', '.cjs'];

/** The file Lambda would start from this zip, or null when it would find none. */
function lambdaWouldLoad(names, handler) {
  const module = handler.slice(0, handler.lastIndexOf('.'));
  return LAMBDA_LOADS.map((ext) => module + ext).find((n) => names.includes(n)) ?? null;
}

describe('which file Lambda starts', () => {
  it('finds index.mjs and index.js, and nothing for index.mts or index.ts', () => {
    expect(lambdaWouldLoad(['index.mjs'], 'index.handler')).toBe('index.mjs');
    expect(lambdaWouldLoad(['index.js'], 'index.handler')).toBe('index.js');
    expect(lambdaWouldLoad(['index.mts'], 'index.handler')).toBeNull();
    expect(lambdaWouldLoad(['index.ts'], 'index.handler')).toBeNull();
    expect(lambdaWouldLoad(['main.mjs'], 'index.handler')).toBeNull();
  });
});

describe('the uploaded zip', () => {
  it('holds the file the handler names, which loads with nothing installed beside it and says what settings it is missing', async () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'gateway-bundle-'));
    const alone = fs.mkdtempSync(path.join(os.tmpdir(), 'gateway-alone-'));
    try {
      const zip = await bundle(out);
      expect(fs.statSync(zip).size).toBeGreaterThan(1000);
      // Unpacked into a folder with no node_modules anywhere above it, as Lambda does.
      execFileSync('unzip', ['-q', zip, '-d', alone]);
      const file = lambdaWouldLoad(fs.readdirSync(alone), HANDLER);
      expect(file, `Lambda finds nothing for ${HANDLER} in ${fs.readdirSync(alone).join(', ')}`).not.toBeNull();
      const mod = await import(pathToFileURL(path.join(alone, file)).href);
      const fn = HANDLER.slice(HANDLER.lastIndexOf('.') + 1);
      await expect(mod[fn]({ rawPath: '/v1/me', headers: {}, requestContext: { http: { method: 'GET' } } })).rejects.toThrow(/missing REGION/);
    } finally {
      fs.rmSync(out, { recursive: true, force: true });
      fs.rmSync(alone, { recursive: true, force: true });
    }
  }, 60_000);
});
