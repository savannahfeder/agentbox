// THE CLOUD SERVER'S AWS RIGHTS REACH ONLY WHAT IT NEEDS, AND IT DEPLOYS AS
// ONE FILE THAT STARTS.
//
// scripts/cloud-gateway-setup.mjs gives the cloud server (w-6633e825a7) its
// rights in our AWS account. Two of them guard everyone's data: the links it
// hands to Macs are signed by a user that must never reach the ledger (or a
// Mac could rewrite its own plan), and the function itself must start only
// our one runtime. And the function is bundled into one file for Lambda,
// where nothing is installed: a bundle that cannot even load is only found
// once it is deployed, by every caller at once.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { rolePolicy, signerPolicy, signerKeyPlan, withDoneNotice, bundle, FUNCTION_SECONDS } from '../scripts/cloud-gateway-setup.mjs';
import { CALL_MS } from '../main/cloud/managed.mjs';
import { runtimeRolePolicy } from '../scripts/cloud-setup.mjs';

const where = { bucket: 'agentbox-cloud-x', runtimeArn: 'arn:aws:bedrock-agentcore:us-east-1:000000000000:runtime/agentbox_sandbox-x', region: 'us-east-1', account: '000000000000' };
const resources = (p) => p.Statement.flatMap((s) => [].concat(s.Resource));
const actions = (p) => p.Statement.flatMap((s) => [].concat(s.Action));

describe('the links\' signer', () => {
  it('reads and writes runs and sign-ins, and nothing else', () => {
    const p = signerPolicy(where);
    const objects = p.Statement.find((s) => [].concat(s.Action).includes('s3:GetObject'));
    expect([].concat(objects.Resource).sort()).toEqual(['arn:aws:s3:::agentbox-cloud-x/logins/*', 'arn:aws:s3:::agentbox-cloud-x/runs/*']);
    expect([].concat(objects.Action).sort()).toEqual(['s3:GetObject', 's3:PutObject']);
    expect(JSON.stringify(p)).not.toContain('ledger');
  });

  // So a link to a missing run file answers 404, not 403, and the Mac can
  // tell "not there" from "refused". Sign-ins are not listed since 2026-10-22
  // (tests/the-signers-key-works-only-inside-a-link-and-any-other-use-raises-an-alarm).
  it('may list only runs', () => {
    const list = signerPolicy(where).Statement.find((s) => [].concat(s.Action).includes('s3:ListBucket'));
    expect(list.Resource).toBe('arn:aws:s3:::agentbox-cloud-x');
    expect(list.Condition.StringLike['s3:prefix']).toEqual(['runs/*']);
  });
});

describe('the signer\'s key', () => {
  const now = 10_000;
  it('the one in use is kept and any other is deleted', () => {
    expect(signerKeyPlan({ inUse: 'K2', keys: [{ id: 'K1', made: 1 }, { id: 'K2', made: 2 }], now })).toEqual({ keep: 'K2', retire: null, remove: ['K1'], make: false });
  });

  it('with none in use, the extras go and a new one is made, so a third run never asks for a third key', () => {
    expect(signerKeyPlan({ inUse: null, keys: [{ id: 'K1', made: 1 }, { id: 'K2', made: 2 }], now })).toEqual({ keep: null, retire: null, remove: ['K1', 'K2'], make: true });
    expect(signerKeyPlan({ inUse: null, keys: [], now })).toEqual({ keep: null, retire: null, remove: [], make: true });
  });

  it('a key named in use that IAM no longer has is replaced', () => {
    expect(signerKeyPlan({ inUse: 'K9', keys: [{ id: 'K1', made: 1 }], now })).toEqual({ keep: null, retire: null, remove: ['K1'], make: true });
  });
});

describe('the function\'s role', () => {
  // Review, 2026-10-20: links are signed by the signer, so the role never
  // needs to read a sign-in or a run's files.
  it('cannot read a sign-in or a run\'s files, only its ledger, the calls it relays and whether a run is done', () => {
    const p = rolePolicy(where);
    const reads = p.Statement.filter((s) => [].concat(s.Action).includes('s3:GetObject')).flatMap((s) => [].concat(s.Resource));
    expect(reads.sort()).toEqual(['arn:aws:s3:::agentbox-cloud-x/ledger/*', 'arn:aws:s3:::agentbox-cloud-x/runs/*/calls/*', 'arn:aws:s3:::agentbox-cloud-x/runs/*/done.json']);
  });

  it('lists only its ledger, and reads only the signer\'s secret', () => {
    const p = rolePolicy({ ...where, signerSecretArn: 'arn:aws:secretsmanager:us-east-1:000000000000:secret:agentbox-gateway-signer-AbCd' });
    const list = p.Statement.find((s) => [].concat(s.Action).includes('s3:ListBucket'));
    // And runs, so a done.json not there yet answers 404, not 403.
    expect(list.Condition.StringLike['s3:prefix']).toEqual(['ledger/*', 'runs/*']);
    const secret = p.Statement.find((s) => [].concat(s.Action).includes('secretsmanager:GetSecretValue'));
    expect(secret.Resource).toBe('arn:aws:secretsmanager:us-east-1:000000000000:secret:agentbox-gateway-signer-AbCd');
  });

  it('starts and stops only our runtime', () => {
    const p = rolePolicy(where);
    const agentcore = p.Statement.find((s) => [].concat(s.Action).some((a) => a.startsWith('bedrock-agentcore:')));
    expect([].concat(agentcore.Resource)).toEqual([where.runtimeArn, `${where.runtimeArn}/runtime-endpoint/*`]);
    expect(actions(p).filter((a) => a.startsWith('bedrock-agentcore:')).sort()).toEqual(['bedrock-agentcore:InvokeAgentRuntime', 'bedrock-agentcore:StopRuntimeSession']);
  });

  it('touches only runs, sign-ins and its ledger in our bucket, and no action or resource is a bare wildcard', () => {
    const p = rolePolicy(where);
    expect([...new Set(resources(p).filter((r) => r.startsWith('arn:aws:s3')))].sort()).toEqual(['', '/ledger/*', '/logins/*', '/runs/*', '/runs/*/calls/*', '/runs/*/done.json'].map((x) => `arn:aws:s3:::agentbox-cloud-x${x}`));
    expect(resources(p)).not.toContain('*');
    expect(actions(p).some((a) => a === '*' || a.endsWith(':*'))).toBe(false);
  });
});

// Review, 2026-10-20: the Mac gave up at 60 s while the function was still
// within its own 60 s wait on AgentCore, so a slow start or collect failed on
// the Mac and succeeded in the cloud.
describe('deadlines', () => {
  it('the Mac waits longer than the function, which waits longer than its call to AgentCore', () => {
    expect(CALL_MS).toBeGreaterThan(FUNCTION_SECONDS * 1000);
    expect(FUNCTION_SECONDS * 1000).toBeGreaterThan(60_000);
  });
});

// Second review: the sandbox's runtime role could write to every AgentCore
// runtime's logs in the account, and customer code runs as root beside it.
describe('the sandbox\'s own role', () => {
  it('writes logs only to our runtime\'s own groups', () => {
    const p = runtimeRolePolicy({ region: 'us-east-1', account: '000000000000', repo: 'agentbox-sandbox', runtime: 'agentbox_sandbox' });
    const writes = p.Statement.find((s) => [].concat(s.Action).includes('logs:PutLogEvents'));
    expect(writes.Resource).toBe('arn:aws:logs:us-east-1:000000000000:log-group:/aws/bedrock-agentcore/runtimes/agentbox_sandbox-*');
  });
});

describe('S3\'s notices', () => {
  it('ours is added once, and every other notice on the bucket is kept', () => {
    const other = { Id: 'someone-else', LambdaFunctionArn: 'arn:other', Events: ['s3:ObjectRemoved:*'] };
    const first = withDoneNotice({ LambdaFunctionConfigurations: [other], QueueConfigurations: [{ Id: 'q' }] }, 'arn:fn');
    const again = withDoneNotice(first, 'arn:fn2');
    expect(again.QueueConfigurations).toEqual([{ Id: 'q' }]);
    expect(again.LambdaFunctionConfigurations.map((c) => c.Id)).toEqual(['someone-else', 'agentbox-gateway-done']);
    expect(again.LambdaFunctionConfigurations[1]).toMatchObject({ LambdaFunctionArn: 'arn:fn2', Filter: { Key: { FilterRules: [{ Name: 'prefix', Value: 'runs/' }, { Name: 'suffix', Value: 'done.json' }] } } });
    expect(withDoneNotice({}, 'arn:fn').LambdaFunctionConfigurations).toHaveLength(1);
  });
});

describe('the bundle', () => {
  it('is one file that loads with nothing installed beside it, and says what settings it is missing', async () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'gateway-bundle-'));
    try {
      const zip = await bundle(out);
      expect(fs.statSync(zip).size).toBeGreaterThan(1000);
      // Loaded from a folder with no node_modules anywhere above it.
      const alone = fs.mkdtempSync(path.join(os.tmpdir(), 'gateway-alone-'));
      fs.copyFileSync(path.join(out, 'index.mjs'), path.join(alone, 'index.mjs'));
      const mod = await import(pathToFileURL(path.join(alone, 'index.mjs')).href);
      await expect(mod.handler({ rawPath: '/v1/me', headers: {}, requestContext: { http: { method: 'GET' } } })).rejects.toThrow(/missing REGION/);
      fs.rmSync(alone, { recursive: true, force: true });
    } finally {
      fs.rmSync(out, { recursive: true, force: true });
    }
  }, 60_000);
});
