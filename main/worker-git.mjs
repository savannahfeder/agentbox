export const COMMIT_IDENTITY_CHECK = 'git -c user.useConfigOnly=true var GIT_AUTHOR_IDENT && git -c user.useConfigOnly=true var GIT_COMMITTER_IDENT';

export function withWorkerGitBrief(prompt, repoPath) {
  const guidance = workerGitBrief(repoPath);
  return guidance && !prompt.includes(guidance) ? `${prompt}\n\n${guidance}` : prompt;
}

export function workerGitBrief(repoPath) {
  if (!repoPath) return '';
  return `# Committing this task

Before staging or requesting permission to commit, run this read-only identity check in the task folder.
\`${COMMIT_IDENTITY_CHECK}\`
If either check fails, finish the edit and tests, then ask which name and email to use in this thread. Tell them the change is not committed yet. Do not request commit approval until they supply the missing identity.
Never invent an author or copy an author from git history. Do not add user.name or user.email overrides when Git already has an identity. Only use an override if the person explicitly supplied it for this commit, and include each setting once.
If they supply a name and email because Git has none, set them for this repository with git config in that same command, so a later task does not have to ask again.
After tests pass and identity is confirmed, combine staging the named changed files, committing, and checking status in one command and one approval request. Name the commit and author in that request. Do not launch concurrent or duplicate requests for these steps. A denied request stays denied; do not rephrase it to ask again.
`;
}
