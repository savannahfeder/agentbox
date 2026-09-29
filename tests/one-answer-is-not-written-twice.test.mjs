// THE SAME ANSWER TWICE, WHEN NEITHER COPY IS WORD FOR WORD.
//
// Her row, 2026-09-23: "Sometimes the agent duplicates its response, like here",
// with a photograph of w-b108b1d596. The pane drew the answer to that row twice,
// both at 8:53pm, both under "The agent". `one-thing-said-once` was already
// meant to stop exactly this, and it did not fire, for two reasons that are both
// replayed below off her real ledger and her real trace.
//
//   1. THE RUN WROTE ITS RESULT THREE TIMES IN NINE SECONDS, because the first
//      two writes had tool-call scaffolding leaked into the text. The copy that
//      survived was the LONGEST one, by the rule that the fuller text always
//      wins, so what reached her screen ended "7,369 tests both times.</result>
//      </invoke>" and the clean rewrite underneath it was the copy dropped.
//   2. ITS CLOSING MESSAGE OPENED ON ONE LINE OF HOUSEKEEPING, "The row is clean
//      now. Final message, the same words as the row.", above the very words it
//      had just written to the row. The closing-message rule compares first
//      lines, so that one sentence was enough to make the two look like two
//      different messages, and both were drawn whole.
//
// Both texts here are verbatim: the results off
// work-items.jsonl lines 27806, 27808 and 27809, the typed message off
// sessions/w-b108b1d596/1790135414970.log at 03:53:57.

import { describe, it, expect } from "vitest";
import { itemThread } from "../renderer/src/item-thread.ts";

const T = Date.parse("2026-09-23T03:53:00Z");
const sec = 1000;
const at = (ms) => new Date(T + ms).toISOString().slice(11, 19);
const said = (thread) => thread.events.filter((e) => e.kind !== "work");

// The three results, in the order the ledger has them. The first two carry the
// leaked markup; the third is the rewrite she was meant to read.
const leaked = "**It is on main. Quit and reopen Astral, then right click a link and pick Copy.**\n\nMerged and pushed. I confirmed the commit is genuinely on origin/main rather than trusting the push message, and the fixed file is on disk in the folder your app runs from.\n\nYou do have to restart for it. This menu is built by the part of the app that only loads when it launches, so the Astral you have open right now still has the old one. Yours has been up since 19:28 and this landed at 20:53.\n\nWhat changed: Copy now copies from the window you right-clicked in, by name. Before, it was handed to macOS to pass along, and when nothing answered it wrote nothing at all and left the clipboard holding whatever was already there. Cut, paste and select all in the reply box had the same wiring and got the same fix.\n\nThe full suite ran green twice, once on the merge and again inside the push, 7,369 tests both times.</result>\n<parameter name=\"note\">Merged to main and pushed. She needs to quit and reopen Astral to get it.";
const alsoLeaked = "**It is on main. Quit and reopen Astral, then right click a link and pick Copy.**\n\nMerged and pushed. I confirmed the commit is genuinely on origin/main rather than trusting the push message, and the fixed file is on disk in the folder your app runs from.\n\nYou do have to restart for it. This menu is built by the part of the app that only loads when it launches, so the Astral you have open right now still has the old one. Yours has been up since 19:28 and this landed at 20:53.\n\nWhat changed: Copy now copies from the window you right-clicked in, by name. Before, it was handed to macOS to pass along, and when nothing answered it wrote nothing at all and left the clipboard holding whatever was already there. Cut, paste and select all in the reply box had the same wiring and got the same fix.\n\nThe full suite ran green twice, once on the merge and again inside the push, 7,369 tests both times.</result>\n</invoke>";
const answer = "**It is on main. Quit and reopen Astral, then right click a link and pick Copy.**\n\nMerged and pushed. I confirmed the commit is genuinely on origin/main rather than trusting the push message, and the fixed file is on disk in the folder your app runs from.\n\nYou do have to restart for it. This menu is built by the part of the app that only loads when it launches, so the Astral you have open right now still has the old one. Yours has been up since 19:28 and this landed at 20:53.\n\nWhat changed: Copy now copies from the window you right-clicked in, by name. Before, it was handed to macOS to pass along, and when nothing answered it wrote nothing at all and left the clipboard holding whatever was already there. Cut, paste and select all in the reply box had the same wiring and got the same fix.\n\nThe full suite ran green twice, once on the merge and again inside the push, 7,369 tests both times.";
const closing = "The row is clean now. Final message, the same words as the row.\n\n**It is on main. Quit and reopen Astral, then right click a link and pick Copy.**\n\nMerged and pushed. I confirmed the commit is genuinely on origin/main rather than trusting the push message, and the fixed file is on disk in the folder your app runs from.\n\nYou do have to restart for it. This menu is built by the part of the app that only loads when it launches, so the Astral you have open right now still has the old one. Yours has been up since 19:28 and this landed at 20:53.\n\nWhat changed: Copy now copies from the window you right-clicked in, by name. Before, it was handed to macOS to pass along, and when nothing answered it wrote nothing at all and left the clipboard holding whatever was already there. Cut, paste and select all in the reply box had the same wiring and got the same fix.\n\nThe full suite ran green twice, once on the merge and again inside the push, 7,369 tests both times.";

const ledger = [
  { id: "w-b1", ts: T, source: "system", patch: { title: "Clicking copy doesnt seem to actually copy it (links)", status: "open" } },
  { id: "w-b1", ts: T + 14 * sec, source: "agent", claim: { holder: "mcp-59250", leaseUntil: T + 314 * sec }, patch: { status: "claimed" } },
  { id: "w-b1", ts: T + 45 * sec, source: "agent", patch: { status: "done", result: leaked } },
  { id: "w-b1", ts: T + 50 * sec, source: "agent", patch: { status: "done", result: alsoLeaked, note: "Merged to main and pushed. She needs to quit and reopen Astral to get it." } },
  { id: "w-b1", ts: T + 54 * sec, source: "agent", patch: { result: answer } },
];

const trace = {
  startedAt: T + 14 * sec,
  text: [
    "# Clicking copy doesnt seem to actually copy it (links)",
    `${at(38 * sec)}  Merged and on main. Let me clean up the scratch worktree and write the row.`,
    `${at(45 * sec)}  [mcp__agentbox__update_work_item] w-b108b1d596`,
    `${at(47 * sec)}  The note parameter leaked into the result text. Let me rewrite it cleanly.`,
    `${at(50 * sec)}  [mcp__agentbox__update_work_item] w-b108b1d596`,
    `${at(54 * sec)}  [mcp__agentbox__update_work_item] w-b108b1d596`,
    `${at(57 * sec)}  ${closing}`,
    `${at(58 * sec)}  == RESULT (success · 17 turns) ==`,
    closing,
    `# exited (0) ${new Date(T + 59 * sec).toISOString()}`,
  ].join("\n"),
};

describe("the copy-links row in her screenshot", () => {
  const thread = itemThread(ledger, [trace]);
  const everything = [...said(thread), ...(thread.outcome ? [{ text: thread.outcome.text }] : [])];

  it("says the answer once, not twice", () => {
    const bold = everything.filter((e) => /It is on main\. Quit and reopen Astral/.test(e.text ?? ""));
    expect(bold).toHaveLength(1);
  });

  it("never shows her the leaked tool markup", () => {
    for (const e of everything) {
      expect(e.text ?? "").not.toMatch(/<\/result>|<\/invoke>|<parameter name=/);
    }
  });

  it("keeps the clean rewrite, not the superseded copy", () => {
    expect(thread.outcome).not.toBeNull();
    expect(thread.outcome.field).toBe("result");
    expect(thread.outcome.text).toBe(answer);
  });

  it("still draws the run: its work and its other sentences are on the row", () => {
    expect(thread.events.some((e) => e.kind === "work")).toBe(true);
    expect(said(thread).some((e) => /note parameter leaked/.test(e.text ?? ""))).toBe(true);
  });
});

// The guard on the fold above: a closing message that goes on to say something
// of its own is NOT the answer twice, and folding it away would eat that
// paragraph. Same shape as her row, one real sentence added.
describe("a closing message that adds a paragraph of its own", () => {
  const extra = `Worth knowing for next time.\n\n${answer}\n\nOne thing I could not check: whether the same menu in the second window is wired the same way. Say the word and I will look.`;
  const rows = [
    { id: "w-b2", ts: T, source: "system", patch: { title: "Clicking copy doesnt seem to actually copy it (links)", status: "open" } },
    { id: "w-b2", ts: T + 14 * sec, source: "agent", claim: { holder: "mcp-59250", leaseUntil: T + 314 * sec }, patch: { status: "claimed" } },
    { id: "w-b2", ts: T + 54 * sec, source: "agent", patch: { status: "done", result: answer } },
  ];
  const run = {
    startedAt: T + 14 * sec,
    text: [
      "# Clicking copy doesnt seem to actually copy it (links)",
      `${at(54 * sec)}  [mcp__agentbox__update_work_item] w-b108b1d596`,
      `${at(57 * sec)}  ${extra}`,
      `${at(58 * sec)}  == RESULT (success · 17 turns) ==`,
      extra,
      `# exited (0) ${new Date(T + 59 * sec).toISOString()}`,
    ].join("\n"),
  };
  const thread = itemThread(rows, [run]);

  it("keeps the sentence only that message said", () => {
    const all = [...said(thread), ...(thread.outcome ? [{ text: thread.outcome.text }] : [])];
    expect(all.some((e) => /whether the same menu in the second window/.test(e.text ?? ""))).toBe(true);
  });
});
