import React from 'react';
import ReactDOM from 'react-dom/client';
import { TopBar } from '../shared-file/SharedFilePage';
import { JOIN_SCHEME } from '../../../shared/room-links.mts';
import { Name } from '../../../shared/product-name.mjs';
import '../shared-file/shared-file.css';
import './paid.css';

export function PaidPage({ head }: { head: string }) {
  return (
    <div className="sf-page">
      <TopBar count={null} open={false} onComments={() => {}} />
      <main className="sf-state pd-main">
        <h1>{head}</h1>
        <a className="sf-join pd-back" href={`${JOIN_SCHEME}://cloud`}>Back to {Name}</a>
      </main>
    </div>
  );
}

export function bootPaid(page: { head: string }) {
  document.documentElement.dataset.page = 'shared-file';
  ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><PaidPage head={page.head} /></React.StrictMode>);
}
