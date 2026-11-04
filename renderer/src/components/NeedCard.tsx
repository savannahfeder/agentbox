import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { keysOf, needId, type Need } from '../../../shared/cloud-needs.mjs';
import { Name } from '../../../shared/product-name.mjs';
import { keyLabel, keyWords } from '../../../shared/cloud-keys.mjs';
import { codeLooksWrong, keyLooksWrong } from '../key-asks';
import { DARK_INK, logoOf } from '../connections/logos';
import './need-card.css';

// What a message that asks for things knows (shared/cloud-needs.mjs): the keys
// saved for cloud runs (null when this computer has no cloud), whether it is
// the thread's newest answer (only that one takes anything), and how to give
// each kind. Each `give` answers with what went wrong, or null.
export const NeedPlace = createContext<{
  itemId: string;
  saved: string[] | null;
  // Files and codes given while a sign-in on the same message was still open: they go with it.
  given: string[];
  live: boolean;
  // Every need of the message, in order: the facts are said on its first
  // sign-in or key and the way out once, under its last card.
  needs: Need[];
  saveKeys: (fields: { name: string; value: string; label: string }[], need: Need, words?: string) => Promise<string | null>;
  sendFile: (path: string | null, need: Need) => Promise<string | null>;
  sendCode: (about: string, code: string) => Promise<string | null>;
  fileInfo?: (path: string) => Promise<{ ok: boolean; size?: number; error?: string }>;
  onComputer: () => void;
  openLink: (href: string) => void;
} | null>(null);

/** Per thread, the files sent while another ask on the same message was open, with the words that go when the last is given. */
// Kept for the window's life, a reload included (round ten: a held file was forgotten on reload), not past a restart,
// when the main process has forgotten the file too.
const HELD_KEY = 'agentbox.cloudHeld';
const readHeld = (): [string, { need: string; words: string }[]][] => {
  try { return JSON.parse(globalThis.sessionStorage?.getItem(HELD_KEY) ?? '[]'); } catch { return []; }
};
export const HELD = new Map<string, { need: string; words: string }[]>(readHeld());
export function setHeld(item: string, held: { need: string; words: string }[] | null) {
  if (held?.length) HELD.set(item, held); else HELD.delete(item);
  try { globalThis.sessionStorage?.setItem(HELD_KEY, JSON.stringify([...HELD])); } catch { /* no storage */ }
}

// The ask a row atop Needs you was pressed for, so its card takes the keyboard when the thread opens (round seven).
let wanted: { item: string; need: string } | null = null;
export const focusNeedOnOpen = (item: string, need: string) => { wanted = { item, need }; };

/** True inside any of the agent's messages but its last unanswered one (Thread.tsx): those only say what they asked. */
export const NeedOlder = createContext(false);

const I = {
  lock: <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="3" y="7" width="10" height="7" rx="1.5" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" /></svg>,
  cloud: <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M4.5 12.5h7a3 3 0 0 0 .4-5.97A4 4 0 0 0 4.2 7.6 2.5 2.5 0 0 0 4.5 12.5z" /></svg>,
  arrow: <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M5 11l6-6M6 5h5v5" /></svg>,
  file: <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></svg>,
  key: <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="14" r="4" /><path d="M11 11l8-8M16 6l2 2M14 8l2 2" /></svg>,
  laptop: <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="4" y="5" width="16" height="11" rx="1.5" /><path d="M2 19h20" /></svg>,
};

function Mark({ id, fallback }: { id?: string | null; fallback: ReactNode }) {
  const src = id ? logoOf(id) : null;
  return <span className={`need-mark${id && DARK_INK.has(id) ? ' need-mark-ink' : ''}`} aria-hidden="true">{src ? <img src={src} alt="" draggable={false} /> : fallback}</span>;
}

const LINK = /(https?:\/\/[^\s)]+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|io|dev|app|net|org|co|ai)\/[^\s),]*)/gi;
function withLinks(text: string, open: (href: string) => void): ReactNode[] {
  return text.split(LINK).map((part, i) => (i % 2 === 0 ? part
    : <a key={i} href={part} onClick={(e) => { e.preventDefault(); open(/^https?:/i.test(part) ? part : `https://${part}`); }}>{part}</a>));
}
const lower = (s: string) => (/^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);
const sentence = (s: string) => (s ? `${s[0].toUpperCase()}${s.slice(1)}${/[.!?]$/.test(s) ? '' : '.'}` : '');
// Escape in a field hands the keyboard back to the thread's shortcuts (round ten: R, J and K went into a token box).
const giveBackKeys = (e: { key: string; currentTarget: HTMLInputElement; stopPropagation: () => void }) => { if (e.key === 'Escape') { e.stopPropagation(); e.currentTarget.blur(); } };
// On to the next ask still open, so a keyboard never has to find it (rounds nine and eleven).
const focusNextAsk = () => setTimeout(() => document.querySelector<HTMLElement>('.need:not(.need-done) .need-input, .need:not(.need-done) .need-main')?.focus(), 150);
// Enter and Space on a card's button press it; the thread's own Enter (pick an option) took them (round nine).
const keepKeys = (e: { key: string; stopPropagation: () => void }) => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); };
const sizeWords = (n: number) => (n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(1)} GB` : n >= 1024 ** 2 ? `${Math.round(n / 1024 ** 2)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} bytes`);
/** What a file card says under its title: where the file is and how big, or that it is not there. */
export function fileWhy(path: string, why: string, info: { ok: boolean; size?: number; error?: string } | null): string {
  const where = folderOf(path);
  return [info && !info.ok ? info.error : where ? `In ${where} on this computer${info?.size != null ? `, ${sizeWords(info.size)}` : ''}.` : null, sentence(why)].filter(Boolean).join(' ');
}
const fileName = (p: string) => p.split('/').filter(Boolean).pop() ?? p;
const folderOf = (p: string) => { const parts = p.split('/').filter(Boolean); return parts.length > 1 ? parts[parts.length - 2] : null; };

/** Fields for a sign-in or a key, kept for every cloud thread. */
function KeyFields({ need, fields, plain }: { need: Need; fields: { name: string; label: string }[]; plain: string }) {
  const place = useContext(NeedPlace)!;
  const [values, setValues] = useState<Record<string, string>>({});
  const [said, setSaid] = useState<string | null>(null);
  const [warned, setWarned] = useState<string | null>(null);
  // Round ten: the same Save, pressed again, kept a token it had just called wrong. Its second press says so.
  const anyway = warned !== null && warned === JSON.stringify(values);
  const [busy, setBusy] = useState(false);
  const filled = fields.every((f) => values[f.name]?.trim());
  const some = fields.some((f) => values[f.name]?.trim());
  const go = async () => {
    const missing = fields.find((f) => !values[f.name]?.trim());
    if (missing) { setSaid(`Paste the ${lower(missing.label)} too.`); return; }
    const wrong = fields.map((f) => keyLooksWrong(f.name, values[f.name] ?? '', f.label)).find(Boolean) ?? null;
    const asked = JSON.stringify(values);
    if (wrong && warned !== asked) { setWarned(asked); setSaid(wrong); return; }
    setBusy(true);
    setSaid(null);
    const out = await place.saveKeys(fields.map((f) => ({ name: f.name, value: values[f.name], label: f.label })), need);
    setBusy(false);
    if (out) { setSaid(out); return; }
    focusNextAsk();
  };
  return <form className="need-form" onSubmit={(e) => { e.preventDefault(); if (some && !busy) void go(); }}>
    {fields.map((f, i) => (
      <div className="need-row" key={f.name}>
        <input className="need-input" type="password" onKeyDown={giveBackKeys} onFocus={(e) => e.currentTarget.select()} autoComplete="off" spellCheck={false} aria-label={f.label}
          placeholder={`Paste the ${fields.length > 1 ? lower(f.label) : plain}`}
          value={values[f.name] ?? ''} onChange={(e) => { setValues((v) => ({ ...v, [f.name]: e.target.value })); setSaid(null); }} />
        {i === fields.length - 1 && <button type="submit" className="need-btn need-main" disabled={busy || !some}>{busy ? 'Saving' : anyway ? 'Save anyway' : 'Save'}</button>}
      </div>
    ))}
    {said && <p className="need-said" role="status">{said}</p>}
  </form>;
}

function Footer() {
  const place = useContext(NeedPlace)!;
  return <button type="button" className="need-foot" onClick={place.onComputer}>
    <span className="need-foot-mark">{I.laptop}</span>Do it on my computer instead<span className="need-foot-arrow">{I.arrow}</span>
  </button>;
}

/** One thing a cloud run asked the person for, drawn where it asked. */
export function NeedCard({ source, fallback }: { source: string; fallback: ReactNode }) {
  const place = useContext(NeedPlace);
  const older = useContext(NeedOlder);
  let need: Need | null = null;
  try { need = JSON.parse(source) as Need; } catch { need = null; }
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [replacing, setReplacing] = useState(false);
  const box = useRef<HTMLDivElement | null>(null);
  const live = !!place?.saved && !!need && place.live && !older;
  const id = need ? needId(need) : '';
  useEffect(() => {
    if (!live || !place || wanted?.item !== place.itemId || wanted.need !== id) return;
    wanted = null;
    // After the thread's own focus has landed on the reply box; not cleared by a re-render, which comes at once.
    setTimeout(() => box.current?.querySelector<HTMLElement>('input, .need-main')?.focus(), 250);
  }, [live, id, place]);
  // Round nine: a file that was not on the computer said so only after Send.
  const [info, setInfo] = useState<{ ok: boolean; size?: number; error?: string } | null>(null);
  const asksFile = need?.kind === 'file' ? need.path : null;
  useEffect(() => {
    if (!live || !asksFile || !place?.fileInfo) return;
    let on = true;
    void place.fileInfo(asksFile).then((r) => { if (on) setInfo(r); });
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, asksFile]);
  if (!place?.saved || !need) return <>{fallback}</>;
  const open = place.openLink;
  const done = (n: Need) => { const k = keysOf(n); return k.length ? k.every((x) => place.saved!.includes(x)) : place.given.includes(needId(n)); };
  const at = place.needs.findIndex((n) => needId(n) === id);
  const firstKeyed = place.needs.findIndex((n) => (n.kind === 'sign-in' || n.kind === 'key') && !done(n));
  const showFacts = at < 0 || at === firstKeyed;
  const lastOpen = place.needs.map((n) => !done(n)).lastIndexOf(true);
  const showFoot = at < 0 || at === lastOpen;
  const keyedLeft = place.needs.filter((n) => keysOf(n).length && !done(n)).map((n) => (n.kind === 'sign-in' ? n.service.name : n.kind === 'key' ? keyWords(n.what) ?? n.name : ''));
  // Everything else still open on this ask, by name (round eleven: a held file said "Sent." with the code still to give).
  const othersLeft = place.needs.filter((n) => !done(n) && needId(n) !== id).map((n) => (n.kind === 'sign-in' ? n.service.name : n.kind === 'key' ? keyWords(n.what) ?? n.name : n.kind === 'file' ? fileName(n.path) : `the ${n.about} code`));
  const held = (title: string, mark: ReactNode) => <div className="need need-done" ref={box} onKeyDown={keepKeys}><div className="need-body">{mark}<div className="need-col">
    <div className="need-title">{title}</div><div className="need-why">{othersLeft.length ? `Ready. It goes with ${othersLeft.join(' and ')}.` : 'Sent.'}</div>
  </div></div></div>;

  if (need.kind === 'sign-in' || need.kind === 'key') {
    const svc = need.kind === 'sign-in' ? need.service : null;
    const key = need.kind === 'key' ? need : null;
    const signIn = !!svc;
    const fields: { name: string; label: string }[] = svc ? svc.keys : [{ name: key!.name, label: keyLabel(key!.what) ?? key!.name }];
    const saved = fields.every((f) => place.saved!.includes(f.name));
    const name = svc ? svc.name : keyLabel(key!.what) ?? key!.name;
    const title = svc ? `Connect ${name}` : `Add the ${keyWords(key!.what) ?? key!.name}`;
    const why = svc && need.kind === 'sign-in' ? sentence(need.why) : null;
    const tokenUrl = svc ? svc.tokenUrl : null;
    // What the person fetches, in the service's own word: "secret key", "access token".
    const plain = svc ? (svc.keys.length > 1 ? 'access key' : lower(svc.keys[0].label.replace(svc.name, '').trim() || 'token')) : 'key';
    const article = /^[aeiou]/i.test(plain) ? 'an' : 'a';
    const getIt = tokenUrl && <>Get {article} {plain} from <a href={tokenUrl} onClick={(e) => { e.preventDefault(); open(tokenUrl); }}>{name}'s own page</a></>;
    const mark = <Mark id={svc ? svc.id : null} fallback={I.key} />;
    if ((saved && !replacing) || !live) {
      return <div className="need need-done" data-need={svc ? svc.id : key!.name} ref={box} onKeyDown={keepKeys}>
        <div className="need-body">{mark}<div className="need-col">
          <div className="need-title">{saved ? (signIn ? `${name} connected` : `${name} saved`) : title}</div>
          <div className="need-why">{saved ? 'Every cloud thread can use it.' : 'Answered below.'}</div>
        </div>{saved && live && <button type="button" className="need-link" onClick={() => setReplacing(true)}>Replace</button>}</div>
        {saved && live && showFoot && <Footer />}
      </div>;
    }
    return <div className="need" data-need={svc ? svc.id : key!.name} ref={box} onKeyDown={keepKeys}>
      <div className="need-body">{mark}<div className="need-col">
        <div className="need-title">{title}</div>
        {why ? <div className="need-why">{why}</div> : key?.what && <div className="need-why">{withLinks(sentence(key.what), open)}</div>}
        {showFacts ? <div className="need-facts">
          {getIt && <div>{I.arrow}<span>{getIt}</span></div>}
          <div>{I.lock}<span>Kept encrypted in your {Name} Cloud</span></div>
          <div>{I.cloud}<span>Every thread can use it from now on</span></div>
        </div> : getIt && <div className="need-why need-also">{getIt}. Kept the same way.</div>}
        <KeyFields need={need} fields={fields} plain={plain} />
      </div></div>
      {showFoot && <Footer />}
    </div>;
  }

  if (need.kind === 'file') {
    const where = folderOf(need.path);
    const send = async (path: string | null) => {
      setBusy(true); setSaid(null);
      const out = await place.sendFile(path, need);
      setBusy(false);
      if (out) setSaid(out); else focusNextAsk();
    };
    if (live && place.given.includes(id)) return held(`${fileName(need.path)} is ready`, <Mark fallback={I.file} />);
    if (!live) {
      return <div className="need need-done"><div className="need-body"><Mark fallback={I.file} /><div className="need-col">
        <div className="need-title">Send {fileName(need.path)}</div><div className="need-why">Answered below.</div>
      </div></div></div>;
    }
    return <div className="need" data-need="file" ref={box} onKeyDown={keepKeys}>
      <div className="need-body"><Mark fallback={I.file} /><div className="need-col">
        <div className="need-title">Send {fileName(need.path)}</div>
        <div className="need-why">{fileWhy(need.path, need.why, info)}</div>
        <div className="need-facts"><div>{I.lock}<span>Goes only to this thread's cloud machine, and is deleted when it ends</span></div></div>
        <div className="need-acts">
          {info && !info.ok
            ? <button type="button" className="need-btn need-main" disabled={busy} onClick={() => void send(null)}>{busy ? 'Sending' : 'Choose the file'}</button>
            : <><button type="button" className="need-btn need-main" disabled={busy} onClick={() => void send(need.path)}>{busy ? 'Sending' : 'Send from this computer'}</button>
              <button type="button" className="need-btn" disabled={busy} onClick={() => void send(null)}>Choose another file</button></>}
        </div>
        {said && <p className="need-said" role="status">{said}</p>}
      </div></div>
      {showFoot && <Footer />}
    </div>;
  }

  const about = need.about;
  if (!live) {
    return <div className="need need-done"><div className="need-body"><Mark id={about} fallback={I.key} /><div className="need-col">
      <div className="need-title">Enter the {about} code</div><div className="need-why">Answered below.</div>
    </div></div></div>;
  }
  const sendCode = async () => {
    if (keyedLeft.length) { setSaid(`Connect ${keyedLeft.join(' and ')} first, then the code: it runs out in a minute.`); return; }
    const wrong = codeLooksWrong(code);
    if (wrong && said !== wrong) { setSaid(wrong); return; }
    setBusy(true); setSaid(null);
    const out = await place.sendCode(about, code);
    setBusy(false);
    if (out) setSaid(out);
  };
  return <div className="need" data-need="code" ref={box} onKeyDown={keepKeys}>
    <div className="need-body"><Mark id={about} fallback={I.key} /><div className="need-col">
      <div className="need-title">Enter the {about} code</div>
      {need.why && <div className="need-why">{sentence(need.why)} Goes to this thread only.</div>}
      {keyedLeft.length > 0 && <div className="need-why need-also">Enter it once {keyedLeft.join(' and ')} {keyedLeft.length > 1 ? 'are' : 'is'} in: these codes run out in a minute.</div>}
      <form className="need-row need-code-row" onSubmit={(e) => { e.preventDefault(); if (code.trim() && !busy) void sendCode(); }}>
        <input className="need-input need-code" onKeyDown={giveBackKeys} onFocus={(e) => e.currentTarget.select()} inputMode="numeric" autoComplete="one-time-code" spellCheck={false} aria-label={`The ${about} code`} placeholder="123456"
          value={code} onChange={(e) => { setCode(e.target.value.replace(/\s+/g, '')); setSaid(null); }} maxLength={12} />
        <button type="submit" className="need-btn need-main" disabled={busy || !code.trim()}>{busy ? 'Sending' : 'Send'}</button>
      </form>
      {said && !(said.startsWith('Connect ') && !keyedLeft.length) && <p className="need-said" role="status">{said}</p>}
    </div></div>
    {showFoot && <Footer />}
  </div>;
}
