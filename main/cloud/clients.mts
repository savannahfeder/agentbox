// The session and bucket clients a cloud run uses: the owner's own AWS
// account, or the managed cloud's server. Loaded only when a run needs them,
// so a Mac that never uses the cloud never loads AWS.
import { readCloudKey, forgetCloudKey } from './config.mts';

export interface CloudConfig {
  gateway?: string;
  region?: string;
  runtimeArn?: string;
  bucket?: string;
  profile?: string;
  endpoint?: string;
  credentials?: unknown;
  timeoutMs?: number;
  claudeCodeVersion?: string;
  codexVersion?: string;
}

export async function cloudClients(config: CloudConfig | null | undefined, { env = process.env, home }: { env?: NodeJS.ProcessEnv; home?: string } = {}) {
  if (typeof config?.gateway === 'string') {
    const key = readCloudKey(env, home);
    if (!key) throw new Error('this Mac has no cloud key yet; sign in for the cloud');
    const { managedClients } = await import('./managed.mts');
    return managedClients({ url: config.gateway, key, onSignedOut: () => forgetCloudKey(key, env, home) });
  }
  const { awsTransport, awsStorage } = await import('./aws.mts');
  return { transport: awsTransport(config as Parameters<typeof awsTransport>[0]), storage: awsStorage(config as Parameters<typeof awsStorage>[0]) };
}
