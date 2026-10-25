// The session and bucket clients a cloud run uses: the owner's own AWS
// account, or the managed cloud's server. Loaded only when a run needs them,
// so a Mac that never uses the cloud never loads AWS.
import { readCloudKey, forgetCloudKey } from './config.mjs';

export async function cloudClients(config, { env = process.env, home } = {}) {
  if (typeof config?.gateway === 'string') {
    const key = readCloudKey(env, home);
    if (!key) throw new Error('this Mac has no cloud key yet; sign in for the cloud');
    const { managedClients } = await import('./managed.mjs');
    return managedClients({ url: config.gateway, key, onSignedOut: () => forgetCloudKey(key, env, home) });
  }
  const { awsTransport, awsStorage } = await import('./aws.mjs');
  return { transport: awsTransport(config), storage: awsStorage(config) };
}
