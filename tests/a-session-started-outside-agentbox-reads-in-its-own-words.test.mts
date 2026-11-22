// A SESSION STARTED OUTSIDE AGENTBOX READS IN ITS OWN WORDS, IN AGENTBOX'S LAYOUT.
//
// A Claude Code or Codex session a person started themselves never gets
// Agentbox's instructions, so its page is laid out by rules from the tool's own
// words (w-34f79ab66e). The rules were tried on 151 real moments where an agent
// stopped, from 21 hand-started sessions on the founder's Mac (2026-11-22). As
// first written they were wrong 13 times, mostly by offering a list of steps as
// choices; the rules here were wrong once in 101 moments they had not been
// tuned on. Every case below is one of the shapes that decided a rule, written
// fresh so no real session text is in the repository.

import { describe, it, expect } from 'vitest';
import { sessionLayout, theirWords, layoutMarkdown } from '../shared/session-layout.mts';

describe('the ask is found and laid out', () => {
  it('a numbered list right after "I can either:" is the choices, and the sentence before leads', () => {
    const l = sessionLayout([
      "I've moved the config over to the new loader.",
      '',
      'Three customer apps still set `CHECKOUT_TAX_MODE` under its old name, `TAX_MODE`. I can either:',
      '1. Read both names for one release and log a deprecation warning',
      '2. Switch now and tell those three customers',
      '',
      'Which do you want?',
    ].join('\n'));
    expect(l.kind).toBe('asks');
    expect(l.bold).toBe('Three customer apps still set CHECKOUT_TAX_MODE under its old name, TAX_MODE.');
    expect(l.under).toBe('Which do you want?');
    expect(l.choices).toEqual(['Read both names for one release and log a deprecation warning', 'Switch now and tell those three customers']);
  });

  it('a list of steps with no question is not choices: the statement ask leads and the steps stay text', () => {
    const l = sessionLayout([
      'Then press Create. Two follow-ups:',
      '1. Put the new id in `.env.local` and restart the dev server.',
      '2. Reconnect GitHub from the app.',
      '',
      "Once you've reconnected, tell me and I'll run the check again.",
    ].join('\n'));
    expect(l.choices).toEqual([]);
    expect(l.kind).toBe('asks');
    expect(l.bold).toBe("Once you've reconnected, tell me and I'll run the check again.");
  });

  it('a report that ends on a numbered list and asks nothing is shown as it is', () => {
    const msg = ['The cleanest three are:', '', '1. The operating system for your team', '2. The layer for agents', '3. The cockpit'].join('\n');
    const l = sessionLayout(msg);
    expect(l.kind).toBe('plain');
    expect(layoutMarkdown(l, msg)).toBe(msg);
  });

  it('a yes-or-no question carries the paragraph before it, word for word', () => {
    const l = sessionLayout([
      'I found why the receipts page is slow.',
      '',
      'The fix is to load receipts 50 at a time and add an index on `orders.store_id`. I would also delete the `receipts_cache` table.',
      '',
      'Do you want me to do both?',
    ].join('\n'));
    expect(l.bold).toBe('Do you want me to do both?');
    expect(l.context).toBe('The fix is to load receipts 50 at a time and add an index on `orders.store_id`. I would also delete the `receipts_cache` table.');
    expect(l.choices).toEqual([]);
  });

  it('a bare "Want me to?" is led by the sentence before it in the same paragraph', () => {
    const l = sessionLayout('All fixed.\n\nI can also fix the Settings clicks right now instead of leaving it for later. Want me to?');
    expect(l.bold).toBe('I can also fix the Settings clicks right now instead of leaving it for later.');
    expect(l.under).toBe('Want me to?');
  });

  it('labelled A and B bullets before "which should I implement?" are the choices', () => {
    const l = sessionLayout([
      'Two designs are ready:',
      '',
      '- **A: Inside the conversation**, recommended.',
      '- **B: The approval card.**',
      '',
      'Both are previews. Which should I implement?',
    ].join('\n'));
    expect(l.under ?? l.bold).toMatch(/Which should I implement\?/);
    expect(l.choices).toEqual(['**A: Inside the conversation**, recommended.', '**B: The approval card.**']);
  });

  it('the tool\'s own question and choices win, exactly as the tool gave them', () => {
    const l = sessionLayout('I looked at both libraries.', [{ question: 'Which date library should I use?', options: ['date-fns', 'Luxon'] }]);
    expect(l.kind).toBe('asks');
    expect(l.from).toBe('tool');
    expect(l.bold).toBe('Which date library should I use?');
    expect(l.choices).toEqual(['date-fns', 'Luxon']);
  });

  it('a statement only the person can act on is the ask, with the code block after it kept', () => {
    const l = sessionLayout('I can\'t release it from here. To put it out, run this in Terminal:\n\n```\nnpm run deploy\n```');
    expect(l.bold).toBe('To put it out, run this in Terminal:');
    expect(l.after).toContain('npm run deploy');
  });

  it('"e.g." does not cut a question in two', () => {
    const l = sessionLayout('Done.\n\nWant me to keep going on anything else, e.g. the picker or the scorecard, or park it here?');
    expect(l.bold).toBe('Want me to keep going on anything else, e.g. the picker or the scorecard, or park it here?');
  });
});

describe('what must not be taken for an ask', () => {
  it('a question the agent asks itself is not put to the person', () => {
    expect(sessionLayout('That tests your actual hypothesis: does a reference you like improve a different shot?').kind).toBe('plain');
  });
  it('questions inside a list are not the ask', () => {
    expect(sessionLayout('To judge it we would look at:\n\n- Can you finish the briefing in five minutes?\n- Is it missing anything?').kind).toBe('plain');
  });
  it('"can only say" is not "say yes"', () => {
    expect(sessionLayout('One limit: the card can only say "ended" after a run on it is refused.').kind).toBe('plain');
  });
  it('"let me know if" is politeness, not an ask', () => {
    expect(sessionLayout('Shipped. Let me know if any spacing still feels off.').kind).toBe('plain');
  });
  it('a question far up a long report is not the ask', () => {
    const msg = ['Should I keep the old name?', '', 'First.', '', 'Second.', '', 'Third.', '', 'Fourth.', '', 'All tests pass.'].join('\n');
    expect(sessionLayout(msg).kind).toBe('plain');
  });
  it('an empty message is plain', () => {
    expect(sessionLayout('').kind).toBe('plain');
  });
});

describe('the page draws the ask and keeps every word the agent wrote around it', () => {
  it('bold ask, then the agent\'s own paragraph', () => {
    const msg = 'Intro.\n\nThe fix is small. I would also move the files.\n\nDo you want me to do both?';
    expect(layoutMarkdown(sessionLayout(msg), msg)).toBe('**Do you want me to do both?**\n\nThe fix is small. I would also move the files.');
  });
  it('choices are not printed twice: the strip draws them', () => {
    const msg = 'Three apps use the old name. I can either:\n1. Keep both\n2. Switch\n\nWhich do you want?';
    const md = layoutMarkdown(sessionLayout(msg), msg);
    expect(md).toBe('**Three apps use the old name.**\n\nWhich do you want?');
  });
});

describe('"You asked" is the person\'s own words', () => {
  it('drops the browser state and the files Codex adds before them', () => {
    const raw = '\n<in-app-browser-context source="ambient-ui-state">\nThis block is automatically supplied.\n- Current URL: http://127.0.0.1:8765/\n</in-app-browser-context>\n\n## My request:\nWhat about a grey accent instead?\n';
    expect(theirWords(raw)).toBe('What about a grey accent instead?');
  });
  it('drops the attached-files block when there is no browser', () => {
    const raw = '# Files mentioned by the user:\n\n## shot.png: /var/folders/x/shot.png\n\n## My request:\nmake the heading smaller';
    expect(theirWords(raw)).toBe('make the heading smaller');
  });
  it('drops image markers and keeps the rest', () => {
    expect(theirWords('[Image #1] [Image #2] cant even get this thread to run')).toBe('cant even get this thread to run');
  });
  it('an answer to the tool\'s own question reads as the answer', () => {
    const raw = '<send_user_message_question_reply>\n[{"questionItemId":"x","question":"Which one?","answer":"Build a local prototype"}]\n</send_user_message_question_reply>';
    expect(theirWords(raw)).toBe('Build a local prototype');
  });
  it('plain words pass through, spaces tidied', () => {
    expect(theirWords('  fix   the login\nplease ')).toBe('fix the login please');
  });
});
