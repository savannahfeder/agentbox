#!/bin/sh
# The skills, their tests and the plans: a private repository (.agentbox/private.json),
# cloned on a cloud machine with GH_TOKEN. The token is read from the environment
# each time and never written down. The cloud setup runs this, and so does an
# agent that finds .claude/skills missing, as the setup may not be given the token.
cd "$(dirname "$0")/.." || exit 1
[ -d .claude/skills/.git ] && exit 0
[ -n "$GH_TOKEN" ] || { echo "private folder: no GH_TOKEN, so .claude/skills was not cloned"; exit 0; }
helper='!f() { echo username=x-access-token; echo "password=$GH_TOKEN"; }; f'
GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=credential.helper GIT_CONFIG_VALUE_0="$helper" \
  node -e "import('./main/private-folder.mts').then((m) => console.log('private folder:', JSON.stringify(m.bringPrivateFolder(process.cwd(), { every: 0 }))))"
[ -d .claude/skills/.git ] && git -C .claude/skills config credential.helper "$helper"
exit 0
