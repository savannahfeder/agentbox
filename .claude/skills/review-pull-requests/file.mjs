// FILE ONE FINISHED REVIEW INTO THE INBOX.
//
//   node .claude/skills/review-pull-requests/file.mjs <facts.json> <summary.md>
//
// <facts.json> is the one queue.mjs wrote; <summary.md> is the review agent's
// final reply. Refuses, and files nothing, when the pull request has new
// commits or is no longer open: a review only covers the commit it read, and
// the next pass reviews the new one. Files nothing twice for one commit.

import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { PULL_REQUEST_LABEL, reviewRow, whatNeedsReview } from './scan.mjs';
import { gh, inbox } from './lib.mjs';

/** The filing itself, given the store's functions and what GitHub says now. */
export function fileReview({ facts, summary, now: live, work }) {
  const { product, repo, pr, flags } = facts;
  if (live.state !== 'OPEN') return { filed: false, why: `pull request #${pr.number} is ${String(live.state).toLowerCase()} now` };
  if (live.headRefOid !== pr.headRefOid) return { filed: false, why: `pull request #${pr.number} has new commits since this review; the next pass reviews them` };
  if (!String(summary ?? '').trim()) return { filed: false, why: 'the review is empty' };
  const rows = work.listWorkItems({ product, labels: [PULL_REQUEST_LABEL], includeDone: true });
  const [still] = whatNeedsReview({ prs: [pr], rows });
  if (!still) return { filed: false, why: `pull request #${pr.number} at this commit is already in the inbox` };
  const item = work.createItem(product, reviewRow({ pr, repo, summary, flags, previous: still.previous }));
  return { filed: true, id: item.id, title: item.title };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [factsFile, summaryFile] = process.argv.slice(2);
  if (!factsFile || !summaryFile) {
    console.error('usage: file.mjs <facts.json> <summary.md>');
    process.exit(2);
  }
  const facts = JSON.parse(fs.readFileSync(factsFile, 'utf8'));
  const summary = fs.readFileSync(summaryFile, 'utf8');
  const live = JSON.parse(gh(['pr', 'view', String(facts.pr.number), '-R', facts.repo, '--json', 'state,headRefOid']));
  const out = fileReview({ facts, summary, now: live, work: await inbox() });
  console.log(JSON.stringify(out));
  process.exit(out.filed ? 0 : 3);
}
