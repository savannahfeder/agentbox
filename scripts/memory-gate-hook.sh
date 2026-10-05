#!/bin/sh
# ASK AGENTBOX WHETHER MEMORY ALLOWS THIS COMMAND, BEFORE IT RUNS (w-3958c3753d).
#
# Claude Code runs this as a PreToolUse hook on every Bash call of a worker
# Agentbox started ("pre"), and again after it ("post"). The answer comes from
# main/memory-gate-server.mjs over a local socket and is printed as it arrives:
# nothing at all means "carry on as normal", and a deny is JSON Claude Code
# reads. While the Mac is short of memory the answer simply arrives later.
#
# IT FAILS OPEN, FAST, ON PURPOSE. Measured on Claude Code 2.1.289: a hook that
# times out, crashes or prints garbage lets the command run anyway, so there is
# no strict fail-closed to be had. What this script promises instead is that it
# never hangs an agent: no socket means run now; a socket nobody answers on
# (the app crashed) is retried a few times in case another Agentbox takes over,
# then run now; and every wait ends inside the hook's own time limit.
#
# curl and not nc: macOS nc quits before a slow answer arrives. curl ships on
# every Mac, waits, and costs about 9 ms per check.

mode="$1"
sock="${AGENTBOX_GATE_SOCK:-}"
[ -n "$sock" ] && [ -S "$sock" ] || exit 0

input=$(cat)
[ -n "$input" ] || input=null

# Only what is safe to paste into JSON gets through from the environment.
clean() { printf '%s' "$1" | tr -cd 'A-Za-z0-9._-'; }
item=$(clean "${AGENTBOX_GATE_ITEM:-}")
product=$(clean "${AGENTBOX_GATE_PRODUCT:-}")
score="${AGENTBOX_GATE_SCORE:-0}"
case "$score" in ''|*[!0-9]*) score=0 ;; esac

body=$(printf '{"v":1,"event":"%s","item":"%s","product":"%s","score":%s,"ppid":%s,"hook":%s}' \
  "$mode" "$item" "$product" "$score" "$PPID" "$input")

if [ "$mode" != pre ]; then
  printf '%s' "$body" | curl -s --unix-socket "$sock" --max-time 5 --data-binary @- "http://agentbox/$mode" >/dev/null 2>&1
  exit 0
fi

# curl runs as a child we can stop: if Claude Code stops this hook while it
# waits, curl goes with it, the connection closes, and the app forgets the
# request instead of holding its place in line. curl prints the answer itself.
pid=
trap '[ -n "$pid" ] && kill "$pid" 2>/dev/null; exit 0' TERM INT HUP
tries=0
while :; do
  printf '%s' "$body" | curl -s -f --unix-socket "$sock" --max-time "${AGENTBOX_GATE_MAX_S:-1700}" --data-binary @- http://agentbox/pre &
  pid=$!
  wait "$pid"
  code=$?
  pid=
  [ "$code" -eq 0 ] && exit 0
  tries=$((tries + 1))
  [ "$tries" -ge 5 ] && exit 0
  [ -S "$sock" ] || exit 0
  sleep "${AGENTBOX_GATE_RETRY_S:-1}"
done
