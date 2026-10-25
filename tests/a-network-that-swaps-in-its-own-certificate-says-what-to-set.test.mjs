// A NETWORK THAT SWAPS IN ITS OWN CERTIFICATE SAYS WHAT TO SET.
//
// WHAT BROKE. A company network that inspects TLS hands every connection its
// own certificate, and Claude Code refuses it. Measured 2026-10-15 with the
// real Claude Code 2.1.301 behind a local CONNECT proxy with a self-signed
// certificate (scripts/scratch/proxy-probe.mjs, nothing reached Anthropic): the
// run died in 371 ms with
//
//   API Error: Unable to connect to API: Self-signed certificate detected
//   (DEPTH_ZERO_SELF_SIGNED_CERT). The certificate comes from an authority
//   Claude Code doesn't trust, ...
//
// "Unable to connect" is in the list of connections that dropped, so this was
// filed 'interrupted' and the screen said "Nothing to do. Agentbox tries them
// again on its own." It fails the same way every time until somebody sets the
// certificate, and the supervisor never charged those runs an attempt.
//
// It is now its own cause, 'network', which says what to set and where. A
// refused connection stays 'interrupted': the same words come from a laptop
// that is simply offline (measured: "Connection refused — a firewall or proxy
// may be blocking it (ECONNREFUSED)" after ten retries).

import { describe, it, expect } from 'vitest';
import {
  troubleCause, troubleSentence, troubleRemedy, accountSentence, engineTroubleNote,
  deadRunSentence, deadRunCause, runStoppedLine, causeWord, causeWhat, causeNext,
  causeBreakdown, needsHerHands,
} from '../shared/spawn-trouble.mjs';

const MEASURED = "API Error: Unable to connect to API: Self-signed certificate detected (DEPTH_ZERO_SELF_SIGNED_CERT). The certificate comes from an authority Claude Code doesn't trust, usually a TLS-inspecting corporate proxy or a gateway signed by a private CA: set NODE_EXTRA_CA_CERTS to that CA bundle, or add it to the system certificate store · see https://code.claude.com/docs/en/network-config";

describe('which failures are the network', () => {
  it.each([
    ['the measured Claude Code line', MEASURED],
    ['Node, a company root in the chain', 'Error: self signed certificate in certificate chain'],
    ['Node, a root the machine lacks', 'request to https://api.anthropic.com failed, reason: unable to get local issuer certificate'],
    ['Node, an intermediate missing', 'unable to verify the first certificate'],
    ['Node, by code', 'code: SELF_SIGNED_CERT_IN_CHAIN'],
    ['Codex over rustls', 'error sending request for url (https://chatgpt.com/backend-api/codex/responses): invalid peer certificate: UnknownIssuer'],
    ['Codex over OpenSSL', 'error:0A000086:SSL routines:tls_post_process_server_certificate:certificate verify failed'],
    ['a proxy that wants a login', 'HTTP/1.1 407 Proxy Authentication Required'],
  ])('%s', (_name, text) => {
    expect(troubleCause(text)).toBe('network');
  });

  it.each([
    ['a refused connection, which offline says too', 'API Error: Connection refused — a firewall or proxy may be blocking it (ECONNREFUSED)', 'interrupted'],
    ['a dropped connection', 'API Error: read ECONNRESET', 'interrupted'],
    ['a folder nobody trusted', 'This folder is untrusted', 'workspace'],
    ['a signed-out login', 'Not logged in · Please run /login', 'signed-out'],
    ['a limit', "You've hit your session limit · resets 6pm", 'at-limit'],
    ['a run that merely talks about certificates', 'Updated the certificate section of the README', 'unknown'],
  ])('and not %s', (_name, text, cause) => {
    expect(troubleCause(text)).toBe(cause);
  });
});

describe('what the screen says for it', () => {
  it('never says there is nothing to do, and names what to set and where', () => {
    for (const line of [troubleRemedy('network'), causeNext('network'), deadRunSentence({ cause: 'network' }), accountSentence('network'), engineTroubleNote('network', 'Codex')]) {
      expect(line).not.toMatch(/nothing to do/i);
      expect(line).toMatch(/shell profile/);
      expect(line).toMatch(/reopen/i);
    }
    expect(troubleRemedy('network')).toMatch(/HTTPS_PROXY/);
    expect(troubleRemedy('network')).toMatch(/NODE_EXTRA_CA_CERTS/);
  });

  it('has a sentence of its own in every place a cause is drawn', () => {
    expect(troubleSentence('network')).not.toBe(troubleSentence('unknown'));
    expect(runStoppedLine(MEASURED)).not.toBe(runStoppedLine(''));
    expect(causeWord('network')).not.toBe(causeWord('unknown'));
    expect(causeWhat('network', 2)).toMatch(/^2 /);
    expect(deadRunCause(deadRunSentence({ engineWord: 'Codex', cause: 'network' }))).toBe('network');
  });

  it('is hers to fix, but is not the account\'s fault (the account stays in the rotation)', () => {
    expect(needsHerHands('network')).toBe(false);
    const [row] = causeBreakdown([{ cause: 'network' }]);
    expect(row).toMatchObject({ cause: 'network', count: 1, hers: true });
  });
});
