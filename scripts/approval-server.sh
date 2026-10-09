#!/bin/bash
# Launcher for the approvals MCP server.
#
# TWO WORLDS, AND THE PACKAGED ONE WAS BROKEN UNTIL 2026-08-21. Inside a bundle
# this file is the copy electron-builder's `asarUnpack` leaves in
# `app.asar.unpacked/scripts`, because macOS cannot exec a path inside the
# archive. The old line then walked one directory up and asked for
# `app.asar.unpacked/main/approval-prompt-server.mjs`, which has never existed:
# only `scripts/` and `worker-permissions.json` are unpacked, never `main/`.
# node threw MODULE_NOT_FOUND, the MCP server never came up, and the Claude CLI
# refuses to start a session at all when the tool named by
# --permission-prompt-tool is missing. Every agent in every packaged Agentbox died
# in about four seconds. Measured on the walk she was testing, 08-21.
#
# Agentbox's own binary IS Electron, and Electron reads straight out of app.asar,
# so the packaged branch runs the server with that instead of node. It needs no
# node on the machine, which also fixes the second half of the old line: the
# nvm path below only exists on a Mac that installed node that way.
#
# AND IT NO LONGER SPELLS THE APP'S NAME. This line said `MacOS/Astral`, and
# electron-builder names the bundle's executable after `productName`, so the
# path stopped resolving the moment the app was renamed. A shell script cannot
# import shared/product-name.mjs, so it asks the bundle it is standing inside:
# CFBundleExecutable is exactly that name, whatever it is today. The fallback is
# the one file in MacOS/, because a bundle has exactly one and a Mac without
# PlistBuddy should still start her agents.
here="$(cd "$(dirname "$0")" && pwd)"
case "$here" in
  *app.asar.unpacked/scripts)
    res="$(cd "$here/../.." && pwd)"
    app="$(cd "$res/.." && pwd)"
    exe="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$app/Info.plist" 2>/dev/null || true)"
    # A missing PlistBuddy leaves exe empty, and `[ -x dir/ ]` is true because
    # a directory is executable. Require a regular file, then the one binary
    # sitting in MacOS/.
    if [ ! -f "$app/MacOS/$exe" ] || [ ! -x "$app/MacOS/$exe" ]; then
      exe="$(ls "$app/MacOS" 2>/dev/null | head -1)"
    fi
    exec env ELECTRON_RUN_AS_NODE=1 "$app/MacOS/$exe" "$res/app.asar/main/approval-prompt-server.mjs"
    ;;
  *)
    # RUNNING FROM SOURCE, AND THIS LINE USED TO ASSUME NVM. It prepended
    # $HOME/.nvm/versions/node/<newest>/bin and exec'd node. On a Mac that
    # installed node by Homebrew, Volta, asdf or not at all, that folder is
    # absent, PATH is untouched, and an MCP server booting from a bare login
    # shell has no node on it: the exec failed and every agent died the same
    # four-second death described at the top of this file. Reported from
    # source on 2026-10-07 (issue 21).
    #
    # So the app hands its own binary down in ZERO_APPROVALS_RUNTIME, and
    # ELECTRON_RUN_AS_NODE=1 makes that binary a node, exactly as the packaged
    # branch above does. Nothing on the machine is needed.
    server="$(cd "$here/.." && pwd)/main/approval-prompt-server.mjs"
    if [ -f "$ZERO_APPROVALS_RUNTIME" ] && [ -x "$ZERO_APPROVALS_RUNTIME" ]; then
      exec env ELECTRON_RUN_AS_NODE=1 "$ZERO_APPROVALS_RUNTIME" "$server"
    fi
    # Nobody handed one down, so this is somebody running the script by hand.
    # A node already on PATH wins; nvm's newest is the last resort, for the
    # bare login shell that has never sourced nvm.
    if ! command -v node >/dev/null 2>&1; then
      nvm="$HOME/.nvm/versions/node"
      newest="$(ls "$nvm" 2>/dev/null | tail -1)"
      [ -n "$newest" ] && export PATH="$nvm/$newest/bin:$PATH"
    fi
    exec node "$server"
    ;;
esac
