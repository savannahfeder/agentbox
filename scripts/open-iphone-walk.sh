#!/bin/bash
# Opens an iPhone walk's sealed screens (.github/workflows/iphone-walk.yml)
# into a folder, with the private key only this Mac holds.
#   scripts/open-iphone-walk.sh <run id> <folder>
set -euo pipefail
run=$1; out=$2
key=${IPHONE_WALK_KEY:-$HOME/.agentbox/app-review/iphone-walk-key.pem}
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
gh run download "$run" --repo savannahfeder/agentbox -n iphone-walk -D "$tmp"
pass=$(openssl pkeyutl -decrypt -inkey "$key" -pkeyopt rsa_padding_mode:oaep -in "$tmp/key.enc")
mkdir -p "$out"
openssl enc -d -aes-256-cbc -pbkdf2 -pass "pass:$pass" -in "$tmp/walk.tgz.enc" | tar -xzf - -C "$out"
ls "$out/walk"
