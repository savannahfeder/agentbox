#!/bin/sh
# Every Playwright Chromium launch on the cloud machine runs this (Dockerfile).
# Playwright's bundled build trails Chrome's security fixes and Playwright
# starts it with --no-sandbox; Debian's build is kept patched by
# bookworm-security, and the sandbox works on AgentCore.
for arg in "$@"; do
  shift
  [ "$arg" = "--no-sandbox" ] || set -- "$@" "$arg"
done
exec /usr/lib/chromium/chromium "$@"
