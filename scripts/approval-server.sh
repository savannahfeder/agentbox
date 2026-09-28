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
    exe="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$app/Info.plist" 2>/dev/null)"
    [ -x "$app/MacOS/$exe" ] || exe="$(ls "$app/MacOS" 2>/dev/null | head -1)"
    exec env ELECTRON_RUN_AS_NODE=1 "$app/MacOS/$exe" "$res/app.asar/main/approval-prompt-server.mjs"
    ;;
  *)
    # Running from source: node is nvm-only on this machine, and MCP servers
    # boot from a bare login shell, so resolve it the same way the store
    # launcher does.
    export PATH="$HOME/.nvm/versions/node/$(ls "$HOME/.nvm/versions/node" 2>/dev/null | tail -1)/bin:$PATH"
    exec node "$(cd "$here/.." && pwd)/main/approval-prompt-server.mjs"
    ;;
esac
