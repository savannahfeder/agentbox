#!/bin/sh
#   browser-watch.sh <browser pid> <browser start> <profile> <owner pid> <owner start> <activity file> <idle s> <every s>
#
# Ends a detached test browser when the run that owns it is gone, or, with no
# owner, when its activity file has not changed for <idle s>. A start is `ps -o
# lstart=` as read at launch, so a reused pid is never taken for the browser or
# its owner. Started by launchChrome (cdp.mjs); a few MB, where a Node watcher
# would be about 35.

bpid=$1 bstart=$2 profile=$3 opid=$4 ostart=$5 activity=$6 idle=${7:-3600} every=${8:-30}
began=$(date +%s)

startOf() { ps -o lstart= -p "$1" 2>/dev/null | sed 's/^ *//; s/ *$//'; }
isBrowser() {
  [ "$(startOf "$bpid")" = "$bstart" ] || return 1
  ps -o command= -p "$bpid" 2>/dev/null | grep -qF -- "--user-data-dir=$profile"
}
# GNU first: GNU `stat -f` means file-system status and prints a page of it, not the time.
mtime() { stat -c %Y "$1" 2>/dev/null || stat -f %m "$1" 2>/dev/null; }

while :; do
  isBrowser || exit 0
  if [ -n "$opid" ]; then
    [ "$(startOf "$opid")" = "$ostart" ] || break
  elif [ -n "$activity" ]; then
    last=$(mtime "$activity"); [ -n "$last" ] || last=$began
    [ $(( $(date +%s) - last )) -ge "$idle" ] && break
  fi
  sleep "$every"
done

isBrowser || exit 0
kill -TERM "$bpid" 2>/dev/null
i=0
while [ $i -lt 10 ] && isBrowser; do sleep 1; i=$((i + 1)); done
isBrowser && kill -KILL "$bpid" 2>/dev/null
exit 0
