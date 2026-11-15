// THE CLOUD SERVER GIVES UP ON AWS BEFORE LAMBDA CUTS IT OFF.
//
// The cloud server runs in Lambda with a 90 s limit (FUNCTION_SECONDS), but it
// built its AgentCore client with aws.mts's default wait of 5 minutes. A start
// that hung past 90 s was killed mid-call: no 502 with a reason, no "not-started"
// in the ledger, and a Lambda error that trips the agentbox-gateway-failing and
// -answering-5xx alarms. The deadlines test in
// the-cloud-servers-aws-rights-reach-only-what-it-needs said the function
// waits longer than its call to AgentCore, but nothing checked the call.
import { describe, it, expect, vi } from 'vitest';

const made = vi.hoisted(() => ({ transport: null as { timeoutMs?: number } | null }));
vi.mock('../main/cloud/aws.mts', async (real) => {
  const mod = await real<Record<string, unknown>>();
  return {
    ...mod,
    awsTransport: (opts: { timeoutMs?: number }) => { made.transport = opts; return { invoke: async () => ({}), stop: async () => {} }; },
    awsStorage: () => ({ getUrl: async () => '', putUrl: async () => '', headUrl: async () => '' }),
  };
});

const { gatewayFromEnv } = await import('../cloud/gateway/lambda.mjs');
const { FUNCTION_SECONDS } = await import('../scripts/cloud-gateway-setup.mjs');

const env = { REGION: 'us-east-1', BUCKET: 'b', RUNTIME_ARN: 'arn:r', SUPABASE_URL: 'https://db', SUPABASE_ANON_KEY: 'pub', SIGNER_SECRET_ARN: 'arn:secret' };
const readSecret = async () => JSON.stringify({ id: 'AKIA', secret: 's' });

describe('the cloud server\'s wait on AgentCore', () => {
  it('ends with time left to answer and record it before the function limit', async () => {
    await gatewayFromEnv(env, { readSecret });
    expect(made.transport.timeoutMs).toBeLessThanOrEqual(FUNCTION_SECONDS * 1000 - 10_000);
  });

  // aws.mts: a minute's limit killed every cold start, so the cap must not go back to that.
  it('still gives a cold start more than a minute', async () => {
    await gatewayFromEnv(env, { readSecret });
    expect(made.transport.timeoutMs).toBeGreaterThan(60_000);
  });
});
