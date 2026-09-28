# agentbox

An inbox for your coding agents. You file work, agents run headless and file
questions and reviews back, you approve or redirect from a keyboard-first list,
and at inbox zero you get a browser.

A macOS Electron app. It runs Claude Code (and optionally Codex) on your own
subscription, on your own machine. There is no server and no account to make.

Sessions are cattle, the store is the truth: the durable state is a folder on
disk at `storeRoot`, written through `main/store/` so the fold rules exist in
exactly one place. The app can crash, restart, or be rewritten without any
agent noticing.

## Run

```
npm install
npm start          # build renderer + launch
npm run dev        # vite HMR + electron
npm test
```

You need Node 22, a Mac, and Claude Code installed and signed in. The app
looks for the `claude` binary itself; `claudeBin` in the config overrides it.

Useful dev modes:

- `ZERO_FIXTURES=1` canned data, no store or agents touched
- `ZERO_FIXTURES=empty` inbox zero (the reward browser)
- `ZERO_NO_SUPERVISOR=1` never spawn sessions
- `ZERO_SCREENSHOT=/tmp/x.png` capture the window and quit (add `ZERO_FOCUS=1`
  to open the first item)

Fixture worlds are also reachable straight off the url, which is how the
`scripts/shot-*.mjs` family photographs them (`?fixtures`, `?fixtures=empty`,
`?fixtures=crowded`, `?fixtures=mock`, plus `?rest=off`, `?shelf=on`,
`?working=3`). `?engines=` picks which coding agents the fixture Mac has:

- (nothing) one coding agent, the picker shut, which is every Mac today
- `?engines=missing` the gate open and Codex not found: still one agent, so
  still no picker, just the connection card saying so
- `?engines=claude` two agents, workspace still on Claude Code
- `?engines=codex` two agents, workspace moved to Codex

## Config

`zero.config.json` in the repo root, gitignored and machine-specific. Defaults
live in `main/config.mjs`, and every one of them works unset. The ones that
matter:

- `storeRoot`: where the store lives. Defaults to `~/agentbox`.
- `accountId`: which account folder inside it. Left unset, a fresh id is
  minted on first run and written back here.
- `claudeBin`: the brain. Sessions run headless on your subscription.
- `maxConcurrentSessions`: the cap; the queue absorbs the rest.
- `sessionArgs`: what spawned sessions may do. **The default grants only the
  store MCP tools**: workers can read the store, file questions, update work
  items, and nothing else. The store server ships with the app in `mcp/`. To
  let workers edit code and run commands, opt in explicitly:

  ```json
  { "sessionArgs": ["--allowedTools", "mcp__agentbox", "--permission-mode", "acceptEdits"] }
  ```

  That grant is yours to make deliberately. The app never escalates it.

- `personalProducts`: workspaces that are your own tasks rather than a
  product (e.g. `["personal"]`). Sessions there get your message and nothing
  else: no worker brief, no store tools. The reply lands back on the item in
  your inbox, and replying resumes the same session, like a thread. The drive
  never self-starts a personal workspace.
- `personalSessionArgs`: what personal sessions may do. The default allows
  edits in the workspace plus Bash, since "write me a script and run it"
  needs hands.
- `posthogKey`: unset, and nothing is sent anywhere without it. A build made
  from this repo has no key baked in, so a fork is silent by default. Set
  `diagnostics: false` to turn it off even where a key exists.

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

## Shape

- `main/` Electron main process: config, the store
  (`main/store/work-items.mjs` is the single write path), the supervisor that
  spawns one headless session per work item, and IPC.
- `mcp/` the store MCP server handed to those sessions.
- `renderer/` the inbox: list, focus mode, rail, compose, palette, browser.
- `briefs/` the judgment: worker and dispatcher prompts. Edit these, not the
  code, to change how agents behave.
- `tests/` the suite. It is large and it is the documentation of record for
  how any of this is meant to behave.

## Keys

Arrows move · Enter opens · 1/2/3 pick an option · E approves the
recommendation (or marks done) · R replies · S snoozes · C composes ·
Tab cycles views · ⌘K palette · Z undoes.

## Naming

The app is named in exactly one place, `shared/product-name.mjs`. Change the
name there and run `node scripts/product-name.mjs --write`; everything else
follows. The `zero` and `ZERO_` prefixes through the code are the name it had
first and are load-bearing in places, so they are left alone.
