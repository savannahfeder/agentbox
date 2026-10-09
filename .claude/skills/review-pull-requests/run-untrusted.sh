#!/bin/sh
# RUN A STRANGER'S CODE WITHOUT THE NETWORK OR THE HOME FOLDER (w-bde446f1aa).
#
#   run-untrusted.sh <folder> -- <command> [args...]
#
# What a pull request review runs its tests through. The command runs in
# <folder> under macOS's own sandbox (sandbox-exec), with:
#   - no connection out of the machine (localhost still works, for test servers),
#     and no local sockets either, so not the ssh agent's;
#   - nothing in the home folder readable or writable except <folder> itself,
#     the Node install that runs it, and any node_modules <folder> links to;
#   - an empty environment apart from PATH, a throwaway HOME, TMPDIR and LANG,
#     so no token rides along.
# The command's exit code is passed back. It refuses rather than runs when the
# sandbox is missing, because running unsandboxed is the thing it exists to stop.
#
# AGENTBOX_SANDBOX_HOME replaces the home folder for the tests only.

set -u

usage() { echo "usage: run-untrusted.sh <folder> -- <command> [args...]" >&2; exit 2; }
[ $# -ge 3 ] || usage
folder=$1; shift
[ "$1" = "--" ] || usage
shift

[ -x /usr/bin/sandbox-exec ] || { echo "run-untrusted: this Mac has no sandbox-exec, so nothing was run" >&2; exit 2; }
[ -d "$folder" ] || { echo "run-untrusted: no such folder: $folder" >&2; exit 2; }
folder=$(cd "$folder" && pwd -P)
home=$(cd "${AGENTBOX_SANDBOX_HOME:-$HOME}" && pwd -P)

# The folder is what gets opened up, so it must be a folder of its own.
case "$home/" in
  "$folder"/*) echo "run-untrusted: $folder holds the home folder, so it cannot be the folder" >&2; exit 2 ;;
esac
case "$folder$home" in
  *'"'*|*'\'*) echo "run-untrusted: a quote or backslash in a path" >&2; exit 2 ;;
esac

# What else it may read: the Node that runs it, and the dependencies it links to.
reads="$folder"
node_bin=$(command -v node 2>/dev/null || true)
if [ -n "$node_bin" ]; then
  reads="$reads
$(dirname "$(dirname "$(realpath "$node_bin")")")"
fi
for nm in "$folder"/node_modules "$folder"/*/node_modules; do
  [ -L "$nm" ] && reads="$reads
$(realpath "$nm")"
done

profile=$(mktemp "${TMPDIR:-/tmp}/run-untrusted-XXXXXX")
scratch_home=$(mktemp -d "${TMPDIR:-/tmp}/run-untrusted-home-XXXXXX")
trap 'rm -rf "$profile" "$scratch_home"' EXIT

{
  echo '(version 1)'
  echo '(allow default)'
  echo '(deny network-outbound)'
  echo '(allow network-outbound (remote ip "localhost:*"))'
  echo "(deny file-read* (subpath \"$home\"))"
  echo "(deny file-write* (subpath \"$home\"))"
  echo '(allow file-read-metadata)'
  printf '%s\n' "$reads" | while IFS= read -r dir; do
    case "$dir" in *'"'*|*'\'*|'') continue ;; esac
    echo "(allow file-read* (subpath \"$dir\"))"
  done
  echo "(allow file-write* (subpath \"$folder\"))"
} > "$profile"

cd "$folder" || exit 2
/usr/bin/sandbox-exec -f "$profile" /usr/bin/env -i \
  PATH="$PATH" HOME="$scratch_home" TMPDIR="${TMPDIR:-/tmp}" LANG="${LANG:-en_US.UTF-8}" TERM=dumb CI=1 \
  "$@"
