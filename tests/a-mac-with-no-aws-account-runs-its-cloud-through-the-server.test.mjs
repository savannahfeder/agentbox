// A MAC WITH NO AWS ACCOUNT RUNS ITS CLOUD THROUGH THE SERVER.
//
// Until 2026-10-19 a Mac counted as set up for the cloud only when
// ~/.agentbox/cloud.json named a bucket, a runtime and a region from the
// owner's own AWS account (scripts/cloud-setup.mjs). Nobody else has one
// (w-6633e825a7). A Mac on the managed cloud has a cloud.json that names the
// cloud server instead, and a cloud key beside it. Both kinds must keep
// working: the owner's own account must never be routed through the server,
// and a managed Mac must never try AWS with keys it does not have.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { readCloudConfig, cloudConfigPath, readCloudKey, writeCloudKey, cloudKeyPath } from '../main/cloud/config.mjs';
import { cloudClients } from '../main/cloud/clients.mjs';

let home; let server; let url; let asked;
const env = {};

beforeEach(async () => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'managedmac-'));
  fs.mkdirSync(path.join(home, '.agentbox'), { recursive: true });
  asked = [];
  server = http.createServer((req, res) => {
    let body = ''; req.on('data', (c) => { body += c; });
    req.on('end', () => { asked.push({ path: req.url, auth: req.headers.authorization, body }); res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true}'); });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${server.address().port}`;
});

afterEach(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  fs.rmSync(home, { recursive: true, force: true });
});

const setUp = (c) => fs.writeFileSync(cloudConfigPath(env, home), JSON.stringify(c));

describe('whether this Mac is set up for the cloud', () => {
  it('a cloud.json naming the cloud server counts', () => {
    setUp({ gateway: url });
    expect(readCloudConfig(env, home)).toEqual({ gateway: url });
  });

  it('the owner\'s own account still counts, and half of one does not', () => {
    setUp({ region: 'us-east-1', bucket: 'b', runtimeArn: 'arn:x' });
    expect(readCloudConfig(env, home)).toMatchObject({ bucket: 'b' });
    setUp({ bucket: 'b' });
    expect(readCloudConfig(env, home)).toBe(null);
    setUp({ gateway: 42 });
    expect(readCloudConfig(env, home)).toBe(null);
  });
});

describe('the cloud key', () => {
  it('is kept beside cloud.json, readable by this user only, and read back as written', () => {
    writeCloudKey('abk_secret', env, home);
    expect(cloudKeyPath(env, home)).toBe(path.join(home, '.agentbox', 'cloud-key'));
    expect(fs.statSync(cloudKeyPath(env, home)).mode & 0o777).toBe(0o600);
    expect(readCloudKey(env, home)).toBe('abk_secret');
  });

  it('a missing key reads as none', () => {
    expect(readCloudKey(env, home)).toBe(null);
  });
});

describe('which clients a cloud run uses', () => {
  it('a managed Mac talks to the server, with its key', async () => {
    setUp({ gateway: url });
    writeCloudKey('abk_mine', env, home);
    const { transport } = await cloudClients(readCloudConfig(env, home), { env, home });
    await transport.invoke('s1', { action: 'status' });
    expect(asked).toEqual([{ path: '/v1/invoke', auth: 'Bearer abk_mine', body: JSON.stringify({ sessionId: 's1', payload: { action: 'status' } }) }]);
  });

  it('a managed Mac with no key says to sign in, and reaches nothing', async () => {
    setUp({ gateway: url });
    await expect(cloudClients(readCloudConfig(env, home), { env, home })).rejects.toThrow(/sign in/);
    expect(asked).toEqual([]);
  });

  it('the owner\'s own account goes straight to AWS, never through the server', async () => {
    setUp({ region: 'us-east-1', bucket: 'b', runtimeArn: 'arn:aws:bedrock-agentcore:us-east-1:000000000000:runtime/x', profile: 'none' });
    writeCloudKey('abk_mine', env, home);
    const clients = await cloudClients(readCloudConfig(env, home), { env, home });
    expect(clients.me).toBeUndefined();
    expect(typeof clients.storage.headUrl).toBe('function');
    expect(asked).toEqual([]);
  });
});
