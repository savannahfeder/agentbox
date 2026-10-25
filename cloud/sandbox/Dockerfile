# THE CLOUD SANDBOX: one AgentCore microVM, one run (docs/cloud/PLAN.md).
#
# arm64, because AgentCore runs nothing else. Built in AWS CodeBuild by
# scripts/cloud-setup.mjs, so no Mac ever needs Docker for it.
#
# Claude Code is pinned to the version the Mac runs (the build passes it), so a
# transcript written in the cloud resumes on the Mac and the other way round.
FROM public.ecr.aws/docker/library/node:22-bookworm-slim

ARG CLAUDE_CODE_VERSION
ARG CODEX_VERSION
RUN test -n "$CLAUDE_CODE_VERSION" && test -n "$CODEX_VERSION"

# git for the bundle, tar for the transcripts, what `npm ci` needs to build
# native modules in a project's own dependencies, bubblewrap, which Codex's
# own command sandbox runs on, and bsdutils for `script`, the terminal
# `claude setup-token` needs to sign an account in (server.mjs).
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates tar gzip python3 python3-pip make g++ openssh-client procps bubblewrap bsdutils curl wget unzip xz-utils \
 && rm -rf /var/lib/apt/lists/*

RUN npm install -g "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}" "@openai/codex@${CODEX_VERSION}" && npm cache clean --force

# A BROWSER, so an agent can draw a page and photograph it as one on the Mac
# does. Without it a design thread spent its first minutes fetching Chromium's
# libraries by hand (2026-10-15). Playwright's Chromium, the libraries and
# fonts it needs, readable by the agent, and the library found from any folder.
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright NODE_PATH=/usr/local/lib/node_modules
RUN npm install -g playwright@1 \
 && playwright install --with-deps chromium \
 && chmod -R a+rX /opt/ms-playwright \
 && rm -rf /var/lib/apt/lists/* && npm cache clean --force

# The server runs as root: a run happens at the SAME absolute paths it has on
# the user's machine (/Users/<name>/..., /home/<name>/..., and the Mac's own
# temp folder for the per-run settings), which only root can create. The agent
# itself runs as `agent`, owning only its task folder and its account folder
# (cloud/sandbox/server.mjs, `runAs`).
# The machine is the agent's for one run and then thrown away, so it may
# install what its work needs (`sudo apt-get install`), and a project's
# `.agentbox/cloud-setup.sh` can, rather than every program being baked in
# here. AgentCore's no_new_privs stops a real sudo, so `sudo` is
# cloud/sandbox/sudo.mjs, which hands the command to the server (root). pip
# installs without asking which environment.
RUN useradd --create-home --home-dir /opt/agent --shell /bin/bash agent \
 && printf '[global]\nbreak-system-packages = true\n' > /etc/pip.conf \
 && mkdir -p /var/lib/agentbox

COPY server.mjs mcp-stub.mjs usage.mjs sudo.mjs /opt/agentbox/
RUN chmod 755 /opt/agentbox/sudo.mjs && ln -s /opt/agentbox/sudo.mjs /usr/local/bin/sudo

ENV AGENTBOX_RUN_AS=agent
EXPOSE 8080
CMD ["node", "/opt/agentbox/server.mjs"]
