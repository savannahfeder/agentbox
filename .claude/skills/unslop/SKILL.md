---
name: unslop
description: Cut the habits that make writing read as machine-made. Use on anything you write while building Agentbox that a person will read, including code comments, commit messages, docs, CLAUDE.md, test headers, pull request text and your answer at the end of a task, or when asked to unslop, de-slop or make writing plain.
---

# Unslop

Start with the fact test. Everything after it is secondary, and in October 2026
a set of pages passed all of it twice and still read as machine-made.

## The fact test

For every sentence, name the fact a reader does not know until they read it.

If the honest answer is "it links the two sentences around it", or "it sets up
the next one", or "it tells you the previous one mattered", or the fact is
already delivered earlier, **delete the sentence**. Do not reword it into a
better-sounding version of the same nothing.

The three she caught, none of which breaks any rule further down this file:

- *"Those three facts are what send people looking for something else."* The
  sentence before it listed the three facts. This one comments on its
  neighbour by saying they had an effect.
- *"The short answer"* as a heading. It names a section type, not its content.
  "One command per task" names the content.
- *"Almost nobody goes looking for a GUI because the terminal is ugly. People
  go looking after they lose track of an agent, which is a different complaint
  with a different answer."* It negates first, saying what the reason is not,
  then gives it, then adds that the two differ. Thirty-three words, one fact.

What they share is that the prose is argument-shaped. Set up, pivot, land.
Negate, then correct. State, then comment. A reference page needs none of it,
and no measurement of words, length, voice or punctuation can see it.

**Write the body the way an FAQ is written.** [measured] On one guide the body
carried about one no-fact sentence in eight and the FAQ about one in twenty,
because a question forces an answer and an answer has no room for a run-up.
Decide the question each paragraph answers, then answer it. Never write a
sentence to get from one paragraph to the next; if a paragraph seems to need a
bridge, it is two answers and should be split.

**The page gets shorter.** [measured] 177 words left one body and no fact went
with them. A word count or word target is not a reason to keep a sentence that
carries nothing, and nothing gets written to replace what goes.

## Then the rest

Scan what you wrote for the patterns below and rewrite. Keep the meaning and
the facts. Plain and specific beats polished.

## Never touch

- **Someone's own words.** A quote, a pasted message, copy a person proposed.
  Keep it character for character.
- **Words the app already shows people.** Copy is part of the design here and
  the maintainer reviews it. Apply this to new copy you are writing, and flag
  existing copy rather than rewriting it on your own.

## Content

- **Empty -ing tails.** "...highlighting the need for", "ensuring that",
  "reflecting a shift". Cut them, or say the actual thing.
- **Vague sources.** "Experts say", "it is widely known". Name the source or
  cut the claim.
- **Generic endings.** "This makes the app more robust." Say what changed, or
  stop a sentence earlier.
- **Feelings instead of facts.** "Search feels snappier" becomes "search
  answers in 40 ms instead of 900". If a sentence could sit unchanged in
  another project's docs, it says nothing about this one.

## Words

- **Machine vocabulary.** Delve, crucial, pivotal, robust, seamless, leverage,
  utilize, enhance, foster, showcase, underscore, landscape, tapestry,
  testament, intricate, vibrant, additionally. Use the plain word: use, help,
  show, many, if.
- **Fancy "is".** "Serves as", "stands as", "acts as", "boasts". Write "is"
  or "has".
- **Metaphor nouns that pose as technical terms.** Surface, substrate, wedge,
  vector, primitive, harness (as a metaphor), north star, flywheel, paradigm.
  Pick the concrete word.
- **Filler.** "In order to" is "to". "Due to the fact that" is "because".
  "It is important to note that" goes.
- **Stacked hedges.** "Could potentially possibly" is "may".
- **Adverbs propping up a weak verb.** "Significantly improves" becomes the
  measured change.

## Shape

- **"Not just X, but Y."** Say Y.
- **Forced threes.** List as many things as there are.
- **Synonym cycling.** Pick one name for a thing and repeat it.
- **Passive voice that hides who acts.** "The file is parsed" becomes "the
  loader parses the file".
- **Dense sentences.** If a reader has to go back over it, split it. One idea
  per sentence.
- **Over-compression.** Arrows, dropped articles and verbless fragments make
  the reader decode. "Bad date → exit 2" becomes "A bad date exits with code
  2 and writes nothing."
- **Mannered lines.** Aphorisms, punchy fragments for effect, code that
  "holds" or "rides along". Say what it does.

## Sentences that only point at other sentences

The hardest kind to see, because each one reads fine alone. Caught on the
guide pages in October 2026, where three sentences in a row said one thing:
"Give every task its own git worktree. That is the whole technical answer, and
it is one command. The rest of this page is about the part that costs you
time." The first carries information. The second labels the first. The third
describes the page.

- **Pointer sentences.** They open with "That is", "This is", "It is", and the
  pointing is the whole sentence. "That is the point." "It is neither." "That
  is the entire design question." Cut them, or fold the fact into the sentence
  before.
- **Page talk.** Sentences about the document rather than its subject. "The
  rest of this page is for...", "more on that below", "this section covers".
  A link already does this.
- **Announcing a list before giving it.** "Three honest limits on that figure."
  Then the three limits. Give the three.

Read each sentence alone and ask what a reader loses if it goes. If the answer
is nothing, it goes. Replacing it with a fact beats deleting when you need the
length.

## Voice and rhythm, which the rules above do not catch

Everything above is about words. A page can pass all of it and still read as
machine-made, and in October 2026 one did, twice. What a measurement of eight
pieces by Julia Evans, Simon Willison and Dan Luu found, against six pages that
had already been unslopped:

| | Them | Us |
|---|---|---|
| First person per 1,000 words, counted as one thing | 44.9 | 1.3 |
| Sentences opening with a bare command | 0.0% | 5.0% |
| Mean sentence length | 21.8 | 14.9 |
| Sentences over 25 words | 37.5% | 10% |

- **Never open a sentence with a bare command.** Not one of the eight does.
  "Give every task its own git worktree" is an instruction manual shouting at a
  stranger. Say what is true or what happened and let the reader draw the
  instruction out of it. Inside a numbered how-to step a command is fine.
- **Never invent the person.** "We" attaches only to something that actually
  happened. No war stories, no "in our experience", no anecdote that did not
  occur. Faked experience is worse than no voice at all, and if no true
  first-person claim fits, write a plain statement instead.
- **Vary the length.** Sentences all the same length are the machine rhythm,
  and that monotone is what gets read as incoherent. Let a thought run to its
  end in one sentence rather than chopping it into three.
- **Measure body prose and FAQ answers apart.** An answer under a question
  heading should stay short and say "you". Body prose should not. Averaging
  the two describes neither, and chasing the average pads the FAQ.

## Write about the thing, not about having looked at it

That 44.9 is two numbers added together, and chasing it produced six pages she
read as "you overly use the word we. It feels like Smiegel is almost talking".
Split by pronoun, the same eight pieces and the same six pages:

| per 1,000 words | Them | Us, after chasing 44.9 |
|---|---|---|
| I, me, my | 22.8 | 0.0 |
| we, our, us | 15.1 | 14.5 |

Their "we" is the reader and the writer walking through something together.
Dan Luu writes "let's say we want to write a file safely". The pages' "we" was
a company reporting its own research, and 87 of its 134 uses were "we" plus a
verb of having looked at something, as in "we found", "we read", "we checked".
A product page has no "I" available to it, so copying a personal blog's
first-person number leaves only the corporate plural, which is the one that
grates.

- **State a fact, never report it.** Cut the clause saying somebody went and
  looked. "The twenty-three tools we found all automate that step" is "All
  twenty-three tools automate that step". "When we checked, its last commit was
  20 August" is "Its last commit was 20 August". The date and the source go
  once, in the as-of line or the method section, where a reader checking the
  work goes anyway.
- **"We" meaning the product is the product's name.** "Where we lose" is
  "Where Agentbox loses". A table cell saying "ours" says what it means.
- **An admission keeps its force without the pronoun.** "We have not tested ten
  agents" is "Ten agents remain untested", which concedes the same thing.
  Dropping the concession along with the pronoun is the one way this rule does
  damage, and on a comparison page it is dishonest.
- **"You" is for a reader being asked or instructed.** An FAQ question keeps
  its wording and a how-to step keeps its "you". Otherwise name the subject.
  "the subscription you already pay for" is "an existing Claude Code
  subscription", which also says which subscription.

## Every heading has to survive being read on its own

Headings get read in a different order from the text under them, by somebody
skimming, by a search result, and by a model summarising the page. So the test
is to put every heading in a list, with nothing around it, and read it cold.

"Five surfaces, four of them graphical" failed that test in October 2026. It
sat above the section that explains what a surface is, so it is clear in place
and meaningless out of it. Her words were "incoherent if reading on my own,
it's weirdly phrased and means nothing".

Three shapes fail, and all three read fine in place:

- **A word the page invents and defines just below it.** "Five surfaces, four
  of them graphical", "The four shapes the third-party ones come in". Use the
  words a stranger already has: "Anthropic ships Claude Code for the desktop,
  the browser, two editors and the terminal".
- **A pronoun with no referent, because what it points at is above it.** "The
  CLI answers it too", "Where Anthropic's own answer stops", "Six of the
  twenty-one are not what a roundup implies". Name the thing: "Six of the
  twenty-one are dead, renamed or have gone quiet".
- **A heading naming things its own section does not.** "Emdash and Nimbalyst
  for the board" sat over a paragraph naming Agentbox, claudecodeui and Orca.
  Read the first paragraph before writing the heading over it, and again
  after editing either one.

A plainer and longer heading beats a clever short one every time. Eleven words
that a newcomer understands are worth more than four that need the paragraph
underneath. Headings are also the one place where repeating a noun is right,
because the reader may have arrived at that heading from a search result and
seen none of the others.

## Punctuation and formatting

- **No em dashes.** Use a full stop or a comma.
- **No colons in copy**, including before a list or a code block, where a full
  stop reads just as well. Her rule, and it beats what the references do.
- **Bold** for the one thing a skimmer must not miss, not every noun.
- **No bold-label lists that repeat themselves**, like "**Speed:** Speed
  improved". A bold lead-in that names the item, followed by new detail, is
  fine.
- **Sentence case headings**, straight quotes, no decorative emoji.

## Talking to a person

- No "Great question", "Certainly!", "I hope this helps", "Let me know if".
- No preamble. Start with the answer.
- Say what you measured and what you did not. "I don't know" is fine.

Adapted from pstack's `unslop` skill,
https://github.com/cursor/plugins/tree/main/pstack (MIT).
