// Threads whose answers carry files: a table, a picture, a page and a
// document. Stand-in agents answer in words only, so without these a tester
// never opens a file beside a thread.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const MIN = 60_000;

const TABLE = [
  'Company,Category,Based in,Note,Status,Website',
  'Ramp,Spend,New York,Send the first email,Meeting,ramp.com',
  'Mercury,Banking,San Francisco,Find who runs finance,Replied,mercury.com',
  'Plaid,Payments,San Francisco,Check the pricing page,Contacted,plaid.com',
  'Brex,Spend,San Francisco,No contact yet,New,brex.com',
  'Modern Treasury,Payments,San Francisco,"Wants pricing first, then a call",Replied,moderntreasury.com',
  'Deel,Payroll,San Francisco,Intro through an investor,New,deel.com',
  'Gusto,Payroll,San Francisco,Opened the email once,Contacted,gusto.com',
  'Unit,Banking,New York,No contact yet,New,unit.co',
].join('\n') + '\n';

const DOC = `# Launch plan

We launch on a Tuesday, in the morning, with one post and one email.

## Before

- Finish the pricing page and have two customers read it.
- Record the demo on the real app, not a mockup.

## On the day

1. Post at 9.
2. Email the waiting list at 10.
3. Answer every reply by the evening.
`;

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>Pricing</title>
<style>body{font:16px system-ui;margin:0;background:#0f1012;color:#eee;display:flex;gap:24px;justify-content:center;padding:64px}
.p{background:#1a1b1e;border-radius:12px;padding:28px;width:220px}.p b{font-size:28px;display:block;margin:12px 0}</style></head>
<body><div class="p">Free<b>$0</b>One project</div><div class="p">Team<b>$20</b>Every project, a seat each</div></body></html>
`;

/**
 * Writes the files under the project's documents and returns the ledger lines
 * for one open thread per file, each answered within the last few hours.
 */
export function seedArtifacts({ accountRoot, slug, picture, now = Date.now() }) {
  const docs = path.join(accountRoot, slug);
  const id = () => `w-${crypto.randomBytes(5).toString('hex')}`;
  const threads = [
    { title: 'Find fintech companies to write to', file: 'leads/fintech-leads.csv', body: TABLE,
      say: '**Pick who I write to first, or tell me who to drop.**\n\nI put 8 fintech companies in a table with a note and a status for each. Two replied already. I would start with the ones marked New.\n\nleads/fintech-leads.csv\n\n## Options\n1. Write to the New ones first (recommended)\n2. Drop the payroll companies' },
    { title: 'Draft the launch plan', file: 'notes/launch-plan.md', body: DOC,
      say: '**Is a Tuesday morning launch right?**\n\nThe plan is one post and one email, with the pricing page read by two customers first.\n\nnotes/launch-plan.md\n\n## Options\n1. Tuesday it is (recommended)\n2. Move it to Thursday' },
    { title: 'Mock up the pricing page', file: 'designs/DESIGN_ID/pricing.html', body: PAGE,
      say: '**Two plans or three?**\n\nI drew the page with two plans, Free and Team.\n\ndesigns/DESIGN_ID/pricing.html\n\n## Options\n1. Keep two (recommended)\n2. Add a third for companies' },
    ...(picture ? [{ title: 'Screenshot the new inbox for the blog', file: 'designs/DESIGN_ID/inbox.png', copyFrom: picture,
      say: '**Use this screenshot in the post?**\n\nIt is the inbox at full width in dark mode.\n\ndesigns/DESIGN_ID/inbox.png\n\n## Options\n1. Use it (recommended)\n2. Take another with more threads' }] : []),
  ];
  const lines = [];
  threads.forEach((t, i) => {
    const tid = id();
    const file = t.file.replace('DESIGN_ID', tid);
    const at = now - (i + 1) * 47 * MIN;
    fs.mkdirSync(path.dirname(path.join(docs, file)), { recursive: true });
    if (t.copyFrom) fs.copyFileSync(t.copyFrom, path.join(docs, file));
    else fs.writeFileSync(path.join(docs, file), t.body);
    lines.push({ id: tid, ts: at, source: 'system', patch: { title: t.title, status: 'open', kind: 'directive', priority: 5, labels: ['founder'] } });
    lines.push({ id: tid, ts: at + 3, source: 'founder', patch: { title: t.title, model: 'opus' } });
    lines.push({ id: tid, ts: at + 9 * MIN, source: 'agent', patch: { result: t.say.replace('DESIGN_ID', tid) } });
  });
  return lines;
}
