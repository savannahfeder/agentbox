// WHAT AN AGENT MAY SHIP WITHOUT ASKING (w-e4d49a1539).
//
// Four kinds of change, sorted by what a change does for someone using the
// product rather than by its size, each with its own answer. Set once for
// every project and, where a project differs, for that project alone. Every
// answer starts on asking, which adds nothing to a brief. Kept in the config,
// out of the store and the repo, so an agent cannot raise its own answer.

export const KINDS = ['small', 'wide', 'seen', 'big'];

export const CHOICES = {
  small: ['ask', 'ship'],
  wide: ['ask', 'review'],
  seen: ['ask', 'test'],
  big: ['ask', 'test-ask', 'test'],
};

export const ASK_FIRST = Object.freeze({ small: 'ask', wide: 'ask', seen: 'ask', big: 'ask' });

export const KIND_WORDS = {
  small: { label: 'A small fix nobody sees', desc: 'Nothing on screen changes, and it touches none of the rows below.' },
  wide: { label: 'A fix that reaches a lot', desc: 'Sign-in, money, stored data, or how work starts or ships.' },
  seen: { label: 'A change you can see', desc: 'Words, layout, colour, or a control added, moved or taken away.' },
  big: { label: 'A big change', desc: 'A new feature, or a new way of working.' },
};

export const CHOICE_WORDS = {
  small: { ask: 'Ask me first', ship: 'Ship it' },
  wide: { ask: 'Ask me first', review: 'Codex reviews it, then it ships' },
  seen: { ask: 'Ask me first', test: 'AI testers try it, then it ships' },
  big: { ask: 'Ask me first', 'test-ask': 'AI testers try it, then ask me', test: 'AI testers try it, then it ships' },
};

/** A whole set of answers, or null when `value` is not one. */
export function cleanRules(value) {
  if (!value || typeof value !== 'object') return null;
  const out = {};
  for (const k of KINDS) {
    if (!CHOICES[k].includes(value[k])) return null;
    out[k] = value[k];
  }
  return out;
}

/** The answers for every project. */
export const everyProject = (config) => cleanRules(config?.shipRules?.every) ?? { ...ASK_FIRST };

/** A project's own answers, or null when it follows every project. */
export const projectOwn = (config, slug) => (config?.shipRules?.projects?.[slug]?.off ? null : cleanRules(config?.shipRules?.projects?.[slug]));

/** A project's own answers kept while it follows every project, to put back. */
export const projectKept = (config, slug) => cleanRules(config?.shipRules?.projects?.[slug]);

/** The answers a project's agents follow. */
export const rulesFor = (config, slug) => projectOwn(config, slug) ?? everyProject(config);

/** Whether anything ships without asking under these answers. */
export const shipsAlone = (rules) => KINDS.some((k) => rules?.[k] && rules[k] !== 'ask' && rules[k] !== 'test-ask');

/** What happens to each kind, in a few sentences, for a project row. */
export function rulesSummary(rules) {
  const names = { small: 'small fixes', wide: 'fixes that reach a lot', seen: 'changes you can see', big: 'big changes' };
  const which = (pick) => KINDS.filter((k) => pick(rules[k], k)).map((k) => names[k]);
  const and = (list) => (list.length === 1 ? list[0] : `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`);
  const cap = (s) => `${s[0].toUpperCase()}${s.slice(1)}`;
  const said = [];
  const alone = which((c, k) => k === 'small' && c === 'ship');
  const reviewed = which((c) => c === 'review');
  const tested = which((c) => c === 'test');
  const triedFirst = which((c) => c === 'test-ask');
  if (alone.length) said.push(`${cap(and(alone))} ship on their own.`);
  if (reviewed.length) said.push(`${cap(and(reviewed))} ship after a Codex review.`);
  if (tested.length) said.push(`${cap(and(tested))} ship after AI testers try them.`);
  if (triedFirst.length) said.push(`${cap(and(triedFirst))} go to AI testers, then to you.`);
  if (!said.length) return 'Everything asks you first.';
  if (KINDS.some((k) => rules[k] === 'ask')) said.push('The rest asks you first.');
  return said.join(' ');
}

const ASK = ['   Do not ship it. Bring it to them, and ask.'];

/** The section a worker's brief carries for these answers, or '' when everything asks. */
export function shipRulesBrief(rules) {
  if (!rules || !shipsAlone(rules)) return '';
  const lines = {
    small: rules.small === 'ship' ? ['   When its tests pass, ship it without asking.'] : ASK,
    wide: rules.wide === 'review' ? [
      '   Have a second model review it first: Codex, or the project\'s own review skill if',
      '   it names one. Fix what it finds that is both likely and bad, at most two rounds,',
      '   then ship it without asking. If no second model can run, ask them.',
    ] : ASK,
    seen: rules.seen === 'test' ? [
      '   Take screenshots of it in the running product, before and after. Have at least one',
      '   synthetic power user (below) try it. If they find nothing wrong, ship it without',
      '   asking and put the screenshots in your answer.',
    ] : ['   Take screenshots of it in the running product, before and after. Do not ship it.', '   Bring it to them with the screenshots.'],
    big: rules.big === 'ask' ? ['   Do not ship it. Bring it to them with screenshots, and ask.'] : [
      '   Before anything else, have synthetic power users try it: subagents that each play a',
      '   real person this product is for, use the running product for a stretch, and report',
      '   what broke, confused or slowed them. For anything several people use together, run',
      '   several at once on the same thing. Fix what they find and run them again.',
      ...(rules.big === 'test'
        ? ['   When they find nothing new that is broken, ship it without asking, with screenshots', '   and what the testers found in your answer.']
        : ['   Then bring it to them with screenshots and what the testers found. Do not ship it.']),
    ],
  };
  return [
    '',
    '# When this change ships',
    '',
    'The person set these rules in Settings, under Shipping. Where a rule below ships',
    'without asking, it is their standing approval, and it outranks a general rule in',
    'their instructions to ask before shipping. When they have said otherwise on this',
    'thread, or asked to see something first, what they said wins.',
    '',
    'Before you finish, put your change in one of these, by what it changes for someone',
    'using the product, not by how many lines it is:',
    '',
    '1. A small fix nobody sees. Behaviour is put right and the design is unchanged:',
    '   the screen looks and reads as it did, except that it now shows what it always',
    '   meant to (the right number, the right row, no crash), and it touches none of',
    '   what 2 lists, however small.',
    ...lines.small,
    '2. A fix that reaches a lot: code many parts depend on, how data is stored or moved,',
    '   how work starts or ships, sign-in, money, or anything that could lose someone\'s',
    '   work. A change nothing on screen shows stays here however big it is.',
    ...lines.wide,
    '3. A change people can see: words, layout, colour, a control added, moved or taken',
    '   away.',
    ...lines.seen,
    '4. A big change people will see or use: a new feature on screen, a new way people',
    '   work in the product, or a visible change with a lot of room for bugs.',
    ...lines.big,
    '',
    'When you are unsure between two, take the later one. A change that is partly',
    'seen is a seen change. A failing test is never shipped.',
    '',
    'Your answer says which of the four your change was and why, in one sentence, and',
    'what reviewed or tested it.',
  ].join('\n');
}
