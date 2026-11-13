// THE RIGHT SIDE OF THE PURCHASE PAGE: what Pro brings, drawn over the sky in
// place of the app, one card for each line on the left (PRO_PITCH in
// ../setup-split.ts), in the same order. Styles are in ./setup-split.css.
import { useEffect, useRef } from 'react';
import { TEAM } from '../../../cloud/gateway/plans.mjs';
import { drawSky, skyTheme } from '../home/sky';
import { useDarkWindow } from '../home/home-settings';

const CloudIcon = () => <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" aria-hidden="true"><path d="M4.5 12.5h7.2a2.8 2.8 0 0 0 .4-5.6A4 4 0 0 0 4.4 6.2 3.2 3.2 0 0 0 4.5 12.5z" /></svg>;
const PeopleIcon = () => <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden="true"><circle cx="6" cy="5.5" r="2.3" /><path d="M1.8 13c.5-2.3 2.2-3.6 4.2-3.6s3.7 1.3 4.2 3.6" /><path d="M10.6 3.4a2.2 2.2 0 0 1 0 4.2M12 9.6c1.1.5 1.9 1.6 2.2 3.4" /></svg>;
const FileIcon = () => <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" aria-hidden="true"><path d="M4 1.8h5.2L12.5 5v9.2H4z" /><path d="M9 1.8V5h3.5" /></svg>;

/** The icon beside each of PRO_PITCH's lines, shared with the left column. */
export const PERK_ICONS: Record<string, JSX.Element> = { cloud: <CloudIcon />, team: <PeopleIcon />, files: <FileIcon /> };

// An illustration: teammates and files a team on Pro would have, not anybody's real ones.
const TEAMMATES = [{ face: 'P', name: 'Priya', on: 'Review the refund tests' }, { face: 'L', name: 'Leo', on: 'Fix the flaky date picker' }];
const FILES = [{ name: 'checkout-flow.png', size: '2.1 MB' }, { name: 'release-notes.md', size: '8 KB' }, { name: 'search-profile.html', size: '310 KB' }];

export function ProShowcase({ agents, team }: { agents: string[]; team: string | null }) {
  const sky = useRef<HTMLCanvasElement>(null);
  const dark = useDarkWindow();
  useEffect(() => {
    const k = skyTheme(dark ? 'ember' : 'sage');
    if (sky.current && k) drawSky(sky.current, k.art, { from: 0, span: 260 });
  }, [dark]);
  return (
    <div className="pro-show">
      <canvas ref={sky} className="pro-sky" />
      <div className="pro-cards">
        <section className="pro-card" data-perk="cloud">
          <header>{PERK_ICONS.cloud}Cloud computers<span>{TEAM.agentsPerSeat} at once</span></header>
          <div className="pro-pcs">{agents.map((a) => <div key={a} className="pro-pc"><i /><span>{a}</span></div>)}</div>
        </section>
        <section className="pro-card" data-perk="team">
          <header>{PERK_ICONS.team}{team ?? 'Your team'}<span>Shared inbox</span></header>
          {TEAMMATES.map((t) => <div key={t.name} className="pro-row"><b className="pro-face">{t.face}</b><span className="pro-who">{t.name}</span><span className="pro-on">{t.on}</span></div>)}
        </section>
        <section className="pro-card" data-perk="files">
          <header>{PERK_ICONS.files}Files<span>Saved in the cloud</span></header>
          {FILES.map((f) => <div key={f.name} className="pro-row"><span className="pro-file">{f.name}</span><span className="pro-size">{f.size}</span></div>)}
        </section>
      </div>
    </div>
  );
}
