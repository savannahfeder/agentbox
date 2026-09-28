// FOUR WAYS TO TURN ON ADHD MODE, drawn inside the real Instructions page
// (w-5737fe67cf). Proposals only: nothing here is in the app.
//
//   arch -arm64 node scripts/shot-w-5737fe67cf-adhd.mjs <dist> <outDir>
import fs from 'node:fs';
import path from 'node:path';
import { openInbox } from './lib/inbox-harness.mjs';

const [dist, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });

const RULES = [
  'The first line is the thing to do or answer, in bold.',
  'Steps are a numbered list of five or fewer, and the first one is small.',
  'No recap, no preamble, no closing offer.',
  'Work in progress says where it is in one clause.',
  'Time is given in units, or not at all.',
];

const SAMPLE_PLAIN = 'I finished the landing page changes. I updated the hero copy, fixed the pricing table on mobile, and moved the FAQ around based on your notes from yesterday. The tests pass. Let me know whether you would like me to merge it or keep going.';
const SAMPLE_ADHD = '<b>Merge the landing page changes?</b><ol style="margin:8px 0 6px 18px;padding:0"><li>Hero copy updated</li><li>Pricing table fixed on mobile</li><li>FAQ reordered</li></ol>Tests pass.';

// Each design is a function body run in the page after the "How agents write
// to you" tab is open. `ed` is that tab's card.
// ROUND 2 (2026-09-25). She turned down all four below: "I think it should
// really just append that text to your content if you have ADHD mode on, and
// then remove it when you turn it off... Maybe it opens a new section with
// additional instructions that get applied." So one design, in two states.
const ADHD_SECTION = (on) => `
    const box = ed.querySelector('textarea'); box.style.minHeight = '260px'; box.style.height = '260px';
    const row = document.createElement('div');
    row.className = 'set-plate'; row.style.margin = '0 0 20px'; row.style.maxWidth = '74ch';
    row.innerHTML = '<div class="set-row"><div class="set-row-text"><div class="set-row-label">ADHD mode</div><div class="set-row-desc">Adds a short set of rules under yours.</div></div><div class="set-row-ctl"><button type="button" role="switch" aria-checked="${on}" class="set-sw ${on ? 'on' : ''}"></button></div></div>';
    ed.querySelector('p').after(row);
    if (${on}) {
      const sec = document.createElement('div');
      sec.style.cssText = 'margin-top:28px;max-width:74ch';
      sec.innerHTML = '<div class="instruction-editor-head" style="margin-bottom:12px"><h2 style="font-size:14px">ADHD mode</h2><button type="button" disabled>Reset to default</button></div><textarea spellcheck="false" style="min-height:150px;height:150px"></textarea>';
      sec.querySelector('textarea').value = ${JSON.stringify(RULES.map((r) => '- ' + r).join('\n'))};
      box.after(sec);
    }`;

const DESIGNS_ROUND2 = { 'e-off': ADHD_SECTION(false), 'e-on': ADHD_SECTION(true) };

const DESIGNS_ROUND1 = {
  // A: one switch at the top of the card it changes.
  'a-switch': `
    const row = document.createElement('div');
    row.className = 'set-plate'; row.style.margin = '0 0 20px'; row.style.maxWidth = '74ch';
    row.innerHTML = '<div class="set-row"><div class="set-row-text"><div class="set-row-label">ADHD mode</div><div class="set-row-desc">Shorter messages. The thing to do comes first, in bold, and lists stop at five. Adds five rules to the ones below.</div></div><div class="set-row-ctl"><button type="button" role="switch" aria-checked="true" class="set-sw on"></button></div></div>';
    ed.querySelector('p').after(row);`,
  // B: a style picker that fills the box.
  'b-style': `
    const wrap = document.createElement('div');
    wrap.style.margin = '0 0 20px';
    wrap.innerHTML = '<div class="set-seg"><button type="button">Standard</button><button type="button" class="on">ADHD mode</button><button type="button">Write my own</button></div><div class="set-row-desc" style="margin-top:10px">ADHD mode: the thing to do comes first, in bold. Lists stop at five. No recaps. You can still edit every word below.</div>';
    ed.querySelector('p').after(wrap);`,
  // C: its own tab, with the rules it adds on show and editable.
  'c-tab': `
    const tabs = document.querySelector('.instruction-tabs');
    tabs.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', 'false'));
    const t = document.createElement('button'); t.textContent = 'ADHD mode'; t.setAttribute('aria-pressed', 'true'); tabs.appendChild(t);
    ed.querySelector('h2').textContent = 'ADHD mode';
    ed.querySelector('.instruction-editor-head button').outerHTML = '<button type="button" role="switch" aria-checked="true" class="set-sw on"></button>';
    ed.querySelector('p').textContent = 'Rules added on top of How agents write to you, for anyone who wants shorter messages. Off by default. Edit them like any other rules.';
    ed.querySelector('textarea').value = ${JSON.stringify(RULES.map((r) => '- ' + r).join('\n'))};
    ed.querySelector('textarea').style.minHeight = '180px';`,
  // D: pick by seeing the same message both ways.
  'd-preview': `
    const pick = document.createElement('div');
    pick.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:0 0 22px;max-width:74ch';
    const card = (name, body, on) => '<button type="button" style="all:unset;cursor:pointer;display:block;padding:16px 18px;border-radius:var(--radius);border:1px solid ' + (on ? 'var(--underline)' : 'var(--line)') + ';background:' + (on ? 'var(--wash)' : 'transparent') + '"><div style="font-size:12px;color:var(--text-faint);margin-bottom:10px;display:flex;justify-content:space-between"><span>' + name + '</span><span>' + (on ? 'On' : '') + '</span></div><div style="font-size:13px;line-height:1.55;color:var(--text)">' + body + '</div></button>';
    pick.innerHTML = card('Standard', ${JSON.stringify(SAMPLE_PLAIN)}, false) + card('ADHD mode', ${JSON.stringify(SAMPLE_ADHD)}, true);
    ed.querySelector('p').after(pick);`,
};

const h = await openInbox({ dist, width: 1440, height: 1000, snapshot: {} });
try {
  await h.goto(h.origin);
  await h.evaluate(`localStorage.setItem('zero.firstRun.done','1')`);
  await h.evaluate(`localStorage.setItem('zero.theme','dark')`);
  // ROUND 3: the built page, nothing injected. Off, then the real switch
  // pressed, with every right edge on the card measured.
  if (process.argv[4] === 'built') {
    await h.goto(`${h.origin}/?fixtures&settings=instructions`);
    await h.wait(2500);
    await h.evaluate(`(() => { const b = [...document.querySelectorAll('.instruction-tabs button')].find(x => x.textContent === 'How agents write to you'); b && b.click(); })()`);
    await h.wait(1200);
    const edges = `(() => { const r = (el) => el ? Math.round(el.getBoundingClientRect().right) : null; const ed = document.querySelector('.instruction-editor'); const cs = getComputedStyle(ed); return { cardContentRight: Math.round(ed.getBoundingClientRect().right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth)), reset: r(ed.querySelector('.instruction-editor-head button')), toggle: r(ed.querySelector('.instruction-toggle .set-sw')), box: r(ed.querySelector(':scope > textarea')), adhdReset: r(ed.querySelector('.instruction-sub .instruction-editor-head button')), adhdBox: r(ed.querySelector('.instruction-sub textarea')) }; })()`;
    await h.evaluate(`document.activeElement && document.activeElement.blur()`);
    console.log('off', JSON.stringify(await h.evaluate(edges)));
    await h.capture(path.join(out, 'built-off.png'));
    await h.evaluate(`document.querySelector('.instruction-toggle .set-sw').click()`);
    await h.wait(1200);
    await h.evaluate(`(() => { document.activeElement && document.activeElement.blur(); document.querySelector('.instruction-sub').scrollIntoView({block:'end'}); })()`);
    await h.wait(400);
    console.log('on', JSON.stringify(await h.evaluate(edges)));
    await h.capture(path.join(out, 'built-on.png'));
    const err = await h.evaluate('window.__ERR__ || null');
    if (err) console.error('error', err);
    process.exitCode = 0;
  } else for (const [name, body] of Object.entries(DESIGNS_ROUND2)) {
    await h.goto(`${h.origin}/?fixtures&settings=instructions`);
    await h.wait(2500);
    await h.evaluate(`(() => { const b = [...document.querySelectorAll('.instruction-tabs button')].find(x => x.textContent === 'How agents write to you'); b && b.click(); })()`);
    await h.wait(800);
    await h.evaluate(`(() => { document.activeElement && document.activeElement.blur(); const ed = document.querySelector('.instruction-editor'); ${body} })()`);
    await h.wait(400);
    const err = await h.evaluate('window.__ERR__ || null');
    if (err) console.error(name, err);
    console.log(await h.capture(path.join(out, `${name}.png`)));
  }
} finally {
  h.close();
}
