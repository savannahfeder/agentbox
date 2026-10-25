# How other people's machines break Agentbox: the map

Most bugs that reached people were not in the app's logic. They were in the
distance between this Mac and theirs: how they installed Claude Code and
Codex, what their shell profile does, how their git is set up, what network
they sit behind. This file is the list of those differences, so a test can be
written before the bug report instead of after it.

Built 2026-10-15 (w-6d8c543a43) from both histories (about 2,050 commits): about
120 product fixes depended on somebody's setup. Each line below says where it
stands. When a bug report turns out to be about a setup, add its row here and
its shape to `scripts/machines.mjs` or `scripts/setups.mjs` before fixing it.

## Where past setup bugs came from

| kind of difference | past fixes |
|---|---|
| logins, accounts and billing | 34 |
| operating system (Intel, privacy prompts, translocation) | 26 |
| how the tool was installed and found | 16 |
| git config and repository shape | 9 |
| file paths (symlinks, spaces, permissions) | 9 |
| machine resources | 6 |
| tool versions | 6 |
| shell startup files | 5 |
| network | 5 |
| Claude Code and Codex settings | 4 |

## The risks, and what covers each

Status: **fixed** (reproduced, fixed, test added), **covered** (a check runs it
and it holds), **known** (reproduced, not fixed, the check prints KNOWN),
**open** (not reproduced yet).

### Logins and billing
| risk | status | where |
|---|---|---|
| API key in `~/.claude/settings.json`, a project's `.claude/settings.json`, or `apiKeyHelper` bills the key | fixed | setups `api-key-in-settings`, `api-key-in-project`; `tests/a-key-in-someones-claude-settings-never-bills-a-worker` |
| `CLAUDE_CONFIG_DIR` exported in `.zshrc` (even `=~/.claude`, which is a different keychain entry) | fixed | setup `config-dir-from-zshrc`; `tests/a-login-moved-in-the-shell-profile-is-the-one-workers-use` |
| `CODEX_HOME` exported in `.zshrc` | fixed | same test; setup `codex-home-from-zshrc` |
| Codex signed in with an API key (`auth_mode: apikey`) billed the key | fixed | setup `codex-api-key-login`; `tests/a-codex-signed-in-with-an-api-key-is-refused-rather-than-billed` |
| `CLAUDE_CODE_OAUTH_TOKEN` (from `claude setup-token`) in `.zshrc` | open | measured: scrubbed, so workers read signed out. Proposal: read it from the shell for the default login only |
| Bedrock or Vertex in a person's settings `env` | open, by choice | workers bill that cloud account, like a gateway the person chose |
| A plan or setting without auto mode | open | Claude Code silently falls back to `default` (measured, 2.1.301 with `disableAutoMode`), so every edit becomes an approval card with no reason given. The first stream event's `permissionMode` says so |

### How the tool was installed, and which version
| risk | status | where |
|---|---|---|
| Installer, Homebrew, npm under nvm (lazy too), Intel, desktop-app copies, mid-upgrade | covered | `machines` layer |
| Claude Code older than 2.1.71 (no `--permission-mode auto`) | fixed | `tests/a-claude-code-too-old-for-the-worker-line-says-to-update-it` |
| Codex older than the app-server protocol the app speaks | open | no version check |

### Shell
| risk | status | where |
|---|---|---|
| bash, noisy or slow profiles, space in home | covered | `machines` |
| `.zshrc` that execs tmux or fish; profile slower than 5 s | fixed | shapes `tmux-autostart-*`, `exec-fish-in-zshrc`, `slow-zshrc-homebrew-in-zprofile` |
| proxy or company certificate only in the shell profile | fixed | shape `company-proxy-in-zshrc`; `tests/a-proxy-and-certificate-set-in-the-shell-profile-reach-every-worker` |
| no LANG in a Dock launch | fixed | shape `dock-launch-has-no-language` |
| Linux launcher start (nvm in `.bashrc`) | fixed | shape `linux-launcher-nvm-in-bashrc` |
| fish and nushell as the login shell | open | never run for real; nushell's literal `$PATH` is now refused |
| Linux `.bash_profile` that does not source `.bashrc` | open | |

### Git
| risk | status | where |
|---|---|---|
| commit signing (gpg, ssh, 1Password) hung every park | fixed | `tests/a-repository-that-signs-its-commits-…` |
| `user.useConfigOnly` with no identity | fixed | `tests/a-task-folder-is-put-away-when-git-does-not-know-who-you-are` |
| no Command Line Tools; git missing | fixed | `tests/a-computer-where-git-cannot-run-says-how-to-fix-it` |
| dubious ownership (external drive, another account) | fixed | same test |
| post-checkout hook that exits 1 (git-lfs missing, husky) | fixed | `tests/a-task-folder-is-made-when-the-repository-has-a-failing-post-checkout-hook` |
| submodules filled in by an agent | fixed | `tests/a-task-folder-holding-a-submodule-is-still-put-away` |
| default branch not main or master, or a feature branch checked out | open, a decision | tasks branch from whatever is checked out; deliberate today |
| project reached through a symlink | open | |
| iCloud Desktop and Documents with Optimize Storage | open | hard to fake; manual |

### Claude Code and Codex settings
| risk | status | where |
|---|---|---|
| own hooks, broken hooks, own MCP servers (one named `agentbox`), plan mode, strict permissions, heavy instructions, two logins | covered | `setups` layer |
| company-managed settings (`managed-settings.json`: managed-only permissions, allowed MCP servers, managed-only hooks) | open | needs a machine where that file can be written |
| plugins with hooks and MCP servers | open | |
| Codex: own model, approval policy, sandbox, notify, broken MCP server, one named `agentbox`, long AGENTS.md | covered | setup `codex-own-config` |
| Codex config.toml it cannot read, or a legacy `profile` line 0.160 refuses: a stop with no reason | fixed | setups `codex-invalid-config`, `codex-legacy-profile`; `tests/a-codex-config-it-cannot-read-says-which-file` |
| Codex with a `model_provider` of the person's own | open | no stand-in for it |

### Operating system
| risk | status | where |
|---|---|---|
| Linux Codex sandbox unavailable (Ubuntu 24.04 user namespaces, WSL, containers) | open | needs a Linux machine |
| Linux machines in the `machines` layer | partly | `linux-launcher-nvm-in-bashrc` only |
