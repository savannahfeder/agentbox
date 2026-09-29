# Agentbox

**An inbox for your coding agents.** You file the work, each item gets its own
agent in its own thread, and they come back to you with a summary of what they
did and what they need. You read, you approve or redirect, you move on.

Today the number of agents you can run is limited by how many windows you can
keep track of at once. Agentbox drops the chat window entirely and gives your
agents an inbox instead, so you can run far more of them than you could ever
watch and only deal with one when it actually needs you.

A macOS app. It runs on the Claude Code or Codex plan you already have, on your
own machine. There is no server, no account to make, and no extra subscription.

## How it works

1. **File the work.** Paste a list, send over a board of issues, or type one
   task. Twelve at once is a normal day.
2. **Walk away.** Each item gets a headless agent in its own thread. Nothing
   needs you while they run, so go and do something else.
3. **Come back to an inbox.** Every thread opens with what the agent did and
   what it wants from you, in two lines you can read at a glance.
4. **Answer with one key.** Press `E` to approve and merge. Press `1`, `2` or
   `3` to pick an option an agent offered. Type a sentence and send it back if
   none of them is right.
5. **Reach inbox zero.** The rows you approved are done. The ones you
   redirected are already working again.

The job this leaves you is reviewing what agents made and deciding whether it
is good enough, rather than watching them make it. That is the whole argument
for an inbox: a person in the loop where judgment is worth something, and
nowhere else. An agent that got a failing test to pass by editing the test is
exactly the moment you want to be asked.

## Get it

You need a Mac, Claude Code installed and signed in, and Node 22 to build.
Codex is optional and is picked up when it is there.

```
git clone https://github.com/savannahfeder/agentbox.git
cd agentbox
npm install
npm start
```

`npm start` builds the renderer and launches the app. On first run it walks you
through connecting Claude Code and choosing a folder to work in.

## Keys

It is built for the keyboard. Arrows move, Enter opens, `E` approves the
recommendation or marks a row done, `1`/`2`/`3` pick an option an agent
offered, `R` replies, `S` snoozes, `C` composes, Tab cycles views, `Z` undoes,
and `⌘K` opens the palette, which reaches almost everything else.

## Make it yours

Fifteen skins, each in light and dark, from plain slate to woodblock and riso
prints. Press `⌘K` and type "theme", or open Settings and then Look.

## Config

`zero.config.json` in the repo root, gitignored and machine-specific. Every
default works unset and they all live in `main/config.mjs`. The ones that
matter:

- `storeRoot`: where the store lives. Defaults to a folder named after the app
  in your home directory.
- `claudeBin`: the binary to run. The app finds `claude` itself if you leave
  this alone.
- `maxConcurrentSessions`: how many agents run at once. The queue absorbs the
  rest.
- `sessionArgs`: what a spawned session may do. **The default grants only the
  store tools**, so an agent can read the store, file questions and update work
  items, and nothing else. To let agents edit code and run commands, opt in:

  ```json
  { "sessionArgs": ["--allowedTools", "mcp__agentbox", "--permission-mode", "acceptEdits"] }
  ```

  That grant is yours to make deliberately. The app never escalates it for you.

- `personalProducts`: workspaces that are your own tasks rather than a product,
  for example `["personal"]`. Sessions there get your message and nothing else,
  and replying resumes the same session, like a thread.
- `diagnostics`: `false` turns off the counts described below.

## What this sends

Nothing, unless you are running a build that was signed and released with a
PostHog key baked into it. A build made from this repo has no key, so a clone
and a fork are silent, and with no key the whole path is off at every send.

A released build counts seven things, and they are counts:

- the app was opened
- first run finished
- a repo was connected
- an agent was seen
- a task was opened
- a reply was sent
- a task finished

Each carries a random install id, the app and platform version, and at most
four other things: how long something took, how many of a thing there were,
which kind of row it was out of six fixed words, and whether an agent or you
did it. No file contents, no prompts, no paths, no titles, nothing you typed.
`shared/analytics-events.mjs` is the whole list, and anything a caller attaches
beyond those four is dropped rather than sent, so nobody can widen it by
accident. Crash reports travel the same way and are scrubbed first
(`shared/crash-scrub.mjs`).

**The events can be turned off,** and either way is enough on its own:

- In the app: Settings, then the "Counts and crash reports" switch.
- In `zero.config.json`: `"diagnostics": false`.

The update check is separate and is not routed through any of this. It is a
request to github.com for the latest release, it carries no identity and no
key, and it only happens in a packaged build.

The thing that sends the most is not ours at all. This app drives Claude Code
and Codex, so whatever a session reads and writes goes to Anthropic or OpenAI
under their terms, exactly as it would if you ran those tools yourself.

## How it is built

Sessions are cattle and the store is the truth. The durable state is a folder
on disk at `storeRoot`, written through `main/store/` so the fold rules exist
in exactly one place. The app can crash, restart or be rewritten without any
agent noticing.

- `main/` the Electron main process: config, the store
  (`main/store/work-items.mjs` is the single write path), the supervisor that
  spawns one headless session per work item, and IPC.
- `mcp/` the store server handed to those sessions.
- `renderer/` the inbox: list, focus mode, rail, compose, palette, browser.
- `briefs/` the judgment: worker and dispatcher prompts. Edit these rather than
  the code to change how agents behave.
- `tests/` the suite, which is large and is the documentation of record for how
  any of this is meant to behave.

## Develop

```
npm run dev        # vite HMR plus electron
npm test
```

Useful modes:

- `ZERO_FIXTURES=1` canned data, with no store and no agents touched
- `ZERO_FIXTURES=empty` inbox zero
- `ZERO_NO_SUPERVISOR=1` never spawn sessions
- `ZERO_SCREENSHOT=/tmp/x.png` capture the window and quit

The same fixture worlds are reachable off the url, which is how the
`scripts/shot-*.mjs` family photographs them: `?fixtures`, `?fixtures=empty`,
`?fixtures=crowded`, `?fixtures=mock`, `?working=3`. `?engines=`
picks which coding agents the fixture Mac has, where nothing is one agent,
`?engines=missing` is the gate open with Codex not found, and `?engines=claude`
or `?engines=codex` give two.

To open the app as somebody who has never seen it, with its own throwaway home
and nothing of yours inside it, press `⌘K` and choose "Open agentbox as a new
user". `npm run fresh` does the same from a terminal.

The app is named in exactly one place, `shared/product-name.mjs`. Change it
there and run `node scripts/product-name.mjs --write`, and everything else
follows. The `zero` and `ZERO_` prefixes through the code are the name it had
first and are load-bearing in places, so they are left alone.

## Licence

GPL-3.0-or-later. See [LICENSE](LICENSE).
