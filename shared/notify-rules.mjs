// WHEN AGENTBOX IS ALLOWED TO INTERRUPT HER, and what the banner says when it is.
//
// Both halves of that sentence are rules, and the second one is the harder one:
// a notification that fires while she is looking at the row it is about is
// worse than no notification at all, because it costs her the flow the whole
// product is built to protect. So the gate is closed by default and opens only
// when she is provably somewhere else.
//
// This is the only copy of the rule. main/notify.mjs is the live wiring around
// it (the window's focus, the banner's lifetime); everything decidable is here,
// as plain functions over plain values, because that is the half worth pinning
// with tests.

// HOW LONG A STILL KEYBOARD MEANS SHE HAS GONE, and it is deliberately long.
// The window can hold focus while she is not at the machine at all: the lid is
// open, Agentbox is the front app, and she is in another room. That is squarely
// "in a diff app" as she meant it, so the banner should fire.
//
// Five minutes rather than one, because the failure modes are not symmetric.
// Firing late costs her a few minutes of not knowing. Firing while she is
// reading a long message with her hands off the keyboard is exactly the
// interruption she asked us to stop, and she would be right to read it as the
// feature not working. Reading one card for five unbroken minutes is rare;
// walking away for five minutes is not.
export const AWAY_AFTER_MS = 5 * 60 * 1000;

// She is at the app, so say nothing. Focus alone is not enough (see above) and
// idleness alone is not either: a still keyboard while she is reading Slack is
// not a reason to stay quiet.
export function atTheApp({ focused = false, idleMs = 0 } = {}) {
  return !!focused && idleMs < AWAY_AFTER_MS;
}

// A title long enough to be a paragraph is normal here; hers run past a
// hundred characters. macOS will hard-truncate mid-word, so cut on a space and
// say that it was cut.
export function clip(text, max = 120) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[.,;:]$/, '')}…`;
}

// ONE BANNER FOR THE WHOLE TIME SHE IS AWAY. Not one per arrival, and not one
// per rewrite either, which is what this file used to do.
//
// The version before this one already refused to STACK banners: it took the old
// one down and put a fresh one up. That is one banner on screen, and it is
// still twenty interruptions, because on macOS there is no way to edit a
// notification that is already up. Rewriting it means showing another one, with
// another sound. A forty minute meeting with an agent finishing every two
// minutes was twenty chimes. That is the thing she is naming, and the count in
// the old wording is what made it feel necessary to keep re-firing: a number
// goes stale the second the next agent lands.
//
// So: she is told once, in words that stay true however many arrive after, and
// the rest is waiting on the rows when she comes back. `seen` in
// main/notify.mjs resets this the moment she has the window, so the next time
// she walks away she can be told again.
//
// THE ONE EXCEPTION, and it is here because an approval card has a clock on it.
// A finished agent waits as long as it takes. An approval is a worker frozen
// mid-run with her as the only way through, and it is DENIED AUTOMATICALLY
// after fifteen minutes (TIMEOUT_MS, main/approval-prompt-server.mjs). If the
// first banner of the stretch was a finished agent, an approval landing twenty
// minutes later would die unheard under a strict one-and-done rule. So an
// approval gets to speak once more, and that is the cap: at most two in one
// stretch away, never more.
export function shouldSpeak({ spoke = false, spokeAsk = false, waiting = [] } = {}) {
  const items = (waiting ?? []).filter(Boolean);
  if (!items.length) return false;
  if (!spoke) return true;
  if (spokeAsk) return false;
  return items.some((i) => i.kind === 'approval');
}

// WHAT THE ONE BANNER SAYS. No number in it, for two reasons that point the
// same way. The design law rejects counts on a glance surface (STATE.md), and
// under the rule above a count would be a lie within a minute: it can only ever
// describe the first second and a half of a stretch that may run for hours.
//
// TWO LINES, NEVER THREE, AND NO PROJECT NAME ANYWHERE IN IT.
//
// The subtitle field went first, earlier the same day, because she read a lone
// project name stacked under the title as the title bleeding over. Putting the
// project into the title instead only moved the problem: a title is the one
// line macOS will not wrap, so a project called something long pushes "An agent
// is ready" out of the banner and the fact she needed is the part that gets
// cut. Both fields are hers to fill with anything, and neither of them is a
// safe place for a string we do not control the length of.
//
// So the title is a fixed sentence and the body is the row's own name, which is
// where the project is recognisable anyway. Plural without a number covers the
// rest.
//
// `waiting` is everything unseen, oldest first. Returns null when there is
// nothing to say.
export function banner(waiting) {
  const items = (waiting ?? []).filter(Boolean);
  if (!items.length) return null;

  // A frozen worker outranks a finished one, so when both are unseen the
  // banner speaks for the one with a clock on it.
  const asks = items.filter((i) => i.kind === 'approval');
  const lead = asks.length ? asks[0] : items[items.length - 1];
  const many = items.length > 1;

  const title = asks.length
    ? (many ? 'Agents are waiting on you' : 'An agent is waiting on you')
    : (many ? 'Agents are ready' : 'An agent is ready');

  return {
    title,
    body: clip(lead.title),
    // What a click opens. An approval card is already on screen the moment the
    // window comes forward, so that one only needs the window.
    open: lead.kind === 'approval' ? null : (lead.id ?? null),
  };
}
