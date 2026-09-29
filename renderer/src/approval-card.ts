// WHAT THE APPROVAL CARD SAYS, AND THE ONLY COPY OF THAT RULE.
//
// One card draws two very different questions now. A command approval asks her
// to let something RUN; a Codex file-change approval asks her to let something
// CHANGE, and it carries paths and a diff rather than a line of shell. The card
// used to hardcode "asks to run" above both, so a patch reached her as a
// sentence that was simply false about the thing under it.
//
// It also ended `input.command ?? input.file_path ?? JSON.stringify(input)`,
// which put a blob of JSON in front of the founder for any shape neither key
// covered.
//
// This is out of App.tsx for the reason renderer/src/list-rules.ts is: what a
// card FAILS to say has no symptom. Every card it draws looks plausible, and
// the cost of a wrong one is a yes she did not mean.
//
// THE CLAUDE CARD MUST NOT MOVE. Its two live shapes are a `Bash` card carrying
// `command` and a `Read(**/.env*)` card carrying `file_path`
// (worker-permissions.json is the whole ask-list), and both come out of here
// byte for byte as they came out of App.tsx before this file existed.

/** What is drawn when there is nothing readable to draw. Not JSON, and not a
 *  blank box either: it is a sentence, and the honest answer to it is Deny. */
import { Name } from '../../shared/product-name.mjs';
export const UNREADABLE = `${Name} could not read what this asks for.`;

export type ApprovalReading = {
  /** The half-sentence after the product's name in the card's head. */
  what: string;
  /** The body of the card's `<pre>`. */
  body: string;
};

/**
 * One approval's `input`, as the two lines her eye actually lands on.
 *
 * `changes` is first because it is the only key that says the question is about
 * files rather than a command; main/codex-approvals.mjs is the one place that
 * writes it, already capped and already marked where it was cut.
 *
 * `host` IS BEHIND `command`, AND THE ORDER IS THE POINT. A network approval
 * usually arrives WITH a command, and then the command is the thing she is
 * answering about and the host is the extra line beside it, drawn the way `cwd`
 * is. But `CommandExecutionRequestApprovalParams.command` is nullable, and such
 * a request used to be refused outright even where the host was there to show
 * -- so a card carrying only a host is a real card now, and "asks to run" over
 * one would be the card lying about the question it is asking.
 */
export function approvalReads(input: unknown, tool?: string): ApprovalReading {
  // MCP argument names are arbitrary: "command" or "host" is not native
  // permission metadata. Keep the existing card, name the server/tool, and
  // show each argument separately with lossless JSON escaping for its value.
  const mcp = /^mcp__(.+)__(.+)$/.exec(tool ?? '');
  if (mcp) {
    const identity = `${mcp[1]} / ${mcp[2]}`;
    let argumentsText = UNREADABLE;
    if (input && typeof input === 'object' && !Array.isArray(input)) {
      try {
        const fields = Object.entries(input).map(([key, value]) => {
          const rendered = JSON.stringify(value, null, 2);
          if (rendered === undefined) throw new Error('Unreadable argument');
          return `${key}: ${rendered}`;
        });
        argumentsText = fields.length ? fields.join('\n\n') : 'No arguments.';
      } catch { /* Malformed input stays explicitly unreadable. */ }
    }
    return { what: 'asks to use', body: `${identity}\n\n${argumentsText}` };
  }
  const it = (input ?? {}) as Record<string, unknown>;
  if (typeof it.changes === 'string' && it.changes) return { what: 'asks to change', body: it.changes };
  if (typeof it.command === 'string') return { what: 'asks to run', body: it.command };
  if (typeof it.host === 'string' && it.host) return { what: 'asks to reach', body: it.host };
  if (typeof it.file_path === 'string') return { what: 'asks to run', body: it.file_path };
  return { what: 'asks to run', body: UNREADABLE };
}
