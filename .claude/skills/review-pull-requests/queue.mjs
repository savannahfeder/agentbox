// WHICH PULL REQUESTS NEED A REVIEW NOW, and the brief for each.
//
//   node .claude/skills/review-pull-requests/queue.mjs [--product agentbox-team]
//
// Prints JSON: { repo, todo: [...] }. Each entry names a brief file (the
// instructions for one review agent, filled in) and a facts file (what
// file.mjs needs to file the finished review). An empty `todo` means nothing
// new since the last pass. Reads GitHub and the inbox; writes nothing to either.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PULL_REQUEST_LABEL, mayRunHere, mayRunOnGitHub, reviewBrief, scanPullRequest, whatNeedsReview } from './scan.mjs';
import { DEFAULT_PRODUCT, SANDBOX, argOf, gh, inbox, repoOf, repoRoot } from './lib.mjs';

const FIELDS = 'number,title,author,headRefOid,isDraft,url,isCrossRepository,additions,deletions,changedFiles';

const product = argOf(process.argv, '--product', DEFAULT_PRODUCT);
const repo = repoOf();
if (!repo) {
  console.log(JSON.stringify({ repo: null, todo: [], why: 'this checkout\'s origin is not on GitHub' }));
  process.exit(0);
}

let me = null;
try { me = gh(['api', 'user', '--jq', '.login']).trim() || null; } catch {}
const prs = JSON.parse(gh(['pr', 'list', '-R', repo, '--state', 'open', '--limit', '100', '--json', FIELDS]));
const { listWorkItems } = await inbox();
const rows = listWorkItems({ product, labels: [PULL_REQUEST_LABEL], includeDone: true });

const todo = [];
for (const { pr, previous } of whatNeedsReview({ prs, rows, me })) {
  const n = String(pr.number);
  let files = [];
  let diff = '';
  try { files = JSON.parse(gh(['pr', 'view', n, '-R', repo, '--json', 'files'])).files ?? []; } catch {}
  try { diff = gh(['pr', 'diff', n, '-R', repo]); } catch {}
  try { pr.association = gh(['api', `repos/${repo}/pulls/${n}`, '--jq', '.author_association']).trim() || null; } catch {}
  const login = pr.author?.login;
  if (login && !login.includes('/')) {
    try {
      const [created, repos] = gh(['api', `users/${login}`, '--jq', '.created_at, .public_repos']).trim().split('\n');
      if (created) pr.account = `opened ${created.slice(0, 10)}, ${repos ?? '?'} public repositories`;
    } catch {}
  }
  const flags = scanPullRequest({ files, diff });
  // Not being able to see it is not evidence there is nothing to see.
  if (!diff.trim()) flags.push({ flag: 'unreadable', why: 'its diff could not be fetched, so none of it has been read', files: [], holdsRun: true });

  const stem = path.join(os.tmpdir(), `pr-review-${n}-${pr.headRefOid.slice(0, 7)}`);
  fs.writeFileSync(`${stem}.md`, reviewBrief({ pr, repo, repoPath: repoRoot, sandbox: SANDBOX, flags, previous }));
  fs.writeFileSync(`${stem}.json`, JSON.stringify({ product, repo, pr, flags, previous }, null, 2));
  todo.push({
    number: pr.number,
    title: pr.title,
    author: login ?? null,
    head: pr.headRefOid,
    runsHere: mayRunHere(flags),
    githubMayRun: mayRunOnGitHub(flags),
    flags: flags.map((f) => f.flag),
    previous,
    brief: `${stem}.md`,
    facts: `${stem}.json`,
  });
}

console.log(JSON.stringify({ repo, product, todo }, null, 2));
