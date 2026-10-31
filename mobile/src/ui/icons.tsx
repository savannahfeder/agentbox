// The desktop's own glyphs (renderer/src/threads/Pages.tsx, team/SignInPage.tsx,
// phone.css), drawn the same way.
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { color } from './theme';

type P = { size?: number; tint?: string };

export const Back = ({ size = 16, tint = color.dim }: P) => (
  <Svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={tint} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><Path d="M10 3.5L5.5 8l4.5 4.5" /></Svg>
);

/** The chevron the page's arrows and folds wear (OneThingAtATime.tsx `chevron`). */
export const Chevron = ({ up = false, size = 14, tint = color.dim }: P & { up?: boolean }) => (
  <Svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={tint} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><Path d={up ? 'M4 10l4-4 4 4' : 'M4 6l4 4 4-4'} /></Svg>
);
export const Gear = ({ size = 17, tint = color.dim }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={tint} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
    <Circle cx={12} cy={12} r={3} />
    <Path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </Svg>
);

export const Pen = ({ size = 22, tint = color.ink }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={tint} strokeWidth={1.5}><Path d="M12 20h8" /><Path d="m4 20 1-4.5L15.5 5a2.1 2.1 0 0 1 3 3L8 18.5 4 20Z" /></Svg>
);

/** The logo inside the app: the nine dots alone, the top right one lit (components/AppMark.tsx). The tile is the app icon's. */
export const AppMark = ({ size = 24 }: { size?: number }) => (
  <Svg width={size} height={size} viewBox="10 10 80 80">
    {[21, 50, 79].flatMap((cy) => [21, 50, 79].map((cx) => (cx === 79 && cy === 21
      ? <Circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={10.5} fill="#ee6018" />
      : <Circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={10.5} fill={color.text} fillOpacity={0.38} />)))}
  </Svg>
);

/** Done's two ticks (threads/ThreadMenu.tsx `DoneMark`). */
export const DoneMark = ({ size = 16, tint = color.dim }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={tint} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round"><Path d="m3 13 3.6 3.6L13.4 9" /><Path d="m10.6 13 3.6 3.6L21 9" /></Svg>
);

export const More = ({ size = 18, tint = color.dim }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={tint}><Circle cx={5} cy={12} r={1.5} /><Circle cx={12} cy={12} r={1.5} /><Circle cx={19} cy={12} r={1.5} /></Svg>
);

export const Panel = ({ size = 17, tint = color.dim }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={tint} strokeWidth={1.5}><Rect x={3.75} y={4.75} width={16.5} height={14.5} rx={1} /><Path d="M14.5 5v14" /></Svg>
);

export const Cross = ({ size = 18, tint = color.dim }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={tint} strokeWidth={1.6} strokeLinecap="round"><Path d="M6 6l12 12M18 6 6 18" /></Svg>
);

/** Attach (components/Focus.tsx `compose-attach`). */
export const Clip = ({ size = 18, tint = color.dim }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={tint} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><Path d="m21 11.5-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l8.6-8.6a3.7 3.7 0 0 1 5.2 5.2l-8.6 8.6a1.8 1.8 0 0 1-2.6-2.6l8-8" /></Svg>
);

export const Mic = ({ size = 18, tint = color.dim }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={tint} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
    <Rect x={9} y={3} width={6} height={11.5} rx={3} /><Path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
  </Svg>
);

export const Clock =({ size = 15, tint = color.faint }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={tint} strokeWidth={1.6} strokeLinecap="round"><Circle cx={12} cy={12} r={8.5} /><Path d="M12 7.5V12l3 2" /></Svg>
);

/** A repeating task (threads/Pages.tsx `RepeatMark`). */
export const Repeat = ({ size = 14, tint = color.faint }: P) => (
  <Svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={tint} strokeWidth={1.4}>
    <Path d="M13 6.5A5.5 5.5 0 0 0 3.2 4.8M3 2.5v2.6h2.6" /><Path d="M3 9.5a5.5 5.5 0 0 0 9.8 1.7M13 13.5v-2.6h-2.6" />
  </Svg>
);

/** A pinned thread (threads/ThreadMenu.tsx `PinMark`), square-headed like every shape here. */
export const Pin = ({ size = 13, tint = color.faint }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={tint} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M8 3h8l-1.5 6 3.5 3.5H6L9.5 9z" /><Path d="M12 12.5V21" />
  </Svg>
);

export const Caret =({ size = 12, tint = '#fff' }: P) => (
  <Svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={tint} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><Path d="m4 6 4 4 4-4" /></Svg>
);

export const Tick = ({ size = 22, tint = 'rgba(238, 96, 24, 0.5)' }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={tint} strokeWidth={1.7} strokeLinecap="square"><Path d="m4 12.5 5 5L20 6.5" /></Svg>
);

/** A run in the cloud (threads/Pages.tsx `RunningMark`). */
export const Cloud = ({ tint = color.accent }: P) => (
  <Svg width={14} height={11} viewBox="2 5 21 15" fill="none" stroke={tint} strokeWidth={1.6} strokeLinejoin="round"><Path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" /></Svg>
);

export const GoogleMark = ({ size = 16 }: P) => (
  <Svg width={size} height={size} viewBox="0 0 48 48">
    <Path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <Path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <Path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <Path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </Svg>
);

export const AppleMark = ({ size = 16, tint = color.text }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={tint}>
    <Path d="M16.37 12.73c-.02-2.3 1.88-3.4 1.96-3.46-1.07-1.56-2.73-1.78-3.32-1.8-1.41-.14-2.76.83-3.48.83-.72 0-1.82-.81-3-.79-1.54.02-2.96.9-3.76 2.27-1.6 2.78-.41 6.9 1.15 9.16.76 1.1 1.67 2.34 2.86 2.3 1.15-.05 1.58-.74 2.96-.74 1.39 0 1.78.74 2.99.72 1.24-.02 2.02-1.12 2.77-2.23.88-1.28 1.24-2.52 1.26-2.59-.03-.01-2.42-.93-2.44-3.67zM14.1 5.98c.63-.77 1.06-1.83.94-2.89-.91.04-2.01.61-2.66 1.37-.58.67-1.1 1.76-.96 2.8 1.01.08 2.05-.52 2.68-1.28z" />
  </Svg>
);
