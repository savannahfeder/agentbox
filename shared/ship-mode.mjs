// HOW MUCH A PROJECT WANTS TO BE ASKED BEFORE A CHANGE SHIPS (w-e4d49a1539).
//
// `ask` is every project's starting point and adds nothing to a brief. The
// other two hand the agent a standing approval and the rules for using it,
// sorted by what a change does to someone using the product rather than by
// its size. Kept in the config, out of the store and the repo, so an agent
// cannot raise its own project's answer.

export const SHIP_MODES = ['ask', 'unseen', 'tested'];

export const isShipMode = (v) => SHIP_MODES.includes(v);

export function shipModeOf(config, slug) {
  const mode = config?.shipModes?.[slug];
  return isShipMode(mode) ? mode : 'ask';
}

export const SHIP_MODE_WORDS = {
  ask: 'Ask me first',
  unseen: 'Ship what I won’t see',
  tested: 'Ship everything once tested',
};

export const SHIP_MODE_SENTENCE = {
  ask: 'Every change waits for your yes.',
  unseen: 'Fixes nobody can see ship on their own, with a second model checking the risky ones. Anything on screen comes to you with pictures.',
  tested: 'Changes on screen ship too, once synthetic users have tried them. Threads that ship close themselves.',
};

/** The section a worker's brief carries for this mode, or '' for `ask`. */
export function shipModeBrief(mode) {
  if (mode !== 'unseen' && mode !== 'tested') return '';
  const shipsSeen = mode === 'tested';
  return [
    '',
    '# When this change ships',
    '',
    `The person set this project to ${shipsSeen ? 'ship tested changes, seen or not,' : 'ship changes they would not see'} without`,
    'asking them. That setting is their standing approval for the cases below, and it',
    'outranks a general rule in their instructions to ask before shipping. When they',
    'have said otherwise on this thread, or asked to see something first, what they said wins.',
    '',
    'Before you finish, put your change in one of these, by what it changes for someone',
    'using the product, not by how many lines it is:',
    '',
    '1. A small fix nobody sees. Behaviour is put right and nothing on screen looks or',
    '   reads differently. When its tests pass, ship it without asking.',
    '2. A fix nobody sees, with a wide reach: code many parts depend on, how data is',
    '   stored or moved, how work starts or ships, sign-in, money, or anything that could',
    '   lose someone\'s work. Have a second model review it first: Codex, or the project\'s',
    '   own review skill if it names one. Fix what it finds that is both likely and bad,',
    '   at most two rounds, then ship it without asking. If no second model can run, ask them.',
    '3. A change people can see: words, layout, colour, a control added, moved or taken',
    '   away. Take screenshots of it in the running product, before and after.',
    ...(shipsSeen ? [
      '   Have at least one synthetic power user (below) try it. If they find nothing',
      '   wrong, ship it without asking and put the screenshots in your answer.',
    ] : [
      '   Do not ship it. Bring it to them with the screenshots.',
    ]),
    '4. A big change: a new feature, a new way of working, or a change with a lot of room',
    '   for bugs. Before anything else, have synthetic power users try it: subagents that',
    '   each play a real person this product is for, use the running product for a',
    '   stretch, and report what broke, confused or slowed them. For anything several',
    '   people use together, run several at once on the same thing. Fix what they find',
    ...(shipsSeen ? [
      '   and run them again. When they find nothing new that is broken, ship it without',
      '   asking, with screenshots and what the testers found in your answer. If they',
      '   disagree about something only the person can decide, bring that one thing to them.',
    ] : [
      '   and run them again, then bring it to them with screenshots and what the testers',
      '   found. Do not ship it.',
    ]),
    '',
    'When you are unsure between two, take the later one. A change that is partly',
    'seen is a seen change. A failing test is never shipped.',
  ].join('\n');
}
