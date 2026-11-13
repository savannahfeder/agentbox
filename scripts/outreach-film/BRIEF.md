# Write one lead's brief.json

You are filling in the words for a 97-second outreach film. The founder's
voice, the order of events and everything on screen are fixed. You write only
what is about this one company, in `brief.json`, shaped exactly like
`brief.example.json` beside this file. That example is a made-up shipping
company: copy its shape, replace every value, and reuse none of its lines or
ideas. Any line copied from it word for word is refused, the teammates' done
lists included.

You get two files in the lead's folder: `site.json` (their own site, read by a
script: each page's title, headings and text) and `lead.json` (who it is for).
Do not browse the web. `site.json` is the only source about the company.

When you are done, run `film.mjs make` again. If anything breaks a rule below,
it prints each problem as `where: what to change`. Fix exactly those and run
it again. Nothing is filmed until the brief passes.

## What the film says, so your threads fit her words

1. "This is your homepage, and you can see what everyone on your team is
   working on." The teammates are always Maya Chen, Jordan Lee and Sam Patel.
   You write what they work on (`team`), never who they are.
2. "Every agent you run gets its own thread." `running` is 19 threads.
3. "This one fixed a bug and wants to merge, the summary tells me exactly what
   changed, so I just hit one." That is `bug`; option 1 is "Merge it".
4. "This one wants to run a migration, and I see what it's about." That is
   `migration`, with its code change in `change`.
5. "This one wrote three new headlines for your homepage." That is
   `headlines`: three hero lines for their real homepage. See Heroes below.
6. "Each thread gets its very own cloud computer." The first `running` thread
   is the one she opens, so it has `"cloud": true`.
7. "When someone on your team gets stuck, you can open their thread." That is
   `maya`: a blocker only a person can clear (an access, a key, a decision),
   her one-line comment, and your short reply.
8. "Their messages land in the same inbox." That is `jordan`: his comment on
   the changelog thread.

## Accuracy, so nobody has to check it

- Every product, feature, plan, integration or customer type you name must be
  on their site, spelled as they spell it. Put each one in `grounding` as
  `{"term": "<the name>", "quote": "<a line from site.json>"}`. The quote
  is copied character for character from `site.json`, whole words only, and
  contains the term. The check looks for every quote in the site's text, and
  for every capitalised word in a title, summary or ask in `grounding` or on
  the site. The first word of a title or of a sentence does not count.
- Work from what the site says they build. `lead.json` hints may be wrong.
- Never invent facts about the company: no customer names, revenue, funding,
  headcount, launch dates or business metrics. Numbers about the agents' own
  work are good and should be specific ("37 of 37 quotes match", "3.1 seconds
  to 40 milliseconds").
- The work is what an engineer there would really hand an agent: small,
  concrete, done in a day, in their stack as the site shows it.
- If the site is too thin to know what they build, write only
  `{"unsure": "<why>"}`. A wrong film is worse than none.

## Words

- Plain sentences, the way an engineer writes a ticket.
- Every thread title starts with a verb: Fix, Add, Move, Show, Speed up,
  Cache, Retry, Document, Write, Debug, Update, Check...
- No long dashes, no colons inside a sentence, no exclamation marks.
- Never: seamless, effortless, unlock, supercharge, revolutionize, empower,
  leverage, cutting-edge, next-generation, robust, elevate, streamline,
  game-changer, harness, delve, synergy, world-class, best-in-class.
- No two thread titles may start with the same five words: the film finds
  each thread by the start of its title.

## Sizes the screen holds

| Field | Rule |
| --- | --- |
| `projects` | exactly 5, each at most 28 characters: their product areas, plus Website and Docs |
| any thread `title` | at most 60 characters (`running` titles 64, `maya.title` 36) |
| `summary` | 30 to 220 characters, two sentences: what was wrong, what changed |
| `ask` | at most 90 characters, ends with `?` |
| `progress` | 2 to 5 steps, each at most 70 characters |
| `context` | 1 to 3 sentences, each at most 240 characters |
| `options` | 2 or 3, each at most 40 characters; `bug.options` is 3 and starts with "Merge it" |
| `migration.change` | 1 to 3 files, 12 to 30 rows of code in all, each row `["+" or "-" or "=", "code"]` at most 100 characters |
| `fourth`, `sixth` | two more threads waiting on you, shaped like `bug`: `fourth` usually in Docs, `sixth` anywhere |
| `maya.body` | at most 140 characters: what she first asked her agent |
| `maya.ask` | starts "I'm stuck on", at most 90 characters |
| `maya.summary` | at most 140 characters: the line her inbox row shows |
| `maya.context` | 40 to 400 characters, in her agent's voice: what fails, what passes, what she needs |
| `maya.title` + `maya.comment` | at most 70 characters together, or her inbox row hides the comment |
| `maya.reply` | 12 to 28 characters of plain keyboard text: the thing that unblocks her |
| `jordan.title` | starts "Write this week's " (for example "Write this week's Acme changelog") |
| `jordan.comment` | 10 to 60 characters: he asks to add one of his own items |
| `running` | exactly 19; `activity` at most 40 characters; the first has `"cloud": true`, and about five more |
| `done` | exactly 3; `result` ends "Merged." or "Live." |
| `team.<name>.done` | 8 to 14 short titles each, at most 60 characters |

## Heroes

Three lines, each a real candidate for their homepage, each from a different
angle (what it is, what it saves, who it is for, the moment it helps). At most
8 words and 46 characters each, so it sits in their hero like theirs does. The
film draws each one on their live page in their font, and refuses one that
takes more lines than their own headline (or more than two), or spills out of
the hero. Their hero's width and font size set the real limit: a site with
huge type fits fewer words, and the problem message gives their headline and
its length to aim near.
`headlines.why` says in one sentence what each leads with: "The first leads
with X, the second with Y, and the third with Z."

What the best heroes on the web do (read off the live sites, Nov 2026):

| Site | Hero | Why it works |
| --- | --- | --- |
| Resend | Email for developers | The category and the buyer, three words |
| Supabase | Build in a weekend Scale to millions | Two beats: the start and the payoff |
| Ramp | Time is money. Save both. | An old saying turned into the pitch |
| Sentry | Code breaks, fix it faster | Names the pain first, then the promise |
| Raycast | Your shortcut to everything. | Possessive, one idea, no jargon |
| Zed | Your last next editor | A twist the buyer repeats to friends |
| Granola | The AI notepad for back-to-back meetings | Category plus the exact moment of use |
| Railway | Ship software peacefully | A verb they want and a feeling they lack |
| Stripe | Financial infrastructure to grow your revenue | Category plus outcome, no adjectives |
| Loom | One video is worth a thousand words | A known phrase, bent to the product |
| Apple iPod (2001) | 1,000 songs in your pocket. | A number and an image, nothing else |

The weak ones claim a category nobody asked for ("Agentic Infrastructure"),
lean on superlatives ("The world's fastest..."), or shout. A hero that would
fit any company fails. Do not reuse their current headline or a line above.
A good way to get there: write ten, score each on whether only this company
could say it, whether a buyer gets what it does, and whether it sounds like a
person wrote it, and keep the best three that take different angles.
