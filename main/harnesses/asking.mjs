// WHAT A GROK BUILD OR PI RUN NEEDS TO RAISE AN APPROVAL CARD.
//
// Neither has Claude Code's `--permission-prompt-tool`. Grok asks through a
// PreToolUse hook (main/grok-approvals.mjs) and pi through an extension loaded
// for the run (main/pi.mjs); both call one helper, main/agent-approval-cli.mjs,
// run by this app's own binary as Node, which writes the card into the same
// spool and waits for the same signed answer Claude Code's approval server does
// (main/approval-ask.mjs). This is the environment that helper reads.
//
// `<engine>Ask` in the config says when it asks: before risky actions (the
// default), before every action, or never (main/agent-approval-policy.mjs).
import path from 'node:path';
import { askMode } from '../agent-approval-policy.mjs';
import { approvalPublicKey } from '../approvals.mjs';
import { nameSlug } from '../../shared/product-name.mjs';

export function approvalEnv(sup, engine, { ready = () => true } = {}) {
  const mode = askMode(sup.config?.[`${engine}Ask`]);
  if (mode === 'never' || !ready()) return {};
  return {
    AGENTBOX_ASK: mode,
    // The app's own store tool never asks, for the same reason Claude Code's
    // worker is granted it outright.
    AGENTBOX_OWN_SERVER: nameSlug,
    AGENTBOX_NODE: process.execPath,
    AGENTBOX_APPROVAL_CLI: path.join(sup.appDir, 'main', 'agent-approval-cli.mjs'),
    ZERO_APPROVALS_DIR: path.join(sup.config.storeRoot, '.approvals'),
    ZERO_APPROVALS_PUBKEY: approvalPublicKey(),
  };
}

/** The store and row a worker reports against, as the Claude adapter sets them. */
export function rowEnv(sup, item, storeRootEnv) {
  return { STORE_ACCOUNT_ID: sup.config.accountId, ...storeRootEnv(sup.config.storeRoot), ZERO_PRODUCT: item.product, ZERO_ITEM: item.id };
}

/** Claude Code-shaped lines off a child's stdout, one per call, as claude.mjs reads them. */
export function readLines(child, each) {
  let buffer = '';
  child.stdout.on('data', data => {
    buffer += data.toString();
    let index;
    while ((index = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, index); buffer = buffer.slice(index + 1);
      if (line.trim()) each(line);
    }
  });
}
