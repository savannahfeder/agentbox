#!/bin/sh
# Launcher for this app's own store server.
#
# It exists because node is installed through nvm on this machine and is NOT on
# a login shell's PATH, so an MCP client spawning `node mcp/stdio.mjs` gets
# "command not found" and reports the server as failed with nothing useful in
# it. Hard-coding the current nvm path would work until the next node upgrade
# silently moved it, so resolve it at launch instead.
#
# STDOUT IS THE JSON-RPC STREAM. Anything nvm prints on the way in would be
# parsed as protocol and corrupt the session, hence the redirects: every setup
# step here sends its output to stderr or /dev/null, and the only thing that
# ever writes to stdout is the server itself.

if ! command -v node >/dev/null 2>&1; then
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  # shellcheck disable=SC1091
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null 2>&1
fi

if ! command -v node >/dev/null 2>&1; then
  # Last resort: the newest version nvm has on disk, without sourcing anything.
  for bin in "$HOME"/.nvm/versions/node/*/bin; do
    [ -x "$bin/node" ] && PATH="$bin:$PATH"
  done
  export PATH
fi

if ! command -v node >/dev/null 2>&1; then
  echo "[store] cannot find node (looked on PATH and in $HOME/.nvm)" >&2
  exit 1
fi

exec node "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/stdio.mjs" "$@"
