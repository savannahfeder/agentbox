// WHERE A MAC'S CLOUD RUNS ARE SET UP, AND WHETHER THEY CAN RUN AT ALL.
//
// scripts/cloud-setup.mjs writes ~/.agentbox/cloud.json (the bucket, the
// runtime, the profile it signs as); it is never in git, because it names an
// AWS account. Each account's sign-in for the cloud is made and kept in the
// cloud, never on this Mac (main/cloud/logins.mjs).
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { Name } from '../../shared/product-name.mjs';
import { CLOUD_ADDRESS } from '../../shared/cloud-address.mjs';

// `home` is the supervisor's own idea of the home folder (config.home), so a
// supervisor built for a test, with a home that is not the developer's, never
// reads the developer's real setup.
export function cloudConfigPath(env = process.env, home = os.homedir()) {
  return env.AGENTBOX_CLOUD_CONFIG || path.join(home || os.homedir(), '.agentbox', 'cloud.json');
}

// Either the owner's own AWS account (bucket, runtime, region), or the
// managed cloud's server (`gateway`, its address), whose key sits beside it.
export function readCloudConfig(env = process.env, home = os.homedir()) {
  try {
    const c = JSON.parse(fs.readFileSync(cloudConfigPath(env, home), 'utf8'));
    return (c?.bucket && c?.runtimeArn && c?.region) || typeof c?.gateway === 'string' ? c : null;
  } catch {
    return null;
  }
}

/**
 * Where Agentbox Cloud is: the server's address and the database's public
 * address and key. A checkout's cloud/, this Mac's own copy, or a release's
 * baked package.json (scripts/release.mjs) can name another cloud; without
 * one it is the cloud every copy ships with (shared/cloud-address.mjs).
 */
export function cloudAccountConfig(appDir, { home = os.homedir() } = {}) {
  const whole = (c) => typeof c?.gateway === 'string' && typeof c.supabaseUrl === 'string' && typeof c.anonKey === 'string';
  for (const file of [path.join(appDir, 'cloud', 'cloud.public.json'), path.join(home, '.agentbox', 'cloud.public.json')]) {
    try {
      const c = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (whole(c)) return c;
    } catch { /* try the next */ }
  }
  try {
    const baked = JSON.parse(fs.readFileSync(path.join(appDir, 'package.json'), 'utf8')).bakedCloud;
    if (whole(baked)) return baked;
  } catch { /* none */ }
  return { ...CLOUD_ADDRESS };
}

export const cloudKeyPath =(env = process.env, home = os.homedir()) => path.join(path.dirname(cloudConfigPath(env, home)), 'cloud-key');

// WHAT THE CLOUD IMAGE SAID IT CAN DO at its last start, per cloud. A run can
// only learn it from a start, so the next run reads what the last one heard;
// an image rebuilt without something says so at its first start.
const capsPath = (env, home) => path.join(path.dirname(cloudConfigPath(env, home)), 'cloud-image.json');
const cloudId = (config) => String(config?.runtimeArn || config?.gateway || '');

export function imageCaps(config, env = process.env, home = os.homedir()) {
  try {
    const caps = JSON.parse(fs.readFileSync(capsPath(env, home), 'utf8'))[cloudId(config)]?.caps;
    return Array.isArray(caps) ? caps.filter((c) => typeof c === 'string') : [];
  } catch { return []; }
}

export function noteImageCaps(config, caps, env = process.env, home = os.homedir()) {
  const file = capsPath(env, home);
  let all = {};
  try { all = JSON.parse(fs.readFileSync(file, 'utf8')) || {}; } catch { /* first */ }
  const id = cloudId(config);
  const now = [...new Set(caps)].sort();
  if (JSON.stringify(all[id]?.caps) === JSON.stringify(now)) return;
  all[id] = { caps: now, at: Date.now() };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(all, null, 2));
  fs.renameSync(tmp, file);
}

export function readCloudKey(env = process.env, home = os.homedir()) {
  try { return fs.readFileSync(cloudKeyPath(env, home), 'utf8').trim() || null; } catch { return null; }
}

/**
 * The server said this key is not known (it went unused, or another Mac
 * signed this one out): this Mac is signed out of the cloud, as if by its own
 * hand, so nothing keeps sending threads there with it. A key a newer sign-in
 * put in its place is left alone.
 */
export function forgetCloudKey(key, env = process.env, home = os.homedir()) {
  if (!key || readCloudKey(env, home) !== key) return false;
  fs.rmSync(cloudKeyPath(env, home), { force: true });
  if (typeof readCloudConfig(env, home)?.gateway === 'string') fs.rmSync(cloudConfigPath(env, home), { force: true });
  return true;
}

export function writeCloudKey(key, env = process.env, home = os.homedir()) {
  const file = cloudKeyPath(env, home);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, key, { mode: 0o600 });
  fs.renameSync(tmp, file);
}

// The keychain service the first cloud build kept its own Claude tokens
// under. Nothing writes it now; main/cloud/logins.mjs deletes what is left.
export const OLD_TOKEN_SERVICE = `${Name} cloud: Claude sign-in`;
