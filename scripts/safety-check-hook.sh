#!/bin/sh
#   safety-check-hook.sh <denied|pre> <run folder> <runtime> [flags...] <main/safety-check-hook.mts>
#
# Runs on every tool call of a worker ("pre"), so with no refused call on
# record it answers here without starting a runtime. main/safety-check-hook.mts
# says what the hooks do.

mode="$1"
dir="$2"
shift 2
if [ "$mode" = pre ]; then
  pending=
  for f in "$dir"/refused/*; do [ -e "$f" ] && pending=1; break; done
  if [ -z "$pending" ]; then
    exec cat >/dev/null
  fi
fi
exec env ELECTRON_RUN_AS_NODE=1 "$@" "$mode" "$dir"
