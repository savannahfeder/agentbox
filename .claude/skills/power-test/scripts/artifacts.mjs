// Threads whose answers carry files: a table, a picture, a page and a
// document. Stand-in agents answer in words only, so without these a tester
// never opens a file beside a thread.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

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

/** A one-page PDF with a heading and two lines, written by hand so no tool is needed. */
export function onePagePdf(lines) {
  const text = lines.map((l, i) => `BT /F1 ${i ? 14 : 24} Tf 72 ${720 - i * 32} Td (${l.replace(/[()\\]/g, '\\$&')}) Tj ET`).join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(text, 'latin1')} >>\nstream\n${text}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const at = objects.map((o, i) => { const here = Buffer.byteLength(out, 'latin1'); out += `${i + 1} 0 obj\n${o}\nendobj\n`; return here; });
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${at.map((n) => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

/** A five-second test film, or null where ffmpeg is not installed. */
export function makeFilm(out) {
  const made = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=24:duration=5', '-pix_fmt', 'yuv420p', out], { timeout: 60_000 });
  return made.status === 0 && fs.existsSync(out) ? out : null;
}

/**
 * Writes the files under the project's documents and returns the ledger lines
 * for one open thread per file, each answered within the last few hours. The
 * picture thread gets `picture2` as its v2 on a later answer.
 */
export function seedArtifacts({ accountRoot, slug, picture, picture2 = null, film = null, now = Date.now() }) {
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
      say: '**Use this screenshot in the post?**\n\nIt is the inbox at full width in dark mode.\n\ndesigns/DESIGN_ID/inbox.png\n\n## Options\n1. Use it (recommended)\n2. Take another with more threads',
      ...(picture2 ? { next: { file: 'designs/DESIGN_ID/inbox-v2.png', copyFrom: picture2,
        say: '**Is this one better for the post?**\n\nI took it again with the palette open, as you asked.\n\ndesigns/DESIGN_ID/inbox-v2.png\n\n## Options\n1. Use v2 (recommended)\n2. Go back to v1' } } : {}) }] : []),
    { title: 'Summarise the quarter for the board', file: 'reports/q3-summary.pdf', bytes: onePagePdf(['Q3 summary', 'Revenue grew 18% on the quarter.', 'Two hires, one in sales and one in support.']),
      say: '**Send this summary to the board as it is?**\n\nOne page: revenue, hires, and what is next.\n\nreports/q3-summary.pdf\n\n## Options\n1. Send it (recommended)\n2. Add a page on churn' },
    ...(film ? [{ title: 'Cut the demo film for the launch', file: 'designs/DESIGN_ID/demo.mp4', copyFrom: film,
      say: '**Is five seconds long enough for the demo?**\n\nIt is the short cut, with no sound.\n\ndesigns/DESIGN_ID/demo.mp4\n\n## Options\n1. Keep it short (recommended)\n2. Make a thirty second cut' }] : []),
  ];
  const lines = [];
  threads.forEach((t, i) => {
    const tid = id();
    const file = t.file.replace('DESIGN_ID', tid);
    const at = now - (i + 1) * 47 * MIN;
    const put = (f, from) => {
      fs.mkdirSync(path.dirname(path.join(docs, f)), { recursive: true });
      if (from.copyFrom) fs.copyFileSync(from.copyFrom, path.join(docs, f));
      else fs.writeFileSync(path.join(docs, f), from.bytes ?? from.body);
    };
    put(file, t);
    lines.push({ id: tid, ts: at, source: 'system', patch: { title: t.title, status: 'open', kind: 'directive', priority: 5, labels: ['founder'] } });
    lines.push({ id: tid, ts: at + 3, source: 'founder', patch: { title: t.title, model: 'opus' } });
    lines.push({ id: tid, ts: at + 9 * MIN, source: 'agent', patch: { result: t.say.replace('DESIGN_ID', tid) } });
    if (t.next) {
      put(t.next.file.replace('DESIGN_ID', tid), t.next);
      lines.push({ id: tid, ts: at + 20 * MIN, source: 'agent', patch: { result: t.next.say.replace(/DESIGN_ID/g, tid) } });
    }
  });
  return lines;
}
