export const COMMIT_IDENTITY_CHECK = 'git -c user.useConfigOnly=true var GIT_AUTHOR_IDENT && git -c user.useConfigOnly=true var GIT_COMMITTER_IDENT';

export function withWorkerGitBrief(prompt: string, repoPath?: string | null, engine?: string | null): string {
  const guidance = workerGitBrief(repoPath, engine);
  return guidance && !prompt.includes(guidance) ? `${prompt}\n\n${guidance}` : prompt;
}

// Codex keeps a worktree's Git data read-only on purpose, so a commit only
// goes through when the agent asks to step outside. Agents that did not ask
// parked their threads on the error instead.
const CODEX_COMMIT = `
Your sandbox cannot write this task's Git data, so a plain \`git add\` or \`git commit\` fails with "Read-only file system" on an index.lock. Run the staging-and-commit command with \`sandbox_permissions: "require_escalated"\` and a one-line justification from the first try; the review allows it. That error is not a cause to wait on: never call wait_on_cause, park this thread or open another one over it.
`;

export function workerGitBrief(repoPath?: string | null, engine?: string | null): string {
  if (!repoPath) return '';
  return commitBrief() + (engine === 'codex' ? CODEX_COMMIT : '');
}

function commitBrief(): string {
  return `# Committing this task

Before staging or requesting permission to commit, run this read-only identity check in the task folder.
\`${COMMIT_IDENTITY_CHECK}\`
If either check fails, finish the edit and tests, then ask which name and email to use in this thread. Tell them the change is not committed yet. Do not request commit approval until they supply the missing identity.
Never invent an author or copy an author from git history. Do not add user.name or user.email overrides when Git already has an identity. Only use an override if the person explicitly supplied it for this commit, and include each setting once.
If they supply a name and email because Git has none, set them for this repository with git config in that same command, so a later task does not have to ask again.
After tests pass and identity is confirmed, combine staging the named changed files, committing, and checking status in one command and one approval request. Name the commit and author in that request. Do not launch concurrent or duplicate requests for these steps. A denied request stays denied; do not rephrase it to ask again.
In what you write for a person, answers and options included, name a branch by its thread's title, never by its agentbox/w-… name, and give commit hashes only if they ask for them.
`;
}
