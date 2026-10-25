# The people who power test Agentbox

Each file is one kind of person Agentbox is built for: people who run many
Claude Code and Codex agents at once, mostly software engineers, founding
engineers, CTOs and technical founders at startups and AI companies. Testing
the way they work finds the bugs a quick check misses. Two sit at the edge of
that on purpose: an engineer at a big company whose tools are locked down,
and a teammate who is not an engineer but uses Claude Code through the app
all day.

| file | who | what they lean on |
|---|---|---|
| `startup-engineer` | founding engineer, 12 people | 8 at once, two logins, Codex when Claude runs out, keyboard only |
| `big-company-engineer` | senior engineer, 3,000 people | one login, no Codex, long careful threads, away in meetings |
| `founder` | technical CEO, 5 people | one plan for everything, non-code tasks, replies hours later |
| `cto` | CTO, 40 people | 300 threads, five projects, search, board, options, an app open for days |
| `ai-lab-engineer` | member of technical staff at an AI lab | same task on both engines, switching engine and model mid-thread |
| `ops-teammate` | growth and operations, not an engineer | the mouse, plain words, many research tasks |
| `new-user` | engineer, first day | exploring, mistakes, undo, deciding whether to keep it |

## Adding someone

Copy a file and change it. The front matter is read by `scripts/plan.mjs`:

- `name`, `role`: who they are, in one line each.
- `logins`: Claude logins on their copy (1 to 4). The second one is the one a
  power test runs out first.
- `codex`: yes or no. With no, their copy has no Codex.
- `projects`: their projects, comma separated; the copy makes one per name.
- `at-once`: how many threads they have going at their busiest; the test tells
  them when they have not got there yet.
- `history`: how many old threads their inbox starts with.
- `knows-keys`: yes, or no for someone who uses the mouse or is new.
- `pace`: fast, steady or between-meetings; how long they step away.

The body is handed to the tester as who they are, in the second person.
`## Your day` is a numbered list of the parts of their day, which the test
walks through as its clock moves. `## On your plate` is the work they brought.
A person is a role, never a real one: no real names, companies or quotes.
