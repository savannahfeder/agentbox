import React from 'react';
import ReactDOM from 'react-dom/client';
import { SITE, TopBar } from '../shared-file/SharedFilePage';
import { JOIN_SCHEME } from '../../../shared/room-links.mts';
import { Name } from '../../../shared/product-name.mjs';
import '../shared-file/shared-file.css';
import '../paid/paid.css';

// The invitation waits in Needs you once the app is signed in with the address it went to.
export function InvitedPage() {
  return (
    <div className="sf-page">
      <TopBar count={null} open={false} onComments={() => {}} />
      <main className="sf-state pd-main">
        <h1>Join your team on {Name}</h1>
        <div className="pd-acts">
          <a className="sf-join pd-back" href={`${JOIN_SCHEME}://cloud`}>Open {Name}</a>
          <a className="sf-join pd-back" href={SITE}>Get {Name}</a>
        </div>
      </main>
    </div>
  );
}

export function bootInvited() {
  document.documentElement.dataset.page = 'shared-file';
  ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><InvitedPage /></React.StrictMode>);
}
