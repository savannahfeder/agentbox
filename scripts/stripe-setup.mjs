#!/usr/bin/env node
// SETS UP STRIPE FOR AGENTBOX CLOUD: what is sold, the billing page, and the
// webhook that tells the cloud server who paid.
//
//   node scripts/stripe-setup.mjs          # the sandbox (Keychain: agentbox-stripe-test)
//   node scripts/stripe-setup.mjs --live   # real money (Keychain: agentbox-stripe-live)
//   add --managed once Managed Payments is on in the Dashboard: Stripe is
//   then the seller of record and handles sales tax
//   then: node scripts/cloud-gateway-setup.mjs
//
// Safe to run again. The key is read from the Keychain and never printed.
// It makes:
//   - a product and a monthly price for each paid plan in
//     cloud/gateway/plans.mjs, found again by the price's lookup key
//   - the billing page's settings: change plan, cancel at the period's end,
//     update the card, see invoices
//   - a webhook to the cloud server's /v1/stripe, whose signing secret Stripe
//     shows once; it goes, with the key, into AWS Secrets Manager
//     (agentbox-gateway-stripe), which the server reads. An AWS sign-in is
//     needed for that step only.
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PLANS } from '../cloud/gateway/plans.mjs';
import { formOf, lookupKeyOf } from '../cloud/gateway/stripe.mjs';
import { readCloudConfig } from '../main/cloud/config.mjs';
import { STRIPE_SECRET_NAME, GATEWAY_FUNCTION } from './cloud-gateway-setup.mjs';

// SaaS sold to businesses (Stripe's tax codes).
const TAX_CODE = 'txcd_10103001';
export const WEBHOOK_EVENTS = ['checkout.session.completed', 'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted'];

export const paidPlans = (plans = PLANS) => Object.entries(plans).filter(([, p]) => p.agents > 0 && p.dollarsPerMonth > 0);
const title = (plan) => plan[0].toUpperCase() + plan.slice(1);
export const productOf = (plan, p) => ({
  name: `Agentbox Cloud ${title(plan)}`,
  description: `${p.unlimited ? 'Unlimited' : p.agents} agents at once in the cloud, ${p.hoursPerMonth.toLocaleString('en-US')} hours a month`,
  tax_code: TAX_CODE,
  metadata: { agentbox_plan: plan },
});
/** Whether an existing price still sells the plan as plans.mjs has it. */
export const priceIsCurrent = (price, p) => !!price && price.active && price.currency === 'usd' && price.unit_amount === p.dollarsPerMonth * 100 && price.recurring?.interval === 'month';

/** The billing page: switch between the plans, cancel at the period's end. */
export const portalSettings = (sold) => ({
  business_profile: { headline: 'Agentbox Cloud' },
  features: {
    customer_update: { enabled: true, allowed_updates: ['email', 'address', 'tax_id'] },
    invoice_history: { enabled: true },
    payment_method_update: { enabled: true },
    subscription_cancel: { enabled: true, mode: 'at_period_end' },
    subscription_update: { enabled: true, default_allowed_updates: ['price'], proration_behavior: 'create_prorations', products: sold.map((s) => ({ product: s.product, prices: [s.price], adjustable_quantity: { enabled: false } })) },
  },
});

const say = (...a) => console.log('stripe-setup:', ...a);

async function main() {
  const live = process.argv.includes('--live');
  const service = live ? 'agentbox-stripe-live' : 'agentbox-stripe-test';
  let key;
  try { key = execFileSync('security', ['find-generic-password', '-a', os.userInfo().username, '-s', service, '-w'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { key = ''; }
  if (!key) throw new Error(`no Stripe key in the Keychain under ${service}`);
  if (!key.startsWith(live ? 'sk_live_' : 'sk_test_') && !key.startsWith(live ? 'rk_live_' : 'rk_test_')) throw new Error(`the key under ${service} is not a ${live ? 'live' : 'sandbox'} key`);

  const stripe = async (method, p, params) => {
    const form = params ? formOf(params).toString() : '';
    const res = await fetch(method === 'GET' && form ? `https://api.stripe.com${p}?${form}` : `https://api.stripe.com${p}`, {
      method, headers: { authorization: `Bearer ${key}`, ...(method === 'POST' ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) },
      ...(method === 'POST' ? { body: form } : {}), signal: AbortSignal.timeout(20_000),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Stripe ${method} ${p}: ${out?.error?.message || res.status}`);
    return out;
  };

  const account = await stripe('GET', '/v1/account');
  say(`account ${account.settings?.dashboard?.display_name || account.business_profile?.name || account.id} (${live ? 'live' : 'sandbox'})`);

  // What is sold.
  const products = (await stripe('GET', '/v1/products', { limit: 100, active: true })).data;
  const sold = [];
  for (const [plan, p] of paidPlans()) {
    const want = productOf(plan, p);
    let product = products.find((x) => x.metadata?.agentbox_plan === plan);
    if (!product) { product = await stripe('POST', '/v1/products', want); say(`made ${want.name}`); } else await stripe('POST', `/v1/products/${product.id}`, want);
    let price = (await stripe('GET', '/v1/prices', { lookup_keys: [lookupKeyOf(plan)] })).data[0];
    if (!priceIsCurrent(price, p) || price.product !== product.id) {
      price = await stripe('POST', '/v1/prices', {
        product: product.id, currency: 'usd', unit_amount: p.dollarsPerMonth * 100, recurring: { interval: 'month' },
        lookup_key: lookupKeyOf(plan), transfer_lookup_key: true, tax_behavior: 'exclusive',
      });
      say(`${want.name}: $${p.dollarsPerMonth} a month`);
    }
    sold.push({ plan, product: product.id, price: price.id });
  }

  // The billing page.
  const portals = (await stripe('GET', '/v1/billing_portal/configurations', { is_default: true, limit: 1 })).data;
  if (portals[0]) await stripe('POST', `/v1/billing_portal/configurations/${portals[0].id}`, portalSettings(sold));
  else await stripe('POST', '/v1/billing_portal/configurations', portalSettings(sold));
  say('billing page set');

  // The webhook, and the secret the server checks it with.
  const region = readCloudConfig()?.region || 'us-east-1';
  const aws = (args, input) => execFileSync('aws', [...args, '--region', region, '--output', 'json'], { encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, AWS_PAGER: '' } });
  try { aws(['sts', 'get-caller-identity']); } catch { throw new Error('products and the billing page are set; sign in to AWS (aws login --region us-east-1) and run this again for the webhook'); }
  let gateway;
  try { gateway = JSON.parse(aws(['lambda', 'get-function-url-config', '--function-name', GATEWAY_FUNCTION])).FunctionUrl; } catch { throw new Error('no cloud server yet: run scripts/cloud-gateway-setup.mjs first'); }
  const url = `${gateway.replace(/\/+$/, '')}/v1/stripe`;
  let stored = null;
  try { stored = JSON.parse(JSON.parse(aws(['secretsmanager', 'get-secret-value', '--secret-id', STRIPE_SECRET_NAME])).SecretString); } catch { /* none yet */ }
  const hooks = (await stripe('GET', '/v1/webhook_endpoints', { limit: 100 })).data.filter((h) => h.url === url);
  let webhookSecret = stored?.webhookSecret && stored.endpoint && hooks.some((h) => h.id === stored.endpoint) ? stored.webhookSecret : null;
  let endpoint = stored?.endpoint;
  if (webhookSecret) {
    await stripe('POST', `/v1/webhook_endpoints/${endpoint}`, { enabled_events: WEBHOOK_EVENTS, disabled: false });
  } else {
    // Stripe shows a signing secret only when it makes the webhook.
    for (const h of hooks) await stripe('DELETE', `/v1/webhook_endpoints/${h.id}`);
    const made = await stripe('POST', '/v1/webhook_endpoints', { url, enabled_events: WEBHOOK_EVENTS, description: 'Agentbox Cloud server' });
    ({ secret: webhookSecret, id: endpoint } = made);
    say(`webhook made for ${url}`);
  }
  const value = JSON.stringify({ key, webhookSecret, endpoint, live, managedPayments: process.argv.includes('--managed') });
  if (stored) aws(['secretsmanager', 'put-secret-value', '--secret-id', STRIPE_SECRET_NAME, '--secret-string', 'file:///dev/stdin'], value);
  else aws(['secretsmanager', 'create-secret', '--name', STRIPE_SECRET_NAME, '--secret-string', 'file:///dev/stdin'], value);
  say(`key and webhook secret stored in ${STRIPE_SECRET_NAME}; now run scripts/cloud-gateway-setup.mjs`);
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  main().catch((err) => { console.error(`stripe-setup: ${err.message}`); process.exit(1); });
}
