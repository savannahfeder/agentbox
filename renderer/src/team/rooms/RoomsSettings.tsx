// Rooms, in Settings (round 23): your name, what your card shows, invisible.
// Handed to the Settings screen as its Rooms pane, in that screen's own rows.
import type { ReactNode } from 'react';
import type { RoomCard, RoomProfile } from '../../types';
import { WallCard } from './RoomPage';
import { invisibleNotice, sentence } from './room-rules';

function Row({ label, desc, children }: { label: string; desc?: ReactNode; children?: ReactNode }) {
  return <div className="set-row">
    <div className="set-row-text"><div className="set-row-label">{label}</div>{desc && <div className="set-row-desc">{desc}</div>}</div>
    {children && <div className="set-row-ctl">{children}</div>}
  </div>;
}

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className={`set-sw ${on ? 'on' : ''}`} onClick={() => onChange(!on)} />;
}

const Group = ({ id, label, children, bare = false }: { id: string; label: string; children: ReactNode; bare?: boolean }) =>
  <div className="set-group" data-find={id}>
    <div className="set-group-label"><span>{label}</span></div>
    {bare ? children : <div className="set-plate">{children}</div>}
  </div>;

export function RoomsSettings({ me, fullName, card, roomName, now, save, goInvisible, comeBack }: {
  me: RoomProfile; fullName: string; card: RoomCard | null; roomName: string | null; now: number;
  save: (patch: Record<string, unknown>) => void; goInvisible: (minutes: number | null) => void; comeBack: () => void;
}) {
  const full = !!fullName.trim() && me.display_name === fullName.trim().split(/\s+/).join(' ');
  const working = me.show_working !== 'none';
  const invisible = invisibleNotice(me.invisible_until, now);
  const preview = card ? { ...card, me: false, name: me.display_name } : null;
  return <>
    <Group id="rooms-name" label="Your name">
      <Row label="Show my full name" desc={sentence(`${full ? 'On' : 'Off'}, rooms show you as ${me.display_name}`)}>
        <Switch label="Show my full name" on={full} onChange={(v) => save({ fullName: v })} />
      </Row>
    </Group>
    <Group id="rooms-card" label="Your card" bare>
      <div className="rm-prev"><div className="set-plate" style={{ flex: 1, minWidth: 0 }}>
        <Row label="What you are working on" desc={working ? undefined : 'Off, it reads Private thread. Your team still sees your shared threads on its board.'}>
          <Switch label="What you are working on" on={working} onChange={(v) => save({ show_working: v ? 'everyone' : 'none' })} />
        </Row>
        {working && <Row label="Show it to people outside your team" desc={me.show_working === 'everyone' ? 'On, everyone in your rooms sees the name and your activity.' : 'Off, they see Private thread and no activity.'}>
          <Switch label="Show it to people outside your team" on={me.show_working === 'everyone'} onChange={(v) => save({ show_working: v ? 'everyone' : 'team' })} />
        </Row>}
        <Row label="How many agents are running"><Switch label="How many agents are running" on={me.show_agents} onChange={(v) => save({ show_agents: v })} /></Row>
        <Row label="Your level"><Switch label="Your level" on={me.show_level} onChange={(v) => save({ show_level: v })} /></Row>
        <Row label="Your status"><Switch label="Your status" on={me.show_status} onChange={(v) => save({ show_status: v })} /></Row>
        <Row label="Your activity on your page" desc={me.show_activity === false ? 'Off, people see only your progress.' : undefined}>
          <Switch label="Your activity on your page" on={me.show_activity !== false} onChange={(v) => save({ show_activity: v })} />
        </Row>
      </div>
      {preview && <div className="pv"><div className="set-group-label" style={{ margin: 0 }}><span>How {roomName ?? 'your room'} sees you</span></div><WallCard card={preview} /></div>}
      </div>
    </Group>
    <Group id="rooms-invisible" label="Invisible">
      <Row label="Go invisible" desc={invisible ?? 'Leave every room until you turn it off.'}>
        <Switch label="Go invisible" on={!!invisible} onChange={(v) => (v ? goInvisible(null) : comeBack())} />
      </Row>
    </Group>
  </>;
}

/** Rooms is on but my card is not made yet; the service tries again every few seconds. */
export function RoomsNotReady({ error }: { error: string | null }) {
  return <Group id="rooms-card" label="Your card">
    <Row label={error ? 'Your room card could not be made yet' : 'Making your room card'}
      desc={error ? sentence(`Rooms tries again every few seconds. The cloud said: ${error}`) : 'This takes a few seconds.'} />
  </Group>;
}
