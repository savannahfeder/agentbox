// WHERE ONE OF HER TURNS BEGINS (w-250047ba5f, 2026-09-26).
//
// Hers: "When I'm scrolling in the chat, it's often really hard to find my
// previous messages... there's no visual distinction between my text and the
// agents' text." She picked the chapters look out of five: a hairline above
// each of her turns and her words a step larger, so a long conversation reads
// as sections that each start with her. And the rule she set on it: "on each
// new message the agent sends, there shouldn't be a new divider. There should
// only be a new divider to indicate something I've said."
//
// So a divider opens a turn of hers and nothing else:
//
//   - never on the agent's messages, however many it sends in a row;
//   - never on work lines, which are the agent's too;
//   - never on her second message in a row, which is the same turn;
//   - never on the first thing in the thread, because a rule over a
//     conversation that starts right underneath it is just a line;
//   - and ALWAYS on the far side of the cut middle, because whatever she was
//     continuing there is out of sight.

export interface TurnNode {
  kind?: string;
  who?: string;
}

export function herTurnStarts(nodes: TurnNode[], cutAfter = -1): boolean[] {
  let last: string | null = null;
  return nodes.map((e, n) => {
    if (n > 0 && n - 1 === cutAfter) last = null;
    if (e.kind === 'run' || e.kind === 'work') return false;
    const starts = e.who === 'you' && last !== 'you' && n > 0;
    last = e.who ?? null;
    return starts;
  });
}

// AND WHERE IT ENDS, 2026-09-27. The first build ruled only ABOVE her turn, and
// she read the result the other way round: "We're supposed to have dividers
// around my text but it's in the wrong place." With a line on one side only,
// the lower of two lines sits under the agent's section and reads as closing
// it. So her turn is framed: a second rule after her last message in a row,
// wherever anything of the agent's follows, messages or work.
//
//   - never when she is the last thing in the thread, where a rule under the
//     conversation is just a line again;
//   - never between two of hers, work lines in between or not;
//   - and ALWAYS at the cut middle, the mirror of the rule above.
export function herTurnEnds(nodes: TurnNode[], cutAfter = -1): boolean[] {
  const said = (e: TurnNode) => e.kind !== 'run' && e.kind !== 'work';
  return nodes.map((e, n) => {
    if (!said(e) || e.who !== 'you') return false;
    for (let k = n + 1; k < nodes.length; k++) {
      if (k - 1 === cutAfter) return true;
      if (said(nodes[k])) return nodes[k].who !== 'you';
    }
    // Only work after her: the agent is on it, so her turn is over.
    return n < nodes.length - 1;
  });
}
