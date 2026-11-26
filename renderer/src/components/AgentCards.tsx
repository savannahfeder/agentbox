// AN AGENT'S CARD: its name, what it needs, and one button. Setup draws one per
// agent, and so do Settings and the sidebar for someone already past setup.
// Nothing runs until the button is pressed.
import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { agentCard, sidebarAgent, type AgentPress, type AgentReading } from '../setup-split';
import { EngineLogo } from './EngineLogos';
import { SidebarAgent } from './SidebarUpdate';
import './agent-cards.css';

export type AgentId = 'claude' | 'codex';
export const AGENT_IDS = ['claude', 'codex'] as const;
type Press = AgentPress & { via: 'setup' | 'update' };

/** Said whenever a press leaves an agent with a new reading, so every card of it redraws. */
export const AGENT_READ = 'agentbox:agent-read';

// The updater only updates a copy from Claude Code's own installer; any other says "its own installer", which says nothing to do.
const stoppedUpdate = (engine: AgentId, message: string | null | undefined): Press =>
  /own installer/.test(message ?? '') ? { phase: 'manual', error: `Run ${engine} update in a terminal`, via: 'update' } : { phase: 'failed', error: message ?? null, via: 'update' };

/** The readings, what each press is doing, and the press itself. */
export function useAgentCards(start: readonly AgentReading[]) {
  const [cards, setCards] = useState<readonly AgentReading[]>(start);
  const [presses, setPresses] = useState<Partial<Record<AgentId, Press>>>({});
  useEffect(() => { if (start.length) setCards(start); }, [start]);
  useEffect(() => {
    const took = (e: Event) => { const r = (e as CustomEvent<AgentReading>).detail; if (r?.engine) setCards((had) => [...had.filter((x) => x.engine !== r.engine), r]); };
    addEventListener(AGENT_READ, took);
    return () => removeEventListener(AGENT_READ, took);
  }, []);
  const pressing = AGENT_IDS.filter((e) => ['checking', 'installing', 'signing-in', 'updating'].includes(presses[e]?.phase ?? ''));
  const pressOn = (engine: AgentId, press: Press | null) =>
    setPresses((had) => { const n = { ...had }; if (press) n[engine] = press; else delete n[engine]; return n; });
  const readAgain = useCallback(async (engine: AgentId) => {
    const r = await api.engineSetup('ready', engine).catch(() => null);
    if (r) dispatchEvent(new CustomEvent(AGENT_READ, { detail: r }));
    return r;
  }, []);
  const press = useCallback(async (engine: AgentId, act: string) => {
    if (act === 'Open again') { void api.engineSetup('again', engine).catch(() => null); return; }
    if (act === 'Check again') { pressOn(engine, { phase: 'checking', via: 'update' }); await readAgain(engine); pressOn(engine, null); return; }
    const update = act === 'Update' || (act === 'Try again' && presses[engine]?.via === 'update');
    if (update) {
      pressOn(engine, { phase: 'updating', via: 'update' });
      try {
        const u = await api.agentUpdate(engine, 'start');
        if (u.state === 'current') { await readAgain(engine); pressOn(engine, null); }
        else if (u.state !== 'running') pressOn(engine, stoppedUpdate(engine, u.message));
      } catch (e) { pressOn(engine, stoppedUpdate(engine, (e as Error)?.message)); }
      return;
    }
    pressOn(engine, { phase: 'checking', via: 'setup' });
    const s = await api.engineSetup('start', engine).catch(() => null);
    pressOn(engine, { phase: s?.phase ?? 'failed', error: s?.error ?? null, via: 'setup' });
  }, [presses, readAgain]);
  // A press is watched until it settles.
  useEffect(() => {
    if (!pressing.length) return undefined;
    const tick = setInterval(async () => {
      for (const engine of pressing) {
        if (presses[engine]?.via === 'update') {
          const u = await api.agentUpdate(engine, 'status').catch(() => null);
          if (u?.state === 'current') { await readAgain(engine); pressOn(engine, null); }
          else if (u?.state === 'failed') pressOn(engine, stoppedUpdate(engine, u.message));
        } else {
          const s = await api.engineSetup('status', engine).catch(() => null);
          if (!s) continue;
          if (s.phase === 'ready') { await readAgain(engine); pressOn(engine, { phase: 'ready', via: 'setup' }); }
          else pressOn(engine, { phase: s.phase, error: s.error ?? null, via: 'setup' });
        }
      }
    }, 1000);
    return () => clearInterval(tick);
  }, [pressing.join(), presses, readAgain]);
  const cardOf = (engine: AgentId) => agentCard(cards.find((r) => r.engine === engine) ?? { engine, found: false }, presses[engine] ?? null);
  return { cards, cardOf, press, pressing: pressing.length > 0 };
}

/** Once a window, and again on coming back to it at most every ten minutes: the ready check starts the agent to ask. */
const REREAD = 10 * 60_000;

/** What each agent's ready check says now, for a page that did not come through setup. */
export function useAgentReadings(): readonly AgentReading[] {
  const [readings, setReadings] = useState<readonly AgentReading[]>([]);
  useEffect(() => {
    let live = true;
    let at = 0;
    const read = async () => {
      at = Date.now();
      const got = await Promise.all(AGENT_IDS.map((e) => api.engineSetup('ready', e).catch(() => null)));
      if (live) setReadings(got.filter((r): r is NonNullable<typeof r> => !!r && !r.error));
    };
    void read();
    const back = () => { if (Date.now() - at > REREAD) void read(); };
    addEventListener('focus', back);
    return () => { live = false; removeEventListener('focus', back); };
  }, []);
  return readings;
}

const CLOSED_KEY = 'agentbox.agent-card-closed';
const readClosed = (): string[] => { try { const v = JSON.parse(globalThis.localStorage?.getItem(CLOSED_KEY) ?? '[]'); return Array.isArray(v) ? v.map(String) : []; } catch { return []; } };

/** The sidebar's card for an agent someone uses that is not ready, or nothing. */
export function SidebarAgentSlot({ collapsed, rail = false }: { collapsed: boolean; rail?: boolean }) {
  const { cards, cardOf, press } = useAgentCards(useAgentReadings());
  const [closed, setClosed] = useState(readClosed);
  const note = sidebarAgent(cards, closed);
  if (!note) return null;
  const engine = note.engine as AgentId;
  const card = cardOf(engine);
  const close = () => {
    const next = [...closed, `${note.engine}:${note.act}`];
    setClosed(next);
    try { globalThis.localStorage?.setItem(CLOSED_KEY, JSON.stringify(next)); } catch { /* private window */ }
  };
  return <SidebarAgent note={note} sub={card.sub} act={card.act} collapsed={collapsed} rail={rail} onPress={(act) => void press(engine, act)} onClose={close} />;
}

/** At the top of an agent's Settings page, its card while it is not ready; nothing once it is. */
export function AgentSettingsCard({ engine }: { engine: AgentId }) {
  const { cards, cardOf, press } = useAgentCards(useAgentReadings());
  // Once pressed, the card stays to say Ready.
  const [pressed, setPressed] = useState(false);
  const reading = cards.find((r) => r.engine === engine);
  if (!reading || (agentCard(reading).ready && !pressed)) return null;
  return <div className="agent-tiles"><div className="ss-tiles">
    <AgentTile engine={engine} card={cardOf(engine)} onPress={(act) => { setPressed(true); void press(engine, act); }} />
  </div></div>;
}

export function AgentTile({ engine, card, onPress }: { engine: AgentId; card: ReturnType<typeof agentCard>; onPress: (act: string) => void }) {
  return <div className="ss-tile">
    <span className="ss-tile-logo"><EngineLogo engine={engine} size={22} /></span>
    <span className="ss-tile-name">{engine === 'claude' ? 'Claude Code' : 'Codex'}</span>
    {card.sub && <span className="ss-tile-sub" title={card.sub}>{card.sub}</span>}
    <span className="ss-tile-end">{card.ready ? <><Tick />Ready</> : card.act && <button type="button" className="ss-tile-btn" onClick={() => onPress(card.act!)}>{card.act}</button>}</span>
  </div>;
}

const Tick = () => <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3.5 8.4l3 3 6-6.6" /></svg>;
