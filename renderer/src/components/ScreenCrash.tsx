// Without this, a throw while a child renders unmounts the whole tree and
// leaves an empty window that only ⌘R brings back. A throw it cannot see is
// caught by the window itself (../after-a-crash comeBackFromABlankScreen).
import { Component, type ReactNode } from 'react';
import { LogoOrbit } from './LogoOrbit';
import { afterACrash, CRASHED_TWICE, screenDrew, writeHeldBeforeReload } from '../after-a-crash';

type Props = {
  children: ReactNode;
  // Tests pass these; the app uses the real ones.
  reload?: () => void;
  report?: (error: Error) => void;
};

const sendCrash = (error: Error) => {
  try {
    Promise.resolve(window.zero?.crash?.({ name: error?.name ?? 'Error', message: error?.message ?? '', stack: error?.stack ?? '' })).catch(() => {});
  } catch {}
};

export class ScreenCrash extends Component<Props, { crashed: 'reload' | 'stay' | null }> {
  state = { crashed: null as 'reload' | 'stay' | null };

  static getDerivedStateFromError() {
    return { crashed: 'reload' as const };
  }

  // The root has children from here on, so an empty one later is a screen that
  // died rather than one still coming up (../after-a-crash, main.tsx).
  componentDidMount() { screenDrew(); }

  componentDidCatch(error: Error) {
    // A caught error never reaches the window's 'error' listener in main.tsx.
    (this.props.report ?? sendCrash)(error);
    const next = afterACrash(Date.now());
    if (next === 'stay') { this.setState({ crashed: 'stay' }); return; }
    void writeHeldBeforeReload().then(() => (this.props.reload ?? (() => window.location.reload()))());
  }

  render() {
    const { crashed } = this.state;
    if (!crashed) return this.props.children;
    return crashed === 'stay'
      ? <div className="boot boot-stuck" role="alert"><LogoOrbit /><p>{CRASHED_TWICE}</p></div>
      : <div className="boot" role="status"><LogoOrbit /></div>;
  }
}
